/**
 * 受管段读写核心。
 *
 * 这是整个插件风险最高的 250 行：**它在改用户的资产文件**
 * （`~/.dsh/profiles/<profile>/cordis.patch.yml`）。因此这里有三条不许破的纪律：
 *
 * 1. **绝不「解析 YAML → 改对象 → 全量 dump」**。文件里有用户注释与 cordis 私有
 *    `!!js` tag，一次全量 dump 就会把 `!!js process.env.TOKEN` 静默写成字面量
 *    ——不可逆的损坏。所有写操作都是「在 `scan()` 出来的行区间上做字符串拼接」，
 *    段外一个字节都不碰。
 * 2. **写前重新扫描**。唯一性判断永远发生在"落盘前的最后一次 scan"上，而不是
 *    页面内存的旧列表上——这是"刷新页面不会重复插入"的全部原因。
 * 3. **原子写 + 备份 + 回滚**。tmp → fsync → rename；任一异常自动把 `.bak` 拷回。
 *    任意时刻文件内容 ∈ {改前, 改后}。
 *
 * 全部逻辑只依赖注入的 `fs` 与 `filePath`，因此可以在 tmp 目录里被完整单测。
 */
import { createHash } from 'node:crypto';
import * as nodeFs from 'node:fs';
import { dirname } from 'node:path';
import { normalizeConfig } from './config.js';
import { resolveHomeDir, resolvePatchTarget, toDisplayPath } from './paths.js';
import {
  MCP_CLIENT_NAME,
  SECRET_KEYS,
  detectNewline,
  parseFlowMap,
  parseFlowSeq,
  parseScalar,
  redactSecretValues,
  serializeEntry,
  splitPair,
} from './serialize.js';
import { TRANSPORTS, validateServerInput } from './validate.js';

/**
 * 受管段锚点。**改这里等于改磁盘协议**，必须同步 README 与测试。
 */
export const BEGIN_ANCHOR =
  '# >>> dsh-mcpserver-manager:managed:begin (由「设置 → MCP 管理」维护，请勿手改)';
export const END_ANCHOR = '# <<< dsh-mcpserver-manager:managed:end';

/** 锚点识别正则（容忍锚点后的空白与注释微调）。 */
const BEGIN_RE = /^#\s*>>>\s*dsh-mcpserver-manager:managed:begin\b/;
const END_RE = /^#\s*<<<\s*dsh-mcpserver-manager:managed:end\b/;

/** 条目级键的缩进（顶层序列项下的直接子键）。 */
const ITEM_INDENT = 2;

/**
 * 造一个带错误码的 Error。
 *
 * 错误码是前后端的契约：前端 `api.messageFor(code)` 按它取中文文案。
 * @param {string} code 错误码。
 * @param {string} message 原因。
 * @returns {Error & {code: string}} 错误对象。
 */
export function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * 取错误的人类可读原因（不取堆栈）。
 * @param {unknown} error 异常。
 * @returns {string} 原因文本。
 */
function describe(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * 按换行符切行（保留 `\r\n` 会被下一行的 join 还原）。
 * @param {string} text 文本。
 * @returns {string[]} 行数组。
 */
function splitLines(text) {
  return text.split(/\r?\n/);
}

/**
 * 计算校验和（SHA-256 前 12 位）。
 *
 * 用它而不是 mtime 做外部变更检测（team-lead 裁决 A5）：mtime 在秒级精度的
 * 文件系统上会漏检"同一秒内的并发改动"，那是真实的丢更新风险。配置文件只有
 * 几 KB，哈希成本可忽略。
 * @param {string} text 文件内容。
 * @returns {string} 12 位十六进制校验和。
 */
function checksumOf(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);
}

/**
 * 找锚点。
 *
 * @param {string[]} lines 行数组。
 * @returns {{state: 'ok'|'missing'|'broken', beginLine: number, endLine: number}} 锚点状态。
 */
export function findAnchors(lines) {
  let beginLine = -1;
  let endLine = -1;
  let beginCount = 0;
  let endCount = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (BEGIN_RE.test(trimmed)) {
      beginCount += 1;
      if (beginLine === -1) beginLine = i;
    }
    if (END_RE.test(trimmed)) {
      endCount += 1;
      if (endLine === -1) endLine = i;
    }
  }
  // 只有一个 / 顺序颠倒 / 重复出现 —— 一律 broken：宁可拒绝写，也不猜用户意图。
  const broken = beginCount !== 1 || endCount !== 1 || beginLine >= endLine;
  if (beginCount === 0 && endCount === 0) return { state: 'missing', beginLine: -1, endLine: -1 };
  if (broken) return { state: 'broken', beginLine, endLine };
  return { state: 'ok', beginLine, endLine };
}

/**
 * 去掉条目区间尾部的空行/注释后的空行。
 * @param {string[]} lines 行数组。
 * @param {number} start 起始行。
 * @param {number} end 结束行（不含）。
 * @returns {number} 收紧后的结束行。
 */
