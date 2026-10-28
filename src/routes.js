/**
 * HTTP 路由：`/api/dsh-mcpserver-manager/*` 的全部逻辑。
 *
 * 三条纪律：
 * 1. **每个 handler 的第一条语句是 `requestRejection` 守卫**（宿主安全契约，
 *    守卫写在统一的 `register()` 包装里，没有任何一条路由能绕过它）；
 * 2. 响应体一律走统一信封 `{ok:true,data,revision}` / `{ok:false,error:{...}}`，
 *    前端只需判 `ok` 一个字段；
 * 3. 日志只打 serverName / 错误码 / 路径，**永不打 `raw`、`env` 值**。
 *
 * 路由形态（宿主 webServer 只有 exact / prefix，没有路径参数 —— 照 `dsh-ssh`）：
 * - `exact /servers`：GET（列表）、POST（新增）；
 * - `prefix /servers/`：DELETE `/servers/<name>`、POST `/servers/<name>/toggle`、
 *   GET `/servers/<name>/tools`、POST `/servers/<name>/check`、
 *   GET `/servers/<name>/config`（可编辑 JSON，密钥置空）、
 *   POST `/servers/<name>/edit`（替换该条目）；
 * - `exact /update`：GET（读缓存结论）、POST（忽略当前版本）；
 * - `exact /update/check`：POST（真的去查一次）；
 * - `exact /upgrade`：GET（进度）、POST（开始装）。
 *
 * 版本检查那 4 条路由只在传入了 `updater` 时注册：没有更新器就干脆不存在这条
 * 路由（宿主回 404），好过挂一条永远 500 的端点。
 */
import { checkServer } from './health.js';
import { codedError } from './patch-store.js';
import { catalogFor, countFor, toolServiceOf } from './tool-catalog.js';
import { SERVER_NAME_RE, validateServerInput } from './validate.js';
import { PLUGIN_VERSION } from './version.js';


/** 路由前缀（与包名一致）。 */
export const PREFIX = '/api/dsh-mcpserver-manager';
/** 服务器集合路径（exact 与 prefix 共用）。 */
export const SERVERS_PATH = `${PREFIX}/servers`;
/** 版本检查状态（GET 读缓存 / POST 忽略当前版本）。 */
export const UPDATE_PATH = `${PREFIX}/update`;
/** 手动触发一次远程检查。 */
export const UPDATE_CHECK_PATH = `${UPDATE_PATH}/check`;
/** 原地升级（GET 进度 / POST 开始）。 */
export const UPGRADE_PATH = `${PREFIX}/upgrade`;
/** 修复旧版写坏的条目形状（一次性数据迁移）。 */
export const REPAIR_PATH = `${PREFIX}/repair`;

/** POST body 上限：配置再长也长不过一块剪贴板。 */
export const MAX_BODY_BYTES = 256 * 1024;

/**
 * 错误码 → HTTP 状态码（架构 §3.5 的十三码全在这里）。
 *
 * @type {Readonly<Record<string, number>>}
 */
export const STATUS_BY_CODE = Object.freeze({
  'invalid-json': 400,
  'invalid-config': 400,
  'duplicate-server': 409,
  'unknown-server': 404,
  'readonly-entry': 409,
  'unparsable-entry': 409,
  'anchors-broken': 409,
  'file-changed': 409,
  'disable-by-expression': 409,
  'file-unreadable': 500,
  'write-failed': 500,
  'body-too-large': 413,
  'method-not-allowed': 405,
});

/**
 * 连接层准入检查。返回 true 表示请求已被拒、调用方应直接收尾。
 * @param {object} ctx cordis 上下文。
 * @param {object} req 请求。
 * @param {object} res 响应。
 * @returns {boolean} 是否已拒绝。
 */
function rejected(ctx, req, res) {
  const rejection = ctx.connection.requestRejection(req);
  if (rejection !== undefined) {
    res.statusCode = rejection;
    res.end();
    return true;
  }
  return false;
}

/**
 * 发送一个 JSON 响应。
 * @param {object} res 响应。
 * @param {number} statusCode 状态码。
 * @param {unknown} payload 响应体。
 * @returns {void}
 */
function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

/**
 * 成功信封。
 * @param {object} res 响应。
 * @param {number} statusCode 状态码。
 * @param {object} data 数据。
 * @param {number} revision 快照版本。
 * @returns {void}
 */
function sendOk(res, statusCode, data, revision) {
  sendJson(res, statusCode, { ok: true, data, revision });
}

/**
 * 读取并解析 JSON body（带体积上限）。
 * @param {object} req 请求。
 * @returns {Promise<object>} 解析结果。
 */
