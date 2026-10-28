/**
 * 健康检查单测。
 *
 * 每个分支都对应界面上的一句话，所以这里断言的是**结论 + 文案要点**，不是
 * 内部实现：用户看到"连不上（ENOTFOUND）"和看到"需留意（HTTP 200）"，下一步
 * 该干什么完全不同。
 *
 * 全部用注入的假 fetch，**不发真实网络请求**。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PROBE_TIMEOUT_MS, PROBE_PROTOCOL_VERSION, STATUS, checkServer, resolveCommand } from '../src/health.js';
import { PLUGIN_VERSION } from '../src/version.js';
import { healthSummary, healthView } from '../src/client/api.js';

/**
 * 一条流式传输条目的默认形状。
 * @param {object} [overrides] 覆盖字段。
 * @returns {object} 条目。
 */
const httpItem = (overrides = {}) => ({
  serverName: 'creis',
  transport: 'streamable-http',
  url: 'https://example.test/mcp',
  command: null,
  cwd: null,
  enabled: true,
  parsable: true,
  ...overrides,
});

/**
 * 给条目挂上"原始 config"（与 `patch-store.parseItem` 一样用不可枚举属性）。
 *
 * 健康检查只从这个字段读 `headers` 的真实值——它是 Host 内存里的东西，不在
 * HTTP 快照里，所以测试也必须显式挂上去，否则测出来的就是"没配请求头"。
 * @param {object} item 条目。
 * @param {Record<string, string>} headers 请求头。
 * @returns {object} 同一个条目。
 */
const withHeaders = (item, headers) => {
  Object.defineProperty(item, 'parsed', { value: { headers }, enumerable: false });
  return item;
};

/** 一条 stdio 条目的默认形状。 */
const stdioItem = (overrides = {}) => ({
  serverName: 'local',
  transport: 'stdio',
  url: null,
  command: process.execPath,
  cwd: null,
  enabled: true,
  parsable: true,
  ...overrides,
});

/**
 * 造一个假 fetch：记录调用并返回给定响应。
 * @param {(url: string, init: object) => object} produce 响应工厂。
 * @returns {{fetchImpl: Function, calls: Array<{url: string, init: object}>}} 假 fetch 与调用记录。
 */
function fakeFetch(produce) {
  /** @type {Array<{url: string, init: object}>} */
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return produce(url, init);
  };
  return { fetchImpl, calls };
}

/** 一个带 `body.cancel` 与空 headers 的最小响应对象。 */
const response = (status) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  body: { cancel: () => {} },
});

/**
 * 造一个能吐 SSE 帧的响应（MCP 的 `text/event-stream`）。
 * @param {Array<object>} frames 要吐的 JSON-RPC 消息。
 * @param {Record<string, string>} [headerMap] 响应头（键用小写）。
 * @returns {object} 假响应。
 */
function sseResponse(frames, headerMap = {}) {
  const text = frames.map((frame) => `event: message\ndata: ${JSON.stringify(frame)}\n\n`).join('');
  const chunk = new TextEncoder().encode(text);
  let emitted = false;
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => headerMap[String(name).toLowerCase()] ?? null },
    body: {
      getReader: () => ({
        read: async () => {
          if (emitted) return { done: true, value: undefined };
          emitted = true;
          return { done: false, value: chunk };
        },
        cancel: async () => {},
      }),
      cancel: () => {},
    },
  };
}

/** 一条 `initialize` 成功、带 session id 的回包。 */
const initOk = () => sseResponse([{ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'data', version: '1.0.0' } } }], {
  'mcp-session-id': 'sess-1',
});

/** `notifications/initialized` 的 202 回包。 */
const ackOk = () => ({ ok: true, status: 202, headers: { get: () => null }, body: { cancel: () => {} } });

/**
 * 一个按方法分派的 MCP 假服务端。
 * @param {number} toolCount 服务端宣称的工具数。
 * @returns {{fetchImpl: Function, calls: Array<{url: string, init: object}>}} 假 fetch 与调用记录。
 */
function fakeMcpServer(toolCount) {
  const tools = Array.from({ length: toolCount }, (_, index) => ({ name: `tool_${index}` }));
  return fakeFetch((url, init) => {
    const body = JSON.parse(init.body);
    if (body.method === 'initialize') return initOk();
    if (body.method === 'notifications/initialized') return ackOk();
    return sseResponse([{ jsonrpc: '2.0', id: 2, result: { tools } }]);
  });
}

