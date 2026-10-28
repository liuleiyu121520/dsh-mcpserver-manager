/**
 * 健康检查：判断一条 MCP 条目"现在到底能不能用"。
 *
 * 三条判断依据，按可靠性从高到低：
 *
 * 1. **注册了工具**——最硬的证据。MCP 客户端只有握手成功才会把工具注册进
 *    `ctx.tools`，所以 `toolCount > 0` 基本等于"当时连上了"（见 `tool-catalog.js`）；
 * 2. **端点探测**（`streamable-http`）——工具数为 0 时才需要，因为这时"没连上"
 *    和"连上了但没工具"无法区分。先发一次 `initialize` 握手，把网络/鉴权/路径
 *    三类故障分开报；握手通过后再走完 `tools/list`，**问出服务端自己有几个
 *    工具**。这一步是 0.4.2 加的，专治一类最气人的误判：服务端明明有 42 个
 *    工具、用户的配置也全对，DSH 这边却一个都没注册——不把两边的数字摆在一
 *    起，界面上就只能写"未注册工具"，看起来像是用户在瞎配；
 * 3. **命令可解析性**（`stdio`）——本地进程没法从外部探活（它由宿主拉起、
 *    生命周期归宿主），能确认的只有"这个可执行文件在不在 PATH 里"。
 *
 * 三条纪律：
 * - **带着用户配的请求头去探**（0.4.2 起，可用插件配置 `probeHeaders: false`
 *   关掉）。早期版本刻意只发 `content-type` / `accept`，理由是"少一条密钥泄漏
 *   路径"；但代价是整个探测对**需要鉴权的服务**失去意义——它永远只能回一句
 *   "401 需要鉴权"，而用户明明配好了 `Authorization`。真正想知道的是"我配的
 *   这个 header 到底生不生效"，所以现在默认照配置发。风险收窄到三条：只发往
 *   **用户自己写的那个 url**、**不跟随重定向**（否则 302 会把密钥带到别的
 *   域名）、日志与快照里永不出现值；
 * - **401 / 403 分两种说法**：没配请求头 → "需要鉴权"（补配置就行）；配了却被拒
 *   → "鉴权失败"（密钥过期/写错），并把**是哪个键**点名；
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

/** 探测请求自己必须带的头（用户配置不许覆盖这两项，否则 JSON body 会被破坏）。 */
const BASE_PROBE_HEADERS = Object.freeze({
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
});

/** 读 `tools/list` 响应时的字节上限：42 个工具的完整 JSON Schema 就有 150 KB，512 KB 留足余量。 */
const MAX_PROBE_BODY_BYTES = 512 * 1024;

/**
 * 拼出这次探测要发的请求头。
 *
 * **带密钥**是默认行为（见文件头的纪律说明）。两个细节：
 * 1. `content-type` / `accept` 由我们自己定，用户配置里的同名键会被忽略——
 *    探测发的是 JSON-RPC body，改掉这两个头只会让它发不出去；
 * 2. 空值键跳过：编辑约定里"空串 = 沿用原值"，真到发请求这一步还没有值，
 *    发一个空 header 只会让服务端多一个拒绝理由。
 *
 * 返回**配了哪些键**（`configured`）与**实际发了哪些键**（`sent`）两组信息：
 * 关闭 `probeHeaders` 时前者仍是真话，而 401 的解释必须区分"没配"和"没发"——
 * 对一条明明配好了 `Authorization` 的条目说"该条目没有配置请求头"是纯粹的误导。
 *
 * @param {object} item ServerItem。
 * @param {boolean} sendSecrets 是否带上配置里的请求头。
 * @returns {{headers: Record<string, string>, sent: string[], configured: boolean}} 头与两组键名。
 */
function buildProbeHeaders(item, sendSecrets) {
  /** @type {Record<string, string>} */
  const headers = { ...BASE_PROBE_HEADERS };
  /** @type {string[]} */
  const sent = [];
  const source = item !== null && typeof item === 'object' && item.parsed !== null && typeof item.parsed === 'object'
    ? /** @type {any} */ (item.parsed).headers
    : null;
  const entries = source !== null && typeof source === 'object' && !Array.isArray(source)
    ? Object.entries(source).filter(
        ([key, value]) =>
          typeof value === 'string' &&
          value !== '' &&
          key.toLowerCase() !== 'content-type' &&
          key.toLowerCase() !== 'accept',
      )
    : [];
  const configured = entries.length > 0;
  if (sendSecrets !== true) return { headers, sent, configured };
  for (const [key, value] of entries) {
    headers[key] = /** @type {string} */ (value);
    sent.push(key);
  }
  return { headers, sent, configured };
}