function tighten(lines, start, end) {
  let cursor = end;
  while (cursor > start && lines[cursor - 1].trim() === '') cursor -= 1;
  return cursor;
}

/**
 * 切出所有顶层序列项的区间。
 * @param {string[]} lines 行数组。
 * @returns {Array<{start: number, end: number}>} 区间数组。
 */
export function itemSpans(lines) {
  /** @type {Array<{start: number, end: number}>} */
  const spans = [];
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // 顶层序列项：`- ` 必须在列 0（缩进不为 0 的 `- ` 属于上层结构的子块）。
    if (/^-\s/.test(line)) {
      if (start !== -1) spans.push({ start, end: tighten(lines, start, i) });
      start = i;
      continue;
    }
    // 回到列 0 的非空行（受管段锚点注释、文件尾部内容…）：当前条目到此为止。
    // 少了这条判断，段内最后一条条目会把 END 锚点连同段外内容一起吃进去。
    if (start !== -1 && line.trim() !== '' && lineIndentStart(line) === 0) {
      spans.push({ start, end: tighten(lines, start, i) });
      start = -1;
    }
  }
  if (start !== -1) spans.push({ start, end: tighten(lines, start, lines.length) });
  return spans.filter((span) => span.end > span.start);
}

/**
 * 取一个顶层条目的 `id`（用于 id 撞车检测）。
 * @param {string[]} lines 行数组。
 * @param {{start: number, end: number}} span 条目区间。
 * @returns {string|null} id；解析不出返回 null。
 */
function extractId(lines, span) {
  const inline = splitPair(lines[span.start].replace(/^-\s+/, ''));
  if (inline !== null && inline.key === 'id') {
    const value = parseScalar(inline.value).value;
    return typeof value === 'string' && value !== '' ? value : null;
  }
  for (let i = span.start + 1; i < span.end; i += 1) {
    const line = lines[i];
    if (line.trim() === '') continue;
    if (line.length - line.trimStart().length !== ITEM_INDENT) continue;
    const pair = splitPair(line.trimStart());
    if (pair === null || pair.key !== 'id') continue;
    const value = parseScalar(pair.value).value;
    return typeof value === 'string' && value !== '' ? value : null;
  }
  return null;
}

/**
 * 解析单个顶层条目。
 *
 * 只认有限形状（顶层 `- ` 项 / 2 空格键 / 更深的 `config` 子块 / 流样式）。
 * 解析不出来 → `parsable: false`，由调用方降级为「不可解析 · 只读」，
 * **不报错、不写、不猜**。
 *
 * @param {string[]} lines 行数组。
 * @param {{start: number, end: number}} span 条目区间。
 * @param {{state: string, beginLine: number, endLine: number}} anchor 锚点状态。
 * @param {string} newline 换行符。
 * @returns {object|null} ServerItem；不是 MCP 客户端条目时返回 null。
 */
