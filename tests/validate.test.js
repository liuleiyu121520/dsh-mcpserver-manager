/**
 * 校验规则单测：架构 §4.2 的 16 条规则逐条正反用例。
 *
 * 这份断言同时守护前端与后端——它们是同一个模块，所以一份用例覆盖两端。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  CANONICAL_ORDER,
  DEFAULTS,
  KNOWN_FIELDS,
  SERVER_NAME_RE,
  TRANSPORTS,
  checkUniqueness,
  parseJsonWithPosition,
  validateConfig,
  validateServerInput,
} from '../src/validate.js';

/**
 * 取某个 code 的 issue。
 * @param {object[]} issues issue 列表。
 * @param {string} code 错误码。
 * @returns {object|undefined} 命中的 issue。
 */
const findIssue = (issues, code) => issues.find((item) => item.code === code);

/** 一条最小合法 stdio 配置。 */
const stdio = { serverName: 'github', transport: 'stdio', command: 'npx' };
/** 一条最小合法 http 配置。 */
const http = { serverName: 'remote', transport: 'streamable-http', url: 'https://example.com/mcp' };

describe('validate · R1 JSON 可解析', () => {
  it('合法 JSON → ok', () => {
    const parsed = parseJsonWithPosition('{"a": 1}');
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.value, { a: 1 });
  });

  it('非法 JSON → 带行列号', () => {
    const parsed = parseJsonWithPosition('{\n  "a": 1,\n  "b": }\n');
    assert.equal(parsed.ok, false);
    assert.equal(typeof parsed.line, 'number');
    assert.equal(parsed.line, 3);
    assert.equal(typeof parsed.column, 'number');
    assert.ok(parsed.reason.length > 0);
  });

  it('validateServerInput 对非法 JSON 给出中文文案与 E_JSON', () => {
    const result = validateServerInput('{\n"a": }\n');
    assert.equal(result.ok, false);
    const issue = result.issues[0];
    assert.equal(issue.code, 'E_JSON');
    assert.equal(issue.line, 2);
    assert.match(issue.message, /JSON 语法错误（第 2 行第 \d+ 列）/);
  });
});

describe('validate · R2 顶层为对象', () => {
  it('数组 / null / 字符串 → E_ROOT', () => {
    for (const value of [[], null, 'x', 42]) {
      const { issues, normalized } = validateConfig(value);
      assert.ok(findIssue(issues, 'E_ROOT') !== undefined, `应拒绝 ${JSON.stringify(value)}`);
      assert.equal(normalized, null);
    }
  });

  it('对象 → 通过', () => {
    const { issues } = validateConfig(stdio);
    assert.equal(findIssue(issues, 'E_ROOT'), undefined);
  });
});

describe('validate · R3 transport 合法', () => {
  it('既没写传输方式、也推不出来 → E_TRANSPORT', () => {
    assert.ok(findIssue(validateConfig({ serverName: 'a' }).issues, 'E_TRANSPORT'));
    assert.ok(findIssue(validateConfig({ serverName: 'a', foo: 1 }).issues, 'E_TRANSPORT'));
  });

  it('写了但认不出来 → E_TRANSPORT，且文案带上那个值', () => {
    const issue = findIssue(validateConfig({ serverName: 'a', transport: 'websocket', url: 'https://a.test' }).issues, 'E_TRANSPORT');
    assert.ok(issue !== undefined);
    assert.match(issue.message, /websocket/);
  });

  it('两种合法值都通过', () => {
    for (const transport of TRANSPORTS) {
      const base = transport === 'stdio' ? { command: 'n' } : { url: 'https://a.test/mcp' };
      const { issues } = validateConfig({ serverName: 'a', transport, ...base });
      assert.equal(findIssue(issues, 'E_TRANSPORT'), undefined, `${transport} 应通过`);
    }
  });

  it('按形状推断：command → stdio，url → streamable-http（各带一条 warn）', () => {
    const byCommand = validateServerInput(JSON.stringify({ serverName: 'a', command: 'npx' }));
    assert.equal(byCommand.ok, true);
    assert.equal(byCommand.value.transport, 'stdio');
    assert.ok(findIssue(byCommand.issues, 'W_INFER_TRANSPORT') !== undefined);

    const byUrl = validateServerInput(JSON.stringify({ serverName: 'a', url: 'https://a.test/mcp' }));
    assert.equal(byUrl.ok, true);
    assert.equal(byUrl.value.transport, 'streamable-http');
    assert.ok(findIssue(byUrl.issues, 'W_INFER_TRANSPORT') !== undefined);
  });

  it('sse 归一为 streamable-http，并明确告知（DSH 没有 SSE 实现）', () => {
    const result = validateServerInput(
      JSON.stringify({ serverName: 'a', transport: 'sse', url: 'https://a.test/sse' }),
    );
    assert.equal(result.ok, true, '不该硬拒：能跑起来比拒绝更有用');
    assert.equal(result.value.transport, 'streamable-http');
    const issue = findIssue(result.issues, 'W_SSE');
    assert.ok(issue !== undefined);
    assert.equal(issue.level, 'warn');
    assert.match(issue.message, /SSE/);
  });
});

