/**
 * 卡片真渲染测试。
 *
 * 守的全是"用户看得见、点得着"的东西：
 * 1. 启停是**开关**（`role="switch"` + `aria-checked`），不是文字按钮；
 * 2. 每个条目都有**健康检查按钮**，点完结论落在卡片里（而不是只弹一句 toast）；
 * 3. 工具数就在行上，点开才去取详情，展开能看到具体工具名；
 * 4. 旧 Host（没有 `toolCount`）不渲染工具区——**不显示一个"共 0 个工具"的假结论**；
 * 5. 只读条目没有开关也没有菜单，但健康检查与工具列表照旧可用（那是读操作）。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasEsbuild, loadComponent, render } from './react-stub.js';

/** 一条受管条目的完整形状（与 Host 下发的 ServerItem 字段一致）。 */
const item = (overrides = {}) => ({
  serverName: 'github',
  transport: 'stdio',
  summary: 'npx -y @mcp/github',
  command: 'npx',
  args: ['-y', '@mcp/github'],
  url: null,
  envKeys: ['GITHUB_TOKEN'],
  headerKeys: [],
  cwd: null,
  toolCallTimeoutMs: 60000,
  enabled: true,
  managed: true,
  parsable: true,
  disabledBy: null,
  raw: '',
  toolCount: 3,
  toolsAvailable: true,
  ...overrides,
});

/** 一条假的工具表响应。 */
const catalog = {
  serverName: 'github',
  available: true,
  count: 2,
  tools: [
    { name: 'mcp__github__list_issues', rawName: 'list_issues', description: '列出 issue', parameters: 2 },
    { name: 'mcp__github__ping', rawName: 'ping', description: '', parameters: 0 },
  ],
};

/** 一条"正常"的健康报告。 */
const report = {
  serverName: 'github',
  status: 'healthy',
  detail: '已注册 3 个工具',
  tools: 3,
  latencyMs: 12,
  checkedAt: '2026-10-28T00:00:00.000Z',
};

/**
 * 按条件找元素。
 * @param {{elements: any[]}} tree 树。
 * @param {(element: any) => boolean} predicate 条件。
 * @returns {any|undefined} 元素。
 */
const find = (tree, predicate) => tree.elements.find(predicate);

/**
 * 找 `role="switch"` 的开关。
 * @param {{elements: any[]}} tree 树。
 * @returns {any|undefined} 元素。
 */
const switchOf = (tree) => find(tree, (element) => element.props?.role === 'switch');

/**
 * 载入卡片组件。
 * @returns {Promise<{Component: Function, hooks: object}>} 组件与 hook 控制柄。
 */
const load = () => loadComponent("export { ServerCard } from '../src/client/ServerCard.jsx';", 'ServerCard');

describe('client ServerCard · 开关与健康检查', { skip: !hasEsbuild }, () => {
  it('启停是 role="switch" 的开关，点一下给出目标状态', async () => {
    const { Component, hooks } = await load();
    /** @type {Array<[string, boolean]>} */
    const toggles = [];
    const props = { item: item(), onToggle: (name, next) => toggles.push([name, next]), onRemove: () => {} };
    const tree = render(Component, props, hooks);
    const control = switchOf(tree);
    assert.ok(control !== undefined, `应该有开关：${tree.texts.join(' | ')}`);
    assert.equal(control.props['aria-checked'], true);
    assert.equal(control.type, 'button');
    control.props.onClick();
    assert.deepEqual(toggles, [['github', false]], '开着的时候点一下应该是「停用」');
  });

  it('已停用的条目：开关是关的，点一下是「启用」', async () => {
    const { Component, hooks } = await load();
    /** @type {Array<[string, boolean]>} */
    const toggles = [];
    const props = { item: item({ enabled: false, toolCount: 0 }), onToggle: (n, v) => toggles.push([n, v]), onRemove: () => {} };
    const tree = render(Component, props, hooks);
    const control = switchOf(tree);
    assert.equal(control.props['aria-checked'], false);
    control.props.onClick();
    assert.deepEqual(toggles, [['github', true]]);
  });

  it('健康检查按钮点完，结论落在卡片里（含耗时）', async () => {
    const { Component, hooks } = await load();
    /** @type {string[]} */
    const asked = [];
    const props = {
      item: item(),
      onToggle: () => {},
      onRemove: () => {},
      onHealth: async (name) => {
        asked.push(name);
        return report;
      },
    };
    let tree = render(Component, props, hooks);
    const button = find(tree, (element) => element.props?.['aria-label'] === '健康检查');
    assert.ok(button !== undefined, '每个条目都该有健康检查按钮');
    await button.props.onClick();
    tree = render(Component, props, hooks);
    assert.deepEqual(asked, ['github']);
    const shown = tree.texts.join('');
    assert.ok(shown.includes('健康检查 · 正常'), `缺结论行：${shown}`);
    assert.ok(shown.includes('12ms'), `缺耗时：${shown}`);
    assert.ok(shown.includes('已注册 3 个工具'), `缺原因：${shown}`);
    assert.ok(
      find(tree, (element) => element.props?.className === 'dshmcp-health is-ok') !== undefined,
      '正常要用 is-ok（绿色条），不能跟"连不上"一个色',
    );
  });

  it('健康检查失败（返回 null）时不会插入一个空结论行', async () => {
    const { Component, hooks } = await load();
    const props = { item: item(), onToggle: () => {}, onRemove: () => {}, onHealth: async () => null };
    let tree = render(Component, props, hooks);
    const button = find(tree, (element) => element.props?.['aria-label'] === '健康检查');
    await button.props.onClick();
    tree = render(Component, props, hooks);
    assert.equal(find(tree, (element) => String(element.props?.className ?? '').includes('dshmcp-health')), undefined);
  });
});

