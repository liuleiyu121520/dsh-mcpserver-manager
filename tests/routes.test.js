/**
 * Host HTTP 层单测：4 个端点 + 守卫 + 错误码表。
 *
 * 用一个假 ctx（`webServer.register` / `connection.requestRejection` /
 * `effect`）把路由挂起来，再用假 req/res 直接打——不依赖真实宿主进程。
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { apply } from '../src/index.js';
import { BEGIN_ANCHOR, END_ANCHOR, createPatchStore } from '../src/patch-store.js';
import { PREFIX, SERVERS_PATH, registerRoutes, serverNameFromPath } from '../src/routes.js';

/** @type {string} */
let dir;
/** @type {string} */
let filePath;
/** @type {Array<{kind: string, path: string, handler: Function}>} */
let routes;
/** @type {boolean} */
let rejectAll;

/**
 * 建一个假 ctx：把 `webServer.register` 收到的路由攒进 `sink`。
 * @param {Array<{kind: string, path: string, handler: Function}>} sink 路由收集器。
 * @returns {object} ctx。
 */
function createCtx(sink) {
  return {
    connection: {
      requestRejection: () => (rejectAll === true ? 403 : undefined),
    },
    webServer: {
      register(route) {
        sink.push(route);
        return () => {};
      },
    },
    effect(fn) {
      return fn();
    },
  };
}

/**
 * 按 kind 分发到指定路由表：exact 优先，其次 prefix。
 * @param {Array<{kind: string, path: string, handler: Function}>} table 路由表。
 * @param {string} method HTTP 方法。
 * @param {string} url 路径。
 * @param {string} [body] 请求体。
 * @returns {Promise<{statusCode: number, payload: any, res: object}>} 响应。
 */
async function dispatch(table, method, url, body = undefined) {
  const pathname = new URL(url, 'http://localhost').pathname;
  const exact = table.find((route) => route.kind === 'exact' && route.path === pathname);
  const prefix = table.find((route) => route.kind === 'prefix' && pathname.startsWith(route.path));
  const route = exact ?? prefix;
  assert.ok(route !== undefined, `没有路由匹配 ${method} ${url}`);

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
    headersSent: false,
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
  await route.handler(req, res);
  /** @type {any} */
  let payload = null;
  try {
    payload = JSON.parse(res.body);
  } catch {
    payload = null;
  }
  return { statusCode: res.statusCode, payload, res };
}

/**
 * 打到全局路由表。
 * @param {string} method HTTP 方法。
 * @param {string} url 路径。
 * @param {string} [body] 请求体。
 * @returns {Promise<{statusCode: number, payload: any, res: object}>} 响应。
 */
const call = (method, url, body) => dispatch(routes, method, url, body);

