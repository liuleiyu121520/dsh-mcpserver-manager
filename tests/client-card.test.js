/**
 * 卡片真渲染测试。
 *
 * 守的全是"用户看得见、点得着"的东西：
 * 1. 启停是**开关**（`role="switch"` + `aria-checked`），不是文字按钮；
 * 2. 每个条目都有**健康检查按钮**，点完把结论交给上层（卡片里**不留**常驻文案）；
 *    菜单里有「编辑」，点页面其他区域菜单要能关掉；
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
 * 取一个元素自己的文字（只看直接子节点里的字符串）。
 *
 * 菜单项的文字是原生子节点而不是 `tree.texts`——`tree.texts` 是全树的，没法
 * 用来区分"哪一个按钮"。
 * @param {any} element 元素。
 * @returns {string} 文字。
 */
const labelOf = (element) =>
  Array.isArray(element.children) ? element.children.filter((child) => typeof child === 'string').join('') : '';

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

  it('健康检查点一下就把结论交给上层，卡片里不留常驻文案', async () => {
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
    assert.deepEqual(asked, ['github'], '结论必须交出去（上层负责 toast）');
    const shown = tree.texts.join('');
    assert.ok(!shown.includes('健康检查 ·'), `卡片里不该再出现结论行：${shown}`);
    assert.ok(!shown.includes('12ms'), `耗时也不该留在卡片里：${shown}`);
    assert.ok(!shown.includes('已注册 3 个工具'), `原因交给 toast，别占三行：${shown}`);
    assert.equal(
      find(tree, (element) => String(element.props?.className ?? '').includes('dshmcp-health')),
      undefined,
      '结论条已删除，任何情况下都不该渲染出来',
    );
  });

  it('健康检查返回 null（失败）时也不会凭空多出一块结论区', async () => {
    const { Component, hooks } = await load();
    const props = { item: item(), onToggle: () => {}, onRemove: () => {}, onHealth: async () => null };
    let tree = render(Component, props, hooks);
    const button = find(tree, (element) => element.props?.['aria-label'] === '健康检查');
    await button.props.onClick();
    tree = render(Component, props, hooks);
    assert.equal(find(tree, (element) => String(element.props?.className ?? '').includes('dshmcp-health')), undefined);
  });
});

describe('client ServerCard · 更多操作菜单', { skip: !hasEsbuild }, () => {
  /** 打开 ⋯ 菜单后的树。 */
  const openMenu = async () => {
    const { Component, hooks } = await load();
    /** @type {Array<[string, string]>} */
    const edits = [];
    const props = {
      item: item(),
      onToggle: () => {},
      onRemove: () => {},
      onEdit: (name) => edits.push(['edit', name]),
      onHealth: async () => null,
    };
    let tree = render(Component, props, hooks);
    find(tree, (element) => element.props?.['aria-label'] === '更多操作').props.onClick();
    tree = render(Component, props, hooks);
    return { tree, edits, props, Component, hooks };
  };

  it('菜单里有「编辑」，点了把名字交给上层', async () => {
    const { tree, edits } = await openMenu();
    const edit = find(
      tree,
      (element) => element.type === 'button' && element.props?.className === 'dshmcp-menu-item' && labelOf(element) === '编辑',
    );
    assert.ok(edit !== undefined, '已添加的 MCP 必须能编辑（这一条是用户反馈的核心）');
    edit.props.onClick();
    assert.deepEqual(edits, [['edit', 'github']]);
  });

  it('点菜单外的任何地方都关得掉：有一块全屏垫层接管点击', async () => {
    const { tree } = await openMenu();
    const backdrop = find(tree, (element) => element.props?.className === 'dshmcp-menu-backdrop');
    assert.ok(backdrop !== undefined, '没有垫层就只能在点同一个按钮时才关得上');
    // 垫层自己不该渲染出任何内容（它是透明的）。
    assert.deepEqual(backdrop.children, []);
    assert.equal(backdrop.props.onClick(), undefined);
  });

  it('只读条目连菜单都没有（不能编辑就别让人看见入口）', async () => {
    const { Component, hooks } = await load();
    const tree = render(
      Component,
      { item: item({ managed: false }), onToggle: () => {}, onRemove: () => {}, onEdit: () => {} },
      hooks,
    );
    assert.equal(find(tree, (element) => element.props?.['aria-label'] === '更多操作'), undefined);
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
