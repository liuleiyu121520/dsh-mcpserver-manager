/**
 * 添加弹窗的**真渲染**测试。
 *
 * 守的是用户实际看到的那几行：把 Claude 格式粘进去之后
 * 1. 不再报"未知字段 / 缺少 transport"；
 * 2. SSE 只给一条提示，且**不拦提交**（「确定」可点）；
 * 3. 解析结果行显示 `将写入 <serverName> · <transport>`；
 * 4. 路径（写入位置）不再出现在弹窗里。
 *
 * 做法与 `client-toolbar.test.js` 相同：esbuild 把**真源码**打成 CJS、在
 * `node:vm` 里用最小 React 桩执行。区别是这里要驱动 `useState`——用户是
 * 通过 textarea 的 onChange 把配置粘进来的，不动状态就测不到真实路径。
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const hasEsbuild = existsSync(join(root, 'node_modules', 'esbuild'));

/** 用户上一条反馈里贴的那条 SSE 配置。 */
const CLAUDE_SSE = JSON.stringify(
  {
    mcpServers: {
      creis_mcp_server: {
        transportType: 'sse',
        url: 'https://testllmgateway.3g.fang.com/mcp/creis_mcp_server',
        headers: { 'x-litellm-api-key': 'Bearer sk-test' },
        disabled: false,
      },
    },
  },
  null,
  2,
);

/**
 * 最小 React 桩：createElement / Fragment + 能真正跑起来的四个 hook。
 *
 * 不做调度，只做"每次调用组件前把游标归零、按位置复用槽位"——对一个无副作用
 * 的受控表单组件来说，这已经足够模拟"粘贴 → 重渲染"。
 * @returns {{react: object, begin: () => void}} 桩与重渲染前必须调的 begin。
 */
