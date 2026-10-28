/**
 * 校验规则引擎 —— **前后端同源的唯一真源**。
 *
 * Host（src/routes.js）与 Client（src/client/AddDialog.jsx）都只准调
 * `validateServerInput()` 这一个入口：前端拿它做输入即时反馈，后端拿它做
 * 提交时的权威判定。物理上只有这一个文件，所以不存在"两份实现漂移"的可能。
 *
 * 硬约束（构建期由 scripts/build.mjs 的 assertValidateIsIsomorphic() 守着）：
 * - 不得 import 任何 Node 内置模块；
 * - 不得访问浏览器专属全局对象。
 * 换句话说：这里只能用 ECMAScript 标准库 + `URL` 这种两端都有的全局。
 *
 * 本文件**不 import 任何东西**，也就天然不会把第三方代码带进客户端 bundle。
 */

/** serverName 的合法形状：字母、数字、下划线、连字符，1–32 字符。 */
export const SERVER_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;

/** 支持的传输方式。 */
export const TRANSPORTS = Object.freeze(['stdio', 'streamable-http']);

/**
 * Claude Desktop / Claude Code / Cursor / VS Code 那种「一层集合包一层服务器」的
 * 外壳键。用户从各家文档里复制的多半是这个形状：
 *
 * ```json
 * { "mcpServers": { "<serverName>": { ... } } }
 * ```
 *
 * 见到外壳就先拆壳：集合键即 serverName（Claude 用它在工具名前做命名空间，
 * 与 DSH 的 `mcp__<serverName>__<tool>` 是同一件事）。
 */
export const WRAPPER_KEYS = Object.freeze(['mcpServers', 'servers']);

/**
 * 传输方式别名 → DSH 规范值。
 *
 * `sse` 也在这里：DSH 的 MCP 客户端只认 `stdio` / `streamable-http`
 * （`@deepseek-ai/dsh-mcp-client` 的 schema 是 `z.const('stdio')` /
 * `z.const('streamable-http')`），SSE 没有实现。硬拒一个从别处复制来的
 * 配置没有意义——按 streamable-http 写入并明确告知，才是能跑起来的路。
 */
export const TRANSPORT_ALIASES = Object.freeze({
  stdio: 'stdio',
  sse: 'streamable-http',
  http: 'streamable-http',
  https: 'streamable-http',
  'streamable-http': 'streamable-http',
  streamablehttp: 'streamable-http',
  'streamable_http': 'streamable-http',
});

/** 后端补齐后写入的默认值。 */
export const DEFAULTS = Object.freeze({
  toolCallTimeoutMs: 60000,
  maxInstructionBytes: 32768,
  failOnStartupError: false,
});

/**
 * 已知字段白名单。不在其中的字段按 R16 走"警告放行"（原样写入，不丢弃）。
 */
export const KNOWN_FIELDS = Object.freeze([
  'serverName',
  'transport',
  'command',
  'args',
  'env',
  'cwd',
  'url',
  'headers',
  'toolCallTimeoutMs',
  'maxInstructionBytes',
  'failOnStartupError',
  'reconnect',
  // cordis 原生的条目级停用键：Claude 配置里常带 `"disabled": false`，
  // 认它、校验它，落盘时提到条目级（不是 config 里的一行）。
  'disabled',
]);

/**
 * 序列化时的 canonical 键序。
 *
 * 固定顺序是为了让"同一份输入两次生成的结果逐字节相同"——配置文件是用户
 * 资产，任何一次无意义的键序抖都会在 diff 里制造噪音。
 * 未知字段排在 canonical 字段之后，按用户输入顺序原样透传。
 */