/**
 * 健康结论的取值。
 *
 * - `healthy`：能确认可用（注册了工具）；
 * - `degraded`：宿主侧有响应但状态可疑（端点通、却没注册工具 / 缺鉴权配置）；
 * - `unreachable`：明确用不了（DNS/连接失败/超时/命令不存在/鉴权被拒/重定向）；
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
 *
 * 401 / 403 分成两种说法，这是本函数存在的首要理由：
 * - **没配请求头** → `degraded`，「需要鉴权，补上 Authorization」——用户还差一步配置；
 * - **配了却被拒** → `unreachable`，「请求头 X 被拒绝，可能已过期」——配置写错了，
 *   这是硬失败，不是"需留意"。
 *
 * 把两件事说成一句话（旧版的"探测不带密钥，请自己试"）等于把结论甩回给用户。
 *
 * @param {number} status HTTP 状态码。
 * @param {{sent: string[], configured: boolean}} keys 带了哪些键 / 配了哪些键。
 * @returns {{status: string, detail: string}|null} 解读；2xx 交回调用方处理。
 */
function classifyHttpStatus(status, keys = { sent: [], configured: false }) {
  const sent = Array.isArray(keys.sent) ? keys.sent : [];
  if (status === 401 || status === 403) {
    if (sent.length > 0) {
      return {
        status: STATUS.UNREACHABLE,
        detail: `鉴权失败（HTTP ${status}）：请求头 ${sent.join('、')} 被拒绝，可能已过期或写错`,
      };
    }
    if (keys.configured === true) {
      // 配了但这次没发（probeHeaders=false）：说清是"我们没发"，别赖用户的配置。
      return {
        status: STATUS.DEGRADED,
        detail: `需要鉴权（HTTP ${status}）：探测按配置没有发送请求头，开启 probeHeaders 才能验证密钥`,
      };
    }
    return {
      status: STATUS.DEGRADED,
      detail: `需要鉴权（HTTP ${status}）：该条目没有配置请求头，请补上 Authorization 或服务要求的键`,
    };
  }
  if (status === 404 || status === 405) {
    return {
      status: STATUS.DEGRADED,
      detail: `地址可达，但没有 MCP 接口（HTTP ${status}），请核对 streamable-http 地址`,
    };
  }
  if (status >= 300 && status < 400) {
    return {
      status: STATUS.UNREACHABLE,
      detail: `地址发生重定向（HTTP ${status}）：为免把请求头带到别的域名，探测不跟随跳转`,
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
 * 主动丢弃响应体。
 *
 * `streamable-http` 的响应常是 `text/event-stream`（无限流），`await res.text()`
 * 会一直挂到超时；不读又会让 Node 的 keep-alive 连接占着不放。cancel 是唯一
 * 两全的做法——实测对手头这个服务，cancel 之后同一 session 的 `tools/list`
 * 依然正常。
 * @param {object} response fetch 响应。
 * @returns {Promise<void>} 完成。
 */
async function discardBody(response) {
  try {
    await response?.body?.cancel?.();
  } catch {
    // 取消失败不影响结论。
  }
}

/**
 * 读一个响应头（响应对象可能没有 `headers`，测试桩就是这样）。
 * @param {object} response fetch 响应。
 * @param {string} name 头名。
 * @returns {string|null} 值；缺失为 null。
 */
function readHeader(response, name) {
  try {
    const headers = response?.headers;
    if (headers === null || typeof headers !== 'object' || typeof headers.get !== 'function') return null;
    const value = headers.get(name);
    return typeof value === 'string' && value !== '' ? value : null;
  } catch {
    return null;
  }
}

/**
 * 从累计文本里找一条 JSON-RPC 回包。
 *
 * 两种形态都要认：`application/json` 是整段一个对象（没有换行，只能等流结束再
 * 解析）；`text/event-stream` 是 `data: {...}` 一行一条。
 *
 * @param {string} buffer 累计文本。
 * @param {boolean} flush 流是否已结束（结束时最后一段不完整的行也可以试解析）。
 * @returns {{count: number|null, done: boolean}} `done` 表示已经拿到终局答案。
 */
function readToolFrame(buffer, flush) {
  const lines = buffer.split('\n');
  // 最后一段可能还没收到换行符，除非流已结束，否则先不解析。
  const ready = flush ? lines : lines.slice(0, -1);
  for (const line of ready) {
    const trimmed = line.trim();
    const payload = trimmed.startsWith('data:')
      ? trimmed.slice(5).trim()
      : trimmed.startsWith('{')
        ? trimmed
        : '';
    if (payload === '') continue;
    /** @type {any} */
    let message;
    try {
      message = JSON.parse(payload);
    } catch {
      continue;
    }
    if (message === null || typeof message !== 'object') continue;
    if (Array.isArray(message.result?.tools)) return { count: message.result.tools.length, done: true };
    // 服务端明确报错：数不出来，但也不用再读了。
    if (message.error !== undefined) return { count: null, done: true };
  }
  return { count: null, done: false };
}

/**
 * 数 `tools/list` 回了几个工具。
 *
 * 只认第一个带 `result.tools` 的帧就停：一个 42 工具的服务端光 `tools/list`
 * 就有 150 KB，全读完纯属浪费（列表页要的只是一个数字）。
 *
 * @param {object} response `tools/list` 的响应。
 * @returns {Promise<number|null>} 工具数；读不出来为 null（调用方据此退回"未知"）。
 */
async function countServerTools(response) {
  const body = /** @type {any} */ (response)?.body;
  if (body === null || typeof body !== 'object' || typeof body.getReader !== 'function') return null;
  /** @type {ReadableStreamDefaultReader<Uint8Array>} */
  let reader;
  try {
    reader = body.getReader();
  } catch {
    return null;
  }
  const decoder = new TextDecoder();
  let buffer = '';
  let bytes = 0;
  try {
    while (bytes < MAX_PROBE_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += typeof value?.byteLength === 'number' ? value.byteLength : 0;
      buffer += decoder.decode(value, { stream: true });
      const frame = readToolFrame(buffer, false);
      if (frame.done) return frame.count;
    }
    return readToolFrame(buffer, true).count;
  } catch {
    // 超时 / 中断 / 流异常：都归到"读不出来"。
    return null;
  } finally {
    try {
      await reader.cancel();
    } catch {
      // 流可能已经结束。
    }
  }
}

/**
 * 握手通过之后，接着把服务端的工具问出来。
 *
 * 顺序是 MCP 规定的：`initialize` → `notifications/initialized` → `tools/list`，
 * 后两个请求要带上 `initialize` 回给的 `mcp-session-id`（有些实现不带也认，
 * 但规范要求带，照规范做省得挑服务端）。
 *
 * **任何一步失败都只是"数不出来"（null），不算故障**：探测的职责是给出更好的
 * 结论，不是把自己变成失败源。数不出来就退回原来那句"DSH 未注册工具"。
 *
 * @param {string} url 端点。
 * @param {string|null} sessionId `initialize` 回的 session id。
 * @param {object} options 选项。
 * @param {typeof fetch} options.fetchImpl fetch 实现。
 * @param {Record<string, string>} options.headers 已拼好的请求头（含用户配置的）。
 * @param {AbortSignal} options.signal 超时信号（与 initialize 共用一个总预算）。
 * @returns {Promise<number|null>} 服务端工具数；读不出来为 null。
 */
async function countToolsOverSession(url, sessionId, { fetchImpl, headers, signal }) {
  /** @type {Record<string, string>} */
  const sessionHeaders = { ...headers };
  if (sessionId !== null) sessionHeaders['mcp-session-id'] = sessionId;
  try {
    const ack = await fetchImpl(url, {
      method: 'POST',
      headers: sessionHeaders,
      redirect: 'manual',
      signal,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    await discardBody(ack);
    const listing = await fetchImpl(url, {
      method: 'POST',
      headers: sessionHeaders,
      redirect: 'manual',
      signal,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    const { status } = /** @type {{status: number}} */ (listing);
    if (status < 200 || status >= 300) {
      await discardBody(listing);
      return null;
    }
    return await countServerTools(listing);
  } catch {
    return null;
  }
}

/**
 * 2xx 但 DSH 注册了 0 个工具时该怎么说。
 *
 * 三种情况必须分开，因为用户下一步做的事完全不同：
 * - **服务端有工具**（`probeTools > 0`）——配置和密钥都是对的，问题在 DSH
 *   这边没建立起连接，重启一下就好。这是最容易被误判成"你没配好"的情形；
 * - **服务端 0 个工具**——服务器自己没东西可注册，用户该去查服务端；
 * - **数不出来**（null）——老实说不知道，别编。
 *
 * @param {number} status HTTP 状态码。
 * @param {string[]} sent 实际发出的请求头键名。
 * @param {number|null} probeTools 服务端工具数。
 * @returns {string} 一句话结论。
 */
function describeMissingTools(status, sent, probeTools) {
  const auth = sent.length > 0 ? '鉴权通过' : '未带请求头';
  if (typeof probeTools === 'number' && probeTools > 0) {
    return `端点可用（HTTP ${status}，${auth}），服务端有 ${probeTools} 个工具，但 DSH 注册了 0 个：重启 DSH 后重试`;
  }
  if (probeTools === 0) {
    return `端点可用（HTTP ${status}，${auth}），但服务端没有提供任何工具`;
  }
  return `端点可用（HTTP ${status}，${auth}），但 DSH 未注册任何工具：重启 DSH 后重试`;
}

/**
 * 对 `streamable-http` 服务器做一次 `initialize` 握手。
 *
 * @param {object} item ServerItem。
 * @param {object} options 选项。
 * @param {typeof fetch} options.fetchImpl fetch 实现（测试可注入）。
 * @param {number} options.timeoutMs 超时（覆盖整个探测：initialize + tools/list）。
 * @param {boolean} options.sendSecrets 是否带上配置里的请求头。
 * @param {(message: string) => void} options.logger 日志。
 * @returns {Promise<{status: string, detail: string, httpStatus: number|null, latencyMs: number|null, probeTools: number|null}>} 结论。
 */
async function probeHttp(item, { fetchImpl, timeoutMs, sendSecrets, logger }) {
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
  const { headers, sent, configured } = buildProbeHeaders(item, sendSecrets);
  try {
    const response = await fetchImpl(target.toString(), {
      method: 'POST',
      headers,
      // **不跟随跳转**：fetch 默认会跟随 302，并把 Authorization 原样带到
      // Location 指向的域名去——那正是"密钥泄漏给第三方"的经典路径。
      redirect: 'manual',
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
    // 先看一眼是不是需要 session id（有些实现不带也认，但规范要求带）。
    const sessionId = readHeader(response, 'mcp-session-id');
    // 主动丢弃响应体：SSE 流不会自己结束，读它就会挂到超时。
    await discardBody(response);
    const verdict = classifyHttpStatus(response.status, { sent, configured });
    if (verdict !== null) {
      return { ...verdict, httpStatus: response.status, latencyMs, probeTools: null };
    }
    // 走到这里说明端点 2xx —— 鉴权与地址都没问题。工具数为 0 因此不是"服务器
    // 坏了"，剩下的可能是"服务端本来就没工具"或"DSH 这边没连上"。把服务端的
    // 工具数问出来，这个归因才有证据，否则用户会去改一个本来正确的配置。
    const probeTools = await countToolsOverSession(target.toString(), sessionId, {
      fetchImpl,
      headers,
      signal: controller.signal,
    });
    return {
      status: STATUS.DEGRADED,
      detail: describeMissingTools(response.status, sent, probeTools),
      httpStatus: response.status,
      latencyMs,
      probeTools,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    if (controller.signal.aborted) {
      return {
        status: STATUS.UNREACHABLE,
        detail: `探测超时（${Math.round(timeoutMs / 1000)}s 无响应）`,
        httpStatus: null,
        latencyMs,
        probeTools: null,
      };
    }
    const described = describeFetchError(error);
    logger(`health probe failed ${item.serverName}: ${described}`);
    return { status: STATUS.UNREACHABLE, detail: `连接失败：${described}`, httpStatus: null, latencyMs, probeTools: null };
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
      detail: `在 PATH 里找不到命令 ${item.command}，先确认它已安装`,
    };
  }
  if (typeof item.cwd === 'string' && item.cwd !== '' && !existsSync(item.cwd)) {
    return { status: STATUS.UNREACHABLE, detail: `工作目录不存在：${item.cwd}` };
  }
  return {
    status: STATUS.DEGRADED,
    detail: `命令存在（${resolved}），但没有注册任何工具`,
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
 * @param {boolean} [options.sendSecrets] 探测时是否带上配置里的请求头（默认 true）。
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
    sendSecrets = true,
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
    // DSH 注册了 0 个工具时，探测会额外问一次服务端"你本来有几个"——两个数字
    // 摆在一起，才能说清问题在 DSH 侧还是在服务端。下面这些分支都没有探测，
    // 所以默认 null（=不知道，而不是 0）。
    probeTools: null,
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
    const verdict = await probeHttp(item, { fetchImpl, timeoutMs, sendSecrets, logger });
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
