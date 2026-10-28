/**
 * 健康检查：判断一条 MCP 条目"现在到底能不能用"。
 *
 * 三条判断依据，按可靠性从高到低：
 *
 * 1. **注册了工具**——最硬的证据。MCP 客户端只有握手成功才会把工具注册进
 *    `ctx.tools`，所以 `toolCount > 0` 基本等于"当时连上了"（见 `tool-catalog.js`）；
 * 2. **端点探测**（`streamable-http`）——工具数为 0 时才需要，因为这时"没连上"
 *    和"连上了但没工具"无法区分。发一次 `initialize` 握手，把网络/鉴权/路径
 *    三类故障分开报；
 * 3. **命令可解析性**（`stdio`）——本地进程没法从外部探活（它由宿主拉起、
 *    生命周期归宿主），能确认的只有"这个可执行文件在不在 PATH 里"。
 *
 * 三条纪律：
 * - **不发密钥**：探测请求只带 `content-type` / `accept`。配置里的 `headers`
 *   里有 API key，把密钥发到用户自己写的地址上没有额外收益，却会让"日志/抓包
 *   泄漏密钥"多一条路径。代价是 401 分不清"没带密钥"和"密钥错了"——所以
 *   401 的文案只说"需要鉴权"，并把结论交回用户；
 * - **不问就不探**：条目停用 / 不可解析时直接返回结论，不发任何请求；
 * - **只探 http(s)**：`fetch('file:///…')` 之类的输入一律拒掉，配置是用户写的，
 *   但插件不该因为它变成一个任意协议客户端。
 */
import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { delimiter, isAbsolute, join, resolve } from 'node:path';
import { PLUGIN_VERSION } from './version.js';

/** 单次探测的超时（毫秒）。MCP 服务器冷启动偶尔要几秒，6s 是"不误判"和"别让用户干等"的折中。 */
export const PROBE_TIMEOUT_MS = 6000;

/** 握手时声明的协议版本：与主流 MCP 实现（含 dsh-mcp-client 默认）对齐。 */
export const PROBE_PROTOCOL_VERSION = '2025-06-18';

/**
 * 健康结论的取值。
 *
 * - `healthy`：能确认可用（注册了工具）；
 * - `degraded`：宿主侧有响应但状态可疑（端点通、却没注册工具 / 需要鉴权）；
 * - `unreachable`：明确连不上（DNS/连接失败/超时/命令不存在）；
 * - `disabled`：条目停用，未做探测；
 * - `unknown`：信息不足（条目不可解析 / 缺少 url 或 command / 宿主没提供 tools）。
 * @type {Readonly<Record<string, string>>}
 */
export const STATUS = Object.freeze({
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNREACHABLE: 'unreachable',
  DISABLED: 'disabled',
  UNKNOWN: 'unknown',
});

/**
 * 把 fetch 抛出的异常压成一句人话。
 *
 * Node 的 fetch 只会抛 `TypeError: fetch failed`，真正有用的错误码在
 * `error.cause.code`（`ENOTFOUND` / `ECONNREFUSED` / `CERT_HAS_EXPIRED`…）。
 * 不取它的话，界面上永远只有一句 "fetch failed"，排障等于从零开始。
 * @param {unknown} error 异常。
 * @returns {string} 描述。
 */
function describeFetchError(error) {
  if (error === null || typeof error !== 'object') return String(error);
  const cause = /** @type {{cause?: unknown}} */ (error).cause;
  const code = cause !== null && typeof cause === 'object' && typeof (/** @type {any} */ (cause).code) === 'string'
    ? /** @type {string} */ (/** @type {any} */ (cause).code)
    : '';
  const message = typeof (/** @type {any} */ (error).message) === 'string' ? /** @type {string} */ (/** @type {any} */ (error).message) : '';
  if (code !== '') return `${code}（${message === '' ? '连接失败' : message}）`;
  return message === '' ? '连接失败' : message;
}

/**
 * 把一个候选命令解析成绝对路径。
 *
 * `which` 的等价物，自己实现是为了不引入子进程：健康检查不该为了"问一下
 * 命令在不在"而 fork 一次（Windows 上还会闪黑框）。
 *
 * @param {string} command 配置里的 `command`。
 * @param {Record<string, string>} env 环境变量（只用 EXT 相关与 PATH）。
 * @returns {string|null} 命中的绝对路径；找不到为 null。
 */