describe('validate · R4 serverName 格式', () => {
  it('合法名通过', () => {
    for (const name of ['a', 'github', 'my_mcp-1', 'A'.repeat(32)]) {
      assert.equal(SERVER_NAME_RE.test(name), true, `${name} 应合法`);
    }
  });

  it('非法名 → E_NAME', () => {
    for (const name of ['', 'has space', 'has.dot', 'A'.repeat(33), '中文']) {
      assert.equal(SERVER_NAME_RE.test(name), false, `${name} 应非法`);
      const { issues } = validateConfig({ serverName: name, transport: 'stdio', command: 'n' });
      assert.ok(findIssue(issues, 'E_NAME') !== undefined, `${name} 应触发 E_NAME`);
    }
  });
});

describe('validate · R5 serverName 唯一', () => {
  it('名字被占 → E_DUP', () => {
    const issues = checkUniqueness({ serverName: 'github' }, { serverNames: ['github'], ids: [] });
    assert.ok(findIssue(issues, 'E_DUP') !== undefined);
    assert.match(issues[0].message, /serverName "github" 已存在/);
  });

  it('id 被占 → E_DUP', () => {
    const issues = checkUniqueness({ serverName: 'github' }, { serverNames: [], ids: ['mcp-github'] });
    assert.ok(findIssue(issues, 'E_DUP') !== undefined);
  });

  it('normalized 为 null 时不报重名（避免重复报错）', () => {
    assert.deepEqual(checkUniqueness(null, { serverNames: ['github'] }), []);
  });

  it('重名会让 validateServerInput 判否', () => {
    const result = validateServerInput(JSON.stringify(stdio), { existingServerNames: ['github'] });
    assert.equal(result.ok, false);
    assert.ok(findIssue(result.issues, 'E_DUP') !== undefined);
  });
});