export const CANONICAL_ORDER = Object.freeze([
  'serverName',
  'transport',
  'command',
  'args',
  'env',
  'cwd',
  'url',
  'headers',
  'toolCallTimeoutMs',
  'maxInstructionBytes',
  'failOnStartupError',
  'reconnect',
  // 兜底声明：`disabled` 正常路径上会被 store 提到条目级（`serializeEntry` 的
  // `entry.disabled`），不会走 config 序列化；放在这里是为了与 KNOWN_FIELDS
  // 保持同一套字段，序列化行为因此可预测。
  'disabled',
]);

/**
 * @typedef {Object} Issue
 * @property {'error'|'warn'} level 级别；只有 error 会拦住提交。
 * @property {string} code 机器可读码，前端按它决定渲染位置。
 * @property {string} path JSON 路径，如 `$.serverName`。
 * @property {number} [line] 1 起行号（仅 JSON 语法错误有）。
 * @property {number} [column] 1 起列号（仅 JSON 语法错误有）。
 * @property {string} message 中文文案。
 */

/** 级别常量：避免出现魔法字符串。 */
const LEVEL_ERROR = 'error';
const LEVEL_WARN = 'warn';

/**
 * 判断一个值是不是"纯对象"（可用于 string→string 字典判定）。
 * @param {unknown} value 待判定的值。
 * @returns {boolean} 是普通对象返回 true。
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 判断一个值是不是"字符串: 字符串"字典。
 * @param {unknown} value 待判定的值。
 * @returns {boolean} 合法返回 true。
 */
function isStringMap(value) {
  if (!isPlainObject(value)) return false;
  for (const key of Object.keys(value)) {
    if (typeof value[key] !== 'string') return false;
  }
  return true;
}

/**
 * 把字符偏移换算成 1 起的行列号。
 *
 * V8 的报错信息里不一定带 line/column（老版本只有 position），自己换算一遍
 * 才能保证"第 N 行"在两端都可用。
 * @param {string} text 原文。
 * @param {number} offset 字符偏移。
 * @returns {{line: number, column: number}} 行列号。
 */
function offsetToLineColumn(text, offset) {
  const at = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lastBreak = -1;
  for (let i = 0; i < at; i += 1) {
    if (text[i] === '\n') {
      line += 1;
      lastBreak = i;
    }
  }
  return { line, column: at - lastBreak };
}

/**
 * 定位 JSON 里第一个语法错误的字符偏移。
 *
 * V8 只在**部分**错误里给 position（"Expected … in JSON at position N"）；
 * 最常见的 `Unexpected token '}'` 那条只附一段源码预览。与其让用户看到
 * "未知位置"，不如自己扫一遍——扫描器只判结构，不建对象，几十行即可。
 *
 * @param {string} text JSON 文本。
 * @returns {number} 出错处的字符偏移；文本本来合法返回 -1。
 */