describe('client ServerCard · 工具列表', () => {
  it('行上显示「共 3 个工具」，点开才去取详情', async () => {
    const { Component, hooks } = await load();
    /** @type {string[]} */
    const asked = [];
    const props = {
      item: item(),
      onToggle: () => {},
      onRemove: () => {},
      onLoadTools: async (name) => {
        asked.push(name);
        return catalog;
      },
    };
    let tree = render(Component, props, hooks);
    assert.ok(tree.texts.join(' | ').includes('共 3 个工具'), tree.texts.join(' | '));
    assert.deepEqual(asked, [], '没点开之前不该发请求');

    const toggle = find(tree, (element) => element.props?.className === 'dshmcp-tools-toggle');
    await toggle.props.onClick();
    tree = render(Component, props, hooks);
    assert.deepEqual(asked, ['github']);
    const shown = tree.texts.join(' | ');
    assert.ok(shown.includes('list_issues'), `应展开具体工具名：${shown}`);
    assert.ok(shown.includes('2 个参数'), `应显示参数个数：${shown}`);
    assert.ok(shown.includes('无参数'), `无参工具不要显示"0 个参数"：${shown}`);
    assert.ok(shown.includes('列出 issue'), `应显示工具描述：${shown}`);
  });

  it('再点一次收起，不重复请求', async () => {
    const { Component, hooks } = await load();
    /** @type {number} */
    let calls = 0;
    const props = {
      item: item(),
      onToggle: () => {},
      onRemove: () => {},
      onLoadTools: async () => {
        calls += 1;
        return catalog;
      },
    };
    let tree = render(Component, props, hooks);
    const toggle = () => find(tree, (element) => element.props?.className === 'dshmcp-tools-toggle');
    await toggle().props.onClick();
    tree = render(Component, props, hooks);
    await toggle().props.onClick();
    tree = render(Component, props, hooks);
    assert.equal(calls, 1, '收起再展开不该重查');
    assert.equal(tree.texts.join(' | ').includes('list_issues'), false, '收起后工具名不该还在');
  });

  it('0 个工具时给一句能指导下一步的话（停用/未注册分开说）', async () => {
    const { Component, hooks } = await load();
    const props = {
      item: item({ toolCount: 0 }),
      onToggle: () => {},
      onRemove: () => {},
      onLoadTools: async () => ({ ...catalog, count: 0, tools: [] }),
    };
    let tree = render(Component, props, hooks);
    await find(tree, (element) => element.props?.className === 'dshmcp-tools-toggle').props.onClick();
    tree = render(Component, props, hooks);
    assert.ok(tree.texts.join(' ').includes('没有注册任何工具'), tree.texts.join(' | '));

    const disabled = { ...props, item: item({ toolCount: 0, enabled: false }) };
    let offTree = render(Component, disabled, hooks);
    await find(offTree, (element) => element.props?.className === 'dshmcp-tools-toggle').props.onClick();
    offTree = render(Component, disabled, hooks);
    assert.ok(offTree.texts.join(' ').includes('已停用'), offTree.texts.join(' | '));
  });

  it('读不到工具服务时显示「工具数未知」，不显示「共 0 个工具」', async () => {
    const { Component, hooks } = await load();
    const props = { item: item({ toolCount: 0, toolsAvailable: false }), onToggle: () => {}, onRemove: () => {} };
    const tree = render(Component, props, hooks);
    const shown = tree.texts.join(' | ');
    assert.ok(shown.includes('工具数未知'), shown);
    assert.equal(shown.includes('共 0 个工具'), false, shown);
  });

  it('旧 Host（没有 toolCount）时整块工具区不渲染', async () => {
    const { Component, hooks } = await load();
    const old = item();
    delete old.toolCount;
    delete old.toolsAvailable;
    const tree = render(Component, { item: old, onToggle: () => {}, onRemove: () => {} }, hooks);
    assert.equal(find(tree, (element) => element.props?.className === 'dshmcp-tools-toggle'), undefined);
    assert.equal(tree.texts.join(' | ').includes('个工具'), false);
  });
});

describe('client ServerCard · 只读条目', () => {
  it('没有开关也没有菜单，但健康检查与工具列表还在（读操作不受管理权限制）', async () => {
    const { Component, hooks } = await load();
    const tree = render(
      Component,
      { item: item({ managed: false }), onToggle: () => {}, onRemove: () => {} },
      hooks,
    );
    assert.equal(switchOf(tree), undefined, '只读条目不该有开关');
    assert.equal(find(tree, (element) => element.props?.['aria-label'] === '更多操作'), undefined);
    assert.ok(find(tree, (element) => element.props?.['aria-label'] === '健康检查') !== undefined);
    assert.ok(tree.texts.join(' | ').includes('共 3 个工具'));
  });

  it('不可解析的条目只给原文，不给健康检查与工具区', async () => {
    const { Component, hooks } = await load();
    const tree = render(
      Component,
      {
        item: item({ parsable: false, serverName: null, managed: false, raw: 'config:\n  ??', toolCount: 0 }),
        onToggle: () => {},
        onRemove: () => {},
      },
      hooks,
    );
    assert.equal(find(tree, (element) => element.props?.['aria-label'] === '健康检查'), undefined);
    assert.equal(find(tree, (element) => element.props?.className === 'dshmcp-tools-toggle'), undefined);
    const raw = find(tree, (element) => element.type === 'pre' && element.props?.className === 'dshmcp-raw');
    assert.ok(raw !== undefined, '应该把原文摊出来给用户手工改');
  });
});