describe('validate · R6–R14 字段类型', () => {
  it('R6 stdio 缺 command → E_COMMAND', () => {
    assert.ok(findIssue(validateConfig({ serverName: 'a', transport: 'stdio' }).issues, 'E_COMMAND'));
  });

  it('R7 args 必须是字符串数组', () => {
    assert.ok(
      findIssue(validateConfig({ ...stdio, args: 'not-array' }).issues, 'E_ARGS'),
    );
    assert.ok(findIssue(validateConfig({ ...stdio, args: [1, 2] }).issues, 'E_ARGS'));
    assert.equal(findIssue(validateConfig({ ...stdio, args: ['-y'] }).issues, 'E_ARGS'), undefined);
  });

  it('R8 env 必须是「字符串: 字符串」', () => {
    assert.ok(findIssue(validateConfig({ ...stdio, env: { A: 1 } }).issues, 'E_ENV'));
    assert.ok(findIssue(validateConfig({ ...stdio, env: [] }).issues, 'E_ENV'));
    assert.equal(findIssue(validateConfig({ ...stdio, env: { A: 'b' } }).issues, 'E_ENV'), undefined);
  });

  it('R9 cwd 必须是非空字符串', () => {
    assert.ok(findIssue(validateConfig({ ...stdio, cwd: 3 }).issues, 'E_CWD'));
    assert.ok(findIssue(validateConfig({ ...stdio, cwd: '' }).issues, 'E_CWD'));
    assert.equal(findIssue(validateConfig({ ...stdio, cwd: '/tmp' }).issues, 'E_CWD'), undefined);
  });

  it('R10 http 需要合法 url', () => {
    assert.ok(
      findIssue(
        validateConfig({ serverName: 'a', transport: 'streamable-http' }).issues,
        'E_URL',
      ),
    );
    assert.ok(
      findIssue(
        validateConfig({ serverName: 'a', transport: 'streamable-http', url: 'ftp://x' }).issues,
        'E_URL',
      ),
    );
    assert.equal(findIssue(validateConfig(http).issues, 'E_URL'), undefined);
  });

  it('R11 headers 必须是「字符串: 字符串」', () => {
    assert.ok(findIssue(validateConfig({ ...http, headers: { A: 1 } }).issues, 'E_HEADERS'));
    assert.equal(findIssue(validateConfig({ ...http, headers: { A: 'b' } }).issues, 'E_HEADERS'), undefined);
  });

  it('R12 toolCallTimeoutMs 必须是 1–600000 的整数', () => {
    for (const value of [0, 600001, 1.5, '60000']) {
      assert.ok(
        findIssue(validateConfig({ ...stdio, toolCallTimeoutMs: value }).issues, 'E_TIMEOUT'),
        `${String(value)} 应非法`,
      );
    }
    assert.equal(findIssue(validateConfig({ ...stdio, toolCallTimeoutMs: 60000 }).issues, 'E_TIMEOUT'), undefined);
  });

  it('R13 maxInstructionBytes 必须是正整数', () => {
    for (const value of [0, -1, 1.5]) {
      assert.ok(findIssue(validateConfig({ ...stdio, maxInstructionBytes: value }).issues, 'E_BYTES'));
    }
    assert.equal(findIssue(validateConfig({ ...stdio, maxInstructionBytes: 32768 }).issues, 'E_BYTES'), undefined);
  });

  it('R14 failOnStartupError 必须是布尔', () => {
    assert.ok(findIssue(validateConfig({ ...stdio, failOnStartupError: 'yes' }).issues, 'E_FAIL'));
    assert.equal(findIssue(validateConfig({ ...stdio, failOnStartupError: true }).issues, 'E_FAIL'), undefined);
  });
});

describe('validate · R15 字段与传输不匹配', () => {
  it('stdio 不接受 url / headers', () => {
    assert.ok(findIssue(validateConfig({ ...stdio, url: 'https://a.test' }).issues, 'E_MISMATCH'));
    assert.ok(findIssue(validateConfig({ ...stdio, headers: { A: 'b' } }).issues, 'E_MISMATCH'));
  });

  it('streamable-http 不接受 command / args / cwd', () => {
    assert.ok(findIssue(validateConfig({ ...http, command: 'n' }).issues, 'E_MISMATCH'));
    assert.ok(findIssue(validateConfig({ ...http, args: ['x'] }).issues, 'E_MISMATCH'));
    assert.ok(findIssue(validateConfig({ ...http, cwd: '/tmp' }).issues, 'E_MISMATCH'));
  });
});

describe('validate · R16 未知字段警告放行', () => {
  it('未知字段是 warn，不拦提交，且原样透传', () => {
    const result = validateServerInput(JSON.stringify({ ...stdio, foo: 1 }));
    assert.equal(result.ok, true, '警告不该拦住提交');
    const issue = findIssue(result.issues, 'W_UNKNOWN');
    assert.ok(issue !== undefined);
    assert.equal(issue.level, 'warn');
    assert.match(issue.message, /未知字段 "foo"/);
    assert.equal(result.value.foo, 1, '未知字段必须原样透传，不能丢弃');
  });

  it('KNOWN_FIELDS 与 CANONICAL_ORDER 必须逐项对齐', () => {
    // 之前这里断言的是一份**写在测试里**的硬编码字段表：即便有人给
    // CANONICAL_ORDER 加了字段却忘了同步 KNOWN_FIELDS，测试也照样绿。
    // 真正的契约是"两者是同一套字段"——canonical 字段全部已知（否则会被当成
    // 未知字段发警告），已知字段全部可排序（否则键序不稳定）。
    assert.deepEqual(
      [...KNOWN_FIELDS].sort(),
      [...CANONICAL_ORDER].sort(),
      'KNOWN_FIELDS 与 CANONICAL_ORDER 必须是同一套字段',
    );
    for (const field of CANONICAL_ORDER) {
      assert.ok(KNOWN_FIELDS.includes(field), `canonical 字段 ${field} 必须在白名单里`);
    }
  });
});

