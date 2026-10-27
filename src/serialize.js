/**
 * YAML 文本层：序列化 + 极小的标量/流样式解析 + env 脱敏。
 *
 * 这个模块**只做文本**，不做 I/O、不做全量解析：它的存在是为了让
 * `patch-store.js` 能在"不解析整个文件"的前提下完成「生成规范化条目」与
 * 「回显时脱敏」这两件事（PRD D1）。
 *
 * 能力边界是**有意**很窄的：顶层序列项 + 2 空格键 + 4 空格子块 + 两种流样式。
 * 超出边界的形状由调用方降级为「不可解析 · 只读」，绝不猜。
 */
import { CANONICAL_ORDER } from './validate.js';

/** 脱敏占位符：env 的值在回显时一律换成它。 */
export const REDACTED_LITERAL = "'••••'";

/** cordis 里 MCP 客户端条目的固定 name。 */
export const MCP_CLIENT_NAME = '@deepseek-ai/dsh-mcp-client';

/**
 * 探测文件的换行符。
 *
 * **绝不归一化整个文件**——用户的文件用什么换行，我们新增的行就用什么换行。
 *
 * @param {string} text 文件内容。
 * @returns {'\n'|'\r\n'} 换行符。
 */
export function detectNewline(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * 把字符串写成 YAML 单引号标量。
 *
 * 单引号里只有 `'` 需要转义（写成两个）；含换行/制表符时退回双引号 + JSON
 * 转义——单引号标量里塞裸换行会直接把 YAML 结构搞坏。
 *
 * @param {string} value 字符串。
 * @returns {string} YAML 标量文本。
 */
export function quoteScalar(value) {
  const text = String(value);
  if (/[\n\r\t]/.test(text)) return JSON.stringify(text);
  return `'${text.replace(/'/g, "''")}'`;
}

/**
 * 把任意 JS 值写成 YAML 标量文本。
 *
 * `!!js ` 开头的字符串**原样输出**（不加引号）：这是 cordis 的私有 tag，
 * 加上引号就变成了字面量字符串，用户的 `process.env` 表达式会静默失效。
 *
 * @param {unknown} value 值。
 * @returns {string} YAML 标量文本。
 */
export function valueToYaml(value) {
  if (typeof value === 'string') {
    return value.startsWith('!!js') ? value : quoteScalar(value);
  }
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (value === null || value === undefined) return 'null';
  return quoteScalar(String(value));
}

/**
 * 在顶层分隔符上切分（忽略引号与括号内部的分隔符）。
 *
 * @param {string} text 文本。
 * @param {string} separator 分隔符（单个字符）。
 * @returns {string[]} 切分后的片段（已去掉两端空白）。
 */
export function splitTopLevel(text, separator) {
  /** @type {string[]} */
  const parts = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote !== '') {
      current += char;
      if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '{' || char === '[') depth += 1;
    if (char === '}' || char === ']') depth = Math.max(0, depth - 1);
    if (char === separator && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  const tail = current.trim();
  if (tail !== '') parts.push(tail);
  return parts;
}

/**
 * 把一个 `key: value` 文本拆成键值对。
 *
 * @param {string} text 形如 `serverName: github` 的文本。
 * @returns {{key: string, value: string}|null} 拆不出来（纯标量等）返回 null。
 */
export function splitPair(text) {
  const match =
    /^(?:'([^']*)'|"([^"]*)"|([A-Za-z0-9_.$-]+))\s*:\s*([\s\S]*)$/.exec(text.trim());
  if (match === null) return null;
  const key = match[1] ?? match[2] ?? match[3];
  if (key === undefined || key === '') return null;
  return { key, value: match[4] };
}

/**
 * 解析一个 YAML 标量。
 *
 * @param {string} text 标量文本（已去两端空白）。
 * @returns {{kind: 'string'|'number'|'boolean'|'null'|'expression', value: string|number|boolean|null}} 解析结果。
 */
export function parseScalar(text) {
  const raw = text.trim();
  if (raw === '' || raw === 'null' || raw === '~') return { kind: 'null', value: null };
  // cordis 私有 tag：原样保留整串表达式，绝不求值、绝不当成普通字符串。
  if (raw.startsWith('!!js')) return { kind: 'expression', value: raw };
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
    return { kind: 'string', value: raw.slice(1, -1).replace(/''/g, "'") };
  }
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    try {
      const parsed = JSON.parse(raw);
      return { kind: typeof parsed === 'string' ? 'string' : 'string', value: String(parsed) };
    } catch {
      return { kind: 'string', value: raw.slice(1, -1) };
    }
  }
  if (raw === 'true' || raw === 'True') return { kind: 'boolean', value: true };
  if (raw === 'false' || raw === 'False') return { kind: 'boolean', value: false };
  if (/^-?(0|[1-9]\d*)$/.test(raw)) return { kind: 'number', value: Number(raw) };
  if (/^-?\d+\.\d+$/.test(raw)) return { kind: 'number', value: Number(raw) };
  return { kind: 'string', value: raw };
}