describe('health · 不需要探测就能下结论的情况', () => {
  it('停用 → disabled，且一个请求都不发', async () => {
    const { fetchImpl, calls } = fakeFetch(() => response(200));
    const report = await checkServer(httpItem({ enabled: false }), { toolCount: 3, fetchImpl });
    assert.equal(report.status, STATUS.DISABLED);
    assert.equal(report.detail, '已停用，未做探测');
    assert.equal(calls.length, 0, '停用的条目不该被探测');
  });

  it('可解析但工具数为 0 之外，parsable:false → unknown', async () => {
    const report = await checkServer(httpItem({ parsable: false }), { fetchImpl: fakeFetch(() => response(200)).fetchImpl });
    assert.equal(report.status, STATUS.UNKNOWN);
    assert.match(report.detail, /无法解析/);
  });

  it('宿主没有 tools 服务 → unknown（读不到就等于不知道）', async () => {
    const report = await checkServer(httpItem(), { toolsAvailable: false, fetchImpl: fakeFetch(() => response(200)).fetchImpl });
    assert.equal(report.status, STATUS.UNKNOWN);
    assert.match(report.detail, /tools/);
  });

  it('注册了工具 → healthy，且**不发**网络探测（有硬证据就不必再猜）', async () => {
    const { fetchImpl, calls } = fakeFetch(() => response(500));
    const report = await checkServer(httpItem(), { toolCount: 7, fetchImpl });
    assert.equal(report.status, STATUS.HEALTHY);
    assert.equal(report.tools, 7);
    assert.match(report.detail, /7 个工具/);
    assert.equal(calls.length, 0, '工具数 > 0 时不该再发探测');
  });
});

describe('health · streamable-http 端点探测', () => {
  it('发的是 MCP initialize 握手，并**带上配置里的请求头**（否则鉴权探测没有意义）', async () => {
    const { fetchImpl, calls } = fakeFetch(() => response(200));
    const item = withHeaders(httpItem({ headerKeys: ['x-litellm-api-key'] }), {
      'x-litellm-api-key': 'Bearer sk-live',
    });
    await checkServer(item, { toolCount: 0, fetchImpl });
    assert.ok(calls.length >= 1);
    const { url, init } = calls[0];
    assert.equal(url, 'https://example.test/mcp');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'manual', '绝不能跟随 302 —— 那会把密钥带到别的域名');
    const body = JSON.parse(init.body);
    assert.equal(body.method, 'initialize');
    assert.equal(body.jsonrpc, '2.0');
    assert.equal(body.params.protocolVersion, PROBE_PROTOCOL_VERSION);
    assert.equal(body.params.clientInfo.version, PLUGIN_VERSION);
    assert.equal(init.headers['x-litellm-api-key'], 'Bearer sk-live', '要把用户配的请求头发出去');
    assert.equal(init.headers['content-type'], 'application/json');
  });

  it('用户配置不许覆盖 content-type / accept（改了探测就发不出去）', async () => {
    const { fetchImpl, calls } = fakeFetch(() => response(200));
    const item = withHeaders(httpItem(), { 'Content-Type': 'text/plain', Accept: 'text/html', 'X-K': 'v' });
    await checkServer(item, { toolCount: 0, fetchImpl });
    const [{ init }] = calls;
    assert.equal(init.headers['content-type'], 'application/json');
    assert.equal(init.headers.accept, 'application/json, text/event-stream');
    assert.equal(init.headers['X-K'], 'v', '其它键照发');
    assert.equal(init.headers['Content-Type'], undefined);
  });

  it('probeHeaders 关掉（sendSecrets: false）时只发自己的两个头', async () => {
    const { fetchImpl, calls } = fakeFetch(() => response(200));
    const item = withHeaders(httpItem(), { 'x-litellm-api-key': 'Bearer sk-live' });
    await checkServer(item, { toolCount: 0, fetchImpl, sendSecrets: false });
    const [{ init }] = calls;
    const names = Object.keys(init.headers).map((name) => name.toLowerCase()).sort();
    assert.deepEqual(names, ['accept', 'content-type']);
  });

  it('200 但没注册工具 → degraded（端点通不等于这个服务器可用）', async () => {
    const report = await checkServer(httpItem(), { toolCount: 0, fetchImpl: fakeFetch(() => response(200)).fetchImpl });
    assert.equal(report.status, STATUS.DEGRADED);
    assert.equal(report.httpStatus, 200);
    assert.match(report.detail, /未注册任何工具/);
  });
});