function findJsonErrorOffset(text) {
  const n = text.length;
  let i = 0;

  /** 跳过空白。 */
  const skipWs = () => {
    while (i < n && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) {
      i += 1;
    }
  };

  /** 读一个字符串字面量。 */
  const readString = () => {
    if (text[i] !== '"') return false;
    i += 1;
    while (i < n) {
      const char = text[i];
      if (char === '\\') {
        i += 2;
        continue;
      }
      if (char === '"') {
        i += 1;
        return true;
      }
      if (char === '\n' || char === '\r') return false;
      i += 1;
    }
    return false;
  };

  /** 读一个数字。 */
  const readNumber = () => {
    if (text[i] === '-' || text[i] === '+') i += 1;
    let digits = 0;
    while (i < n && text[i] >= '0' && text[i] <= '9') {
      i += 1;
      digits += 1;
    }
    if (digits === 0) return false;
    if (text[i] === '.') {
      i += 1;
      let frac = 0;
      while (i < n && text[i] >= '0' && text[i] <= '9') {
        i += 1;
        frac += 1;
      }
      if (frac === 0) return false;
    }
    if (text[i] === 'e' || text[i] === 'E') {
      i += 1;
      if (text[i] === '-' || text[i] === '+') i += 1;
      let exp = 0;
      while (i < n && text[i] >= '0' && text[i] <= '9') {
        i += 1;
        exp += 1;
      }
      if (exp === 0) return false;
    }
    return true;
  };

  /** 读一个对象或数组。 */
  const readContainer = (open) => {
    const close = open === '{' ? '}' : ']';
    i += 1;
    skipWs();
    if (i < n && text[i] === close) {
      i += 1;
      return true;
    }
    for (;;) {
      if (open === '{') {
        skipWs();
        if (i >= n || text[i] !== '"' || readString() !== true) return false;
        skipWs();
        if (text[i] !== ':') return false;
        i += 1;
        if (readValue() !== true) return false;
      } else if (readValue() !== true) {
        return false;
      }
      skipWs();
      if (i >= n) return false;
      if (text[i] === ',') {
        i += 1;
        continue;
      }
      if (text[i] === close) {
        i += 1;
        return true;
      }
      return false;
    }
  };

  /** 读任意值。 */
  const readValue = () => {
    skipWs();
    if (i >= n) return false;
    const char = text[i];
    if (char === '"') return readString();
    if (char === '{' || char === '[') return readContainer(char);
    if (text.startsWith('true', i) || text.startsWith('false', i) || text.startsWith('null', i)) {
      i += char === 'n' ? 4 : char === 't' ? 4 : 5;
      return true;
    }
    if (char === '-' || (char >= '0' && char <= '9')) return readNumber();
    return false;
  };

  skipWs();
  if (i >= n) return 0;
  if (readValue() !== true) return i;
  skipWs();
  if (i < n) return i;
  return -1;
}

/**
 * JSON.parse + 行列号。
 *
 * @param {string} text JSON 文本。
 * @returns {{ok: true, value: unknown} | {ok: false, message: string, reason: string, line?: number, column?: number}} 解析结果。
 */
export function parseJsonWithPosition(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 去掉 V8 附带的源码预览与 position 尾巴，只留一句干净的"为什么错"。
    const reason = message
      .replace(/ is not valid JSON$/, '')
      .replace(/ in JSON at position \d+[\s\S]*$/, '')
      .replace(/, (?:\.\.\.)?"[\s\S]*$/, '')
      .trim();
    const positionMatch = /at position (\d+)/.exec(message);
    const lineMatch = /\(line (\d+) column (\d+)\)/.exec(message);
    if (lineMatch !== null) {
      return {
        ok: false,
        message,
        reason,
        line: Number(lineMatch[1]),
        column: Number(lineMatch[2]),
      };
    }
    let offset = positionMatch === null ? -1 : Number(positionMatch[1]);
    if (offset < 0) offset = findJsonErrorOffset(text);
    if (offset < 0) return { ok: false, message, reason };
    const { line, column } = offsetToLineColumn(text, offset);
    return { ok: false, message, reason, line, column };
  }
}

/**
 * 造一条 issue。
 * @param {'error'|'warn'} level 级别。
 * @param {string} code 错误码。
 * @param {string} path JSON 路径。
 * @param {string} message 文案。
 * @returns {Issue} issue。
 */
function issue(level, code, path, message) {
  return { level, code, path, message };
}

/**
 * 拆掉 `{ mcpServers: { <name>: {...} } }` 这层外壳。
 *
 * @param {Record<string, unknown>} record 顶层对象。
 * @param {Issue[]} issues issue 收集器（原地追加）。
 * @returns {{input: Record<string, unknown>}|null} 拆壳结果；`null` 表示没有外壳
 *   或外壳形状不对（错误已写进 issues）。
 */