/**
 * 解析流样式序列 `[a, b]`。
 * @param {string} text 含方括号的文本。
 * @returns {unknown[]} 元素值数组。
 */
export function parseFlowSeq(text) {
  const inner = text.trim().replace(/^\[/, '').replace(/\]\s*$/, '');
  if (inner.trim() === '') return [];
  return splitTopLevel(inner, ',').map((item) => parseScalar(item).value);
}

/**
 * 解析流样式映射 `{a: 1, b: 2}`。
 * @param {string} text 含花括号的文本。
 * @returns {Record<string, unknown>} 键值对象。
 */
export function parseFlowMap(text) {
  const inner = text.trim().replace(/^\{/, '').replace(/\}\s*$/, '');
  /** @type {Record<string, unknown>} */
  const out = {};
  if (inner.trim() === '') return out;
  for (const part of splitTopLevel(inner, ',')) {
    const pair = splitPair(part);
    if (pair === null) continue;
    out[pair.key] = parseScalar(pair.value).value;
  }
  return out;
}

/**
 * 把一个 config 值渲染成若干 YAML 行（块风格）。
 *
 * 块风格而不是官方 README 的流风格：块风格对本项目的行级扫描器是**可无损
 * 往返**的，流风格里出现 `!!js`、引号转义、嵌套对象时会显著增加歧义。
 * 两者对 cordis 完全等价。
 *
 * @param {string} key 键名。
 * @param {unknown} value 值。
 * @param {string} pad 键所在行的缩进。
 * @param {string} childPad 子项缩进。
 * @returns {string[]} YAML 行数组。
 */
