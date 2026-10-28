/**
 * 序列化单测：往返一致 / env 脱敏 / 换行符 / 单引号转义 / !!js 透传。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MCP_CLIENT_NAME,
  detectNewline,
  parseFlowMap,
  parseFlowSeq,
  parseScalar,
  quoteScalar,
  REDACTED_LITERAL,
  redactEnvValues,
  serializeEntry,
  splitPair,
  splitTopLevel,
  valueToYaml,
} from '../src/serialize.js';
import { scan } from '../src/patch-store.js';

describe('serialize · 换行符与标量', () => {
  it('detectNewline 跟随原文件，绝不归一化', () => {
    assert.equal(detectNewline('a\nb'), '\n');
    assert.equal(detectNewline('a\r\nb'), '\r\n');
    assert.equal(detectNewline(''), '\n');
  });

  it('quoteScalar 用单引号并把 \' 转义成 \'\'', () => {
    assert.equal(quoteScalar('github'), "'github'");
    assert.equal(quoteScalar("it's"), "'it''s'");
    assert.equal(quoteScalar(''), "''");
  });

  it('含换行的字符串退回双引号 JSON 转义', () => {
    assert.equal(quoteScalar('a\nb'), '"a\\nb"');
  });

  it('!!js 值原样输出，不加引号', () => {
    assert.equal(valueToYaml('!!js process.env.TOKEN'), '!!js process.env.TOKEN');
    assert.equal(valueToYaml('plain'), "'plain'");
    assert.equal(valueToYaml(60000), '60000');
    assert.equal(valueToYaml(true), 'true');
    assert.equal(valueToYaml(null), 'null');
  });

  it('parseScalar 认得标量形态', () => {
    assert.deepEqual(parseScalar("'a''b'"), { kind: 'string', value: "a'b" });
    assert.deepEqual(parseScalar('"x"'), { kind: 'string', value: 'x' });
    assert.deepEqual(parseScalar('60000'), { kind: 'number', value: 60000 });
    assert.deepEqual(parseScalar('true'), { kind: 'boolean', value: true });
    assert.deepEqual(parseScalar('null'), { kind: 'null', value: null });
    assert.deepEqual(parseScalar('!!js process.env.X'), { kind: 'expression', value: '!!js process.env.X' });
    assert.deepEqual(parseScalar('bare'), { kind: 'string', value: 'bare' });
  });

  it('splitTopLevel 忽略引号与括号内的分隔符', () => {
    assert.deepEqual(splitTopLevel("a: 'x,y', b: 2", ','), ["a: 'x,y'", 'b: 2']);
    assert.deepEqual(splitTopLevel('[1, 2], 3', ','), ['[1, 2]', '3']);
  });

  it('splitPair 认得带引号的键', () => {
    assert.deepEqual(splitPair('serverName: github'), { key: 'serverName', value: 'github' });
    assert.deepEqual(splitPair("'serverName': github"), { key: 'serverName', value: 'github' });
    assert.equal(splitPair('- y'), null);
  });

  it('流样式解析', () => {
    assert.deepEqual(parseFlowSeq("['-y', 'pkg']"), ['-y', 'pkg']);
    assert.deepEqual(parseFlowMap('{ A: 1, B: two }'), { A: 1, B: 'two' });
  });
});

describe('serialize · serializeEntry', () => {
  it('生成块风格、canonical 键序、补默认值', () => {
    const lines = serializeEntry({
      id: 'mcp-github',
      config: { serverName: 'github', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] },
    });
    assert.deepEqual(lines, [
      "- id: 'mcp-github'",
      `  name: '${MCP_CLIENT_NAME}'`,
      '  config:',
      "    serverName: 'github'",
      "    transport: 'stdio'",
      "    command: 'npx'",
      '    args:',
      "      - '-y'",
      "      - 'pkg'",
    ]);
  });

  it('默认值由 validate 层补齐后一并写入（serializeEntry 自己不擅自加字段）', () => {
    const lines = serializeEntry({
      id: 'mcp-github',
      config: {
        serverName: 'github',
        transport: 'stdio',
        command: 'npx',
        toolCallTimeoutMs: 60000,
        maxInstructionBytes: 32768,
        failOnStartupError: false,
      },
    });
    assert.deepEqual(lines.slice(-3), [
      '    toolCallTimeoutMs: 60000',
      '    maxInstructionBytes: 32768',
      '    failOnStartupError: false',
    ]);
  });

  it('disabled: true 出现在 name 之后、config 之前', () => {
    const lines = serializeEntry({
      id: 'mcp-x',
      disabled: true,
      config: { serverName: 'x', transport: 'stdio', command: 'n' },
    });
    assert.equal(lines[2], '  disabled: true');
    assert.equal(lines[3], '  config:');
  });

  it('未知字段排在 canonical 之后，按输入顺序透传', () => {
    const lines = serializeEntry({
      id: 'mcp-x',
      config: { serverName: 'x', transport: 'stdio', command: 'n', zzz: 1, aaa: 2 },
    });
    const tail = lines.slice(-2);
    assert.deepEqual(tail, ['    zzz: 1', '    aaa: 2']);
  });

  it('indent 参数生效（供未来嵌套使用）', () => {
    const lines = serializeEntry({ id: 'x', config: { serverName: 'x' } }, '  ');
    assert.equal(lines[0], "  - id: 'x'");
  });
});

describe('serialize · 往返一致', () => {
  it('serializeEntry → scan → 再 serializeEntry 结果一致', () => {
    const config = {
      serverName: 'round',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@scope/pkg'],
      env: { TOKEN: 'abc' },
      toolCallTimeoutMs: 12000,
      maxInstructionBytes: 32768,
      failOnStartupError: false,
    };
    const first = serializeEntry({ id: 'mcp-round', config }).join('\n');
    const item = scan(first).items[0];
    assert.equal(item.serverName, 'round');
    assert.deepEqual(item.args, ['-y', '@scope/pkg']);
    assert.deepEqual(item.envKeys, ['TOKEN']);
    assert.equal(item.toolCallTimeoutMs, 12000);
    assert.equal(item.summary, 'npx -y @scope/pkg');
    const second = serializeEntry({ id: 'mcp-round', config }).join('\n');
    assert.equal(second, first);
  });

  it('http 条目的 summary 是 url', () => {
    const text = serializeEntry({
      id: 'mcp-h',
      config: { serverName: 'h', transport: 'streamable-http', url: 'https://x.test/mcp' },
    }).join('\n');
    const item = scan(text).items[0];
    assert.equal(item.transport, 'streamable-http');
    assert.equal(item.summary, 'https://x.test/mcp');
  });
});

describe('serialize · env 脱敏', () => {
  it('块风格：值换成占位符，key 保留', () => {
    const text = ['- id: mcp-a', '  config:', '    env:', "      TOKEN: 'secret-abc'", "      B: 'x'"].join('\n');
    const result = redactEnvValues(text);
    assert.equal(result.includes('secret-abc'), false);
    assert.ok(result.includes("TOKEN: '••••'"));
  });

  it('流风格：值换成占位符，key 保留', () => {
    const result = redactEnvValues("  env: { TOKEN: 'secret-abc', OTHER: bare }");
    assert.equal(result.includes('secret-abc'), false);
    assert.equal(result.includes('bare'), false);
    assert.ok(result.includes('TOKEN'));
    assert.ok(result.includes('OTHER'));
    assert.ok(result.includes('••••'));
  });

  it('!!js 表达式原样保留', () => {
    const result = redactEnvValues('    env:\n      TOKEN: !!js process.env.TOKEN');
    assert.ok(result.includes('!!js process.env.TOKEN'));
  });

  it('认不出来的 env 形态整值脱敏，绝不留原文', () => {
    const result = redactEnvValues('    env: !!js some.map');
    assert.equal(result.includes('some.map'), false);
  });

  it('换行符跟随原文', () => {
    const result = redactEnvValues("env:\r\n  A: 'b'\r\n");
    assert.ok(result.includes('\r\n'));
  });

  it('env 之外的内容一个字节不动', () => {
    const text = ['- id: mcp-a', '  name: "@deepseek-ai/dsh-mcp-client"', '  config:', '    serverName: a', "    env:", "      K: 'v'"].join('\n');
    const result = redactEnvValues(text);
    assert.equal(result.split('\n')[0], '- id: mcp-a');
    assert.equal(result.split('\n')[3], '    serverName: a');
  });
});

describe('serialize · headers 脱敏（远程 MCP 的 token 就在这里）', () => {
  it('块风格：鉴权头的值换成占位符，头名保留', () => {
    const text = [
      '- id: mcp-r',
      '  config:',
      "    url: 'https://x.test/mcp'",
      '    headers:',
      "      Authorization: 'Bearer sk-secret'",
      "      x-api-key: 'sk-2'",
    ].join('\n');
    const result = redactEnvValues(text);
    assert.equal(result.includes('sk-secret'), false, result);
    assert.equal(result.includes('sk-2'), false, result);
    assert.ok(result.includes('Authorization'));
    assert.ok(result.includes('x-api-key'));
    assert.ok(result.includes("url: 'https://x.test/mcp'"), 'url 不是秘密，必须照旧可见');
  });

  it('流风格 headers 也打码', () => {
    const result = redactEnvValues("    headers: { Authorization: 'Bearer sk-secret' }");
    assert.equal(result.includes('sk-secret'), false, result);
    assert.ok(result.includes('Authorization'));
  });

  it('引号键 / 行尾注释 两种形态都不能漏', () => {
    for (const key of ["'headers'", '"headers"', 'headers']) {
      const text = `    ${key}:  # 备注\n      Authorization: 'Bearer sk-secret'`;
      assert.equal(redactEnvValues(text).includes('sk-secret'), false, `${key} 漏了明文`);
    }
  });

  it('headers 的 !!js 表达式原样保留', () => {
    const result = redactEnvValues('    headers:\n      Authorization: !!js `Bearer ${process.env.T}`');
    assert.ok(result.includes('!!js `Bearer ${process.env.T}`'), result);
  });

  it('env 与 headers 同时存在时两处都打码，且互不干扰', () => {
    const text = [
      '  config:',
      '    env:',
      "      A: 'env-secret'",
      '    headers:',
      "      B: 'header-secret'",
    ].join('\n');
    const result = redactEnvValues(text);
    assert.equal(result.includes('env-secret'), false);
    assert.equal(result.includes('header-secret'), false);
    assert.ok(result.includes('A'));
    assert.ok(result.includes('B'));
  });
});

/**
 * BUG-1 回归矩阵：env 脱敏**形态覆盖**。
 *
 * 之前只测了"插件自己生成"的块风格与流风格两种，正好漏掉会漏明文的那两种
 * （引号键 `'env':` 与 `env: # 行尾注释`）。这里把 YAML 里可能出现的 env 形态
 * 尽量列全，统一断言"输出全文不含明文"。
 *
 * 断言方式刻意用"全文不含 secret"而不是"某字段等于占位符"——明文可能从
 * `item.raw` 这类没被单独断言的路径漏出去，只有全文扫描才拦得住。
 */