function unwrapServers(record, issues) {
  const wrapperKey = WRAPPER_KEYS.find((key) => record[key] !== undefined);
  if (wrapperKey === undefined) return null;
  const wrapper = record[wrapperKey];
  if (!isPlainObject(wrapper)) {
    issues.push(issue(LEVEL_ERROR, 'E_WRAPPER', `$.${wrapperKey}`, `${wrapperKey} 必须是一个对象`));
    return { input: null };
  }
  const names = Object.keys(/** @type {Record<string, unknown>} */ (wrapper));
  if (names.length === 0) {
    issues.push(issue(LEVEL_ERROR, 'E_WRAPPER', `$.${wrapperKey}`, `${wrapperKey} 里没有任何服务器`));
    return { input: null };
  }
  if (names.length > 1) {
    // 本页一次只写一条：多给就得替用户猜，猜错等于往配置里塞他不要的东西。
    const shown = names.slice(0, 5).join('、') + (names.length > 5 ? '…' : '');
    issues.push(
      issue(
        LEVEL_ERROR,
        'E_WRAPPER_MULTI',
        `$.${wrapperKey}`,
        `${wrapperKey} 里有 ${names.length} 个服务器（${shown}），一次只能添加一个`,
      ),
    );
    return { input: null };
  }
  const name = names[0];
  const body = /** @type {Record<string, unknown>} */ (wrapper)[name];
  if (!isPlainObject(body)) {
    issues.push(
      issue(LEVEL_ERROR, 'E_WRAPPER', `$.${wrapperKey}.${name}`, `${wrapperKey}.${name} 必须是一个对象`),
    );
    return { input: null };
  }

  const siblings = Object.keys(record).filter((key) => key !== wrapperKey);
  if (siblings.length > 0) {
    issues.push(
      issue(
        LEVEL_WARN,
        'W_WRAPPER_EXTRA',
        '$',
        `已按 ${wrapperKey} 里的 "${name}" 解析，同级字段（${siblings.slice(0, 5).join('、')}）未采用`,
      ),
    );
  }

  /** @type {Record<string, unknown>} */
  const input = { .../** @type {Record<string, unknown>} */ (body) };
  if (input.serverName !== undefined && input.serverName !== name) {
    issues.push(
      issue(
        LEVEL_WARN,
        'W_NAME_OVERRIDDEN',
        '$.serverName',
        `serverName 取集合键 "${name}"，条目里写的那个已忽略`,
      ),
    );
  }
  input.serverName = name;
  return { input };
}

/**
 * 把各种来源的传输字段收敛成 `transport`，并按需给出提示。
 *
 * 认三种写法：DSH 的 `transport`、Claude 的 `transportType`、以及各家通用的
 * `type`。别名（`sse` / `http` …）先归一再进 R3；两个来源字段映射完即丢弃，
 * 不留在结果里当"未知字段"写进配置。
 *
 * @param {Record<string, unknown>} input 已拆壳的输入（**原地修改**）。
 * @param {Issue[]} issues issue 收集器。
 * @returns {void}
 */
function adoptTransport(input, issues) {
  let raw = typeof input.transport === 'string' ? input.transport : undefined;
  if (raw === undefined) {
    for (const alias of ['transportType', 'type']) {
      if (typeof input[alias] === 'string') {
        raw = /** @type {string} */ (input[alias]);
        break;
      }
    }
  }
  delete input.transportType;
  delete input.type;

  if (raw === undefined) {
    // 没写传输方式：按形状推断（有 command 就是本地进程，有 url 就是远程）。
    if (typeof input.command === 'string') {
      input.transport = 'stdio';
      issues.push(issue(LEVEL_WARN, 'W_INFER_TRANSPORT', '$.transport', '未写传输方式，按 command 推断为 stdio'));
    } else if (typeof input.url === 'string') {
      input.transport = 'streamable-http';
      issues.push(
        issue(LEVEL_WARN, 'W_INFER_TRANSPORT', '$.transport', '未写传输方式，按 url 推断为 streamable-http'),
      );
    }
    return;
  }

  const key = raw.trim().toLowerCase();
  const mapped = TRANSPORT_ALIASES[key];
  if (mapped === undefined) {
    // 认不出来的值原样留着，交给 R3 报错（错误文案里会带上这个值）。
    input.transport = raw;
    return;
  }
  input.transport = mapped;
  if (key === 'sse') {
    issues.push(
      issue(
        LEVEL_WARN,
        'W_SSE',
        '$.transport',
        'DSH 不支持 SSE，已按 streamable-http 写入；连不上时请改用该服务的 streamable-http 地址',
      ),
    );
  } else if (input.transport !== raw) {
    issues.push(
      issue(LEVEL_WARN, 'W_TRANSPORT_ALIAS', '$.transport', `传输方式 "${raw}" 已归一为 ${mapped}`),
    );
  }
}