export function parseItem(lines, span, anchor, newline = '\n') {
  /** @type {Array<{key: string, value: string, lineIndex: number}>} */
  const itemKeys = [];
  let configLineIdx = -1;
  let configInline = null;

  for (let i = span.start; i < span.end; i += 1) {
    let text = lines[i];
    let indent = ITEM_INDENT;
    if (i === span.start) {
      text = text.replace(/^-\s+/, '');
    } else {
      if (text.trim() === '') continue;
      indent = lineIndentStart(text);
      if (indent < ITEM_INDENT) continue;
      text = text.trimStart();
    }
    if (text.startsWith('#')) continue;
    const pair = splitPair(text);
    if (pair === null) continue;
    if (pair.key === 'config' && configLineIdx === -1) {
      configLineIdx = i;
      configInline = pair.value.trim() === '' ? null : pair.value.trim();
      continue;
    }
    if (indent === ITEM_INDENT) itemKeys.push({ key: pair.key, value: pair.value.trim(), lineIndex: i });
  }

  // 只认 MCP 客户端条目：其它插件的条目只参与 id 撞车检测，不进列表。
  const nameNode = itemKeys.find((entry) => entry.key === 'name');
  const nameValue = nameNode === undefined ? null : parseScalar(nameNode.value).value;
  if (nameValue !== MCP_CLIENT_NAME) return null;

  /** @type {Array<{key: string, value: string, childLines: string[], lineIndex: number}>} */
  const configKeys = [];
  if (configInline !== null) {
    for (const [key, value] of Object.entries(parseFlowMap(configInline))) {
      configKeys.push({ key, value: '', childLines: [], lineIndex: configLineIdx, flowValue: value });
    }
  } else if (configLineIdx !== -1) {
    /** @type {Array<{line: string, indent: number, index: number}>} */
    const children = [];
    for (let i = configLineIdx + 1; i < span.end; i += 1) {
      const line = lines[i];
      if (line.trim() === '') continue;
      const indent = lineIndentStart(line);
      if (indent <= ITEM_INDENT) break;
      children.push({ line, indent, index: i });
    }
    let minIndent = Number.POSITIVE_INFINITY;
    for (const child of children) minIndent = Math.min(minIndent, child.indent);
    for (let ci = 0; ci < children.length; ci += 1) {
      if (children[ci].indent !== minIndent) continue;
      const pair = splitPair(children[ci].line.trimStart());
      if (pair === null) continue;
      /** @type {string[]} */
      const childLines = [];
      for (let cj = ci + 1; cj < children.length; cj += 1) {
        if (children[cj].indent <= minIndent) break;
        childLines.push(children[cj].line);
      }
      configKeys.push({
        key: pair.key,
        value: pair.value.trim(),
        childLines,
        lineIndex: children[ci].index,
      });
    }
  }

  /**
   * 解析一个 config 键的值（块序列 / 块映射 / 标量）。
   * @param {{value: string, childLines: string[], flowValue?: unknown}} node 键节点。
   * @returns {unknown} 值。
   */
  const resolveValue = (node) => {
    if (node.flowValue !== undefined) return node.flowValue;
    const raw = node.value.trim();
    // 官方 README 的写法是流样式（`args: [...]`、`env: {...}`），必须照读不误。
    if (raw.startsWith('[') && raw.endsWith(']')) return parseFlowSeq(raw);
    if (raw.startsWith('{') && raw.endsWith('}')) return parseFlowMap(raw);
    if (raw !== '') return parseScalar(raw).value;
    const children = node.childLines.filter((line) => line.trim() !== '');
    if (children.length === 0) return null;
    if (children.every((line) => /^\s*-\s/.test(line))) {
      return children.map((line) => parseScalar(line.replace(/^\s*-\s+/, '')).value);
    }
    /** @type {Record<string, unknown>} */
    const map = {};
    for (const line of children) {
      const pair = splitPair(line.trimStart());
      if (pair === null) continue;
      map[pair.key] = parseScalar(pair.value.trim()).value;
    }
    return map;
  };

  /** @type {Record<string, unknown>} */
  const config = {};
  for (const node of configKeys) config[node.key] = resolveValue(node);

  // serverName 必须是"能当键用"的字符串：`!!js` 表达式无法当身份键。
  let serverName = null;
  if (typeof config.serverName === 'string' && config.serverName !== '' && !config.serverName.startsWith('!!js')) {
    serverName = config.serverName;
  }

  const transport = typeof config.transport === 'string' && TRANSPORTS.includes(config.transport)
    ? config.transport
    : null;
  const command = typeof config.command === 'string' ? config.command : null;
  const args = Array.isArray(config.args) ? config.args.filter((item) => typeof item === 'string') : [];
  const url = typeof config.url === 'string' ? config.url : null;
  const cwd = typeof config.cwd === 'string' ? config.cwd : null;
  const timeout = Number.isInteger(config.toolCallTimeoutMs) ? /** @type {number} */ (config.toolCallTimeoutMs) : null;
  const env = config.env !== null && typeof config.env === 'object' && !Array.isArray(config.env)
    ? /** @type {Record<string, unknown>} */ (config.env)
    : null;
  const envKeys = env === null ? [] : Object.keys(env);
  // 请求头**只留键名**：`headers` 与 `env` 一样是密钥常见落脚点（
  // `x-litellm-api-key` / `Authorization`），值一旦进了快照就会被下发到浏览器。
  // 键名本身不是秘密，界面上"带 1 个请求头"比"什么也不显示"有用得多。
  const headers = config.headers !== null && typeof config.headers === 'object' && !Array.isArray(config.headers)
    ? /** @type {Record<string, unknown>} */ (config.headers)
    : null;
  const headerKeys = headers === null ? [] : Object.keys(headers);

  const disabledNode = itemKeys.find((entry) => entry.key === 'disabled');
  let disabledBy = null;
  let disabled = false;
  if (disabledNode !== undefined) {
    const value = disabledNode.value.trim();
    if (value.startsWith('!!js')) {
      // 由表达式控制：不可自动启停，也不该假装它是"已停用"。
      disabledBy = 'expression';
    } else {
      disabledBy = 'native-key';
      disabled = parseScalar(value).value === true;
    }
  }

  const managed = anchor.state === 'ok' && span.start > anchor.beginLine && span.start < anchor.endLine;
  const parsable = configLineIdx !== -1 && serverName !== null;

  let summary = '';
  if (transport === 'streamable-http') summary = url ?? '';
  else if (command !== null) summary = [command, ...args].join(' ').trim();

  const item = {
    id: extractId(lines, span),
    serverName,
    transport,
    summary,
    command,
    args,
    url,
    envKeys,
    headerKeys,
    cwd,
    toolCallTimeoutMs: timeout,
    enabled: disabled !== true,
    managed,
    parsable,
    raw: redactSecretValues(lines.slice(span.start, span.end).join(newline)),
    disabledBy,
    span: { start: span.start, end: span.end },
  };
  // 原始 config 对象（**含 env / headers 明文**）只挂在**不可枚举**属性上。
  //
  // 为什么这么绕：编辑功能需要把整条 config 还原成 JSON 交给前端改，而快照
  // 是要经 HTTP 下发到浏览器的。不可枚举是这里唯一可靠的保险丝——`JSON.stringify`
  // 跳过它、对象展开（`{...item}`）也跳过它，所以任何"顺手把 item 传出去"的
  // 代码都不会泄漏明文，只有显式读 `item.parsed` 的 `configSource()` 拿得到。
  Object.defineProperty(item, 'parsed', { value: config, enumerable: false });
  return item;
}

