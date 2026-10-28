/**
 * 工具目录单测。
 *
 * 这里守的核心是**命名空间过滤**：`mcp__<serverName>__` 前缀少一个下划线、
 * 多一个下划线，都会让"这个服务器有几个工具"变成别的服务器的数字——而这种
 * 错误在界面上看起来完全正常（就是一个数字），只能靠测试盯。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { catalogFor, countFor, publicToolPrefix, toolServiceOf } from '../src/tool-catalog.js';

/**
 * 造一个只有 `view()` 的假 ToolsService。
 * @param {Record<string, object>} visible 可见工具表。
 * @returns {object} 服务。
 */
function fakeService(visible) {
  return { view: () => ({ visible: new Map(Object.entries(visible)) }) };
}

/** 一条典型的 dsh-mcp-client 工具定义。 */
const definition = (description, parameters = { type: 'object', properties: {} }) => ({ description, parameters });

describe('tool-catalog · 命名空间过滤', () => {
  it('前缀形如 mcp__<serverName>__', () => {
    assert.equal(publicToolPrefix('github'), 'mcp__github__');
  });

  it('只收本服务器的工具，别的服务器与前缀相近的名字都排除', () => {
    const service = fakeService({
      'mcp__github__list_issues': definition('列出 issue'),
      'mcp__github__create_issue': definition('创建 issue'),
      // 前缀是 `mcp__github_` 而不是 `mcp__github__`：必须排除。
      'mcp__github_extra__x': definition('别的服务器'),
      mcp__gitlab__list: definition('别的服务器'),
      bash: definition('宿主自带工具'),
    });
    const catalog = catalogFor(service, 'github');
    assert.equal(catalog.available, true);
    assert.equal(catalog.count, 2);
    assert.deepEqual(
      catalog.tools.map((tool) => tool.rawName),
      ['create_issue', 'list_issues'],
      'rawName 要去掉命名空间并按字母序',
    );
  });

  it('描述压成一行并截断（MCP 描述可以写几千字，列表里没人读）', () => {
    const long = `${'很长的描述'.repeat(100)}\n第二段`;
    const catalog = catalogFor(fakeService({ 'mcp__s__a': definition(long) }), 's');
    const [tool] = catalog.tools;
    assert.equal(tool.description.includes('\n'), false, '不该保留换行');
    assert.ok(tool.description.length <= 240, `描述没被截断：${tool.description.length}`);
    assert.ok(tool.description.endsWith('…'), '截断要有省略号，别让人以为原文就这么短');
  });

  it('缺描述 / 描述不是字符串 → 空串，不抛错', () => {
    const service = fakeService({
      'mcp__s__none': { parameters: { type: 'object', properties: {} } },
      'mcp__s__weird': { description: 42 },
    });
    const catalog = catalogFor(service, 's');
    assert.deepEqual(catalog.tools.map((tool) => tool.description), ['', '']);
  });

  it('参数个数按顶层 properties 数', () => {
    const service = fakeService({
      'mcp__s__a': definition('', { type: 'object', properties: { q: {}, limit: {} } }),
      'mcp__s__b': definition(''),
      'mcp__s__c': { description: '', parameters: null },
    });
    assert.deepEqual(catalogFor(service, 's').tools.map((tool) => tool.parameters), [2, 0, 0]);
  });

  it('countFor 与 catalogFor 的数字一致（列表与展开不能说两套话）', () => {
    const service = fakeService({
      'mcp__s__a': definition('a'),
      'mcp__s__b': definition('b'),
      'mcp__t__c': definition('c'),
    });
    assert.equal(countFor(service, 's').count, catalogFor(service, 's').count);
    assert.equal(countFor(service, 's').count, 2);
  });
});

describe('tool-catalog · 服务缺失一律降级', () => {
  it('service 为 undefined → available:false，而不是假装 0 个工具', () => {
    const catalog = catalogFor(undefined, 'github');
    assert.equal(catalog.available, false);
    assert.deepEqual(catalog.tools, []);
    assert.deepEqual(countFor(undefined, 'github'), { available: false, count: 0 });
  });

  it('view() 抛错 → available:false（服务在但没就绪）', () => {
    const service = { view: () => { throw new Error('not ready'); } };
    assert.equal(catalogFor(service, 'github').available, false);
    assert.equal(countFor(service, 'github').available, false);
  });

  it('serverName 为空 → available:true + 0 个（服务是好的，只是没东西可数）', () => {
    assert.deepEqual(catalogFor(fakeService({}), ''), { available: true, count: 0, tools: [] });
  });

  it('toolServiceOf：没有 ctx.get / ctx.get 抛错 / 返回值没有 view，一律 undefined', () => {
    assert.equal(toolServiceOf(undefined), undefined);
    assert.equal(toolServiceOf({}), undefined);
    assert.equal(toolServiceOf({ get: () => { throw new Error('nope'); } }), undefined);
    assert.equal(toolServiceOf({ get: () => ({}) }), undefined);
    assert.equal(toolServiceOf({ get: () => ({ view: 1 }) }), undefined, 'view 不是函数就不算');
    const service = { view: () => ({ visible: new Map() }) };
    assert.equal(toolServiceOf({ get: (name) => (name === 'tools' ? service : undefined) }), service);
  });
});