describe('health · 握手通过后把服务端的工具数问出来（0.4.2）', () => {
  it('服务端有 42 个工具、DSH 注册 0 个 → 明说是 DSH 侧没连上，别让用户去改正确的配置', async () => {
    const item = withHeaders(httpItem(), { 'x-litellm-api-key': 'Bearer sk-live' });
    const { fetchImpl, calls } = fakeMcpServer(42);
    const report = await checkServer(item, { toolCount: 0, fetchImpl });

    assert.equal(report.status, STATUS.DEGRADED);
    assert.equal(report.probeTools, 42, '要把服务端的答案带回来，卡片才有证据');
    assert.match(report.detail, /服务端有 42 个工具/);
    assert.match(report.detail, /DSH 注册了 0 个/, '两边数字必须摆在一起');
    assert.match(report.detail, /配置未加载或连接失败/, '要给出可执行的下一步');
    // v0.4.5 起不再提"重启"：补丁文件由宿主 HMR 精确监听（watchConfig →
    // reconcileProfile），改完一两秒就生效。给一个错的下一步比不给更糟。
    assert.equal(/重启/.test(report.detail), false, '配置是热加载的，让用户去重启是误导');
    assert.ok(report.detail.length <= 80, `detail 太长，toast 里放不下：${report.detail}`);

    // 三步都走到了，且后两步带上了 session id —— 这是 MCP 规范要求。
    assert.equal(calls.length, 3);
    assert.deepEqual(
      calls.map((call) => JSON.parse(call.init.body).method),
      ['initialize', 'notifications/initialized', 'tools/list'],
    );
    assert.equal(calls[2].init.headers['mcp-session-id'], 'sess-1');
    assert.equal(calls[2].init.headers['x-litellm-api-key'], 'Bearer sk-live', '后续请求也要继续带密钥');
    assert.equal(calls[2].init.redirect, 'manual');
  });

  it('服务端自己就是 0 个工具 → 那是服务端的问题，不去怀疑 DSH', async () => {
    const { fetchImpl } = fakeMcpServer(0);
    const report = await checkServer(httpItem(), { toolCount: 0, fetchImpl });
    assert.equal(report.status, STATUS.DEGRADED);
    assert.equal(report.probeTools, 0);
    assert.match(report.detail, /服务端没有提供任何工具/);
    assert.equal(/重启/.test(report.detail), false, '服务端没工具，重启 DSH 也没用');
  });

  it('tools/list 失败 → 老实说不知道（probeTools: null），退回通用结论', async () => {
    const fetchImpl = async (url, init) => {
      const body = JSON.parse(init.body);
      if (body.method === 'initialize') return initOk();
      if (body.method === 'notifications/initialized') return ackOk();
      return response(500);
    };
    const report = await checkServer(httpItem(), { toolCount: 0, fetchImpl });
    assert.equal(report.status, STATUS.DEGRADED);
    assert.equal(report.probeTools, null, '数不出来就说不知道，不许编');
    assert.match(report.detail, /未注册任何工具/);
  });

  it('没有 session id 也照样去问（有些实现不发，但认这条请求）', async () => {
    const fetchImpl = async (url, init) => {
      const body = JSON.parse(init.body);
      if (body.method === 'initialize') return sseResponse([{ jsonrpc: '2.0', id: 1, result: {} }]);
      if (body.method === 'notifications/initialized') return ackOk();
      return sseResponse([{ jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'a' }, { name: 'b' }] } }]);
    };
    const report = await checkServer(httpItem(), { toolCount: 0, fetchImpl });
    assert.equal(report.probeTools, 2);
    assert.match(report.detail, /服务端有 2 个工具/);
  });

  it('注册了工具时**不发**这一步（healthy 已经定论，不必多花两个请求）', async () => {
    const { fetchImpl, calls } = fakeMcpServer(42);
    await checkServer(httpItem(), { toolCount: 42, fetchImpl });
    assert.equal(calls.length, 0);
  });
});