/** 一条合法配置的 JSON 文本。 */
const rawFor = (name) =>
  JSON.stringify({ serverName: name, transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] });

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'dshmcp-routes-'));
  mkdirSync(join(dir, 'profiles', 'web'), { recursive: true });
  filePath = join(dir, 'profiles', 'web', 'cordis.patch.yml');
  writeFileSync(
    filePath,
    '# 我的 patch\n- id: ui-settings-general\n  name: "other"\n  config:\n    a: 1\n',
  );
  rejectAll = false;
  routes = [];
  apply(createCtx(routes), { dshHome: dir });
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('routes · 端点与信封', () => {
  it('注册了 exact 与 prefix 两条路由', () => {
    assert.equal(routes.length, 2);
    assert.deepEqual(routes.map((route) => route.kind).sort(), ['exact', 'prefix']);
    assert.equal(SERVERS_PATH, `${PREFIX}/servers`);
  });

  it('GET /servers —— 空态是 200 而不是错误', async () => {
    const { statusCode, payload } = await call('GET', SERVERS_PATH);
    assert.equal(statusCode, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.data.exists, true);
    assert.equal(payload.data.anchors, 'missing');
    assert.deepEqual(payload.data.items, []);
    assert.equal(typeof payload.revision, 'number');
  });

  it('POST /servers —— 201 且文件里出现受管段与条目', async () => {
    const { statusCode, payload } = await call(
      'POST',
      SERVERS_PATH,
      JSON.stringify({ raw: rawFor('github') }),
    );
    assert.equal(statusCode, 201);
    assert.equal(payload.ok, true);
    assert.equal(payload.data.item.serverName, 'github');
    const text = readFileSync(filePath, 'utf8');
    assert.ok(text.includes(BEGIN_ANCHOR));
    assert.ok(text.includes(END_ANCHOR));
    assert.ok(text.includes("- id: 'mcp-github'"));
    assert.ok(text.includes("name: '@deepseek-ai/dsh-mcp-client'"));
    assert.ok(text.includes('# 我的 patch'), '段外注释必须在');
    assert.ok(text.includes('- id: ui-settings-general'), '别的插件条目必须在');
  });

  it('未知字段原样写入（Q8 警告放行）', async () => {
    const { statusCode } = await call(
      'POST',
      SERVERS_PATH,
      JSON.stringify({
        raw: JSON.stringify({ serverName: 'extra', transport: 'stdio', command: 'n', foo: 1 }),
      }),
    );
    assert.equal(statusCode, 201);
    assert.ok(readFileSync(filePath, 'utf8').includes('foo: 1'));
  });

  it('重名 → 409 duplicate-server', async () => {
    const { statusCode, payload } = await call(
      'POST',
      SERVERS_PATH,
      JSON.stringify({ raw: rawFor('github') }),
    );
    assert.equal(statusCode, 409);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, 'duplicate-server');
  });

  it('非法 JSON → 400 invalid-json，且带行号', async () => {
    const { statusCode, payload } = await call(
      'POST',
      SERVERS_PATH,
      JSON.stringify({ raw: '{\n"a": }\n' }),
    );
    assert.equal(statusCode, 400);
    assert.equal(payload.error.code, 'invalid-json');
    assert.equal(payload.error.errors[0].line, 2);
  });

  it('缺字段 → 400 invalid-config', async () => {
    const { statusCode, payload } = await call(
      'POST',
      SERVERS_PATH,
      JSON.stringify({ raw: JSON.stringify({ serverName: 'nope', transport: 'stdio' }) }),
    );
    assert.equal(statusCode, 400);
    assert.equal(payload.error.code, 'invalid-config');
    assert.ok(payload.error.errors.some((item) => item.code === 'E_COMMAND'));
  });

  it('DELETE /servers/<name> —— 200，再删一次 → 404 unknown-server', async () => {
    const first = await call('DELETE', `${SERVERS_PATH}/github`);
    assert.equal(first.statusCode, 200);
    assert.equal(first.payload.data.removed, 'github');
    const second = await call('DELETE', `${SERVERS_PATH}/github`);
    assert.equal(second.statusCode, 404);
    assert.equal(second.payload.error.code, 'unknown-server');
  });

  it('POST /servers/<name>/toggle —— 停用 200 changed:true，重复一次 changed:false', async () => {
    const first = await call('POST', `${SERVERS_PATH}/extra/toggle`, JSON.stringify({ enabled: false }));
    assert.equal(first.statusCode, 200);
    assert.equal(first.payload.data.changed, true);
    assert.equal(first.payload.data.item.enabled, false);
    assert.ok(readFileSync(filePath, 'utf8').includes('disabled: true'));

    const second = await call('POST', `${SERVERS_PATH}/extra/toggle`, JSON.stringify({ enabled: false }));
    assert.equal(second.statusCode, 200);
    assert.equal(second.payload.data.changed, false);

    const back = await call('POST', `${SERVERS_PATH}/extra/toggle`, JSON.stringify({ enabled: true }));
    assert.equal(back.payload.data.item.enabled, true);
    assert.equal(readFileSync(filePath, 'utf8').includes('disabled: true'), false);
  });

  it('toggle 缺 enabled 字段 → 400 invalid-config', async () => {
    const { statusCode, payload } = await call('POST', `${SERVERS_PATH}/extra/toggle`, '{}');
    assert.equal(statusCode, 400);
    assert.equal(payload.error.code, 'invalid-config');
  });

  it('方法不匹配 → 405 method-not-allowed', async () => {
    const { statusCode, payload } = await call('PUT', SERVERS_PATH);
    assert.equal(statusCode, 405);
    assert.equal(payload.error.code, 'method-not-allowed');
  });

  it('body 超过 256KB → 413 body-too-large', async () => {
    const huge = JSON.stringify({
      raw: `{"serverName":"big","transport":"stdio","command":"${'x'.repeat(300 * 1024)}"}`,
    });
    const { statusCode, payload } = await call('POST', SERVERS_PATH, huge);
    assert.equal(statusCode, 413);
    assert.equal(payload.error.code, 'body-too-large');
  });

  it('env 明文绝不越过 Host 边界（P0-13）', async () => {
    await call(
      'POST',
      SERVERS_PATH,
      JSON.stringify({
        raw: JSON.stringify({
          serverName: 'secret',
          transport: 'stdio',
          command: 'node',
          env: { TOKEN: 'super-secret-value' },
        }),
      }),
    );
    const { payload } = await call('GET', SERVERS_PATH);
    const wire = JSON.stringify(payload);
    assert.equal(wire.includes('super-secret-value'), false, 'env 明文不该出现在响应里');
    const item = payload.data.items.find((entry) => entry.serverName === 'secret');
    assert.deepEqual(item.envKeys, ['TOKEN']);
    assert.ok(item.raw.includes('••••'), 'raw 里应该给出脱敏占位符');
    assert.equal(item.raw.includes('super-secret-value'), false);
    // 文件里必须有明文（否则 MCP 跑不起来），只是不下发给页面。
    assert.ok(readFileSync(filePath, 'utf8').includes('super-secret-value'));
  });

  it('守卫：requestRejection 返回状态码时请求被直接拒掉', async () => {
    rejectAll = true;
    try {
      const { statusCode, res } = await call('GET', SERVERS_PATH);
      assert.equal(statusCode, 403);
      assert.equal(res.body, '', '被拒的请求不该有任何响应体');
    } finally {
      rejectAll = false;
    }
  });
});