/**
 * 输入整形：拆壳 → 收敛传输字段。**返回新对象，不改调用方传进来的值**
 * （`validateConfig` 会被同一个 fixture 反复调用，绝不能被写脏）。
 *
 * @param {Record<string, unknown>} value 顶层对象。
 * @param {Issue[]} issues issue 收集器。
 * @returns {Record<string, unknown>|null} 整形后的输入；形状不对返回 null。
 */
function adoptInput(value, issues) {
  const unwrapped = unwrapServers(value, issues);
  if (unwrapped !== null) {
    if (unwrapped.input === null) return null;
    adoptTransport(unwrapped.input, issues);
    return unwrapped.input;
  }
  const input = { ...value };
  adoptTransport(input, issues);
  return input;
}

/**
 * 不含唯一性的纯规则校验（R1–R4、R6–R17）。
 *
 * 浏览器与宿主都可直接调用：它不碰任何 I/O。
 *
 * @param {unknown} value 已解析的 JSON 顶层值。
 * @returns {{issues: Issue[], normalized: object|null}} 校验结果；有 ERROR 时
 *   `normalized` 为 null。
 */
export function validateConfig(value) {
  /** @type {Issue[]} */
  const issues = [];

  // R2 顶层必须是对象。
  if (!isPlainObject(value)) {
    issues.push(issue(LEVEL_ERROR, 'E_ROOT', '$', '配置必须是一个 JSON 对象'));
    return { issues, normalized: null };
  }
  const adopted = adoptInput(/** @type {Record<string, unknown>} */ (value), issues);
  if (adopted === null) return { issues, normalized: null };
  const input = adopted;

  // R3 transport 必填且合法。
  const transport = input.transport;
  const transportOk = typeof transport === 'string' && TRANSPORTS.includes(transport);
  if (!transportOk) {
    issues.push(
      issue(
        LEVEL_ERROR,
        'E_TRANSPORT',
        '$.transport',
        typeof transport === 'string'
          ? `不支持 transport "${transport}"，只能是 stdio 或 streamable-http`
          : 'transport 必填，只能是 stdio 或 streamable-http',
      ),
    );
  }

  // R4 serverName 格式。
  const rawName = input.serverName;
  const nameOk = typeof rawName === 'string' && SERVER_NAME_RE.test(rawName);
  if (!nameOk) {
    issues.push(
      issue(LEVEL_ERROR, 'E_NAME', '$.serverName', 'serverName 只能包含字母、数字、下划线和连字符，长度 1–32'),
    );
  }

  // R6 stdio 需要 command。
  if (transport === 'stdio' && (typeof input.command !== 'string' || input.command.trim() === '')) {
    issues.push(issue(LEVEL_ERROR, 'E_COMMAND', '$.command', 'stdio 传输必须提供 command'));
  }

  // R7 args 必须是字符串数组。
  if (input.args !== undefined) {
    const ok = Array.isArray(input.args) && input.args.every((item) => typeof item === 'string');
    if (!ok) issues.push(issue(LEVEL_ERROR, 'E_ARGS', '$.args', 'args 必须是字符串数组'));
  }

  // R8 env 必须是「字符串: 字符串」对象。
  if (input.env !== undefined && !isStringMap(input.env)) {
    issues.push(issue(LEVEL_ERROR, 'E_ENV', '$.env', 'env 必须是「字符串: 字符串」对象'));
  }

  // R9 cwd 必须是非空字符串。
  if (input.cwd !== undefined && (typeof input.cwd !== 'string' || input.cwd === '')) {
    issues.push(issue(LEVEL_ERROR, 'E_CWD', '$.cwd', 'cwd 必须是字符串'));
  }

  // R10 http 需要可解析的 url。
  let urlOk = false;
  if (transport === 'streamable-http') {
    urlOk = typeof input.url === 'string' && isHttpUrl(input.url);
    if (!urlOk) {
      issues.push(issue(LEVEL_ERROR, 'E_URL', '$.url', 'streamable-http 传输必须提供合法的 url'));
    }
  }

  // R11 headers 必须是「字符串: 字符串」对象。
  if (input.headers !== undefined && !isStringMap(input.headers)) {
    issues.push(issue(LEVEL_ERROR, 'E_HEADERS', '$.headers', 'headers 必须是「字符串: 字符串」对象'));
  }

  // R12 toolCallTimeoutMs：1–600000 的整数。
  if (input.toolCallTimeoutMs !== undefined) {
    const v = input.toolCallTimeoutMs;
    if (!Number.isInteger(v) || v < 1 || v > 600000) {
      issues.push(issue(LEVEL_ERROR, 'E_TIMEOUT', '$.toolCallTimeoutMs', 'toolCallTimeoutMs 必须是 1–600000 的整数'));
    }
  }

  // R13 maxInstructionBytes：正整数。
  if (input.maxInstructionBytes !== undefined) {
    const v = input.maxInstructionBytes;
    if (!Number.isInteger(v) || v < 1) {
      issues.push(issue(LEVEL_ERROR, 'E_BYTES', '$.maxInstructionBytes', 'maxInstructionBytes 必须是正整数'));
    }
  }

  // R14 failOnStartupError：布尔。
  if (input.failOnStartupError !== undefined && typeof input.failOnStartupError !== 'boolean') {
    issues.push(issue(LEVEL_ERROR, 'E_FAIL', '$.failOnStartupError', 'failOnStartupError 必须是布尔值'));
  }

  // R17 disabled：布尔（cordis 原生条目级停用键）。
  if (input.disabled !== undefined && typeof input.disabled !== 'boolean') {
    issues.push(issue(LEVEL_ERROR, 'E_DISABLED', '$.disabled', 'disabled 必须是布尔值'));
  }

  // R15 字段与传输方式不匹配。
  if (transport === 'stdio') {
    for (const field of ['url', 'headers']) {
      if (input[field] !== undefined) {
        issues.push(issue(LEVEL_ERROR, 'E_MISMATCH', `$.${field}`, `stdio 传输不支持 ${field} 字段`));
      }
    }
  }
  if (transport === 'streamable-http') {
    for (const field of ['command', 'args', 'cwd']) {
      if (input[field] !== undefined) {
        issues.push(issue(LEVEL_ERROR, 'E_MISMATCH', `$.${field}`, `streamable-http 传输不支持 ${field} 字段`));
      }
    }
  }

  // R16 未知字段：警告放行（原样写入，不丢弃——丢弃会静默吃掉未来新增的官方字段）。
  for (const field of Object.keys(input)) {
    if (!KNOWN_FIELDS.includes(field)) {
      issues.push(
        issue(
          LEVEL_WARN,
          'W_UNKNOWN',
          `$.${field}`,
          `未知字段 "${field}" 不在已知字段内，将原样写入；若 DSH 不支持则会被忽略`,
        ),
      );
    }
  }

  const hasError = issues.some((item) => item.level === LEVEL_ERROR);
  return { issues, normalized: hasError ? null : normalizeForWrite(input) };
}