function renderValue(key, value, pad, childPad) {
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${pad}${key}: []`];
    /** @type {string[]} */
    const lines = [`${pad}${key}:`];
    for (const item of value) lines.push(`${childPad}- ${valueToYaml(item)}`);
    return lines;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(/** @type {Record<string, unknown>} */ (value));
    if (entries.length === 0) return [`${pad}${key}: {}`];
    /** @type {string[]} */
    const lines = [`${pad}${key}:`];
    for (const [childKey, childValue] of entries) {
      // 值里的 `!!js ` 原样输出，不加引号（见 valueToYaml）。
      lines.push(`${childPad}${childKey}: ${valueToYaml(childValue)}`);
    }
    return lines;
  }
  return [`${pad}${key}: ${valueToYaml(value)}`];
}

/**
 * 把一个条目对象渲染成规范化 YAML 行数组。
 *
 * 键序固定为 `CANONICAL_ORDER`（+ 未知字段按输入顺序），保证同一输入两次
 * 生成的结果逐字节相同。
 *
 * @param {{id: string, name?: string, disabled?: boolean, config: Record<string, unknown>}} entry 条目。
 * @param {string} [indent] 条目首行的缩进（顶层序列用空串）。
 * @returns {string[]} YAML 行数组（不含换行符）。
 */
export function serializeEntry(entry, indent = '') {
  const name = typeof entry.name === 'string' && entry.name !== '' ? entry.name : MCP_CLIENT_NAME;
  const bodyPad = `${indent}  `;
  const configPad = `${bodyPad}  `;
  const childPad = `${configPad}  `;
  /** @type {string[]} */
  const lines = [`${indent}- id: ${quoteScalar(entry.id)}`, `${bodyPad}name: ${quoteScalar(name)}`];
  // 停用用 cordis 原生键：`disabled: true`。
  if (entry.disabled === true) lines.push(`${bodyPad}disabled: true`);
  lines.push(`${bodyPad}config:`);
  const config = entry.config !== null && typeof entry.config === 'object' ? entry.config : {};
  for (const key of CANONICAL_ORDER) {
    if (config[key] === undefined) continue;
    lines.push(...renderValue(key, config[key], configPad, childPad));
  }
  for (const key of Object.keys(config)) {
    if (CANONICAL_ORDER.includes(key)) continue;
    lines.push(...renderValue(key, config[key], configPad, childPad));
  }
  return lines;
}

/**
 * 把流样式 `env: {...}` 里的值替换成脱敏占位符（保留 key）。
 * @param {string} inner 花括号内的文本。
 * @returns {string} 重建后的流样式文本（含花括号）。
 */
function redactFlowPairs(inner) {
  /** @type {string[]} */
  const rebuilt = [];
  for (const part of splitTopLevel(inner, ',')) {
    const pair = splitPair(part);
    if (pair === null) {
      // 认不出来的片段：宁可多打一个占位符，也不能漏出原文。
      if (rebuilt.length === 0) rebuilt.push(REDACTED_LITERAL);
      else rebuilt[rebuilt.length - 1] = `${rebuilt[rebuilt.length - 1]}, ${REDACTED_LITERAL}`;
      continue;
    }
    const value = pair.value.trim();
    rebuilt.push(`${pair.key}: ${value.startsWith('!!js') ? value : REDACTED_LITERAL}`);
  }
  return `{ ${rebuilt.join(', ')} }`;
}

/**
 * env 键的识别正则。
 *
 * 键可能被写成 `env` / `'env'` / `"env"`（不少格式化工具会给键加引号）——三种
 * 都得认，否则整个 env 块会被跳过，那等于把明文 token 直接下发给浏览器。
 * 注意 `environment:` 之类不能误命中：`env` 之后必须紧跟可选的空白与冒号。
 */
const ENV_KEY_RE = /^(\s*)(?:'env'|"env"|env)\s*:\s*([\s\S]*)$/;

/**
 * 兜底守门：把 env 子树里**所有**还没脱敏的值打码。
 *
 * 主流程已经覆盖了块风格与流风格，但 YAML 形态太多了（引号键、行尾注释、深层
 * 嵌套、块标量…），任何一处漏判就等于把明文 token 下发到浏览器。所以这里再
 * 无条件扫一遍整个 env 子树：凡是有值的行一律打码，`!!js ` 表达式除外（它是
 * 引用不是明文）。**宁可多打码，不可漏明文。**
 *
 * @param {string[]} out 输出行数组（原地修改）。
 * @param {number} index env 键所在行的下标。
 * @param {number} envIndent env 键的缩进宽度。
 * @returns {void}
 */
function redactEnvBlock(out, index, envIndent) {
  for (let j = index + 1; j < out.length; j += 1) {
    const line = out[j];
    if (line.trim() === '') continue;
    const lineIndent = line.length - line.trimStart().length;
    // 缩进回到 env 键这一层（或更浅）：子树结束。
    if (lineIndent <= envIndent) break;
    // 纯注释不是值，不动它。
    if (line.trimStart().startsWith('#')) continue;
    const pair = splitPair(line.trimStart());
    if (pair === null) {
      // 认不出来的行（块标量内容、续行…）：整行打码。
      out[j] = `${' '.repeat(lineIndent)}${REDACTED_LITERAL}`;
      continue;
    }
    const value = pair.value.trim();
    // 父键（`nested:` 这种）没有值可打码，它的子行会被本循环继续处理。
    if (value === '') continue;
    if (value.startsWith('!!js')) continue;
    out[j] = `${' '.repeat(lineIndent)}${pair.key}: ${REDACTED_LITERAL}`;
  }
}

/**
 * env 脱敏：把条目原文里 env 的值一律换成占位符，**保留 key**。
 *
 * `!!js ` 表达式原样保留——它是「去宿主环境变量里取」，本身就是引用而非明文，
 * 且用户需要看到自己配的是表达式。
 *
 * @param {string} text 条目原始 YAML 文本。
 * @returns {string} 脱敏后的文本（换行符与原文本一致）。
 */
export function redactEnvValues(text) {
  const newline = detectNewline(text);
  const lines = text.split(/\r?\n/);
  const out = lines.slice();
  for (let i = 0; i < lines.length; i += 1) {
    const match = ENV_KEY_RE.exec(lines[i]);
    if (match === null) continue;
    const indent = match[1];
    const rest = match[2].trim();
    // 空值，或值的位置只有一个行尾注释（`env: # 备注`）：都是块风格，子行在后面。
    // 早先把"带行尾注释"当成"有内联值"处理，于是子行一行都没被脱敏。
    if (rest === '' || rest.startsWith('#')) {
      redactEnvBlock(out, i, indent.length);
      continue;
    }
    if (rest.startsWith('{')) {
      out[i] = `${indent}env: ${redactFlowPairs(rest.replace(/^\{/, '').replace(/\}\s*$/, ''))}`;
      redactEnvBlock(out, i, indent.length);
      continue;
    }
    // 无法枚举 key 的形态（整值表达式、块标量…）：整值脱敏，绝不留原文。
    out[i] = `${indent}env: ${REDACTED_LITERAL}`;
    redactEnvBlock(out, i, indent.length);
  }
  return out.join(newline);
}
