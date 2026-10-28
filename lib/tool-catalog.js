/**
 * 工具目录：把「某个 MCP 服务器注册了哪些工具」从宿主的 `tools` 服务里读出来。
 *
 * 为什么能这么读（而不是去问 MCP 服务器要 `tools/list`）：
 * `@deepseek-ai/dsh-mcp-client` 每连上一个服务器就把它的工具注册进
 * `ctx.tools`，公开名固定是 `mcp__<serverName>__<rawName>`（见
 * `publicToolName()`）。而 `serverName` 的约束是 `^[A-Za-z0-9_-]{1,32}$`，
 * 全部字符都在 `[A-Za-z0-9_-]` 里，**不会被 `INVALID_NAME_CHARS` 改写**，
 * 所以 `mcp__<serverName>__` 这个前缀永远精确可用。
 *
 * 由此得到一个免费的好处：工具表就是"这个服务器到底连上没有"的第一手证据——
 * 连不上就一个都不会注册。健康检查因此不需要凭空造一个探测接口。
 *
 * 纪律：`docs` 里约定的"缺服务一律降级而不是抛错"在这里同样成立。宿主没提供
 * `tools`（版本不对 / 服务未就绪）时返回 `available:false`，由前端显示"工具数
 * 未知"，绝不让页面因此炸掉。
 */

/** 工具公开名前缀的固定部分（与 dsh-mcp-client 的拼接方式一致）。 */
const PREFIX_HEAD = 'mcp__';
/** 工具公开名前缀的分隔符。 */
const PREFIX_SEP = '__';
/** 描述文本上限：一条 MCP 工具描述可以写满几千字，列表里没人会读。 */
const MAX_DESCRIPTION = 240;

/**
 * 某个 serverName 的工具名前缀。
 * @param {string} serverName 服务器名。
 * @returns {string} 前缀（含尾部双下划线）。
 */
export function publicToolPrefix(serverName) {
  return `${PREFIX_HEAD}${serverName}${PREFIX_SEP}`;
}

/**
 * 取宿主的 `tools` 服务。
 *
 * 三条纪律与 `probeProfileContext` 一致：只用 `ctx.get`（不写
 * `ctx.tools`，服务缺失时那个属性访问在 cordis 的 Proxy 上可能直接抛错）、
 * 整个探测包在 try 里、失败静默。
 *
 * @param {object} ctx cordis 上下文。
 * @returns {object|undefined} `ToolsService`（至少有 `view` 方法）或 undefined。
 */
export function toolServiceOf(ctx) {
  try {
    if (ctx === null || typeof ctx !== 'object' || typeof ctx.get !== 'function') return undefined;
    const service = ctx.get('tools');
    if (service === null || typeof service !== 'object') return undefined;
    if (typeof service.view !== 'function') return undefined;
    return service;
  } catch {
    return undefined;
  }
}

/**
 * 把描述压成一行短文本。
 * @param {unknown} description 原始描述。
 * @returns {string} 单行描述。
 */
function oneLine(description) {
  if (typeof description !== 'string') return '';
  const flat = description.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_DESCRIPTION ? `${flat.slice(0, MAX_DESCRIPTION - 1)}…` : flat;
}

/**
 * 数一个工具入参有几个顶层字段。
 *
 * 不做 schema 校验、不做展开：这里只回答"调用时要不要填参数"，多一个数字足够
 * 用户判断该不该点开。
 * @param {unknown} parameters JSON Schema。
 * @returns {number} 顶层属性个数。
 */
function parameterCount(parameters) {
  if (parameters === null || typeof parameters !== 'object') return 0;
  const properties = /** @type {{properties?: unknown}} */ (parameters).properties;
  if (properties === null || typeof properties !== 'object') return 0;
  return Object.keys(properties).length;
}

/**
 * 读一个服务器的工具表。
 *
 * `view()` 的 `visible` 是**当前作用域能看见的**工具：被 `restrict` 掉的不会
 * 出现在里面，这正是我们想展示的（列出一个调用不了的工具有害无益）。
 *
 * @param {object|undefined} service `toolServiceOf()` 的产物。
 * @param {string} serverName 服务器名。
 * @returns {{available: boolean, count: number, tools: Array<object>}} 工具表。
 *   `available:false` 表示读不到（宿主没有 tools 服务），此时 `count` 无意义。
 */
export function catalogFor(service, serverName) {
  const empty = { available: false, count: 0, tools: [] };
  if (service === undefined) return empty;
  if (typeof serverName !== 'string' || serverName === '') return { available: true, count: 0, tools: [] };

  /** @type {Map<string, object>|undefined} */
  let visible;
  try {
    // 全局视角（不传 scope）：MCP 服务器的工具是全局注册的。
    visible = service.view().visible;
  } catch {
    return empty;
  }
  if (visible === null || typeof visible !== 'object' || typeof visible.entries !== 'function') {
    return { available: true, count: 0, tools: [] };
  }

  const prefix = publicToolPrefix(serverName);
  /** @type {Array<object>} */
  const tools = [];
  for (const [name, definition] of visible.entries()) {
    if (typeof name !== 'string' || !name.startsWith(prefix)) continue;
    const record = definition !== null && typeof definition === 'object' ? definition : {};
    tools.push({
      name,
      // 去掉命名空间后的原始名：用户认的是服务器自己起的名字。
      rawName: name.slice(prefix.length),
      description: oneLine(record.description),
      parameters: parameterCount(record.parameters),
    });
  }
  tools.sort((left, right) => (left.rawName < right.rawName ? -1 : left.rawName > right.rawName ? 1 : 0));
  return { available: true, count: tools.length, tools };
}

/**
 * 只取数量的轻量版。
 *
 * 列表页每个条目都要一个数字，但**不需要**描述文本：列表快照会整体下发到
 * 浏览器，把 N 个服务器的全部工具描述都塞进去纯属浪费带宽。所以这里自己
 * 数一遍，不复用 `catalogFor`（复用会顺手把每条描述都 trim 出来）。
 *
 * @param {object|undefined} service `toolServiceOf()` 的产物。
 * @param {string} serverName 服务器名。
 * @returns {{available: boolean, count: number}} 计数。
 */
export function countFor(service, serverName) {
  if (service === undefined) return { available: false, count: 0 };
  if (typeof serverName !== 'string' || serverName === '') return { available: true, count: 0 };
  /** @type {Map<string, object>} */
  let visible;
  try {
    visible = service.view().visible;
  } catch {
    return { available: false, count: 0 };
  }
  if (visible === null || typeof visible !== 'object' || typeof visible.keys !== 'function') {
    return { available: true, count: 0 };
  }
  const prefix = publicToolPrefix(serverName);
  let count = 0;
  for (const name of visible.keys()) {
    if (typeof name === 'string' && name.startsWith(prefix)) count += 1;
  }
  return { available: true, count };
}