/**
 * 判断字符串是不是合法的 http/https URL。
 * @param {string} value 待判定的字符串。
 * @returns {boolean} 合法返回 true。
 */
function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 按 canonical 键序整理待写入的对象，并补默认值。
 *
 * @param {Record<string, unknown>} input 通过全部 ERROR 规则的输入。
 * @returns {Record<string, unknown>} 待写入的对象（新对象）。
 */
function normalizeForWrite(input) {
  /** @type {Record<string, unknown>} */
  const output = {};
  for (const key of CANONICAL_ORDER) {
    if (input[key] === undefined) continue;
    output[key] = input[key];
  }
  // 未知字段：排在 canonical 之后，按输入顺序原样透传。
  for (const key of Object.keys(input)) {
    if (!CANONICAL_ORDER.includes(key)) output[key] = input[key];
  }
  // 默认值补齐。
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (output[key] === undefined) output[key] = value;
  }
  return output;
}

/**
 * 唯一性校验（R5）。
 *
 * `taken.serverNames` 是**全文件**所有可解析的 `dsh-mcp-client` 条目的
 * serverName（含只读条目——serverName 是工具 namespace，撞了就是撞了）；
 * `taken.ids` 是全文所有顶层条目的 id。
 *
 * @param {Record<string, unknown>|null} normalized 已通过规则校验的对象。
 * @param {{serverNames?: string[], ids?: string[]}} taken 已被占用的名字集合。
 * @returns {Issue[]} 唯一性相关的 issue 列表。
 */