describe('health · streamable-http 故障分类', () => {
  it('401 且没配请求头 → degraded「需要鉴权，补上 Authorization」', async () => {
    const report = await checkServer(httpItem(), { toolCount: 0, fetchImpl: fakeFetch(() => response(401)).fetchImpl });
    assert.equal(report.status, STATUS.DEGRADED);
    assert.equal(report.httpStatus, 401);
    assert.match(report.detail, /需要鉴权/);
    assert.match(report.detail, /没有配置请求头/, '用户还差一步配置，要说清差的是什么');
  });

  it('401 但配了请求头 → unreachable「鉴权失败：X 被拒绝」（这才是用户要的答案）', async () => {
    const item = withHeaders(httpItem(), { 'x-litellm-api-key': 'Bearer expired' });
    const report = await checkServer(item, { toolCount: 0, fetchImpl: fakeFetch(() => response(401)).fetchImpl });
    assert.equal(
      report.status,
      STATUS.UNREACHABLE,
      '配了密钥还被拒 = 密钥失效，那是硬失败，不是"需留意"（旧版不管配没配都只说"需留意"）',
    );
    assert.match(report.detail, /鉴权失败/);
    assert.match(report.detail, /x-litellm-api-key/, '要点名是哪个键被拒了');
    assert.ok(report.detail.length <= 64, `detail 太长，toast 里放不下：${report.detail}`);
  });

  it('401 且显式关闭了发送（probeHeaders=false）→ 说是"我们没发"，别赖用户配置', async () => {
    const item = withHeaders(httpItem(), { Authorization: 'Bearer sk-live' });
    const report = await checkServer(item, {
      toolCount: 0,
      fetchImpl: fakeFetch(() => response(401)).fetchImpl,
      sendSecrets: false,
    });
    assert.equal(report.status, STATUS.DEGRADED);
    assert.match(report.detail, /没有发送请求头/);
    assert.equal(/没有配置请求头/.test(report.detail), false, '明明配了，不能说没配');
  });

  it('302 → unreachable，并说明为什么不跟着跳（避免密钥被带到别处）', async () => {
    const report = await checkServer(httpItem(), { toolCount: 0, fetchImpl: fakeFetch(() => response(302)).fetchImpl });
    assert.equal(report.status, STATUS.UNREACHABLE);
    assert.match(report.detail, /重定向/);
    assert.match(report.detail, /不跟随跳转/);
  });

  it('404 → degraded，提示核对 streamable-http 地址', async () => {
    const report = await checkServer(httpItem(), { toolCount: 0, fetchImpl: fakeFetch(() => response(404)).fetchImpl });
    assert.equal(report.status, STATUS.DEGRADED);
    assert.match(report.detail, /streamable-http 地址/);
  });

  it('502 → unreachable（服务端炸了不是"需留意"）', async () => {
    const report = await checkServer(httpItem(), { toolCount: 0, fetchImpl: fakeFetch(() => response(502)).fetchImpl });
    assert.equal(report.status, STATUS.UNREACHABLE);
    assert.match(report.detail, /502/);
  });

  it('DNS 失败 → unreachable，并把 cause.code 带出来（只有 "fetch failed" 没法排障）', async () => {
    const fetchImpl = async () => {
      const error = new TypeError('fetch failed');
      error.cause = { code: 'ENOTFOUND' };
      throw error;
    };
    const report = await checkServer(httpItem(), { toolCount: 0, fetchImpl });
    assert.equal(report.status, STATUS.UNREACHABLE);
    assert.match(report.detail, /ENOTFOUND/);
  });

  it('超时 → unreachable，文案写清秒数', async () => {
    const fetchImpl = (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const report = await checkServer(httpItem(), { toolCount: 0, fetchImpl, timeoutMs: 20 });
    assert.equal(report.status, STATUS.UNREACHABLE);
    assert.match(report.detail, /超时/);
    assert.ok(PROBE_TIMEOUT_MS >= 1000, '默认超时不能短到把冷启动误判成故障');
  });

  it('非法 url / 非 http(s) 协议 → 直接 unreachable，不发请求', async () => {
    const { fetchImpl, calls } = fakeFetch(() => response(200));
    const broken = await checkServer(httpItem({ url: '不是地址' }), { toolCount: 0, fetchImpl });
    assert.equal(broken.status, STATUS.UNREACHABLE);
    const file = await checkServer(httpItem({ url: 'file:///etc/passwd' }), { toolCount: 0, fetchImpl });
    assert.equal(file.status, STATUS.UNREACHABLE);
    assert.match(file.detail, /只探 http\/https/);
    assert.equal(calls.length, 0, '非法协议一个请求都不该发');
  });

  it('缺 url → unknown（配置不全不是"连不上"）', async () => {
    const report = await checkServer(httpItem({ url: null }), { toolCount: 0, fetchImpl: fakeFetch(() => response(200)).fetchImpl });
    assert.equal(report.status, STATUS.UNKNOWN);
    assert.match(report.detail, /缺少 url/);
  });

  it('响应体被主动取消（SSE 流不会自己结束，读它会挂到超时）', async () => {
    let cancelled = false;
    const fetchImpl = async () => ({ ok: true, status: 200, body: { cancel: () => { cancelled = true; } } });
    await checkServer(httpItem(), { toolCount: 0, fetchImpl });
    assert.equal(cancelled, true);
  });
});

describe('health · stdio 命令可解析性', () => {
  it('命令存在但没注册工具 → degraded（不是 healthy：那正是启动失败的样子）', async () => {
    const report = await checkServer(stdioItem(), { toolCount: 0 });
    assert.equal(report.status, STATUS.DEGRADED);
    assert.match(report.detail, /命令存在/);
    assert.match(report.detail, /没有注册任何工具/);
  });

  it('命令找不到 → unreachable', async () => {
    const report = await checkServer(stdioItem({ command: 'definitely-not-a-real-binary-xyz' }), { toolCount: 0 });
    assert.equal(report.status, STATUS.UNREACHABLE);
    assert.match(report.detail, /找不到命令/);
  });

  it('工作目录不存在 → unreachable（少一次"为什么起不来"的排查）', async () => {
    const report = await checkServer(stdioItem({ cwd: '/definitely/not/here/xyz' }), { toolCount: 0 });
    assert.equal(report.status, STATUS.UNREACHABLE);
    assert.match(report.detail, /工作目录不存在/);
  });

  it('resolveCommand：绝对路径 / 相对路径 / PATH 查找三路都认', () => {
    assert.equal(resolveCommand(process.execPath), process.execPath);
    assert.equal(resolveCommand('/definitely/not/here'), null);
    assert.equal(resolveCommand(''), null);
    assert.equal(resolveCommand(42), null);
    // 用一个一定在 PATH 里的命令（node 自己的目录）。
    const dir = process.execPath.slice(0, process.execPath.lastIndexOf('/'));
    const found = resolveCommand('node', { PATH: dir });
    assert.ok(found === null || found.endsWith('node'), `PATH 查找结果异常：${found}`);
  });
});

describe('health · 报告形状稳定', () => {
  it('任何分支都带 serverName / checkedAt / tools / status / detail', async () => {
    const report = await checkServer(httpItem(), { toolCount: 0, fetchImpl: fakeFetch(() => response(200)).fetchImpl });
    for (const key of ['serverName', 'checkedAt', 'tools', 'status', 'detail', 'toolsAvailable']) {
      assert.ok(key in report, `报告缺字段 ${key}`);
    }
    assert.equal(report.serverName, 'creis');
    assert.match(report.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
  });

  it('条目为 null → unknown，不抛错', async () => {
    const report = await checkServer(null, {});
    assert.equal(report.status, STATUS.UNKNOWN);
  });

  it('传输方式不认识 → unknown', async () => {
    const report = await checkServer(httpItem({ transport: 'websocket', url: null }), { toolCount: 0 });
    assert.equal(report.status, STATUS.UNKNOWN);
    assert.match(report.detail, /不认识的传输方式/);
  });
});

describe('healthSummary · 结论压成一行 toast', () => {
  it('带上三档标签、耗时与原因', () => {
    const text = healthSummary({ status: 'degraded', latencyMs: 132, detail: '服务可达，但需要鉴权（HTTP 401）' });
    assert.equal(text, '需留意 · 132ms · 服务可达，但需要鉴权（HTTP 401）');
  });

  it('没有耗时就不写空档（不留"· ·"这种标点垃圾）', () => {
    assert.equal(healthSummary({ status: 'healthy', latencyMs: null, detail: '已注册 3 个工具' }), '正常 · 已注册 3 个工具');
  });

  it('没有 detail 时只剩标签', () => {
    assert.equal(healthSummary({ status: 'disabled', latencyMs: null, detail: '' }), '已停用');
  });

  it('不是报告就返回空串（调用方据此决定要不要弹）', () => {
    assert.equal(healthSummary(null), '');
    assert.equal(healthSummary(undefined), '');
    assert.equal(healthSummary('x'), '');
  });

  it('三档标签仍然分得开（健康检查的语义没有被压缩掉）', () => {
    assert.deepEqual(
      ['healthy', 'degraded', 'unreachable', 'disabled', 'unknown'].map((status) => healthView(status).label),
      ['正常', '需留意', '连不上', '已停用', '未知'],
    );
  });
});
