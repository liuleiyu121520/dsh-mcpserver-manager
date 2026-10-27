/**
 * BUG-1 回归 · **端到端** env 明文不下发。
 *
 * `tests/serialize.test.js` 只验证了 `redactEnvValues()` 这个纯函数。但脱敏的
 * 目的不是"函数正确"，而是"明文绝不越过 Host 边界到达浏览器"——这中间还隔着
 * `scan()` → `read()` → `GET /servers` 信封 → `JSON.stringify` 好几跳，任何一跳
 * 把原文带出去（比如 `item.raw`、`item.summary`）都算漏。
 *
 * 所以这里**每一条都走完整的 HTTP 路径**，并对响应体全文（`JSON.stringify` 后的
 * 整个 payload，不只是某个字段）断言不含明文。只断言 `raw` 里某个字段等于
 * 占位符是不够的——明文完全可以从另一条路径漏出去。
 *
 * 暴露面提醒：`src/client/ServerCard.jsx` 在 `item.parsable === false` 时会把
 * `item.raw` 原样渲染进页面，所以这里也覆盖了"不可解析条目"的场景。
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { BEGIN_ANCHOR, END_ANCHOR, createPatchStore } from '../src/patch-store.js';
import { SERVERS_PATH, registerRoutes } from '../src/routes.js';

/** 绝不该出现在响应体里的明文。 */
const SECRET = 'super-secret-value-42';

/**
 * 挂一套路由到一个临时目录里的 patch 文件上。
 * @param {string} initial patch 文件初始内容。
 * @returns {{call: (method: string, url: string, body?: string) => Promise<{statusCode: number, payload: any, wire: string}>, file: string, cleanup: () => void}} 测试夹具。
 */