/**
 * 取一行首个非空白字符的位置（空格与制表符都算缩进）。
 * @param {string} line 行文本。
 * @returns {number} 首个非空白字符的下标。
 */
function lineIndentStart(line) {
  const match = /^\s*/.exec(line);
  return match === null ? 0 : match[0].length;
}

/**
 * 全文件扫描。
 *
 * 读是**全文件**扫的（与是否受管无关）：用户手写的、别的插件写的 MCP 条目
 * 都要能被看见，只是 `managed: false`（只读）。
 *
 * @param {string} text 文件全文。
 * @returns {{items: object[], ids: string[], anchors: 'ok'|'missing'|'broken', beginLine: number, endLine: number, newline: string}} 扫描结果。
 */
export function scan(text) {
  const newline = detectNewline(text);
  const lines = splitLines(text);
  const anchor = findAnchors(lines);
  const spans = itemSpans(lines);
  /** @type {object[]} */
  const items = [];
  /** @type {string[]} */
  const ids = [];
  for (const span of spans) {
    const id = extractId(lines, span);
    if (id !== null) ids.push(id);
    const item = parseItem(lines, span, anchor, newline);
    if (item !== null) items.push(item);
  }
  return {
    items,
    ids,
    anchors: anchor.state,
    beginLine: anchor.beginLine,
    endLine: anchor.endLine,
    newline,
  };
}

/**
 * 确保受管段存在（**幂等**）。
 *
 * 段已存在 → 原样返回（逐字节相同）；段不存在 → 追加到**文件末尾**，
 * 用户原有内容一个字节不动。
 *
 * @param {string} text 文件全文。
 * @returns {string} 结果文本。
 */
export function ensureBlock(text) {
  const anchor = findAnchors(splitLines(text));
  if (anchor.state !== 'missing') return text;
  const newline = detectNewline(text);
  let body = text;
  if (body !== '' && !/\n$/.test(body)) body += newline;
  if (body !== '' && !/\n\n$/.test(body)) body += newline;
  return `${body}${BEGIN_ANCHOR}${newline}${END_ANCHOR}${newline}`;
}

/**
 * 把编辑框里留空的密钥换回原值。
 *
 * 编辑的语义难点在于「密钥从不回显」：`configSource()` 下发的是 `env`/`headers`
 * 的**键名**加上空串值，所以用户在编辑框里看到 `"x-litellm-api-key": ""`。
 * 如果原样写盘，密钥就被空串覆盖了——那不是"没改"，那是**改坏了**。
 *
 * 约定因此很直白：**空串 = 沿用原值**。想换密钥就填新的，想删掉就把整个键删掉
 * （键没了就不会被还原）。这条约定必须写进界面提示，否则就是给用户埋雷。
 *
 * @param {Record<string, unknown>} clientConfig 校验后的新 config（浅拷贝后再改）。
 * @param {Record<string, unknown>|null} previous 条目原有的 config。
 * @returns {Record<string, unknown>} 合并后的 config。
 */
export function restoreSecretValues(clientConfig, previous) {
  const out = { ...clientConfig };
  if (previous === null || typeof previous !== 'object') return out;
  for (const key of SECRET_KEYS) {
    const next = out[key];
    const before = previous[key];
    if (next === null || typeof next !== 'object' || Array.isArray(next)) continue;
    if (before === null || typeof before !== 'object' || Array.isArray(before)) continue;
    /** @type {Record<string, unknown>} */
    const merged = { ...next };
    for (const [name, value] of Object.entries(merged)) {
      // 只认"空串 + 原值是非空字符串"：数字/布尔/`!!js` 都不该被悄悄替换，
      // 而 `!!js process.env.X` 本来就是表达式，用户删了它就是想删。
      if (value === '' && typeof before[name] === 'string' && before[name] !== '') {
        merged[name] = before[name];
      }
    }
    out[key] = merged;
  }
  return out;
}

/**
 * 在受管段末尾追加一条（段不存在则先建段）。
 * @param {string} text 文件全文。
 * @param {string[]} entryLines 条目行（不含换行符）。
 * @returns {string} 结果文本。
 */
export function insertEntry(text, entryLines) {
  const newline = detectNewline(text);
  const withBlock = ensureBlock(text);
  const lines = splitLines(withBlock);
  const anchor = findAnchors(lines);
  if (anchor.state !== 'ok') {
    throw codedError('anchors-broken', '受管段标记被破坏，请手工修复 cordis.patch.yml');
  }
  lines.splice(anchor.endLine, 0, ...entryLines);
  return lines.join(newline);
}