export function checkUniqueness(normalized, taken = {}) {
  /** @type {Issue[]} */
  const issues = [];
  if (normalized === null || typeof normalized !== 'object') return issues;
  const serverNames = Array.isArray(taken.serverNames) ? taken.serverNames : [];
  const ids = Array.isArray(taken.ids) ? taken.ids : [];
  const name = typeof normalized.serverName === 'string' ? normalized.serverName : '';
  if (name !== '' && serverNames.includes(name)) {
    issues.push(issue(LEVEL_ERROR, 'E_DUP', '$.serverName', `serverName "${name}" 已存在，请换一个名字`));
  }
  const id = name === '' ? '' : `mcp-${name}`;
  if (id !== '' && ids.includes(id)) {
    issues.push(
      issue(LEVEL_ERROR, 'E_DUP', '$.id', `条目 id "${id}" 已被占用，请换一个 serverName`),
    );
  }
  return issues;
}

/**
 * 组合入口：前端与后端**只准调这一个**。
 *
 * @param {string} text 用户录入的 JSON 文本。
 * @param {{existingServerNames?: string[], existingIds?: string[]}} [ctx] 已存在的名字集合。
 * @returns {{ok: boolean, value: object|null, issues: Issue[]}} 校验结果。
 */
export function validateServerInput(text, ctx = {}) {
  const parsed = parseJsonWithPosition(text);
  if (parsed.ok !== true) {
    const line = typeof parsed.line === 'number' ? parsed.line : 0;
    const column = typeof parsed.column === 'number' ? parsed.column : 0;
    const where = line > 0 ? `第 ${line} 行第 ${column} 列` : '未知位置';
    return {
      ok: false,
      value: null,
      issues: [
        {
          level: LEVEL_ERROR,
          code: 'E_JSON',
          path: '$',
          line: line > 0 ? line : undefined,
          column: column > 0 ? column : undefined,
          message: `JSON 语法错误（${where}）：${parsed.reason}`,
        },
      ],
    };
  }

  const { issues, normalized } = validateConfig(parsed.value);
  const uniqueness = checkUniqueness(normalized, {
    serverNames: ctx.existingServerNames ?? [],
    ids: ctx.existingIds ?? [],
  });
  const all = issues.concat(uniqueness);
  return {
    ok: !all.some((item) => item.level === LEVEL_ERROR),
    value: normalized,
    issues: all,
  };
}