export function resolveCommand(command, env = {}) {
  if (typeof command !== 'string' || command === '') return null;
  // 带路径分隔符的一律当路径处理（`./server.js`、`/usr/local/bin/uvx`）。
  if (isAbsolute(command) || command.includes('/') || command.includes('\\')) {
    const full = isAbsolute(command) ? command : resolve(command);
    try {
      if (!statSync(full).isFile()) return null;
      accessSync(full, constants.X_OK);
      return full;
    } catch {
      return null;
    }
  }
  // Windows 的可执行后缀：不补的话 `npx` 永远找不到（PATH 里是 `npx.CMD`）。
  const extensions = process.platform === 'win32'
    ? (typeof env.PATHEXT === 'string' && env.PATHEXT !== '' ? env.PATHEXT : '.EXE;.CMD;.BAT').split(';')
    : [''];
  const dirs = (typeof env.PATH === 'string' ? env.PATH : '').split(delimiter);
  for (const dir of dirs) {
    if (dir === '') continue;
    for (const extension of extensions) {
      const candidate = join(dir, `${command}${extension}`);
      try {
        if (!statSync(candidate).isFile()) continue;
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // 下一个候选。
      }
    }
  }
  return null;
}

/**
 * 一个 HTTP 状态码该怎么解读。
 * @param {number} status HTTP 状态码。
 * @returns {{status: string, detail: string}|null} 解读；2xx 交回调用方处理。
 */
function classifyHttpStatus(status) {
  if (status === 401 || status === 403) {
    return {
      status: STATUS.DEGRADED,
      detail: `服务可达，但需要鉴权（HTTP ${status}）：探测不携带配置里的密钥，请在对话里试调用任一工具确认密钥有效`,
    };
  }
  if (status === 404 || status === 405) {
    return {
      status: STATUS.DEGRADED,
      detail: `地址可达，但没有 MCP 接口（HTTP ${status}）：请核对该服务的 streamable-http 地址`,
    };
  }
  if (status >= 500) {
    return { status: STATUS.UNREACHABLE, detail: `服务端错误（HTTP ${status}），稍后重试` };
  }
  if (status >= 400) {
    return { status: STATUS.DEGRADED, detail: `请求被拒绝（HTTP ${status}），请核对地址与请求头` };
  }
  return null;
}

/**
 * 对 `streamable-http` 服务器做一次 `initialize` 握手。
 *
 * 只发不读：MCP 的响应可能是 `text/event-stream`（无限流），`await res.text()`
 * 会一直挂到超时。这里拿到状态码就足够判断，随后主动取消 body 以释放连接。
 *
 * @param {object} item ServerItem。
 * @param {object} options 选项。
 * @param {typeof fetch} options.fetchImpl fetch 实现（测试可注入）。
 * @param {number} options.timeoutMs 超时。
 * @param {(message: string) => void} options.logger 日志。
 * @returns {Promise<{status: string, detail: string, httpStatus: number|null, latencyMs: number|null}>} 结论。
 */