describe('serialize · env 脱敏 · BUG-1 回归矩阵', () => {
  /** 一个绝不该出现在脱敏输出里的明文。 */
  const SECRET = 'super-secret-value-42';

  /** @type {Array<[string, string]>} [形态名, 写在 config: 下的 env 片段] */
  const SHAPES = [
    ['块风格 env:', `    env:\n      TOKEN: ${SECRET}\n`],
    ["引号键 'env':", `    'env':\n      TOKEN: ${SECRET}\n`],
    ['双引号键 "env":', `    "env":\n      TOKEN: ${SECRET}\n`],
    ['env: 带行尾注释', `    env: # 备注\n      TOKEN: ${SECRET}\n`],
    ["'env': 带行尾注释", `    'env': # 备注\n      TOKEN: ${SECRET}\n`],
    ['流风格 env: {T: x}', `    env: { TOKEN: ${SECRET} }\n`],
    ['单引号包裹的值', `    env:\n      TOKEN: '${SECRET}'\n`],
    ['双引号包裹的值', `    env:\n      TOKEN: "${SECRET}"\n`],
    ['深层缩进 nested:', `    env:\n      nested:\n        TOKEN: ${SECRET}\n`],
    ['折号块标量 env: >', `    env: >\n      ${SECRET}\n`],
    ['竖线块标量 env: |', `    env: |\n      ${SECRET}\n`],
    ['env 值里带 #', `    env:\n      TOKEN: ${SECRET} # 备注\n`],
    ['env 整值带 #', `    env: ${SECRET} # x\n`],
    ['嵌套流映射', `    env: { a: { b: ${SECRET} } }\n`],
    ['多值块', `    env:\n      A: ${SECRET}\n      B: ${SECRET}\n`],
    ['env 子树后紧跟同级键', `    env:\n      TOKEN: ${SECRET}\n    cwd: /tmp\n`],
    ['CRLF 换行', `    env:\r\n      TOKEN: ${SECRET}\r\n`],
    // 多文档：`---` 之后是另一个条目，两处的 env 都得脱敏。
    ['多文档', `    env:\n      TOKEN: ${SECRET}\n---\n    env:\n      B: ${SECRET}\n`],
  ];

  for (const [label, fragment] of SHAPES) {
    it(`${label} → 全文不含明文`, () => {
      const result = redactEnvValues(fragment);
      assert.equal(
        result.includes(SECRET),
        false,
        `明文漏出来了：\n--- 输入 ---\n${fragment}\n--- 输出 ---\n${result}`,
      );
    });
  }

  it('多文档：每个文档里的 env 都被脱敏（不是只处理第一个）', () => {
    const result = redactEnvValues(`    env:\n      A: ${SECRET}\n---\n    env:\n      B: ${SECRET}\n`);
    // 占位符应出现两次，一次对应一个文档。
    assert.equal(result.split(REDACTED_LITERAL).length - 1, 2, '两个文档的 env 都应被脱敏');
  });

  it('反向断言：!!js 表达式必须原样保留，不能被误打码', () => {
    for (const expr of ['!!js process.env.TOKEN', '!!js `t-${process.env.X}`', '!!js some.map']) {
      const result = redactEnvValues(`    env:\n      T: ${expr}\n`);
      assert.ok(result.includes(expr), `表达式必须原样保留：${expr}\n实得：${result}`);
      assert.ok(result.includes('T:'), 'key 必须保留');
    }
  });

  it('!!js 与明文混排：只打码明文，不动表达式', () => {
    const result = redactEnvValues(`    env:\n      A: !!js process.env.A\n      B: ${SECRET}\n`);
    assert.ok(result.includes('!!js process.env.A'), '表达式不能被动');
    assert.equal(result.includes(SECRET), false, '明文必须被打码');
  });

  it('不误伤：environment: / 注释里的 env: / 普通键都保持原样', () => {
    for (const fragment of [
      '    environment: keepme\n',
      '    # env: keepme\n',
      '    serverName: keepme\n    command: keepme\n',
    ]) {
      const result = redactEnvValues(fragment);
      assert.ok(result.includes('keepme'), `不该被脱敏的被改动了：${fragment} → ${result}`);
      assert.equal(result.includes(REDACTED_LITERAL), false, '不该出现占位符');
    }
  });

  it('脱敏后 key 仍可枚举（UI 要显示"环境：TOKEN、B"）', () => {
    const result = redactEnvValues(`    env:\n      TOKEN: ${SECRET}\n      B: ${SECRET}\n`);
    assert.ok(result.includes('TOKEN'));
    assert.ok(result.includes('B:'));
  });
});