/**
 * 按 serverName 移除受管段内的条目。
 * @param {string} text 文件全文。
 * @param {string} serverName 身份键。
 * @returns {string|null} 结果文本；段内不存在返回 null。
 */
export function removeEntry(text, serverName) {
  const newline = detectNewline(text);
  const target = scan(text).items.find(
    (item) => item.managed === true && item.serverName === serverName,
  );
  if (target === undefined) return null;
  const lines = splitLines(text);
  lines.splice(target.span.start, target.span.end - target.span.start);
  return lines.join(newline);
}

/**
 * 替换受管段内同名条目（编辑用）。
 * @param {string} text 文件全文。
 * @param {string} serverName 身份键。
 * @param {string[]} entryLines 新条目行。
 * @returns {string|null} 结果文本；段内不存在返回 null。
 */
export function replaceEntry(text, serverName, entryLines) {
  const newline = detectNewline(text);
  const target = scan(text).items.find(
    (item) => item.managed === true && item.serverName === serverName,
  );
  if (target === undefined) return null;
  const lines = splitLines(text);
  lines.splice(target.span.start, target.span.end - target.span.start, ...entryLines);
  return lines.join(newline);
}

/**
 * 设置/清除 cordis 原生 `disabled` 键。
 *
 * 停用就是 `disabled: true`——已核实 cordis 的
 * `@deepseek-ai/cordis-plugin-loader` 在启动前会检查 `fiber.entry.disabled`。
 *
 * @param {string} text 文件全文。
 * @param {string} serverName 身份键。
 * @param {boolean} disabled 目标停用状态。
 * @param {boolean} [insertedByUs] **启用时**用：`disabled` 行是插件自己插入的
 *   （原本没有这个键）时为 true → 删掉它；否则（用户原本就写了 `disabled`）
 *   写回 `disabled: false`。这条区分是"停用→启用逐字节可逆"的关键：一律删除
 *   会把用户手写的 `disabled: false` 一起吃掉，而那不是我们能补回来的东西。
 * @returns {string|null} 结果文本；段内不存在、或本来就是目标态返回 null。
 */
export function applyDisable(text, serverName, disabled, insertedByUs = false) {
  const newline = detectNewline(text);
  const target = scan(text).items.find(
    (item) => item.managed === true && item.serverName === serverName,
  );
  if (target === undefined) return null;
  const lines = splitLines(text);
  const { start, end } = target.span;
  let disabledIdx = -1;
  let configIdx = -1;
  let lastKeyIdx = -1;
  for (let i = start + 1; i < end; i += 1) {
    const line = lines[i];
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (lineIndentStart(line) !== ITEM_INDENT) continue;
    const pair = splitPair(line.trimStart());
    if (pair === null) continue;
    lastKeyIdx = i;
    if (pair.key === 'disabled' && disabledIdx === -1) disabledIdx = i;
    if (pair.key === 'config' && configIdx === -1) configIdx = i;
  }
  const pad = ' '.repeat(ITEM_INDENT);
  if (disabled) {
    if (disabledIdx !== -1) {
      lines[disabledIdx] = `${pad}disabled: true`;
      return lines.join(newline);
    }
    const at = configIdx !== -1 ? configIdx : lastKeyIdx !== -1 ? lastKeyIdx + 1 : start + 1;
    lines.splice(at, 0, `${pad}disabled: true`);
    return lines.join(newline);
  }
  if (disabledIdx === -1) return null;
  if (insertedByUs === true) {
    lines.splice(disabledIdx, 1);
    return lines.join(newline);
  }
  // 用户原本就有这个键：只把值翻回 false，绝不整行删掉。
  lines[disabledIdx] = `${pad}disabled: false`;
  return lines.join(newline);
}

/**
 * 创建 store。**filePath / fs / env / now 全部可注入 → 全部逻辑可在 tmp 目录里单测。**
 *
 * 路径来自 `resolvePatchTarget()`：宿主 `profileContext` > 显式路径 > `dshHome` >
 * `$DSH_HOME` > `~/.dsh`（完整优先级见 `paths.js`）。`profileContext` 由装配层
 * （`index.js` 的 `ctx.get('profileContext')`）传进来——store 自己不碰 ctx。
 *
 * @param {{filePath?: string, config?: object, env?: object, fs?: object, now?: () => number,
 *   profileContext?: object}} [options] 选项。
 * @returns {object} store：`{ read, add, remove, setEnabled, filePath, fileDisplay, dshHome, profile, source }`。
 */
