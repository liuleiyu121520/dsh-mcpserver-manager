/**
 * Toolbar 的**真渲染**测试。
 *
 * 为什么不能用 props 断言代替：这一节守的两件事都是"树上到底有没有那个节点"——
 * 刷新按钮在空列表时**不该存在**，写入位置条**已经删掉**。只看 props 是证明
 * 不了这一点的。
 *
 * 做法：用 esbuild 现场把**真正的 `src/client/Toolbar.jsx`** 打成 CJS
 * （react 外链），在 `node:vm` 里配一个最小 React 桩执行，然后展开函数组件、
 * 遍历元素树断言。测的是真源码，不是复刻的逻辑。
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
/** esbuild 是 devDependency；没装就跳过，`npm test` 不该因此变红。 */
const hasEsbuild = existsSync(join(root, 'node_modules', 'esbuild'));

/**
 * 最小 React 桩：只要 createElement / Fragment。
 * @returns {object} 桩。
 */
function reactStub() {
  const stub = {
    createElement(type, props, ...children) {
      return { $$typeof: 'react.element', type, props: props ?? {}, children };
    },
    Fragment: Symbol('Fragment'),
  };
  stub.default = stub;
  return stub;
}

/**
 * 用 esbuild 把 Toolbar 打成 CJS 并在 vm 里求值，返回组件函数。
 * @returns {Promise<Function>} `Toolbar`。
 */
async function loadToolbar() {
  const { build } = await import('esbuild');
  const result = await build({
    stdin: {
      contents: "export { Toolbar } from '../src/client/Toolbar.jsx';",
      resolveDir: join(root, 'tests'),
      sourcefile: 'toolbar-entry.jsx',
      loader: 'jsx',
    },
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
  const code = result.outputFiles[0].text;
  const stub = reactStub();
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: (id) => {
      if (id === 'react') return stub;
      throw new Error(`unexpected require(${id})`);
    },
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'toolbar-entry.jsx' });
  const exported = module.exports.Toolbar;
  assert.equal(typeof exported, 'function', 'Toolbar 应该被导出为函数组件');
  return exported;
}

/**
 * 深度遍历元素树（会展开函数组件），收集所有元素与文本。
 * @param {any} node 根节点。
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
  // 函数组件：按 props 展开，否则只看得到 `<Toolbar />` 这一层。
  if (typeof node.type === 'function') {
    walk(node.type(node.props ?? {}), sink);
    return sink;
  }
  for (const child of node.children ?? []) walk(child, sink);
  return sink;
}

/**
 * 渲染 Toolbar 并收集树信息。
 * @param {Function} Toolbar 组件。
 * @param {object} props 属性。
 * @returns {{elements: any[], texts: string[]}} 树信息。
 */
function render(Toolbar, props) {
  return walk(Toolbar({ onAdd: () => {}, onRefresh: () => {}, ...props }), { elements: [], texts: [] });
}

/**
 * 树上是否有指定 aria-label 的按钮（刷新按钮就是这么定位的）。
 * @param {{elements: any[]}} tree 树。
 * @param {string} label aria-label。
 * @returns {boolean} 是否存在。
 */
function hasButton(tree, label) {
  return tree.elements.some((element) => element.type === 'button' && element.props?.['aria-label'] === label);
}

