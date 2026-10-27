/**
 * 主题一致性静态门禁。
 *
 * 用户明确抱怨过"观感偏差"，所以这三条不许靠人眼守：
 * 1. **不许有 `var()` fallback 之外的硬编码色值**——否则组件会在宿主换主题时
 *    变成一块"钉死的颜色"；
 * 2. **不许用 `matchMedia` / `prefers-color-scheme` 自己判明暗**——主题跟随是
 *    CSS 变量的职责，JS 判一次就必然和宿主不同步；
 * 3. **类名不许悬空也不许有死类**，且必须统一 `dshmcp-` 前缀（不能污染宿主）。
 *
 * 全是纯字符串扫描，不启浏览器、不依赖构建产物，毫秒级。
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const CSS = readFileSync(join(root, 'src/client/styles.js'), 'utf8');

/**
 * 收集 src 下所有 js/jsx。
 * @returns {string[]} 文件绝对路径。
 */
function jsFiles() {
  /** @type {string[]} */
  const out = [];
  /**
   * @param {string} dir 目录。
   * @returns {void}
   */
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
    }
  };
  walk(join(root, 'src'));
  return out;
}

/**
 * 剥掉 `var(--x, fallback)` 里的 fallback，只留 `var(--x)`。
 *
 * 用平衡括号扫描而不是正则：fallback 自己可能带括号（`rgba(0,0,0,.4)`）。
 * @param {string} src 输入。
 * @returns {string} 剥掉 fallback 后的文本。
 */
function stripVarFallbacks(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('var(', i)) {
      let depth = 0;
      let j = i + 3;
      for (; j < src.length; j += 1) {
        if (src[j] === '(') depth += 1;
        else if (src[j] === ')') {
          if (depth === 0) break;
          depth -= 1;
        }
      }
      const inner = src.slice(i + 4, j);
      const comma = inner.indexOf(',');
      out += comma === -1 ? `var(${inner})` : `var(${inner.slice(0, comma)})`;
      i = j + 1;
      continue;
    }
    out += src[i];
    i += 1;
  }
  return out;
}

describe('theme · 色值必须全部走 CSS 变量', () => {
  it('没有 var() fallback 之外的硬编码色值', () => {
    const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/;
    /** @type {string[]} */
    const offenders = [];
    CSS.split('\n').forEach((line, index) => {
      const stripped = stripVarFallbacks(line);
      const hit = stripped.match(COLOR);
      if (hit !== null) offenders.push(`styles.js:${index + 1} → ${hit[0]}\n      ${line.trim()}`);
    });
    assert.deepEqual(offenders, [], `发现硬编码色值：\n  ${offenders.join('\n  ')}`);
  });

  it('CSS 变量全部带 fallback（宿主缺变量时不至于全透明）', () => {
    const total = (CSS.match(/var\(--dsw-/g) ?? []).length;
    const withFallback = (CSS.match(/var\(--dsw-[^)]*,/g) ?? []).length;
    assert.ok(total > 0, '应该用了 CSS 变量');
    assert.equal(total, withFallback, `${total} 处 var()，只有 ${withFallback} 处带 fallback`);
  });

  it('卡片用 settings-card 变量，而不是自造 bg-layer 面板', () => {
    // 必须用"选择器恰好等于 .dshmcp-card"的那一条：正则 `.dshmcp-card {` 会先
    // 命中 `.dshmcp-group.is-readonly .dshmcp-card { opacity }` 那条覆盖规则。
    const card = blocks().find((block) => block.sel === '.dshmcp-card');
    assert.ok(card !== undefined, '应有 .dshmcp-card 规则');
    assert.ok(card.body.includes('--dsw-alias-settings-card-fill'), '卡片缺 settings-card-fill');
    assert.ok(card.body.includes('--dsw-alias-settings-card-stroke'), '卡片缺 settings-card-stroke');
    const empty = blocks().find((block) => block.sel === '.dshmcp-empty');
    assert.ok(empty !== undefined, '应有 .dshmcp-empty 规则');
    assert.ok(empty.body.includes('--dsw-alias-settings-card-fill'), '空态卡片也要用同一套');
  });
});

describe('theme · 不许用 JS 判明暗', () => {
  it('没有任何 matchMedia / prefers-color-scheme / 明暗判定', () => {
    const forbidden =
      /\bmatchMedia\b|prefers-color-scheme|\bcolorScheme\b|\bisDark\b|\btheme\s*===?\s*['"]dark/;
    /** @type {string[]} */
    const hits = [];
    for (const file of jsFiles()) {
      readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        if (forbidden.test(line)) hits.push(`${file.replace(root, '')}:${index + 1}: ${line.trim()}`);
      });
    }
    assert.deepEqual(hits, [], `发现被禁止的明暗判定：\n  ${hits.join('\n  ')}`);
  });
});

