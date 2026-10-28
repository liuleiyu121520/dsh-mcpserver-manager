/**
 * 客户端组件的**真渲染**测试底座：esbuild 现场打包真源码 + 最小 React 桩。
 *
 * 与 `client-adddialog.test.js` 里那份是同一套做法，这里抽出来给新用例复用
 * （老文件保持原样，不为抽公共件去动已经绿的测试）。
 *
 * 桩只做两件事：按位置复用 hook 槽位、把 `setState` 排成一次同步重渲染。
 * 对一个受控展示组件来说这足够——它不依赖调度、不依赖 effect 时序。
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

/** 仓库根。 */
export const root = fileURLToPath(new URL('..', import.meta.url));

/** esbuild 是 devDependency；没装就跳过，`npm test` 不该因此变红。 */
export const hasEsbuild = existsSync(join(root, 'node_modules', 'esbuild'));

/**
 * 最小 React 桩。
 * @returns {{react: object, begin: () => void, takeRerender: () => Function}} 桩与控制柄。
 */
export function reactStub() {
  /** @type {any[]} */
  const slots = [];
  let cursor = 0;
  let rerender = () => {};

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
        rerender();
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
 * 把真组件打成 CJS 并在 vm 里求值。
 * @param {string} entry stdin 入口代码。
 * @param {string} exportName 导出名。
 * @returns {Promise<{Component: Function, hooks: object}>} 组件与 hook 控制柄。
 */
export async function loadComponent(entry, exportName) {
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
    // `URL` 必须显式给：vm 的新 realm 里没有这个 WHATWG 全局。
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
 * 深度遍历元素树（展开函数组件）。
 * @param {any} node 根。
 * @param {{elements: any[], texts: string[]}} sink 收集器。
 * @returns {{elements: any[], texts: string[]}} 收集器。
 */
export function walk(node, sink) {
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
export function render(Component, props, hooks) {
  hooks.begin();
  return walk(Component(props), { elements: [], texts: [] });
}