async function readJsonBody(req) {
  /** @type {Buffer[]} */
  const parts = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > MAX_BODY_BYTES) throw codedError('body-too-large', '配置内容过大');
    parts.push(part);
  }
  if (parts.length === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(parts).toString('utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('body must be a json object');
    }
    return parsed;
  } catch {
    throw codedError('invalid-json', '请求体不是合法的 JSON');
  }
}

/**
 * prefix 路由支持的子动作。
 *
 * 白名单而不是"放过未知段"：`/servers/<name>/anything` 被当成合法请求，
 * 就等于给未来的路由留了一个"静默命中"的口子。
 * @type {ReadonlySet<string>}
 */
const ACTIONS = new Set(['toggle', 'tools', 'check', 'config', 'edit']);

/**
 * 从 prefix 路由的 URL 里抠出 serverName 与动作。
 *
 * @param {object} req 请求。
 * @returns {{name: string, action: 'toggle'|'tools'|'check'|'config'|'edit'|null}} 解析结果。
 */
export function serverNameFromPath(req) {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  const rest = pathname.slice(SERVERS_PATH.length);
  if (!rest.startsWith('/')) throw codedError('unknown-server', '该条目已不存在，请刷新列表');
  const segments = decodeURIComponent(rest.slice(1)).split('/').filter((part) => part !== '');
  if (segments.length === 0) throw codedError('unknown-server', '该条目已不存在，请刷新列表');
  const [rawName, action] = segments;
  // 名字必须过 SERVER_NAME_RE：否则 `../` 之类的输入会被当成合法键。
  if (!SERVER_NAME_RE.test(rawName)) throw codedError('unknown-server', '该条目已不存在，请刷新列表');
  if (segments.length > 2) throw codedError('unknown-server', '该条目已不存在，请刷新列表');
  if (action !== undefined && !ACTIONS.has(action)) {
    throw codedError('unknown-server', '该条目已不存在，请刷新列表');
  }
  return { name: rawName, action: action === undefined ? null : /** @type {any} */ (action) };
}

/**
 * 给列表条目挂上"注册了几个工具"。
 *
 * 放在 Host 侧而不是让前端逐个去问：列表页每一行都要显示「共 N 个工具」，
 * 逐个请求就是 N 次往返；而这里只是遍历一次 `toolCount > 0` 的 Map。
 *
 * `toolsAvailable:false` 是给前端的明确信号——**"0 个工具"和"读不到"不是
 * 一回事**，前者是真没有，后者是宿主没提供 `tools` 服务（例如插件装了但
 * 宿主是旧版本）。两种情况在界面上必须看起来不一样。
 *
 * @param {object[]} items 条目。
 * @param {object|undefined} service `tools` 服务。
 * @returns {object[]} 带计数的新条目数组。
 */
function withToolCounts(items, service) {
  return items.map((item) => {
    const counts = countFor(service, typeof item.serverName === 'string' ? item.serverName : '');
    return { ...item, toolCount: counts.count, toolsAvailable: counts.available };
  });
}

/**
 * 把异常翻成统一错误信封。
 * @param {object} res 响应。
 * @param {unknown} error 异常。
 * @param {(message: string) => void} logger 日志。
 * @returns {void}
 */
function handleError(res, error, logger) {
  const code = error !== null && typeof error === 'object' && typeof error.code === 'string'
    ? error.code
    : 'internal-error';
  const status = STATUS_BY_CODE[code] ?? 500;
  /** @type {Record<string, unknown>} */
  const payload = { code, message: error instanceof Error ? error.message : String(error) };
  if (error !== null && typeof error === 'object' && Array.isArray(error.errors)) {
    payload.errors = error.errors;
  }
  if (error !== null && typeof error === 'object' && error.rolledBack === true) {
    payload.rolledBack = true;
  }
  if (typeof payload.message !== 'string' || payload.message === '') payload.message = '操作失败';
  sendJson(res, status, { ok: false, error: payload });
  logger(`${code} → ${status}`);
}

/**
 * 注册全部 `/api/dsh-mcpserver-manager/*` 路由。
 *
 * 每条路由一个 `ctx.effect`：插件停用时宿主的 disposer 自动跑掉，不给宿主
 * 留半条路由。
 *
 * @param {object} ctx cordis 上下文（已注入 webServer 与 connection）。
 * @param {object} store `createPatchStore()` 的产物。
 * @param {(message: string) => void} [logger] 日志函数。
 * @returns {void}
 */