/**
 * 精确解析 CSS 规则块（避免把 `.dshmcp-group.is-readonly .dshmcp-card` 误当成
 * `.dshmcp-card` 的规则）。
 *
 * 注意：这是**一层**的朴素解析，`@keyframes` 的内层块会被当成独立块（sel 是
 * `0%` / `50%` 这种）。它们不含 `.`，所以本文件的断言天然会跳过，不影响结论。
 * @returns {Array<{sel: string, body: string}>} 规则块。
 */
function blocks() {
  /** @type {Array<{sel: string, body: string}>} */
  const out = [];
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = rule.exec(CSS)) !== null) {
    out.push({ sel: match[1].trim().replace(/\s+/g, ' '), body: match[2] });
  }
  return out;
}

/** CSS 里出现过的所有类名。 */
const CLASS_NAMES = new Set(
  blocks().flatMap((block) => (block.sel.match(/\.([a-zA-Z][\w-]*)/g) ?? []).map((x) => x.slice(1))),
);

describe('theme · 类名审计', () => {
  it('每条规则都挂在 dshmcp- 前缀下（含 keyframes）', () => {
    // 状态类（`is-off` / `is-danger`）本来就不带前缀，但必须**依附**在一个
    // `.dshmcp-*` 类上——孤立的 `.is-off {}` 会污染宿主，所以逐个选择器判。
    const orphan = blocks()
      .map((block) => block.sel)
      .filter((sel) => sel.startsWith('.') || sel.includes('.'))
      .filter((sel) => !sel.includes('.dshmcp-'));
    assert.deepEqual(orphan, [], `存在不挂在 dshmcp- 下的规则：${orphan.join(' | ')}`);
    const keyframes = [...CSS.matchAll(/@keyframes\s+([a-z0-9-]+)/g)].map((m) => m[1]);
    assert.ok(keyframes.length > 0);
    for (const name of keyframes) assert.ok(name.startsWith('dshmcp-'), `keyframes ${name} 缺前缀`);
  });

  it('没有"用了但 CSS 里没定义"的类（悬空类）', () => {
    /** @type {Set<string>} */
    const used = new Set();
    for (const file of jsFiles()) {
      if (file.endsWith('styles.js')) continue;
      for (const match of readFileSync(file, 'utf8').matchAll(/dshmcp-[a-z0-9-]+/g)) used.add(match[0]);
    }
    const dangling = [...used].filter((name) => !CLASS_NAMES.has(name));
    assert.deepEqual(dangling, [], `用了但 CSS 未定义：${dangling.join(', ')}`);
  });

  it('没有"定义了但没人用"的死类', () => {
    // 状态类（`is-off` 等）在 JSX 里是条件拼接出来的，不带 dshmcp- 前缀；
    // 这里只审计带前缀的组件类，状态类另做一条断言。
    const prefixed = [...CLASS_NAMES].filter((name) => name.startsWith('dshmcp-'));
    const source = jsFiles()
      .filter((file) => !file.endsWith('styles.js'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')
      .concat(CSS);
    const dead = prefixed.filter((name) => !source.includes(name));
    assert.deepEqual(dead, [], `CSS 定义了但没人用：${dead.join(', ')}`);
  });

  it('状态类（is-*）在 JSX 里真的被用到', () => {
    const stateClasses = [...CLASS_NAMES].filter((name) => name.startsWith('is-'));
    assert.ok(stateClasses.length > 0, '应该有状态类');
    const jsx = jsFiles()
      .filter((file) => !file.endsWith('styles.js'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    for (const name of stateClasses) {
      assert.ok(jsx.includes(name), `状态类 .${name} 定义了但 JSX 里没用到`);
    }
  });
});
