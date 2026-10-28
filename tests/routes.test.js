/**
 * Host HTTP 层单测：4 个端点 + 守卫 + 错误码表。
 *
 * 用一个假 ctx（`webServer.register` / `connection.requestRejection` /
 * `effect`）把路由挂起来，再用假 req/res 直接打——不依赖真实宿主进程。
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { apply } from '../src/index.js';
import { BEGIN_ANCHOR, END_ANCHOR, createPatchStore } from '../src/patch-store.js';
import {
  PREFIX,
  REPAIR_PATH,
  SERVERS_PATH,
  UPDATE_CHECK_PATH,
  UPDATE_PATH,
  UPGRADE_PATH,
  registerRoutes,
  serverNameFromPath,
} from '../src/routes.js';
import { PLUGIN_VERSION } from '../src/version.js';

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
  it('注册了两条 servers 路由 + 三条版本路由', () => {
    assert.deepEqual(
      routes.map((route) => `${route.kind} ${route.path}`),
      [
        `exact ${SERVERS_PATH}`,
        `prefix ${SERVERS_PATH}`,
        `exact ${REPAIR_PATH}`,
        `exact ${UPDATE_PATH}`,
        `exact ${UPDATE_CHECK_PATH}`,
        `exact ${UPGRADE_PATH}`,
      ],
      '路由清单变了就要同步改这条断言（多一条静默的端点比少一条更危险）',
    );
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

  it('GET /servers 报告运行中的 Host 版本（页面据此发现"升级了没重启"）', async () => {
    const { payload } = await call('GET', SERVERS_PATH);
    assert.equal(
      payload.data.version,
      PLUGIN_VERSION,
      'Host 必须报告自己的版本，否则页面无法发现它是旧进程',
    );
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

describe('routes · 编辑（GET config / POST edit）', () => {
  /**
   * 造一条带密钥的远程条目，返回它的名字。
   * @param {string} name serverName。
   * @returns {Promise<string>} 名字。
   */
  const seedSecret = async (name) => {
    const { statusCode } = await call(
      'POST',
      SERVERS_PATH,
      JSON.stringify({
        raw: JSON.stringify({
          serverName: name,
          transport: 'streamable-http',
          url: 'https://a.example/mcp',
          headers: { Authorization: 'Bearer sk-live-value' },
        }),
      }),
    );
    assert.equal(statusCode, 201);
    return name;
  };

  it('GET /servers/<name>/config —— 200，密钥被置空（浏览器拿不到明文）', async () => {
    const name = await seedSecret('cfg');
    const { statusCode, payload } = await call('GET', `${SERVERS_PATH}/${name}/config`);
    assert.equal(statusCode, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.data.serverName, name);
    assert.equal(payload.data.id, `mcp-${name}`);
    assert.equal(payload.data.text.includes('sk-live-value'), false, '密钥绝不能下发');
    assert.deepEqual(JSON.parse(payload.data.text).headers, { Authorization: '' });
    assert.deepEqual(payload.data.maskedKeys, { headers: ['Authorization'] });
  });

  it('GET config 只接受 GET（写方法一律 405）', async () => {
    const name = await seedSecret('cfg-method');
    const { statusCode, payload } = await call('POST', `${SERVERS_PATH}/${name}/config`, '{}');
    assert.equal(statusCode, 405);
    assert.equal(payload.error.code, 'method-not-allowed');
  });

  it('POST /servers/<name>/edit —— 200，改 url 保留密钥（空串 = 沿用原值）', async () => {
    const name = await seedSecret('edit-keep');
    const source = await call('GET', `${SERVERS_PATH}/${name}/config`);
    const edited = JSON.parse(source.payload.data.text);
    edited.url = 'https://b.example/mcp';
    const { statusCode, payload } = await call(
      'POST',
      `${SERVERS_PATH}/${name}/edit`,
      JSON.stringify({ raw: JSON.stringify(edited) }),
    );
    assert.equal(statusCode, 200);
    assert.equal(payload.data.renamed, false);
    assert.equal(payload.data.item.url, 'https://b.example/mcp');
    const text = readFileSync(filePath, 'utf8');
    assert.ok(text.includes('sk-live-value'), '密钥必须还在（编辑不该把它清空）');
    assert.ok(text.includes('https://b.example/mcp'));
  });

  it('POST edit 改名 —— renamed: true，列表里只剩新名字', async () => {
    const name = await seedSecret('edit-old');
    const source = await call('GET', `${SERVERS_PATH}/${name}/config`);
    const edited = JSON.parse(source.payload.data.text);
    edited.serverName = 'edit-new';
    const { statusCode, payload } = await call(
      'POST',
      `${SERVERS_PATH}/${name}/edit`,
      JSON.stringify({ raw: JSON.stringify(edited) }),
    );
    assert.equal(statusCode, 200);
    assert.equal(payload.data.renamed, true);
    assert.equal(payload.data.item.serverName, 'edit-new');
    const list = await call('GET', SERVERS_PATH);
    const names = list.payload.data.items.map((item) => item.serverName);
    assert.ok(names.includes('edit-new'));
    assert.equal(names.includes('edit-old'), false);
  });

  it('POST edit 缺 raw 字段 → 400 invalid-config（不猜、不写空配置）', async () => {
    const name = await seedSecret('edit-nobody');
    const { statusCode, payload } = await call('POST', `${SERVERS_PATH}/${name}/edit`, JSON.stringify({}));
    assert.equal(statusCode, 400);
    assert.equal(payload.error.code, 'invalid-config');
  });

  it('POST edit 校验不过 → 400，且原来的条目一个字都没动', async () => {
    const name = await seedSecret('edit-invalid');
    const before = readFileSync(filePath, 'utf8');
    const { statusCode } = await call(
      'POST',
      `${SERVERS_PATH}/${name}/edit`,
      JSON.stringify({ raw: JSON.stringify({ serverName: name, transport: 'streamable-http' }) }),
    );
    assert.equal(statusCode, 400);
    assert.equal(readFileSync(filePath, 'utf8'), before, '被拒的编辑必须零副作用');
  });

  it('POST edit 打到不存在的名字 → 404 unknown-server', async () => {
    const { statusCode, payload } = await call(
      'POST',
      `${SERVERS_PATH}/ghost/edit`,
      JSON.stringify({ raw: rawFor('ghost') }),
    );
    assert.equal(statusCode, 404);
    assert.equal(payload.error.code, 'unknown-server');
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

describe('routes · 装配层读宿主 profileContext（BUG-2 回归）', () => {
  /**
   * 造一个带 `get()` 的假 ctx（真宿主用 `ctx.get('profileContext')` 取服务）。
   * @param {Array<{kind: string, path: string, handler: Function}>} sink 路由收集器。
   * @param {() => unknown} get 服务提供者。
   * @param {string[]} logs info 通道收集器。
   * @param {object} [loggerOverride] 完整 logger 替身（默认只有一个 info）。
   * @returns {object} ctx。
   */
  const ctxWithServices = (sink, get, logs, loggerOverride = undefined) => ({
    connection: { requestRejection: () => undefined },
    webServer: {
      register(route) {
        sink.push(route);
        return () => {};
      },
    },
    effect(fn) {
      return fn();
    },
    get,
    logger: loggerOverride ?? { info: (line) => logs.push(line) },
  });

  it('desktop 宿主：写入 profileContext.patchPath，响应回传 profile / source', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dshmcp-ctx-'));
    const desktop = join(root, 'profiles', 'desktop', 'cordis.patch.yml');
    const web = join(root, 'profiles', 'web', 'cordis.patch.yml');
    mkdirSync(join(root, 'profiles', 'desktop'), { recursive: true });
    mkdirSync(join(root, 'profiles', 'web'), { recursive: true });
    writeFileSync(web, '# web：不该被改\n');
    try {
      /** @type {Array<{kind: string, path: string, handler: Function}>} */
      const table = [];
      /** @type {string[]} */
      const logs = [];
      apply(
        ctxWithServices(
          table,
          (name) => (name === 'profileContext' ? { name: 'desktop', patchPath: desktop, home: root } : undefined),
          logs,
        ),
        // 显式配置仍指向 web：宿主上下文必须压过它。
        { dshHome: root, profile: 'web' },
      );

      const created = await dispatch(table, 'POST', SERVERS_PATH, JSON.stringify({ raw: rawFor('ctx') }));
      assert.equal(created.statusCode, 201);
      assert.ok(readFileSync(desktop, 'utf8').includes('serverName'), 'desktop 文件必须被写入');
      assert.equal(readFileSync(web, 'utf8'), '# web：不该被改\n', 'web 文件不该被碰');

      const read = await dispatch(table, 'GET', SERVERS_PATH);
      assert.equal(read.statusCode, 200);
      assert.equal(read.payload.data.profile, 'desktop');
      assert.equal(read.payload.data.source, 'profileContext');
      assert.equal(read.payload.data.file, desktop);

      // 日志里必须能核对自己被写进了哪个 profile 的哪个文件。
      const mounted = logs.find((line) => line.includes('mounted'));
      assert.ok(mounted !== undefined, `缺 mounted 日志：${logs.join(' | ')}`);
      assert.ok(mounted.includes('profile=desktop'), mounted);
      assert.ok(mounted.includes('cordis.patch.yml'), mounted);
      assert.ok(mounted.includes('source=profileContext'), mounted);
      // 走宿主权威路径时不该有回落警告（警告要留给真正出事的情况）。
      assert.deepEqual(logs.filter((line) => line.includes('[WARN]')), [], logs.join(' | '));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ctx.get 抛错（服务未提供）时静默回落，不阻断激活', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dshmcp-noctx-'));
    mkdirSync(join(root, 'profiles', 'web'), { recursive: true });
    try {
      /** @type {Array<{kind: string, path: string, handler: Function}>} */
      const table = [];
      assert.doesNotThrow(() =>
        apply(
          ctxWithServices(
            table,
            () => {
              throw new Error('service profileContext not provided');
            },
            [],
          ),
          { dshHome: root },
        ),
      );
      const read = await dispatch(table, 'GET', SERVERS_PATH);
      assert.equal(read.statusCode, 200);
      assert.equal(read.payload.data.profile, 'web');
      assert.equal(read.payload.data.source, 'config.dshHome');
      assert.equal(read.payload.data.file, join(root, 'profiles', 'web', 'cordis.patch.yml'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('假 ctx 没有 ctx.get 这个方法时也不崩（测试/旧宿主）', () => {
    /** @type {Array<{kind: string, path: string, handler: Function}>} */
    const table = [];
    assert.doesNotThrow(() => apply(createCtx(table), { dshHome: dir }));
    // 2 条 servers + 1 条 repair + 3 条版本（版本路由不依赖 ctx.get，注册时不探测服务）。
    assert.equal(table.length, 6);
  });
});

describe('routes · 回落时必须留痕（可诊断性）', () => {
  /**
   * 造一个带 `get()` 的假 ctx（同上一组，独立一份是为了不跨 describe 依赖）。
   * @param {Array<{kind: string, path: string, handler: Function}>} sink 路由收集器。
   * @param {() => unknown} get 服务提供者。
   * @param {object} logger 日志替身。
   * @returns {object} ctx。
   */
  const ctxWith = (sink, get, logger) => ({
    connection: { requestRejection: () => undefined },
    webServer: {
      register(route) {
        sink.push(route);
        return () => {};
      },
    },
    effect: (fn) => fn(),
    get,
    logger,
  });

  it('宿主未提供 profileContext → 走 logger.warn，文案写清来源与路径', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshmcp-warn-'));
    mkdirSync(join(root, 'profiles', 'web'), { recursive: true });
    try {
      /** @type {string[]} */
      const infos = [];
      /** @type {string[]} */
      const warns = [];
      /** @type {Array<{kind: string, path: string, handler: Function}>} */
      const table = [];
      apply(
        ctxWith(table, () => undefined, {
          info: (line) => infos.push(line),
          warn: (line) => warns.push(line),
        }),
        { dshHome: root },
      );

      assert.equal(warns.length, 1, `应恰好一条 warn：${warns.join(' | ')}`);
      const line = warns[0];
      assert.ok(line.includes('[WARN]'), line);
      assert.ok(line.includes('宿主未提供 profileContext'), line);
      assert.ok(line.includes('config.dshHome'), `应写清回落来源：${line}`);
      assert.ok(line.includes('cordis.patch.yml'), `应写清回落路径：${line}`);
      assert.ok(line.includes('profile=web'), `应写清实际 profile：${line}`);
      // warn 归 warn，info 归 info：不要在两处重复同一条，info 只放 mounted。
      assert.equal(infos.some((item) => item.includes('[WARN]')), false, infos.join(' | '));
      assert.equal(infos.filter((item) => item.includes('mounted')).length, 1, infos.join(' | '));
      assert.equal(infos.length, 1, `infos 应只有 mounted 一条：${infos.join(' | ')}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('宿主 logger 只有 info 没有 warn → 退回 info 但保留 [WARN] 前缀（绝不静默）', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshmcp-warn2-'));
    try {
      /** @type {string[]} */
      const infos = [];
      /** @type {Array<{kind: string, path: string, handler: Function}>} */
      const table = [];
      apply(ctxWith(table, () => undefined, { info: (line) => infos.push(line) }), { dshHome: root });
      const warnLines = infos.filter((line) => line.includes('[WARN]'));
      assert.equal(warnLines.length, 1, infos.join(' | '));
      assert.ok(warnLines[0].includes('宿主未提供 profileContext'), warnLines[0]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('走 profileContext 时不打回落警告（警告只在真降级时出现）', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshmcp-nowarn-'));
    const desktop = join(root, 'profiles', 'desktop', 'cordis.patch.yml');
    mkdirSync(join(root, 'profiles', 'desktop'), { recursive: true });
    try {
      /** @type {string[]} */
      const warns = [];
      /** @type {string[]} */
      const infos = [];
      /** @type {Array<{kind: string, path: string, handler: Function}>} */
      const table = [];
      apply(
        ctxWith(
          table,
          (name) => (name === 'profileContext' ? { name: 'desktop', patchPath: desktop, home: root } : undefined),
          { info: (line) => infos.push(line), warn: (line) => warns.push(line) },
        ),
        {},
      );
      assert.deepEqual(warns, [], warns.join(' | '));
      // 宿主权威路径既不是回落、也不是「显式指定」：info 只应有 mounted 一条。
      assert.equal(infos.length, 1, infos.join(' | '));
      assert.ok(infos[0].includes('mounted'), infos[0]);
      assert.ok(infos[0].includes('source=profileContext'), infos[0]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('显式 config.patchFile 不是「回落」：宿主没提供 profileContext 时也不打警告', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshmcp-pf-'));
    const explicit = join(root, 'explicit', 'cordis.patch.yml');
    try {
      /** @type {string[]} */
      const warns = [];
      /** @type {string[]} */
      const infos = [];
      /** @type {Array<{kind: string, path: string, handler: Function}>} */
      const table = [];
      apply(
        ctxWith(table, () => undefined, {
          info: (line) => infos.push(line),
          warn: (line) => warns.push(line),
        }),
        { dshHome: root, patchFile: explicit },
      );
      // patchFile 是用户显式指定到文件的最高优先级，说它"回落"既是误报也永远消不掉。
      assert.deepEqual(warns, [], warns.join(' | '));
      const mounted = infos.find((line) => line.includes('mounted'));
      assert.ok(mounted !== undefined, infos.join(' | '));
      assert.ok(mounted.includes('source=config.patchFile'), mounted);
      assert.ok(mounted.includes('cordis.patch.yml'), mounted);
      // 但显式指定值得一条 info（不带 [WARN]、不带「宿主未提供」前提）。
      const explicitInfos = infos.filter((line) => line.includes('使用配置中显式指定的 patchFile'));
      assert.equal(explicitInfos.length, 1, infos.join(' | '));
      assert.ok(explicitInfos[0].includes('cordis.patch.yml'), explicitInfos[0]);
      assert.equal(explicitInfos[0].includes('[WARN]'), false, explicitInfos[0]);
      assert.equal(explicitInfos[0].includes('宿主未提供'), false, explicitInfos[0]);
      assert.equal(infos.length, 2, `info 只该有 mounted + 显式指定两条：${infos.join(' | ')}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('宿主提供了 profileContext + 用户配了 patchFile：仍然不打警告（不能断言宿主没提供）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dshmcp-pf2-'));
    const desktop = join(root, 'profiles', 'desktop', 'cordis.patch.yml');
    const explicit = join(root, 'explicit', 'cordis.patch.yml');
    mkdirSync(join(root, 'profiles', 'desktop'), { recursive: true });
    try {
      /** @type {string[]} */
      const warns = [];
      /** @type {string[]} */
      const infos = [];
      /** @type {Array<{kind: string, path: string, handler: Function}>} */
      const table = [];
      apply(
        ctxWith(
          table,
          (name) => (name === 'profileContext' ? { name: 'desktop', patchPath: desktop, home: root } : undefined),
          { info: (line) => infos.push(line), warn: (line) => warns.push(line) },
        ),
        { patchFile: explicit },
      );
      assert.deepEqual(warns, [], `宿主明明提供了 profileContext，不许打出相反的话：${warns.join(' | ')}`);
      const mounted = infos.find((line) => line.includes('mounted'));
      assert.ok(mounted.includes('source=config.patchFile'), mounted);
      // 写盘仍走 patchFile（结构性压过宿主上下文），不是 desktop 文件。
      assert.ok(mounted.includes(explicit), `写入位置应是 patchFile：${mounted}`);
      assert.equal(infos.some((line) => line.includes('宿主未提供')), false, infos.join(' | '));

      // 回归：写盘真的落在 patchFile，而不是宿主的 desktop 文件。
      const read = await dispatch(table, 'GET', SERVERS_PATH);
      assert.equal(read.payload.data.file, explicit);
      assert.equal(read.payload.data.source, 'config.patchFile');
      const created = await dispatch(table, 'POST', SERVERS_PATH, JSON.stringify({ raw: rawFor('pf') }));
      assert.equal(created.statusCode, 201);
      assert.ok(readFileSync(explicit, 'utf8').includes("serverName: 'pf'"), '必须写进 patchFile');
      assert.equal(existsSync(desktop), false, '绝不能顺手在 desktop 目录里建文件');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('mounted 行不输出错的 profile 标签：patchFile 场景写「由 patchFile 决定」，其余照旧', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshmcp-mlog-'));
    const explicit = join(root, 'explicit', 'cordis.patch.yml'); // 刻意不是 profiles/<name>/ 形状
    const desktop = join(root, 'profiles', 'desktop', 'cordis.patch.yml');
    mkdirSync(join(root, 'profiles', 'desktop'), { recursive: true });
    /** @type {string[]} */
    const infos = [];
    /** @type {Array<{kind: string, path: string, handler: Function}>} */
    const table = [];
    /**
     * 取 mounted 行。
     *
     * 必须匹配 `mounted profile=` 这个**完整前缀**：临时目录名、文件路径都可能
     * 含有 "mounted" 字样，只用 `includes('mounted')` 会先命中「显式指定」那条
     * info（它的文案里带着路径），从而测错对象。
     * @returns {string} 日志行。
     */
    const mountedLine = () => {
      const line = infos.find((item) => item.includes('mounted profile='));
      assert.ok(line !== undefined, `缺 mounted 行：${infos.join(' | ')}`);
      return line;
    };
    try {
      // ① patchFile（非 profiles/<name>/ 形状）：不许出现兜底的 profile=web。
      apply(
        ctxWith(table, () => undefined, {
          info: (line) => infos.push(line),
          warn: (line) => infos.push(`[WARN] ${line}`),
        }),
        { patchFile: explicit },
      );
      const explicitLine = mountedLine();
      assert.ok(explicitLine.includes('profile=(未指定，由 patchFile 决定)'), explicitLine);
      assert.equal(explicitLine.includes('profile=web'), false, `不许显示错的 profile 标签：${explicitLine}`);
      assert.ok(explicitLine.includes(explicit), explicitLine);
      assert.ok(explicitLine.includes('source=config.patchFile'), explicitLine);

      // ② profileContext：仍是真实 profile 名。
      infos.length = 0;
      apply(
        ctxWith(
          table,
          (name) => (name === 'profileContext' ? { name: 'desktop', patchPath: desktop, home: root } : undefined),
          { info: (line) => infos.push(line), warn: () => {} },
        ),
        {},
      );
      const contextLine = mountedLine();
      assert.ok(contextLine.includes('profile=desktop'), contextLine);
      assert.equal(contextLine.includes('由 patchFile 决定'), false, contextLine);

      // ③ 回落层：仍是实际生效的 profile 名（这里走 config.dshHome）。
      infos.length = 0;
      apply(
        ctxWith(table, () => undefined, { info: (line) => infos.push(line), warn: () => {} }),
        { dshHome: root },
      );
      assert.ok(mountedLine().includes('profile=web'), mountedLine());
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('三种回落来源各打一条 warn（$DSH_HOME / ~/.dsh 也覆盖到）', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshmcp-src-'));
    const savedDshHome = process.env.DSH_HOME;
    /**
     * 跑一次 apply，返回两个通道拿到的行。
     * @param {object} config 插件配置。
     * @returns {{infos: string[], warns: string[]}} 日志。
     */
    const runApply = (config) => {
      /** @type {string[]} */
      const infos = [];
      /** @type {string[]} */
      const warns = [];
      /** @type {Array<{kind: string, path: string, handler: Function}>} */
      const table = [];
      apply(ctxWith(table, () => undefined, {
        info: (line) => infos.push(line),
        warn: (line) => warns.push(line),
      }), config);
      return { infos, warns };
    };
    try {
      // ① config.dshHome
      const byConfig = runApply({ dshHome: root });
      assert.equal(byConfig.warns.length, 1, byConfig.warns.join(' | '));
      assert.ok(byConfig.warns[0].includes('config.dshHome'), byConfig.warns[0]);

      // ② $DSH_HOME（env 是 process.env，只能临时改并复原）
      process.env.DSH_HOME = root;
      const byEnv = runApply({});
      process.env.DSH_HOME = savedDshHome;
      assert.equal(byEnv.warns.length, 1, byEnv.warns.join(' | '));
      assert.ok(byEnv.warns[0].includes('$DSH_HOME'), byEnv.warns[0]);

      // ③ ~/.dsh 兜底
      delete process.env.DSH_HOME;
      const byDefault = runApply({});
      if (savedDshHome === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = savedDshHome;
      assert.equal(byDefault.warns.length, 1, byDefault.warns.join(' | '));
      assert.ok(byDefault.warns[0].includes('~/.dsh'), byDefault.warns[0]);

      // 三次都只该有一条 warn，且 info 里不该混入 WARN。
      for (const { infos } of [byConfig, byEnv, byDefault]) {
        assert.equal(infos.filter((line) => line.includes('[WARN]')).length, 0, infos.join(' | '));
      }
    } finally {
      if (savedDshHome === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = savedDshHome;
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('routes · 工具列表与健康检查', () => {
  /**
   * 造一套完全隔离的路由 + 假 tools 服务。
   *
   * 假服务里刻意混入一个宿主自带工具（`bash`）与另一个服务器的工具：
   * 命名空间过滤错了的话，这两个数字会跑进 `demo` 的账上。
   * @returns {{call: Function, close: () => void, logs: string[]}} 调用器与清理。
   */
  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), 'dshmcp-tools-'));
    const file = join(root, 'cordis.patch.yml');
    writeFileSync(file, '# 空文件\n');
    const store = createPatchStore({ filePath: file });
    /** @type {Array<{kind: string, path: string, handler: Function}>} */
    const table = [];
    /** @type {string[]} */
    const logs = [];
    const service = {
      view: () => ({
        visible: new Map([
          ['mcp__demo__ping', { description: '探活', parameters: { type: 'object', properties: {} } }],
          ['mcp__demo__echo', { description: '回声', parameters: { type: 'object', properties: { text: {} } } }],
          ['mcp__other__x', { description: '别人的', parameters: { type: 'object', properties: {} } }],
          ['bash', { description: '宿主的', parameters: { type: 'object', properties: {} } }],
        ]),
      }),
    };
    registerRoutes(
      {
        connection: { requestRejection: () => undefined },
        webServer: {
          register(route) {
            table.push(route);
            return () => {};
          },
        },
        effect: (fn) => fn(),
        get: (name) => (name === 'tools' ? service : undefined),
      },
      store,
      (line) => logs.push(line),
    );
    return {
      call: (method, url, body) => dispatch(table, method, url, body),
      logs,
      close: () => rmSync(root, { recursive: true, force: true }),
    };
  };

  it('GET /servers 给每个条目挂上工具数（只数本命名空间）', async () => {
    const env = setup();
    try {
      await env.call('POST', SERVERS_PATH, JSON.stringify({ raw: rawFor('demo') }));
      const { payload } = await env.call('GET', SERVERS_PATH);
      const entry = payload.data.items.find((item) => item.serverName === 'demo');
      assert.equal(entry.toolCount, 2, '只该数 mcp__demo__ 前缀下的两个');
      assert.equal(entry.toolsAvailable, true);
      assert.equal(JSON.stringify(payload).includes('mcp__demo__'), false, '列表不该把工具名塞进来');
    } finally {
      env.close();
    }
  });

  it('GET /servers/<name>/tools 返回具体工具（不含别人的命名空间）', async () => {
    const env = setup();
    try {
      await env.call('POST', SERVERS_PATH, JSON.stringify({ raw: rawFor('demo') }));
      const { statusCode, payload } = await env.call('GET', `${SERVERS_PATH}/demo/tools`);
      assert.equal(statusCode, 200);
      assert.equal(payload.data.available, true);
      assert.equal(payload.data.count, 2);
      assert.deepEqual(payload.data.tools.map((tool) => tool.rawName), ['echo', 'ping']);
      assert.equal(payload.data.tools[0].parameters, 1);
    } finally {
      env.close();
    }
  });

  it('GET /servers/<name>/tools 对不存在的条目回 404', async () => {
    const env = setup();
    try {
      const { statusCode, payload } = await env.call('GET', `${SERVERS_PATH}/ghost/tools`);
      assert.equal(statusCode, 404);
      assert.equal(payload.error.code, 'unknown-server');
    } finally {
      env.close();
    }
  });

  it('POST /servers/<name>/check 有工具就 healthy，结论落在 data.report 里', async () => {
    const env = setup();
    try {
      await env.call('POST', SERVERS_PATH, JSON.stringify({ raw: rawFor('demo') }));
      const { statusCode, payload } = await env.call('POST', `${SERVERS_PATH}/demo/check`, '{}');
      assert.equal(statusCode, 200, '健康检查失败也要 200——结论本身就是数据');
      assert.equal(payload.data.report.status, 'healthy');
      assert.equal(payload.data.report.tools, 2);
      assert.ok(env.logs.some((line) => line.includes('check demo status=healthy')), env.logs.join(' | '));
    } finally {
      env.close();
    }
  });

  it('停用的条目直接给 disabled，不去探测', async () => {
    const env = setup();
    try {
      await env.call(
        'POST',
        SERVERS_PATH,
        JSON.stringify({ raw: JSON.stringify({ serverName: 'off', transport: 'stdio', command: 'npx', disabled: true }) }),
      );
      const { payload } = await env.call('POST', `${SERVERS_PATH}/off/check`, '{}');
      assert.equal(payload.data.report.status, 'disabled');
    } finally {
      env.close();
    }
  });

  it('GET 打 check / POST 打 tools 都要 405', async () => {
    const env = setup();
    try {
      await env.call('POST', SERVERS_PATH, JSON.stringify({ raw: rawFor('demo') }));
      assert.equal((await env.call('GET', `${SERVERS_PATH}/demo/check`)).statusCode, 405);
      assert.equal((await env.call('POST', `${SERVERS_PATH}/demo/tools`, '{}')).statusCode, 405);
    } finally {
      env.close();
    }
  });
});

describe('routes · 版本检查端点', () => {
  /**
   * 造一套带假 updater 的路由（不联网）。
   * @returns {{call: Function, calls: object, close: () => void}} 调用器与记录。
   */
  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), 'dshmcp-upd-'));
    const file = join(root, 'cordis.patch.yml');
    writeFileSync(file, '# 空文件\n');
    const store = createPatchStore({ filePath: file });
    /** @type {Array<{kind: string, path: string, handler: Function}>} */
    const table = [];
    /** @type {{check: number, dismiss: number, start: number}} */
    const calls = { check: 0, dismiss: 0, start: 0 };
    const payload = { current: '0.4.0', latest: '0.5.0', updateAvailable: true, dismissed: false, enabled: true, error: null, checkedAt: null, url: null };
    const updater = {
      payload: () => payload,
      check: async () => {
        calls.check += 1;
        return payload;
      },
      dismiss: async () => {
        calls.dismiss += 1;
        return { ...payload, dismissed: true };
      },
      startUpgrade: () => {
        calls.start += 1;
        return { running: true, startedAt: 'now', finishedAt: null, result: null, error: null };
      },
      upgradeState: () => ({ running: false, startedAt: 'now', finishedAt: 'later', result: null, error: null }),
    };
    registerRoutes(
      {
        connection: { requestRejection: () => undefined },
        webServer: {
          register(route) {
            table.push(route);
            return () => {};
          },
        },
        effect: (fn) => fn(),
      },
      store,
      () => {},
      { updater },
    );
    return {
      call: (method, url, body) => dispatch(table, method, url, body),
      calls,
      close: () => rmSync(root, { recursive: true, force: true }),
    };
  };

  it('GET /update 只读缓存，不触发网络请求', async () => {
    const env = setup();
    try {
      const { statusCode, payload } = await env.call('GET', UPDATE_PATH);
      assert.equal(statusCode, 200);
      assert.equal(payload.data.updateAvailable, true);
      assert.equal(env.calls.check, 0, '打开页面不该打 GitHub');
    } finally {
      env.close();
    }
  });

  it('POST /update/check 才真的查一次', async () => {
    const env = setup();
    try {
      const { payload } = await env.call('POST', UPDATE_CHECK_PATH, '{}');
      assert.equal(env.calls.check, 1);
      assert.equal(payload.data.latest, '0.5.0');
    } finally {
      env.close();
    }
  });

  it('POST /update 忽略当前版本', async () => {
    const env = setup();
    try {
      const { payload } = await env.call('POST', UPDATE_PATH, '{}');
      assert.equal(env.calls.dismiss, 1);
      assert.equal(payload.data.dismissed, true);
    } finally {
      env.close();
    }
  });

  it('POST /upgrade 立刻返回 running:true，GET /upgrade 读进度', async () => {
    const env = setup();
    try {
      const started = await env.call('POST', UPGRADE_PATH, '{}');
      assert.equal(env.calls.start, 1);
      assert.equal(started.payload.data.running, true);
      const progress = await env.call('GET', UPGRADE_PATH);
      assert.equal(progress.payload.data.running, false);
      assert.equal(progress.payload.data.update.current, '0.4.0');
    } finally {
      env.close();
    }
  });

  it('PUT 打 /update → 405 method-not-allowed', async () => {
    const env = setup();
    try {
      const { statusCode, payload } = await env.call('PUT', UPDATE_PATH);
      assert.equal(statusCode, 405);
      assert.equal(payload.error.code, 'method-not-allowed');
    } finally {
      env.close();
    }
  });
});

describe('routes · legacy 上报与 POST /repair', () => {
  /** 这一组用**独立的**临时目录与路由表，不干扰上面共享的 fixture。 */
  const withLegacyFile = async (run) => {
    const own = mkdtempSync(join(tmpdir(), 'dshmcp-repair-'));
    try {
      const file = join(own, 'cordis.patch.yml');
      writeFileSync(
        file,
        [
          '# patch',
          BEGIN_ANCHOR,
          "- id: 'mcp-flat'",
          "  name: '@deepseek-ai/dsh-mcp-client'",
          '  config:',
          "    serverName: 'flat'",
          "    transport: 'stdio'",
          "    command: 'npx'",
          END_ANCHOR,
          '',
        ].join('\n'),
      );
      const table = [];
      const store = createPatchStore({ filePath: file });
      registerRoutes(createCtx(table), store, () => {});
      await run({ file, table });
    } finally {
      rmSync(own, { recursive: true, force: true });
    }
  };

  it('GET /servers 明确上报 legacy（不是让用户自己去猜"为什么 0 个工具"）', async () => {
    await withLegacyFile(async ({ table }) => {
      const list = await dispatch(table, 'GET', SERVERS_PATH);
      assert.equal(list.statusCode, 200);
      assert.deepEqual(list.payload.data.legacy, ['flat']);
      assert.equal(list.payload.data.items.length, 1, '条目本身照常列出来，用户要能看到它');
    });
  });

  it('POST /repair 改写成 insert 形状，并回传修复条数', async () => {
    await withLegacyFile(async ({ file, table }) => {
      const repaired = await dispatch(table, 'POST', REPAIR_PATH, '{}');
      assert.equal(repaired.statusCode, 200);
      assert.equal(repaired.payload.data.repaired, 1);
      const text = readFileSync(file, 'utf8');
      assert.ok(text.includes('\n- insert:\n'), text);
      const after = await dispatch(table, 'GET', SERVERS_PATH);
      assert.deepEqual(after.payload.data.legacy, [], '修完就该不再上报');
    });
  });

  it('GET /repair → 405（只接受 POST）', async () => {
    await withLegacyFile(async ({ table }) => {
      const got = await dispatch(table, 'GET', REPAIR_PATH);
      assert.equal(got.statusCode, 405);
    });
  });
});