function harness(initial) {
  const dir = mkdtempSync(join(tmpdir(), 'dshmcp-redact-'));
  const file = join(dir, 'cordis.patch.yml');
  writeFileSync(file, initial);
  /** @type {Array<{kind: string, path: string, handler: Function}>} */
  const table = [];
  const ctx = {
    connection: { requestRejection: () => undefined },
    webServer: {
      register(route) {
        table.push(route);
        return () => {};
      },
    },
    effect(fn) {
      return fn();
    },
  };
  registerRoutes(ctx, createPatchStore({ filePath: file }), () => {});

  /**
   * 打一个请求。
   * @param {string} method HTTP 方法。
   * @param {string} url 路径。
   * @param {string} [body] 请求体。
   * @returns {Promise<{statusCode: number, payload: any, wire: string}>} 响应。
   */
  const call = async (method, url, body = undefined) => {
    const chunks = body === undefined ? [] : [Buffer.from(body, 'utf8')];
    const req = {
      method,
      url,
      headers: {},
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) yield chunk;
      },
    };
    const res = {
      statusCode: 200,
      /** @type {Record<string, string>} */
      headers: {},
      body: '',
      setHeader(key, value) {
        this.headers[key] = value;
      },
      end(text) {
        if (typeof text === 'string') this.body += text;
      },
    };
    const route =
      table.find((entry) => entry.kind === 'exact' && entry.path === url) ??
      table.find((entry) => entry.kind === 'prefix' && url.startsWith(entry.path));
    assert.ok(route !== undefined, `没有路由匹配 ${method} ${url}`);
    await route.handler(req, res);
    /** @type {any} */
    let payload = null;
    try {
      payload = JSON.parse(res.body);
    } catch {
      payload = null;
    }
    return { statusCode: res.statusCode, payload, wire: res.body };
  };

  return { call, file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * 造一个受管段里含指定 env 片段的 patch 文件。
 * @param {string} fragment 写在 `config:` 下的 env 片段。
 * @returns {string} patch 文件全文。
 */
function patchWith(fragment) {
  return [
    BEGIN_ANCHOR,
    '- id: mcp-gh',
    "  name: '@deepseek-ai/dsh-mcp-client'",
    '  config:',
    '    serverName: gh',
    '    transport: stdio',
    '    command: npx',
    fragment.replace(/\n$/, ''),
    END_ANCHOR,
    '',
  ].join('\n');
}

/** @type {Array<[string, string]>} [形态名, env 片段] */
const SHAPES = [
  ['块风格 env:', `    env:\n      TOKEN: ${SECRET}\n`],
  ["引号键 'env':", `    'env':\n      TOKEN: ${SECRET}\n`],
  ['双引号键 "env":', `    "env":\n      TOKEN: ${SECRET}\n`],
  ['env: 带行尾注释', `    env: # 备注\n      TOKEN: ${SECRET}\n`],
  ["'env': 带行尾注释", `    'env': # 备注\n      TOKEN: ${SECRET}\n`],
  ['流风格 env: {T: x}', `    env: { TOKEN: ${SECRET} }\n`],
  ['单引号包裹的值', `    env:\n      TOKEN: '${SECRET}'\n`],
  ['深层缩进 nested:', `    env:\n      nested:\n        TOKEN: ${SECRET}\n`],
  ['块标量 env: >', `    env: >\n      ${SECRET}\n`],
  ['env 值里带 #', `    env:\n      TOKEN: ${SECRET} # 备注\n`],
  ['嵌套流映射', `    env: { a: { b: ${SECRET} } }\n`],
  ['CRLF 换行', `    env:\r\n      TOKEN: ${SECRET}\r\n`],
];

describe('HTTP · env 明文绝不下发（BUG-1 端到端回归）', () => {
  for (const [label, fragment] of SHAPES) {
    it(`GET /servers —— ${label} 的响应体全文不含明文`, async () => {
      const fix = harness(patchWith(fragment));
      try {
        const { statusCode, payload, wire } = await fix.call('GET', SERVERS_PATH);
        assert.equal(statusCode, 200);
        assert.equal(payload.ok, true);
        // 关键断言：**整条 wire**（含 item.raw / summary / 一切字段）都不含明文。
        assert.equal(wire.includes(SECRET), false, `明文从 HTTP 漏出去了：${wire}`);
        assert.equal(JSON.stringify(payload).includes(SECRET), false, '明文从信封里漏出去了');
        const item = payload.data.items.find((entry) => entry.serverName === 'gh');
        assert.ok(item !== undefined, '条目应可见');
        assert.equal(item.raw.includes(SECRET), false, 'item.raw 漏了明文（ServerCard 会渲染它）');
        assert.equal(item.summary.includes(SECRET), false, 'item.summary 漏了明文');
      } finally {
        fix.cleanup();
      }
    });
  }

  it('不可解析条目（ServerCard 会渲染 raw）的 env 也照样脱敏', async () => {
    // `config: |` 块标量 → parsable:false → UI 会直接把 item.raw 铺在页面上，
    // 这是 item.raw 唯一的渲染出口，所以这条路径必须单独守住。
    // 注意 env 是 config 的**兄弟键**（缩进 2），不是 config 的子键。
    const fix = harness(
      [
        BEGIN_ANCHOR,
        '- id: mcp-weird',
        "  name: '@deepseek-ai/dsh-mcp-client'",
        '  config: |',
        '    这是一段块标量，超出可解析范围',
        '  env:',
        `    TOKEN: ${SECRET}`,
        END_ANCHOR,
        '',
      ].join('\n'),
    );
    try {
      const { payload, wire } = await fix.call('GET', SERVERS_PATH);
      const item = payload.data.items[0];
      assert.equal(item.parsable, false, '这条应该被判定为不可解析');
      assert.ok(item.raw.length > 0, 'raw 仍要能给 UI 展示');
      assert.equal(wire.includes(SECRET), false, '不可解析条目的 raw 会直接渲染，绝不能带明文');
      assert.ok(item.raw.includes('TOKEN'), 'key 要保留');
    } finally {
      fix.cleanup();
    }
  });

  it('POST 新增含明文 env 的条目 → 之后 GET 仍不下发明文', async () => {
    const fix = harness('');
    try {
      const created = await fix.call(
        'POST',
        SERVERS_PATH,
        JSON.stringify({
          raw: JSON.stringify({
            serverName: 'gh',
            transport: 'stdio',
            command: 'npx',
            env: { TOKEN: SECRET },
          }),
        }),
      );
      assert.equal(created.statusCode, 201);
      // 文件里必须有明文，否则 MCP 跑不起来——只是不该下发给页面。
      const { readFileSync } = await import('node:fs');
      assert.ok(readFileSync(fix.file, 'utf8').includes(SECRET), '文件里应保留明文');

      const { wire } = await fix.call('GET', SERVERS_PATH);
      assert.equal(wire.includes(SECRET), false, 'GET 不该把明文带出去');
    } finally {
      fix.cleanup();
    }
  });

  it('反向断言：!!js 表达式必须原样出现在响应里（不是明文，是引用）', async () => {
    const expr = '!!js process.env.GITHUB_TOKEN';
    const fix = harness(patchWith(`    env:\n      TOKEN: ${expr}\n`));
    try {
      const { wire } = await fix.call('GET', SERVERS_PATH);
      assert.ok(wire.includes(expr), `表达式应原样下发，实得：${wire}`);
      const item = JSON.parse(wire).data.items[0];
      assert.deepEqual(item.envKeys, ['TOKEN'], 'key 要能枚举出来给 UI 显示');
    } finally {
      fix.cleanup();
    }
  });

  it('env key 仍可枚举（UI 要显示"环境：TOKEN"），但值永远是占位符', async () => {
    const fix = harness(patchWith(`    env:\n      TOKEN: ${SECRET}\n      OTHER: ${SECRET}\n`));
    try {
      const { payload } = await fix.call('GET', SERVERS_PATH);
      const item = payload.data.items[0];
      assert.deepEqual(item.envKeys, ['TOKEN', 'OTHER']);
      assert.equal(item.raw.includes(SECRET), false);
    } finally {
      fix.cleanup();
    }
  });
});