describe('routes · 只读条目与锚点损坏', () => {
  it('对段外（用户手写）条目删除 → 409 readonly-entry', async () => {
    const table = [];
    const store = createPatchStore({ config: { dshHome: dir }, now: () => 1 });
    // 手写一条 MCP 条目：文件里还没有受管段（这是用户已有的初始状态）。
    const handPath = join(dir, 'profiles', 'web', 'cordis.patch.yml');
    const backup = readFileSync(handPath, 'utf8');
    writeFileSync(
      handPath,
      `# 手写\n- id: mcp-hand\n  name: "@deepseek-ai/dsh-mcp-client"\n  config:\n    serverName: hand\n    transport: stdio\n    command: npx\n`,
    );
    try {
      registerRoutes(createCtx(table), store, () => {});
      const { statusCode, payload } = await dispatch(table, 'DELETE', `${SERVERS_PATH}/hand`);
      assert.equal(statusCode, 409);
      assert.equal(payload.error.code, 'readonly-entry');
    } finally {
      writeFileSync(handPath, backup);
    }
  });

  it('锚点只有一半 → 任何写都 409 anchors-broken，读仍是 200', async () => {
    const table = [];
    const store = createPatchStore({ config: { dshHome: dir }, now: () => 1 });
    const brokenPath = join(dir, 'profiles', 'web', 'cordis.patch.yml');
    const backup = readFileSync(brokenPath, 'utf8');
    writeFileSync(brokenPath, `# 坏了\n${BEGIN_ANCHOR}\n- id: mcp-a\n  name: "x"\n`);
    try {
      registerRoutes(createCtx(table), store, () => {});
      const read = await dispatch(table, 'GET', SERVERS_PATH);
      assert.equal(read.statusCode, 200);
      assert.equal(read.payload.data.anchors, 'broken');
      const write = await dispatch(
        table,
        'POST',
        SERVERS_PATH,
        JSON.stringify({ raw: rawFor('any') }),
      );
      assert.equal(write.statusCode, 409);
      assert.equal(write.payload.error.code, 'anchors-broken');
    } finally {
      writeFileSync(brokenPath, backup);
    }
  });
});

describe('routes · serverNameFromPath', () => {
  it('认得 <name> 与 <name>/toggle', () => {
    assert.deepEqual(serverNameFromPath({ url: `${SERVERS_PATH}/github` }), {
      name: 'github',
      action: null,
    });
    assert.deepEqual(serverNameFromPath({ url: `${SERVERS_PATH}/github/toggle` }), {
      name: 'github',
      action: 'toggle',
    });
  });

  it('拒绝非法名字（路径穿越 / 空 / 多余段）', () => {
    for (const url of [
      `${SERVERS_PATH}/`,
      `${SERVERS_PATH}/../etc/passwd`,
      `${SERVERS_PATH}/github/foo`,
      `${SERVERS_PATH}/github/toggle/x`,
    ]) {
      assert.throws(() => serverNameFromPath({ url }), /该条目已不存在/, `应拒绝 ${url}`);
    }
  });
});