describe('validate · Claude / Cursor 格式（{ mcpServers: { … } }）', () => {
  /** 用户实际贴过来的那条（SSE + headers + disabled + 集合键当 serverName）。 */
  const userPasted = {
    mcpServers: {
      creis_mcp_server: {
        transportType: 'sse',
        url: 'https://testllmgateway.3g.fang.com/mcp/creis_mcp_server',
        headers: { 'x-litellm-api-key': 'Bearer sk-test' },
        disabled: false,
      },
    },
  };

  it('拆壳 + 字段映射：集合键即 serverName，transportType 即 transport', () => {
    const result = validateServerInput(JSON.stringify(userPasted));
    assert.equal(result.ok, true, JSON.stringify(result.issues));
    assert.equal(result.value.serverName, 'creis_mcp_server');
    assert.equal(result.value.transport, 'streamable-http');
    assert.equal(result.value.url, userPasted.mcpServers.creis_mcp_server.url);
    assert.deepEqual(result.value.headers, { 'x-litellm-api-key': 'Bearer sk-test' });
    assert.equal(result.value.disabled, false, 'disabled 必须留着，落盘时要提到条目级');
  });

  it('映射掉的外来字段不会残留在结果里（也就不会变成未知字段被写进配置）', () => {
    const result = validateServerInput(JSON.stringify(userPasted));
    assert.equal('transportType' in result.value, false);
    assert.equal('type' in result.value, false);
    assert.equal('mcpServers' in result.value, false);
    assert.equal(findIssue(result.issues, 'W_UNKNOWN'), undefined, '已经认下来的字段不该再报未知');
  });

  it('type: http 也认（Claude Code / VS Code 的写法）', () => {
    const result = validateServerInput(
      JSON.stringify({ mcpServers: { r: { type: 'http', url: 'https://a.test/mcp' } } }),
    );
    assert.equal(result.ok, true, JSON.stringify(result.issues));
    assert.equal(result.value.transport, 'streamable-http');
    assert.equal(result.value.serverName, 'r');
  });

  it('servers 键（VS Code 写法）同样拆壳', () => {
    const result = validateServerInput(
      JSON.stringify({ servers: { gh: { type: 'stdio', command: 'npx', args: ['-y', 'x'] } } }),
    );
    assert.equal(result.ok, true, JSON.stringify(result.issues));
    assert.equal(result.value.serverName, 'gh');
    assert.equal(result.value.transport, 'stdio');
  });

  it('多个服务器 → E_WRAPPER_MULTI，一次只能加一个', () => {
    const result = validateServerInput(
      JSON.stringify({
        mcpServers: { a: { command: 'npx' }, b: { command: 'npx' }, c: { url: 'https://a.test' } },
      }),
    );
    assert.equal(result.ok, false);
    const issue = findIssue(result.issues, 'E_WRAPPER_MULTI');
    assert.ok(issue !== undefined);
    assert.match(issue.message, /3 个服务器/);
    assert.match(issue.message, /a、b、c/);
  });

  it('空集合 / 非对象集合 → E_WRAPPER', () => {
    assert.ok(findIssue(validateServerInput('{"mcpServers": {}}').issues, 'E_WRAPPER') !== undefined);
    assert.ok(findIssue(validateServerInput('{"mcpServers": []}').issues, 'E_WRAPPER') !== undefined);
    assert.ok(findIssue(validateServerInput('{"mcpServers": {"a": 1}}').issues, 'E_WRAPPER') !== undefined);
  });

  it('条目自带的 serverName 与集合键冲突 → 以集合键为准 + 一条 warn', () => {
    const result = validateServerInput(
      JSON.stringify({ mcpServers: { real: { serverName: 'other', command: 'npx' } } }),
    );
    assert.equal(result.value.serverName, 'real');
    assert.ok(findIssue(result.issues, 'W_NAME_OVERRIDDEN') !== undefined);
  });

  it('外壳外的同级字段不采用，并留一条 warn（避免静默丢东西）', () => {
    const result = validateServerInput(
      JSON.stringify({ mcpServers: { a: { command: 'npx' } }, globalShortcut: 'Cmd+Esc' }),
    );
    assert.equal(result.ok, true);
    const issue = findIssue(result.issues, 'W_WRAPPER_EXTRA');
    assert.ok(issue !== undefined);
    assert.match(issue.message, /globalShortcut/);
  });

  it('disabled 必须是布尔', () => {
    assert.ok(
      findIssue(
        validateServerInput('{"mcpServers": {"a": {"command": "n", "disabled": "yes"}}}').issues,
        'E_DISABLED',
      ) !== undefined,
    );
  });

  it('整形不改调用方传进来的对象（validateConfig 会被同一 fixture 反复调用）', () => {
    const fixture = { serverName: 'a', transportType: 'sse', url: 'https://a.test', type: 'sse' };
    const before = JSON.stringify(fixture);
    validateConfig(fixture);
    assert.equal(JSON.stringify(fixture), before, '输入对象被写脏了');
  });
});