async function probeHttp(item, { fetchImpl, timeoutMs, logger }) {
  let target;
  try {
    target = new URL(item.url);
  } catch {
    return { status: STATUS.UNREACHABLE, detail: 'url 不是合法地址', httpStatus: null, latencyMs: null };
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return {
      status: STATUS.UNREACHABLE,
      detail: `不支持探测 ${target.protocol} 协议，只探 http/https`,
      httpStatus: null,
      latencyMs: null,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(target.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: PROBE_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'dsh-mcpserver-manager', version: PLUGIN_VERSION },
        },
      }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    // 主动丢弃响应体：SSE 流不会自己结束，读它就会挂到超时。
    try {
      await response.body?.cancel?.();
    } catch {
      // 取消失败不影响结论。
    }
    const verdict = classifyHttpStatus(response.status);
    if (verdict !== null) return { ...verdict, httpStatus: response.status, latencyMs };
    return {
      status: STATUS.DEGRADED,
      detail: `端点有响应（HTTP ${response.status} · ${latencyMs}ms），但没有注册任何工具：检查 DSH 日志里的连接与 tools/list 记录`,
      httpStatus: response.status,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    if (controller.signal.aborted) {
      return {
        status: STATUS.UNREACHABLE,
        detail: `探测超时（${Math.round(timeoutMs / 1000)}s 无响应）`,
        httpStatus: null,
        latencyMs,
      };
    }
    const described = describeFetchError(error);
    logger(`health probe failed ${item.serverName}: ${described}`);
    return { status: STATUS.UNREACHABLE, detail: `连接失败：${described}`, httpStatus: null, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `stdio` 服务器的可确认结论。
 *
 * 只能回答"命令在不在"：进程由宿主拉起，插件手里没有句柄，探活就是另一套
 * 进程管理，超出本插件的职责。所以命令存在但工具数为 0 时给 `degraded`
 * 而不是 `healthy`——那正是"启动失败 / 还在连"的样子。
 *
 * @param {object} item ServerItem。
 * @param {Record<string, string>} env 环境变量。
 * @returns {{status: string, detail: string}} 结论。
 */
function probeCommand(item, env) {
  const resolved = resolveCommand(item.command, env);
  if (resolved === null) {
    return {
      status: STATUS.UNREACHABLE,
      detail: `在 PATH 里找不到命令 ${item.command}：先确认它已安装，或用绝对路径`,
    };
  }
  if (typeof item.cwd === 'string' && item.cwd !== '' && !existsSync(item.cwd)) {
    return { status: STATUS.UNREACHABLE, detail: `工作目录不存在：${item.cwd}` };
  }
  return {
    status: STATUS.DEGRADED,
    detail: `命令存在（${resolved}），但没有注册任何工具：多半是启动失败或鉴权未通过，看 DSH 日志里该服务器的 stderr`,
  };
}

/**
 * 检查一条 MCP 条目。
 *
 * @param {object} item ServerItem（来自 `GET /servers` 的 `items[i]`）。
 * @param {object} [options] 选项。
 * @param {number} [options.toolCount] 已注册工具数。
 * @param {boolean} [options.toolsAvailable] 宿主是否提供了 `tools` 服务。
 * @param {typeof fetch} [options.fetchImpl] fetch 实现。
 * @param {number} [options.timeoutMs] 探测超时。
 * @param {Record<string, string>} [options.env] 环境变量。
 * @param {(message: string) => void} [options.logger] 日志。
 * @returns {Promise<object>} 健康报告（可直接下发到浏览器）。
 */
export async function checkServer(item, options = {}) {
  const {
    toolCount = 0,
    toolsAvailable = true,
    fetchImpl = globalThis.fetch,
    timeoutMs = PROBE_TIMEOUT_MS,
    env = process.env,
    logger = () => {},
  } = options;

  const serverName = typeof item?.serverName === 'string' ? item.serverName : '';
  /** @type {Record<string, unknown>} */
  const base = {
    serverName,
    tools: toolCount,
    toolsAvailable,
    transport: typeof item?.transport === 'string' ? item.transport : null,
    checkedAt: new Date().toISOString(),
    latencyMs: null,
    httpStatus: null,
  };

  if (item === null || typeof item !== 'object') {
    return { ...base, status: STATUS.UNKNOWN, detail: '条目已不存在，请刷新列表' };
  }
  if (item.enabled !== true) {
    return { ...base, status: STATUS.DISABLED, detail: '已停用，未做探测' };
  }
  if (item.parsable !== true) {
    return { ...base, status: STATUS.UNKNOWN, detail: '条目无法解析，无法探测' };
  }
  if (toolsAvailable !== true) {
    return { ...base, status: STATUS.UNKNOWN, detail: '宿主没有提供 tools 服务，读不到已注册的工具' };
  }
  if (toolCount > 0) {
    return {
      ...base,
      status: STATUS.HEALTHY,
      detail: `已注册 ${toolCount} 个工具`,
    };
  }
  if (item.transport === 'streamable-http') {
    if (typeof item.url !== 'string' || item.url === '') {
      return { ...base, status: STATUS.UNKNOWN, detail: '缺少 url，无法探测' };
    }
    if (typeof fetchImpl !== 'function') {
      return { ...base, status: STATUS.UNKNOWN, detail: '当前运行环境没有 fetch，无法探测' };
    }
    const verdict = await probeHttp(item, { fetchImpl, timeoutMs, logger });
    return { ...base, ...verdict, tools: toolCount };
  }
  if (item.transport === 'stdio' || typeof item.command === 'string') {
    if (typeof item.command !== 'string' || item.command === '') {
      return { ...base, status: STATUS.UNKNOWN, detail: '缺少 command，无法探测' };
    }
    const verdict = probeCommand(item, env);
    return { ...base, ...verdict };
  }
  return { ...base, status: STATUS.UNKNOWN, detail: '不认识的传输方式，无法探测' };
}
