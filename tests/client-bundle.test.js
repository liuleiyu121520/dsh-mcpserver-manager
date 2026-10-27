/**
 * 客户端产物（`lib/client.js`）的**加载期**契约测试。
 *
 * "看起来对"不算对：这里用 `node:vm` 造一个最小宿主（只有 `window.__ModuleLoader__`
 * 和一个 React 桩），把构建产物真跑一遍，证明它
 * 1. 真的向加载器注册了自己，id 是 `dsh-mcpserver-manager`；
 * 2. 真的导出 `apply` / `inject`；
 * 3. 外链只有 `react`（React 打进去会让宿主加载两份 React）；
 * 4. `apply(ctx)` 真的注册了设置分区，`render()` 真能吐出 React 元素。
 *
 * 依赖构建产物：`lib/` 在 `.gitignore` 里，新克隆的仓库要先 `npm run build`。
 * 没构建时**跳过**而不是报错——`npm test` 不该因为没构建就红。
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const BUNDLE = join(root, 'lib', 'client.js');
const hasBundle = existsSync(BUNDLE);

/** 产物体积预算（字节），与 scripts/build.mjs 保持一致。 */
const MAX_CLIENT_BYTES = 120 * 1024;

/**
 * 造一个最小 React 桩：只要 `createElement` / `Fragment` / 常用 hooks。
 * @returns {{stub: object, calls: () => number}} 桩与 createElement 调用计数。
 */
function reactStub() {
  let calls = 0;
  const stub = {
    createElement(type, props, ...children) {
      calls += 1;
      return { $$typeof: 'react.element', type, props: props ?? {}, children };
    },
    Fragment: Symbol('Fragment'),
    useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useRef: (value) => ({ current: value }),
  };
  stub.default = stub;
  return { stub, calls: () => calls };
}

/**
 * 在 vm 沙箱里加载产物。
 * @returns {{id: string, mod: any, required: string[], bytes: number}} 加载结果。
 */
function loadBundle() {
  const source = readFileSync(BUNDLE, 'utf8');
  const { stub } = reactStub();
  /** @type {Array<{id: string, factory: Function}>} */
  const loaded = [];
  /** @type {Map<string, any>} */
  const exports = new Map();
  /** @type {string[]} */
  const required = [];
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(descriptor) {
          loaded.push(descriptor);
          exports.set(
            descriptor.id,
            descriptor.factory((id) => {
              required.push(id);
              if (id === 'react') return stub;
              throw new Error(`unexpected require(${id})`);
            }),
          );
        },
      },
    },
    console,
    URL,
    JSON,
    Symbol,
    Math,
    Number,
    String,
    Object,
    Array,
    Boolean,
    Error,
    Promise,
    Date,
    RegExp,
    Map,
    Set,
    setTimeout,
    clearTimeout,
    encodeURIComponent,
    decodeURIComponent,
    parseInt,
    parseFloat,
    isNaN,
    TextEncoder,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'lib/client.js' });
  assert.equal(loaded.length, 1, '必须恰好注册一个模块');
  // 加载器在 load() 里就已经调过 factory 了，导出物从那儿取——不要重复执行。
  const mod = exports.get(loaded[0].id);
  return { id: loaded[0].id, mod, required, bytes: Buffer.byteLength(source, 'utf8') };
}

describe('client bundle · 加载期契约', { skip: !hasBundle }, () => {
  it('外层是 window.__ModuleLoader__.load 契约，id 正确', () => {
    const source = readFileSync(BUNDLE, 'utf8');
    assert.ok(source.includes('window.__ModuleLoader__.load({'), '缺少加载器注册');
    assert.ok(source.includes("id: 'dsh-mcpserver-manager'"), '模块 id 不对');
  });

  it('外链只有 react（React 绝不能被打进 bundle）', () => {
    const source = readFileSync(BUNDLE, 'utf8');
    const externals = [
      ...new Set([...source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1])),
    ];
    assert.deepEqual(externals.sort(), ['react'], `外链不纯：${externals.join(', ')}`);
    for (const leak of ['ReactCurrentDispatcher', '__SECRET_INTERNALS', 'react-dom', 'createRoot']) {
      assert.equal(source.includes(leak), false, `React 内部被打了进去：${leak}`);
    }
  });

  it('体积在 120KB 预算内', () => {
    const bytes = readFileSync(BUNDLE).length;
    assert.ok(bytes <= MAX_CLIENT_BYTES, `${bytes} 字节超出 ${MAX_CLIENT_BYTES} 预算`);
  });

  it('在最小宿主里真的能加载，并导出 apply / inject', () => {
    const { id, mod } = loadBundle();
    assert.equal(id, 'dsh-mcpserver-manager');
    assert.equal(typeof mod.apply, 'function', 'apply 必须是函数');
    // 导出物来自 vm 沙箱（另一个 realm），原型不同，用 Array.from 摊平再比。
    assert.deepEqual(Array.from(mod.inject), ['slots', 'sessions']);
  });

  it('apply(ctx) 真的注册了设置分区，render() 真能吐出 React 元素', () => {
    const { mod } = loadBundle();
    /** @type {string[]} */
    const injected = [];
    /** @type {Array<{meta: any, render: Function}>} */
    const registered = [];
    /** @type {Function[]} */
    const factories = [];
    const ctx = {
      slots: {
        inject(name, factory) {
          injected.push(name);
          factories.push(factory);
        },
        register(meta, render) {
          registered.push({ meta, render });
          return () => {};
        },
      },
      sessions: {},
    };
    mod.apply(ctx);
    assert.deepEqual(injected, ['settings.section']);
    for (const factory of factories) factory();
    assert.equal(registered.length, 1, '应注册一个分区');
    assert.equal(registered[0].meta.id, 'dsh-mcpserver-manager');
    assert.equal(registered[0].meta.name, 'settings.section');
    assert.equal(registered[0].meta.label, 'MCP 管理');
    const element = registered[0].render();
    assert.equal(element.$$typeof, 'react.element');
    assert.equal(typeof element.type, 'function', 'render 应返回一个组件元素');
  });
});
