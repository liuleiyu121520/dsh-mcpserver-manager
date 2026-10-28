/**
 * 「写入位置」条的**真渲染**测试。
 *
 * 为什么不能用 props 断言代替：这一条的整个价值是"用户一眼看到的那几个字"。
 * 组件里 `showProfile` 是个派生条件（`source === 'config.patchFile'` 时不渲染
 * profile chip），只看 props 是证明不了"chip 到底有没有出现在树上"的。
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
 * 树上是否有一个带指定 className 的元素（`dshmcp-chip` 这种状态判断必须看树）。
 * @param {{elements: any[]}} tree 树。
 * @param {string} className 类名。
 * @returns {boolean} 是否存在。
 */
function hasClass(tree, className) {
  return tree.elements.some((element) => element.props?.className === className);
}

/**
 * 取某个类名元素的文本（chip 里 `profile: {profile}` 是**两个**文本节点，
 * 所以必须把它们拼起来再比）。
 * @param {{elements: any[]}} tree 树。
 * @param {string} className 类名。
 * @returns {string} 文本；元素不存在时为空串。
 */
function classText(tree, className) {
  const element = tree.elements.find((node) => node.props?.className === className);
  if (element === undefined) return '';
  return walk(element, { elements: [], texts: [] }).texts.join('');
}

describe('client Toolbar · 写入位置条的真渲染', { skip: !hasEsbuild }, () => {
  it('source=config.patchFile：不渲染 profile chip，note 为「由配置 patchFile 显式指定」', async () => {
    const Toolbar = await loadToolbar();
    const tree = render(Toolbar, {
      fileDisplay: '~/explicit/cordis.patch.yml',
      profile: 'web',
      source: 'config.patchFile',
    });
    assert.equal(hasClass(tree, 'dshmcp-chip'), false, 'patchFile 场景不该出现 profile chip（标签会与宿主不符）');
    assert.equal(
      tree.texts.some((text) => text.includes('profile:')),
      false,
      `不该有 profile 文案：${tree.texts.join(' | ')}`,
    );
    assert.ok(tree.texts.includes('由配置 patchFile 显式指定'), tree.texts.join(' | '));
    assert.ok(tree.texts.includes('~/explicit/cordis.patch.yml'), '路径必须照旧显示');
  });

  it('source=profileContext：渲染 profile chip', async () => {
    const Toolbar = await loadToolbar();
    const tree = render(Toolbar, {
      fileDisplay: '~/.dsh/profiles/desktop/cordis.patch.yml',
      profile: 'desktop',
      source: 'profileContext',
    });
    assert.equal(hasClass(tree, 'dshmcp-chip'), true, '宿主 profile 必须显示出来');
    assert.equal(classText(tree, 'dshmcp-chip'), 'profile: desktop', tree.texts.join(' | '));
    assert.ok(tree.texts.includes('由当前宿主 profile 决定'), tree.texts.join(' | '));
  });

  it('回落层（config.dshHome / $DSH_HOME / ~/.dsh）仍渲染 chip 与各自说明', async () => {
    const Toolbar = await loadToolbar();
    const cases = [
      ['config.dshHome', '由插件配置 dshHome 指定'],
      ['$DSH_HOME', '由环境变量 $DSH_HOME 决定'],
      ['~/.dsh', '宿主未报告 profile，已回落到默认位置'],
    ];
    for (const [source, note] of cases) {
      const tree = render(Toolbar, { fileDisplay: '~/.dsh/profiles/web/cordis.patch.yml', profile: 'web', source });
      assert.equal(hasClass(tree, 'dshmcp-chip'), true, `${source} 应显示 chip`);
      assert.ok(tree.texts.includes(note), `${source} 的说明文案不对：${tree.texts.join(' | ')}`);
    }
  });

  it('路径未解析出来时占位文案仍是「正在解析…」，未知来源不编造说明', async () => {
    const Toolbar = await loadToolbar();
    const tree = render(Toolbar, { fileDisplay: '', profile: '', source: 'nonsense' });
    assert.ok(tree.texts.includes('正在解析…'), tree.texts.join(' | '));
    assert.equal(tree.texts.some((text) => text.includes('决定') || text.includes('指定')), false, tree.texts.join(' | '));
  });
});