function reactStub() {
  /** @type {any[]} */
  const slots = [];
  let cursor = 0;
  let rerender = () => {};

  /**
   * 排一次重渲染（同步执行，便于测试里 await 之后立刻断言）。
   * @param {Function} fn 重渲染函数。
   * @returns {void}
   */
  const schedule = (fn) => {
    rerender = fn;
  };

  const sameDeps = (a, b) =>
    Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

  const react = {
    createElement(type, props, ...children) {
      return { $$typeof: 'react.element', type, props: props ?? {}, children };
    },
    Fragment: Symbol('Fragment'),
    useState(initial) {
      const index = cursor;
      cursor += 1;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      const set = (value) => {
        slots[index] = typeof value === 'function' ? value(slots[index]) : value;
        schedule();
      };
      return [slots[index], set];
    },
    useMemo(factory, deps) {
      const index = cursor;
      cursor += 1;
      const prev = slots[index];
      if (prev === undefined || !sameDeps(prev.deps, deps)) slots[index] = { deps, value: factory() };
      return slots[index].value;
    },
    useEffect() {
      cursor += 1;
    },
    useCallback(fn) {
      cursor += 1;
      return fn;
    },
    useRef(initial) {
      const index = cursor;
      cursor += 1;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
  };
  react.default = react;

  return {
    react,
    begin() {
      cursor = 0;
    },
    takeRerender() {
      const fn = rerender;
      rerender = () => {};
      return fn;
    },
  };
}

/**
 * 载入真组件。
 * @param {string} entry stdin 入口代码。
 * @param {string} exportName 导出名。
 * @returns {Promise<{Component: Function, hooks: object}>} 组件与 hook 控制柄。
 */
async function load(entry, exportName) {
  const { build } = await import('esbuild');
  const result = await build({
    stdin: { contents: entry, resolveDir: join(root, 'tests'), sourcefile: 'entry.jsx', loader: 'jsx' },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    target: ['es2020'],
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    external: ['react'],
    logLevel: 'silent',
  });
  const stub = reactStub();
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: (id) => {
      if (id === 'react') return stub.react;
      throw new Error(`unexpected require(${id})`);
    },
    // `URL` 必须显式给：vm 的新 realm 里没有这个 WHATWG 全局，而 `validate.js`
    // 的 isHttpUrl 依赖它——漏了会让 url 一律判非法（测试就变成在测假象）。
    URL,
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(result.outputFiles[0].text, sandbox, { filename: 'entry.jsx' });
  const Component = module.exports[exportName];
  assert.equal(typeof Component, 'function', `${exportName} 应该被导出为函数组件`);
  return { Component, hooks: stub };
}

/**
 * 收集元素树（展开函数组件；不展开 Icons 之外的东西）。
 * @param {any} node 根。
 * @param {{elements: any[], texts: string[]}} sink 收集器。
 * @returns {{elements: any[], texts: string[]}} 收集器。
 */
function walk(node, sink) {
  if (node === null || node === undefined || typeof node === 'boolean') return sink;
  if (typeof node === 'string' || typeof node === 'number') {
    sink.texts.push(String(node));
    return sink;
  }
  if (Array.isArray(node)) {
    for (const child of node) walk(child, sink);
    return sink;
  }
  if (typeof node !== 'object') return sink;
  sink.elements.push(node);
  if (typeof node.type === 'function') {
    walk(node.type(node.props ?? {}), sink);
    return sink;
  }
  for (const child of node.children ?? []) walk(child, sink);
  return sink;
}

/**
 * 渲染一次并收集树。
 * @param {Function} Component 组件。
 * @param {object} props 属性。
 * @param {object} hooks hook 控制柄。
 * @returns {{elements: any[], texts: string[]}} 树。
 */
function render(Component, props, hooks) {
  hooks.begin();
  return walk(Component(props), { elements: [], texts: [] });
}

/**
 * 往 textarea 里"粘贴"一段文本并重渲染。
 * @param {Function} Component 组件。
 * @param {object} props 属性。
 * @param {object} hooks hook 控制柄。
 * @param {string} text 文本。
 * @returns {{elements: any[], texts: string[]}} 新的树。
 */
function paste(Component, props, hooks, text) {
  const tree = render(Component, props, hooks);
  const editor = tree.elements.find((element) => element.props?.className === 'dshmcp-editor');
  assert.ok(editor !== undefined, '应该有一个 JSON 编辑器');
  editor.props.onChange({ target: { value: text } });
  return render(Component, props, hooks);
}

/**
 * 取「确定」按钮（文案是 `确定` 或 `提交中…`）。
 * @param {{elements: any[]}} tree 树。
 * @returns {any} 按钮元素。
 */
function submitButton(tree) {
  const found = tree.elements.find(
    (element) => element.type === 'button' && (element.children ?? []).some((c) => c === '确定' || c === '提交中…'),
  );
  assert.ok(found !== undefined, `找不到「确定」按钮：${tree.texts.join(' | ')}`);
  return found;
}

describe('client AddDialog · 粘贴 Claude 格式的真渲染', { skip: !hasEsbuild }, () => {
  /** 统一的 props（不重名、无已占用的 id）。 */
  const props = { existingServerNames: [], existingIds: [], onSubmit: async () => {}, onCancel: () => {} };

  it('Claude SSE 配置：通过校验，「确定」可点，并且只给一条 SSE 提示', async () => {
    const { Component, hooks } = await load(
      "export { AddDialog } from '../src/client/AddDialog.jsx';",
      'AddDialog',
    );
    const tree = paste(Component, props, hooks, CLAUDE_SSE);
    const submit = submitButton(tree);
    assert.equal(submit.props.disabled, false, `「确定」应该可点：${tree.texts.join(' | ')}`);
    const joined = tree.texts.join(' | ');
    assert.equal((joined.match(/SSE/g) ?? []).length > 0, true, '应该提到 SSE');
    assert.equal(joined.includes('未知字段'), false, `不该报未知字段：${joined}`);
    assert.equal(joined.includes('必填'), false, `不该报必填缺失：${joined}`);
  });

  it('解析结果行显示将写入的 serverName 与 transport', async () => {
    const { Component, hooks } = await load(
      "export { AddDialog } from '../src/client/AddDialog.jsx';",
      'AddDialog',
    );
    const tree = paste(Component, props, hooks, CLAUDE_SSE);
    const hint = tree.texts.join('');
    assert.ok(hint.includes('将写入'), `缺少解析结果行：${hint}`);
    assert.ok(hint.includes('creis_mcp_server'), `没显示 serverName：${hint}`);
    assert.ok(hint.includes('streamable-http'), `没显示 transport：${hint}`);
  });

  it('弹窗里不再出现路径 / 写入位置', async () => {
    const { Component, hooks } = await load(
      "export { AddDialog } from '../src/client/AddDialog.jsx';",
      'AddDialog',
    );
    const tree = paste(Component, props, hooks, CLAUDE_SSE);
    const joined = tree.texts.join(' | ');
    assert.equal(joined.includes('写入位置'), false, joined);
    assert.equal(joined.includes('cordis.patch.yml'), false, joined);
  });

  it('非法输入时「确定」禁用（校验没被放松）', async () => {
    const { Component, hooks } = await load(
      "export { AddDialog } from '../src/client/AddDialog.jsx';",
      'AddDialog',
    );
    const tree = paste(Component, props, hooks, '{"mcpServers": {"a": {}, "b": {}}}');
    assert.equal(submitButton(tree).props.disabled, true);
    assert.ok(tree.texts.join(' | ').includes('一次只能添加一个'), tree.texts.join(' | '));
  });

  it('遮罩层用的是 DSH 原生 mask 变量（半透明 + 虚化）', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(join(root, 'src/client/styles.js'), 'utf8');
    const block = /\.dshmcp-mask-layer\s*\{([\s\S]*?)\}/.exec(css);
    assert.ok(block !== null, '应有 .dshmcp-mask-layer 规则');
    assert.ok(block[1].includes('--dsw-alias-bg-mask-1'), '遮罩背景要用 DSH 原生 mask 变量');
    assert.ok(block[1].includes('backdrop-filter'), '遮罩要带虚化');
    assert.equal(block[1].includes('--dsw-alias-bg-overlay'), false, '别再用会缺失的 bg-overlay');
  });
});