describe('client Toolbar · 头部真渲染', { skip: !hasEsbuild }, () => {
  it('列表为空：刷新与「添加 MCP」都不渲染（空态卡片里那个才是唯一入口）', async () => {
    const Toolbar = await loadToolbar();
    const tree = render(Toolbar, { showActions: false });
    assert.equal(hasButton(tree, '刷新列表'), false, '空列表不该有刷新按钮');
    assert.equal(
      tree.texts.includes('添加 MCP'),
      false,
      `空列表右上角不该再有「添加 MCP」：${tree.texts.join(' | ')}`,
    );
  });

  it('列表非空：刷新与「添加 MCP」都在', async () => {
    const Toolbar = await loadToolbar();
    const tree = render(Toolbar, { showActions: true });
    assert.equal(hasButton(tree, '刷新列表'), true, '列表非空时刷新按钮必须在');
    assert.ok(tree.texts.includes('添加 MCP'), `列表非空时「添加 MCP」必须在：${tree.texts.join(' | ')}`);
  });

  it('刷新进行中时刷新按钮 disabled，添加按钮不受影响', async () => {
    const Toolbar = await loadToolbar();
    const tree = render(Toolbar, { showActions: true, busy: true, refreshing: true });
    const refresh = tree.elements.find(
      (element) => element.type === 'button' && element.props?.['aria-label'] === '刷新列表',
    );
    assert.equal(refresh.props.disabled, true);
    const add = tree.elements.find(
      (element) => element.type === 'button' && (element.children ?? []).includes('添加 MCP'),
    );
    assert.equal(add.props.disabled, undefined, 'busy 不该拦住「添加 MCP」');
  });

  it('刷新时图标带旋转动画类（点了有反应，不是"什么都没发生"）', async () => {
    const Toolbar = await loadToolbar();
    const idle = render(Toolbar, { showActions: true });
    const spinning = render(Toolbar, { showActions: true, refreshing: true });
    const pick = (tree) =>
      tree.elements.find((element) => element.type === 'button' && element.props?.['aria-label'] === '刷新列表');
    assert.equal(pick(idle).props.className.includes('dshmcp-spin'), false, '空闲时不该转');
    assert.equal(pick(spinning).props.className.includes('dshmcp-spin'), true, '刷新时图标必须转');
    assert.equal(pick(spinning).props['aria-busy'], true);
  });

  it('版本号是个按钮（点它手动检查更新），检查中显示文案', async () => {
    const Toolbar = await loadToolbar();
    const tree = render(Toolbar, { showActions: true, version: '0.4.0', checking: true });
    const version = tree.elements.find((element) => element.props?.className === 'dshmcp-version');
    assert.ok(version !== undefined, `应该有版本按钮：${tree.texts.join(' | ')}`);
    assert.equal(version.type, 'button');
    assert.equal(version.props.disabled, true);
    assert.ok(tree.texts.includes('检查中…'), tree.texts.join(' | '));
  });

  it('不传 version 时不渲染版本按钮（不显示一个空按钮）', async () => {
    const Toolbar = await loadToolbar();
    const tree = render(Toolbar, { showActions: true });
    assert.equal(
      tree.elements.some((element) => element.props?.className === 'dshmcp-version'),
      false,
    );
  });

  it('不再渲染写入位置条（路径/ profile / 来源说明一并不渲染）', async () => {
    const Toolbar = await loadToolbar();
    const tree = render(Toolbar, {
      showActions: true,
      // 旧版这些 props 会画出「写入位置 ~/.dsh/...」条；新版即使传进来也不该理。
      fileDisplay: '~/.dsh/profiles/desktop/cordis.patch.yml',
      profile: 'desktop',
      source: 'profileContext',
    });
    const joined = tree.texts.join(' | ');
    assert.equal(
      tree.elements.some((element) => element.props?.className === 'dshmcp-target'),
      false,
      '写入位置条的 DOM 节点不该再出现',
    );
    assert.equal(joined.includes('写入位置'), false, `不该有「写入位置」文案：${joined}`);
    assert.equal(joined.includes('cordis.patch.yml'), false, `不该露路径：${joined}`);
    assert.equal(joined.includes('profile:'), false, `不该有 profile chip：${joined}`);
  });

  it('副标题只有一句短文案（页面上不再堆解释）', async () => {
    const Toolbar = await loadToolbar();
    const tree = render(Toolbar, { showActions: false });
    const subtitle = tree.texts.filter((text) => text.trim() !== '');
    const long = subtitle.filter((text) => text.length > 24);
    assert.deepEqual(long, [], `出现长文案：${long.join(' | ')}`);
    assert.ok(subtitle.includes('管理已接入的 MCP 服务器。'), subtitle.join(' | '));
  });
});