export function registerRoutes(ctx, store, logger = () => {}, options = {}) {
  if (store === undefined || store === null) {
    throw new TypeError('dsh-mcpserver-manager routes: store is required');
  }
  // 健康检查要不要带条目里配的请求头（默认带；见 `config.js` 的 `probeHeaders`）。
  const { updater = null, probeHeaders = true } = options;
  // `tools` 服务**必须每个请求现取**，不能在注册时取一次存下来：cordis 的服务
  // 可以晚于本插件 provide（`ctx.tools` 由 dsh-tools 提供），注册那一刻取到的
  // 很可能还是 undefined——存下来就等于永久失去工具列表。`ctx.get` 是一次
  // 注册表查询，代价可以忽略。

  /**
   * 统一注册包装：守卫 + 异常兜底，两个都在**所有** handler 之前生效。
   * @param {'exact'|'prefix'} kind 路由形态。
   * @param {string} path 路径。
   * @param {(req: object, res: object) => Promise<void>} handler 处理函数。
   * @returns {void}
   */
  const register = (kind, path, handler) =>
    ctx.effect(
      () =>
        ctx.webServer.register({
          kind,
          path,
          handler: async (req, res) => {
            // 铁律：准入检查永远是第一件事。
            if (rejected(ctx, req, res)) return;
            try {
              await handler(req, res);
            } catch (error) {
              handleError(res, error, logger);
            }
          },
        }),
      `dsh-mcpserver-manager: ${kind} ${path}`,
    );

  // GET /servers —— 列表；POST /servers —— 新增。
  register('exact', SERVERS_PATH, async (req, res) => {
    if (req.method === 'GET') {
      const snapshot = await store.read();
      sendOk(res, 200, {
        // 运行中的 Host 版本：客户端拿它跟自己 bundle 里的常量比。不一致就说明
        // "升级了但没重启宿主"——那时两边的校验规则不是一个版本，报错会自相矛盾。
        version: PLUGIN_VERSION,
        file: snapshot.file,
        fileDisplay: snapshot.fileDisplay,
        dshHome: snapshot.dshHome,
        profile: snapshot.profile,
        // `source` 告诉前端「这条路径是谁决定的」（宿主 profileContext / 显式配置 /
        // 环境变量 / 默认值）——用户核对 profile 对不对时，这是最直接的一句解释。
        source: snapshot.source,
        exists: snapshot.exists,
        anchors: snapshot.anchors,
        // 旧版（≤0.4.2）写出的条目是扁平形状，DSH 的补丁语义不会把它们建行。
        // 这不是"条目不存在"，而是"存在但不会被加载"——必须明说，否则用户
        // 只会看到"共 0 个工具"而完全不知道为什么。
        legacy: snapshot.legacy ?? [],
        items: withToolCounts(snapshot.items, toolServiceOf(ctx)),
        // 前端做即时唯一性校验需要「已占用的名字」：serverName 是工具 namespace，
        // 撞了就是撞了，所以这里给的是**全文件**的可解析条目（含只读条目）。
        taken: snapshot.taken,
      }, snapshot.revision);
      return;
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (typeof body.raw !== 'string') {
        throw codedError('invalid-config', '请求体缺少 raw 字段（MCP 配置的 JSON 文本）');
      }
      // 后端权威校验：前端判过的不算数，这里用**当前文件**的 taken 集合再判一次。
      const snapshot = await store.read();
      const result = validateServerInput(body.raw, {
        existingServerNames: snapshot.taken.serverNames,
        existingIds: snapshot.taken.ids,
      });
      if (result.ok !== true) {
        const codes = new Set(result.issues.map((item) => item.code));
        const code = codes.has('E_JSON')
          ? 'invalid-json'
          : codes.has('E_DUP')
            ? 'duplicate-server'
            : 'invalid-config';
        const error = codedError(code, result.issues[0]?.message ?? '配置校验未通过');
        error.errors = result.issues;
        throw error;
      }
      // store.add 内部会再扫一遍并复核唯一性——落盘前的最后一道闸。
      const added = await store.add(body.raw);
      logger(`add ${String(added.item?.serverName)}`);
      sendOk(res, 201, { item: added.item }, added.revision);
      return;
    }
    throw codedError('method-not-allowed', 'GET or POST only');
  });

  // DELETE /servers/<name> —— 删除；POST .../toggle —— 启停；
  // GET .../tools —— 工具列表；POST .../check —— 健康检查。
  register('prefix', SERVERS_PATH, async (req, res) => {
    const { name, action } = serverNameFromPath(req);

    if (action === 'tools') {
      if (req.method !== 'GET') throw codedError('method-not-allowed', 'GET only');
      const snapshot = await store.read();
      // 条目已不在配置里就别答：此时还留着的工具是"上次连接"的残留，
      // 拿它当现状会误导。
      if (!snapshot.items.some((item) => item.serverName === name)) {
        throw codedError('unknown-server', '该条目已不存在，请刷新列表');
      }
      const catalog = catalogFor(toolServiceOf(ctx), name);
      sendOk(res, 200, { serverName: name, ...catalog });
      return;
    }

    if (action === 'check') {
      if (req.method !== 'POST') throw codedError('method-not-allowed', 'POST only');
      const snapshot = await store.read();
      const item = snapshot.items.find((entry) => entry.serverName === name);
      if (item === undefined) throw codedError('unknown-server', '该条目已不存在，请刷新列表');
      const counts = countFor(toolServiceOf(ctx), name);
      // 探测不动文件，只把结论算出来；失败也返回 200（结论就是 "unreachable"），
      // 只有请求本身不合法才走错误分支。`sendSecrets` 默认 true：带上条目里
      // 配置的请求头去探，否则需要鉴权的服务永远只能回一句"401 需要鉴权"。
      const report = await checkServer(item, {
        toolCount: counts.count,
        toolsAvailable: counts.available,
        sendSecrets: probeHeaders !== false,
        logger,
      });
      logger(`check ${name} status=${report.status} tools=${String(counts.count)}`);
      sendOk(res, 200, { report });
      return;
    }

    if (action === 'config') {
      if (req.method !== 'GET') throw codedError('method-not-allowed', 'GET only');
      // 只回可编辑的 JSON，**密钥是空串**（见 patch-store 的 configSource）。
      sendOk(res, 200, await store.configSource(name));
      return;
    }

    if (action === 'edit') {
      if (req.method !== 'POST') throw codedError('method-not-allowed', 'POST only');
      const body = await readJsonBody(req);
      if (typeof body.raw !== 'string') {
        throw codedError('invalid-config', '请求体缺少 raw 字段（MCP 配置的 JSON 文本）');
      }
      const updated = await store.replace(name, body.raw);
      logger(`edit ${name}${updated.renamed === true ? ` → ${String(updated.item?.serverName)}` : ''}`);
      sendOk(res, 200, { item: updated.item, renamed: updated.renamed === true }, updated.revision);
      return;
    }

    if (req.method === 'DELETE') {
      if (action !== null) throw codedError('unknown-server', '该条目已不存在，请刷新列表');
      const removed = await store.remove(name);
      logger(`remove ${name}`);
      sendOk(res, 200, { removed: name }, removed.revision);
      return;
    }
    if (req.method === 'POST') {
      if (action !== 'toggle') throw codedError('unknown-server', '该条目已不存在，请刷新列表');
      const body = await readJsonBody(req);
      if (typeof body.enabled !== 'boolean') {
        throw codedError('invalid-config', '请求体需要 enabled 字段（布尔值）');
      }
      const toggled = await store.setEnabled(name, body.enabled);
      logger(`toggle ${name} enabled=${String(body.enabled)} changed=${String(toggled.changed)}`);
      sendOk(res, 200, { item: toggled.item, changed: toggled.changed }, toggled.revision);
      return;
    }
    throw codedError('method-not-allowed', 'DELETE or POST only');
  });

  // POST /repair —— 把旧版写坏的扁平条目改成 `- insert:` 形状（一次性数据修复）。
  //
  // 为什么值得单独一条路由：光改代码不会让已经写坏的条目开始工作。用户升级后
  // 打开这一页，看到的就是「共 0 个工具」，除非有一条明确的路可以走。
  register('exact', REPAIR_PATH, async (req, res) => {
    if (req.method !== 'POST') throw codedError('method-not-allowed', 'POST only');
    const repaired = await store.repair();
    logger(`repair entries=${String(repaired.repaired)}`);
    sendOk(res, 200, { repaired: repaired.repaired, items: repaired.items }, repaired.revision);
  });

  if (updater === null) return;

  // GET /update —— 读缓存结论（页面每次打开都读它，不打 GitHub）；
  // POST /update —— 忽略当前这个新版本。
  register('exact', UPDATE_PATH, async (req, res) => {
    if (req.method === 'GET') {
      sendOk(res, 200, updater.payload());
      return;
    }
    if (req.method === 'POST') {
      sendOk(res, 200, await updater.dismiss());
      return;
    }
    throw codedError('method-not-allowed', 'GET or POST only');
  });

  // POST /update/check —— 真的去查一次。单独一条路由，不跟 GET /update 抢缓存。
  register('exact', UPDATE_CHECK_PATH, async (req, res) => {
    if (req.method !== 'POST') throw codedError('method-not-allowed', 'POST only');
    await updater.check();
    sendOk(res, 200, updater.payload());
  });

  // GET /upgrade —— 升级进度；POST /upgrade —— 开始装（立刻返回，前端轮询）。
  register('exact', UPGRADE_PATH, async (req, res) => {
    if (req.method === 'GET') {
      sendOk(res, 200, { ...updater.upgradeState(), update: updater.payload() });
      return;
    }
    if (req.method === 'POST') {
      const state = updater.startUpgrade();
      logger(`upgrade requested running=${String(state.running === true)}`);
      sendOk(res, 200, { ...state, update: updater.payload() });
      return;
    }
    throw codedError('method-not-allowed', 'GET or POST only');
  });
}