describe('validate · 前后端同源硬约束（静态检查，不靠肉眼）', () => {
  const source = readFileSync(new URL('../src/validate.js', import.meta.url), 'utf8');

  it('零 import / 零 require / 零动态 import', () => {
    assert.deepEqual([...source.matchAll(/^\s*import\s.*$/gm)].map((m) => m[0].trim()), []);
    assert.equal([...source.matchAll(/\brequire\s*\(/g)].length, 0);
    assert.equal([...source.matchAll(/\bimport\s*\(/g)].length, 0);
  });

  it('不触碰任何 Node / 浏览器专属全局', () => {
    const globals = [
      'window',
      'document',
      'process',
      'Buffer',
      'globalThis',
      'localStorage',
      'navigator',
      '__dirname',
      'fetch',
    ];
    /** @type {string[]} */
    const hits = [];
    source.split('\n').forEach((line, index) => {
      // 只扫代码行：跳过注释块里的说明文字（那里会提到这些名字）。
      if (/^\s*\*/.test(line)) return;
      const code = line.replace(/\/\/.*$/, '');
      for (const name of globals) {
        if (new RegExp(`\\b${name}\\b`).test(code)) hits.push(`${index + 1}: ${line.trim()}`);
      }
    });
    assert.deepEqual(hits, [], `validate.js 触碰了宿主全局：\n  ${hits.join('\n  ')}`);
  });

  it('在只含 ECMAScript + URL 全局的沙箱里真的能跑（浏览器安全）', async () => {
    const vm = await import('node:vm');
    const sandbox = {
      JSON,
      URL,
      Math,
      Number,
      String,
      Object,
      Array,
      Boolean,
      Error,
      RegExp,
      Set,
      Map,
      isNaN,
      parseInt,
      parseFloat,
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    const cjs = source.replace(/export\s+(?:const|function|class)/g, (m) => m.replace('export ', ''));
    vm.runInContext(
      `${cjs}\n;globalThis.__r = validateServerInput('{"serverName":"a","transport":"stdio","command":"c"}');`,
      sandbox,
    );
    assert.equal(sandbox.__r.ok, true, '沙箱里应该校验通过');
    // 结果对象来自 vm 沙箱（另一个 realm），原型不同，用 Array.from 摊平再比。
    assert.deepEqual(Array.from(sandbox.__r.issues), []);
    assert.equal(sandbox.__r.value.serverName, 'a');
  });
});

describe('validate · 默认值与键序', () => {
  it('缺失的默认值被补齐', () => {
    const result = validateServerInput(JSON.stringify(stdio));
    assert.equal(result.value.toolCallTimeoutMs, DEFAULTS.toolCallTimeoutMs);
    assert.equal(result.value.maxInstructionBytes, DEFAULTS.maxInstructionBytes);
    assert.equal(result.value.failOnStartupError, DEFAULTS.failOnStartupError);
  });

  it('用户显式给的值不被默认值覆盖', () => {
    const result = validateServerInput(JSON.stringify({ ...stdio, toolCallTimeoutMs: 1000 }));
    assert.equal(result.value.toolCallTimeoutMs, 1000);
  });

  it('同一输入两次归一化结果一致（键序稳定）', () => {
    const a = validateServerInput(JSON.stringify({ ...stdio, env: { B: '2', A: '1' } }));
    const b = validateServerInput(JSON.stringify({ ...stdio, env: { B: '2', A: '1' } }));
    assert.deepEqual(JSON.stringify(a.value), JSON.stringify(b.value));
  });
});