export function createPatchStore(options = {}) {
  const fs = options.fs ?? nodeFs;
  const env = options.env ?? process.env;
  const config = normalizeConfig(options.config ?? {});
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  // 路径结论一次性算定：`profile` / `dshHome` / `source` 都跟着它走，页面与日志
  // 因此永远和真正写入的文件一致（BUG-2 的教训：说一套写一套）。
  const target = resolvePatchTarget(config, env, options.profileContext);
  const filePath =
    typeof options.filePath === 'string' && options.filePath !== ''
      ? options.filePath
      : target.filePath;
  const profile = target.profile;
  const dshHome = target.dshHome;
  const source = target.source;
  const fileDisplay = toDisplayPath(filePath, resolveHomeDir(env));
  const backupPath = `${filePath}.bak`;
  const tmpPath = `${filePath}.tmp`;

  /**
   * 记录"这条 `disabled` 行是插件自己插入的（原本没有这个键）"。
   *
   * 启用时必须能区分两种情况：自己插入的 → 删掉；用户原本就写了
   * `disabled: false` 的 → 写回 `false`。否则一刀切删除会把用户的键吃掉。
   *
   * 只在进程内有效；宿主重启后记录丢失，此时启用会**保守地**写回
   * `disabled: false`（保住键）而不是删掉——删掉是不可逆的，多一行
   * `disabled: false` 只是无害。
   * @type {Set<string>}
   */
  const insertedDisabled = new Set();

  /**
   * 读当前文件状态。文件不存在是**正常路径**（空态），不报错。
   * @returns {{text: string, exists: boolean}} 状态。
   */
  const readState = () => {
    let exists = false;
    try {
      exists = fs.existsSync(filePath);
    } catch {
      exists = false;
    }
    if (!exists) return { text: '', exists: false };
    try {
      return { text: fs.readFileSync(filePath, 'utf8'), exists: true };
    } catch (error) {
      throw codedError('file-unreadable', `无法读取配置文件：${describe(error)}`);
    }
  };

  /**
   * fsync 一个文件（best-effort：某些平台/句柄形态不支持，不影响正确性）。
   * @param {string} path 路径。
   * @returns {void}
   */
  const syncFile = (path) => {
    try {
      const fd = fs.openSync(path, 'r');
      try {
        if (typeof fs.fsyncSync === 'function') fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      // 尽力而为：fsync 失败不该让一次本来能成功的写入失败。
    }
  };

  /**
   * 回滚：把 `.bak` 拷回原路径；原本不存在的文件则删掉。
   * @param {{text: string, exists: boolean}} before 改前状态。
   * @param {boolean} backed 是否已落备份。
   * @returns {boolean} 是否真的回滚成功。
   */
  const rollback = (before, backed) => {
    try {
      if (backed) {
        fs.copyFileSync(backupPath, filePath);
        return true;
      }
      if (!before.exists) {
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch {
          // ignore
        }
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  };

  /**
   * 原子写：备份 → 写 tmp → fsync → rename → fsync(dir)；任一异常回滚。
   * @param {{text: string, exists: boolean}} before 改前状态。
   * @param {string} next 新内容。
   * @returns {void}
   */
  const atomicWrite = (before, next) => {
    let backed = false;
    try {
      try {
        fs.mkdirSync(dirname(filePath), { recursive: true });
      } catch {
        // 目录已存在或不可建：写入会自己报错。
      }
      if (before.exists && config.backup) {
        fs.writeFileSync(backupPath, before.text);
        backed = true;
      }
      fs.writeFileSync(tmpPath, next);
      syncFile(tmpPath);
      fs.renameSync(tmpPath, filePath);
      syncFile(dirname(filePath));
    } catch (error) {
      const rolledBack = rollback(before, backed);
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        // ignore
      }
      const wrapped = codedError(
        'write-failed',
        `写入失败，文件${rolledBack ? '已回滚' : '未能回滚'}：${describe(error)}`,
      );
      wrapped.rolledBack = rolledBack;
      throw wrapped;
    }
  };

  /** 进程内写串行化：把「读-改-写」整段锁住。 */
  let queue = Promise.resolve();

  /**
   * 一次受管段变更。
   *
   * @param {(text: string) => {next: string|null, payload: object}} edit 纯编辑函数；
   *   `next === null` 表示无需落盘（幂等的重复操作）。
   * @returns {Promise<object>} payload + revision + checksum。
   */
  const mutate = (edit) => {
    const run = async () => {
      const before = readState();
      const prepared = edit(before.text);
      if (prepared === null || prepared.next === null) {
        return { ...prepared.payload, revision: now(), checksum: checksumOf(before.text) };
      }
      // 读后写前的外部变更拦截（checksum 严格比对，见 checksumOf 的注释）。
      const again = readState();
      if (checksumOf(again.text) !== checksumOf(before.text)) {
        throw codedError('file-changed', '配置文件已被外部修改，请刷新后重试');
      }
      atomicWrite(before, prepared.next);
      return { ...prepared.payload, revision: now(), checksum: checksumOf(prepared.next) };
    };
    const result = queue.then(run, run);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  /**
   * 写前守卫：锚点被破坏时拒绝一切写。
   * @param {ReturnType<typeof scan>} scanned 扫描结果。
   * @returns {void}
   */
  const requireHealthyAnchors = (scanned) => {
    if (scanned.anchors === 'broken') {
      throw codedError('anchors-broken', '受管段标记被破坏，请手工修复 cordis.patch.yml');
    }
  };

  /**
   * 定位一个可写条目，并把各种"不能写"分诊成明确错误码。
   * @param {ReturnType<typeof scan>} scanned 扫描结果。
   * @param {string} serverName 身份键。
   * @returns {object} 命中的条目。
   */
  const requireWritable = (scanned, serverName) => {
    const target = scanned.items.find((item) => item.serverName === serverName);
    if (target === undefined) throw codedError('unknown-server', '该条目已不存在，请刷新列表');
    if (target.managed !== true) throw codedError('readonly-entry', '该条目非本插件管理，无法修改');
    if (target.parsable !== true) {
      throw codedError('unparsable-entry', '该条目格式超出可解析范围，请手工编辑配置文件');
    }
    return target;
  };

  /** 读取快照（纯读，不改文件、不建文件）。 */
  const read = async () => {
    const before = readState();
    const scanned = scan(before.text);
    return {
      file: filePath,
      fileDisplay,
      dshHome,
      profile,
      source,
      exists: before.exists,
      revision: now(),
      checksum: checksumOf(before.text),
      anchors: scanned.anchors,
      items: scanned.items,
      taken: {
        serverNames: scanned.items
          .map((item) => item.serverName)
          .filter((name) => typeof name === 'string'),
        ids: scanned.ids,
      },
    };
  };

  /**
   * 新增一条。校验发生在**落盘前的最后一次 scan** 上——这是幂等的全部原因。
   * @param {string} raw 用户录入的 JSON 文本。
   * @returns {Promise<object>} `{item, revision, checksum}`。
   */
  const add = async (raw) =>
    mutate((text) => {
      const scanned = scan(text);
      requireHealthyAnchors(scanned);
      const { disabled, clientConfig, serverName } = validateOrThrow(raw, scanned);
      const entry = {
        id: `mcp-${serverName}`,
        name: MCP_CLIENT_NAME,
        disabled: disabled === true,
        config: clientConfig,
      };
      const next = insertEntry(text, serializeEntry(entry));
      // 这一行 `disabled` 是插件自己写的：后续"启用"应该删掉整行，而不是
      // 留一行 `disabled: false` 在用户文件里。
      if (disabled === true) insertedDisabled.add(serverName);
      const item = scan(next).items.find((entry2) => entry2.serverName === serverName) ?? null;
      return { next, payload: { item } };
    });

  /**
   * 校验一段配置文本，不通过就抛带错误码的异常。
   *
   * `self` 是"正在编辑的那条自己"：新增时为 undefined（占用集合就是全文件），
   * 编辑时要把它从**已占用**里摘掉——否则"只改了个 url、名字没动"会被自己的
   * 名字判成重名。
   *
   * @param {string} raw 配置文本。
   * @param {ReturnType<typeof scan>} scanned 当前文件扫描结果。
   * @param {object|null} [self] 正在编辑的条目。
   * @returns {{disabled: unknown, clientConfig: Record<string, unknown>, serverName: string}} 校验产物。
   */
  const validateOrThrow = (raw, scanned, self = null) => {
    const selfName = self !== null ? self.serverName : null;
    const result = validateServerInput(raw, {
      existingServerNames: scanned.items
        .map((item) => item.serverName)
        .filter((name) => typeof name === 'string' && name !== selfName),
      existingIds: scanned.ids.filter((id) => (self !== null ? id !== self.id : true)),
    });
    if (result.ok !== true || result.value === null) {
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
    // `disabled` 是**条目级**键，不是 MCP 客户端 config 里的字段：留着会被
    // 序列化成 `config.disabled`，cordis 看不见、等于白写。所以在这里提出来。
    const { disabled, ...clientConfig } = result.value;
    return { disabled, clientConfig, serverName: String(result.value.serverName) };
  };

  /**
   * 读一条条目的可编辑 JSON（**密钥被替换成空串**）。
   *
   * 这是编辑功能唯一会碰明文的地方，也是唯一不把明文发出去的地方：`env` /
   * `headers` 的值在这里被换成 `''`，前端拿到的只是"有哪些键"。
   *
   * @param {string} serverName 身份键。
   * @returns {Promise<object>} `{serverName, id, transport, text, maskedKeys}`。
   */
  const configSource = async (serverName) => {
    const before = readState();
    const scanned = scan(before.text);
    const target = scanned.items.find((item) => item.serverName === serverName);
    if (target === undefined) throw codedError('unknown-server', '该条目已不存在，请刷新列表');
    if (target.managed !== true) throw codedError('readonly-entry', '该条目非本插件管理，无法修改');
    if (target.parsable !== true) {
      throw codedError('unparsable-entry', '该条目格式超出可解析范围，请手工编辑配置文件');
    }
    const source = target.parsed !== null && typeof target.parsed === 'object' ? target.parsed : {};
    /** @type {Record<string, string[]>} */
    const maskedKeys = {};
    /** @type {Record<string, unknown>} */
    const masked = {};
    for (const [key, value] of Object.entries(source)) {
      if (
        SECRET_KEYS.includes(key) &&
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        const names = Object.keys(value);
        maskedKeys[key] = names;
        masked[key] = Object.fromEntries(names.map((name) => [name, '']));
      } else {
        masked[key] = value;
      }
    }
    return {
      serverName,
      id: target.id,
      transport: target.transport,
      text: JSON.stringify(masked, null, 2),
      maskedKeys,
    };
  };

  /**
   * 替换一条已存在的条目（编辑）。
   *
   * 三件与"新增"不同的事：
   * 1. 唯一性判定要摘掉自己（见 `validateOrThrow` 的 `self`）；
   * 2. 留空的密钥要还原成原值（见 `restoreSecretValues`）；
   * 3. **没提到 `disabled` 时沿用原来的启停状态**——否则"改个 url"会顺手把一条
   *    停用的服务器悄悄启用，而用户根本没动那个开关。
   *
   * @param {string} serverName 原身份键。
   * @param {string} raw 新配置文本。
   * @returns {Promise<object>} `{item, renamed, revision, checksum}`。
   */
  const replace = async (serverName, raw) =>
    mutate((text) => {
      const scanned = scan(text);
      requireHealthyAnchors(scanned);
      const target = requireWritable(scanned, serverName);
      const { disabled, clientConfig, serverName: nextName } = validateOrThrow(raw, scanned, target);
      const merged = restoreSecretValues(clientConfig, target.parsed ?? null);
      // `disabled` 没出现在新配置里 → 沿用原状态；出现了 → 以用户写的为准。
      const keepDisabled = disabled === undefined ? target.enabled !== true : disabled === true;
      const entry = {
        id: `mcp-${nextName}`,
        name: MCP_CLIENT_NAME,
        disabled: keepDisabled,
        config: merged,
      };
      const next = replaceEntry(text, serverName, serializeEntry(entry));
      if (next === null) throw codedError('unknown-server', '该条目已不存在，请刷新列表');
      // `disabled` 行的归属记账跟着条目走：旧名字上的记录作废，新名字按"原来
      // 有没有这个键"重新记——否则改名后"启用"会写回一行 `disabled: false`。
      insertedDisabled.delete(serverName);
      if (keepDisabled && target.disabledBy === null) insertedDisabled.add(nextName);
      const item = scan(next).items.find((entry2) => entry2.serverName === nextName) ?? null;
      return { next, payload: { item, renamed: nextName !== serverName } };
    });

  /**
   * 删除一条。
   * @param {string} serverName 身份键。
   * @returns {Promise<object>} `{removed, revision, checksum}`。
   */
  const remove = async (serverName) =>
    mutate((text) => {
      const scanned = scan(text);
      requireHealthyAnchors(scanned);
      requireWritable(scanned, serverName);
      const next = removeEntry(text, serverName);
      if (next === null) throw codedError('unknown-server', '该条目已不存在，请刷新列表');
      return { next, payload: { removed: serverName } };
    });

  /**
   * 启用 / 停用一条（原生 `disabled` 键）。
   * @param {string} serverName 身份键。
   * @param {boolean} enabled 目标状态。
   * @returns {Promise<object>} `{item, changed, revision, checksum}`。
   */
  const setEnabled = async (serverName, enabled) =>
    mutate((text) => {
      const scanned = scan(text);
      requireHealthyAnchors(scanned);
      const target = requireWritable(scanned, serverName);
      if (target.disabledBy === 'expression') {
        throw codedError('disable-by-expression', '该条目的启用状态由表达式控制，请手工修改');
      }
      if (target.enabled === enabled) {
        // 幂等：已是目标态，连盘都不落。
        return { next: null, payload: { item: target, changed: false } };
      }
      // 这一次停用是不是**我们**插入了 `disabled` 行？决定启用时该删掉它、
      // 还是该写回 `disabled: false`（用户原本就写了这个键）。
      const hadDisabledKey = target.disabledBy !== null;
      const next = applyDisable(
        text,
        serverName,
        enabled !== true,
        insertedDisabled.has(serverName),
      );
      if (next === null) throw codedError('unknown-server', '该条目已不存在，请刷新列表');
      if (enabled === true) insertedDisabled.delete(serverName);
      else if (hadDisabledKey) insertedDisabled.delete(serverName);
      else insertedDisabled.add(serverName);
      const item = scan(next).items.find((entry) => entry.serverName === serverName) ?? target;
      return { next, payload: { item, changed: true } };
    });

  return {
    read,
    add,
    replace,
    configSource,
    remove,
    setEnabled,
    filePath,
    fileDisplay,
    dshHome,
    profile,
    source,
  };
}
