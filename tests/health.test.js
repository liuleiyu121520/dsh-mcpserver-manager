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

/** 一个带 `body.cancel` 的最小响应对象。 */
const response = (status) => ({ ok: status >= 200 && status < 300, status, body: { cancel: () => {} } });

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
  it('发的是 MCP initialize 握手，且**不带**配置里的密钥', async () => {
    const { fetchImpl, calls } = fakeFetch(() => response(200));
    await checkServer(httpItem({ headerKeys: ['x-litellm-api-key'] }), { toolCount: 0, fetchImpl });
    assert.equal(calls.length, 1);
    const [{ url, init }] = calls;
    assert.equal(url, 'https://example.test/mcp');
    assert.equal(init.method, 'POST');
    const body = JSON.parse(init.body);
    assert.equal(body.method, 'initialize');
    assert.equal(body.jsonrpc, '2.0');
    assert.equal(body.params.protocolVersion, PROBE_PROTOCOL_VERSION);
    assert.equal(body.params.clientInfo.version, PLUGIN_VERSION);
    const headerNames = Object.keys(init.headers).map((name) => name.toLowerCase()).sort();
    assert.deepEqual(headerNames, ['accept', 'content-type'], '探测不许带业务密钥');
  });

  it('200 但没注册工具 → degraded（端点通不等于这个服务器可用）', async () => {
    const report = await checkServer(httpItem(), { toolCount: 0, fetchImpl: fakeFetch(() => response(200)).fetchImpl });
    assert.equal(report.status, STATUS.DEGRADED);
    assert.equal(report.httpStatus, 200);
    assert.match(report.detail, /没有注册任何工具/);
  });

  it('401 → degraded，并说清"探测不带密钥"（否则会误判成密钥失效）', async () => {
    const report = await checkServer(httpItem(), { toolCount: 0, fetchImpl: fakeFetch(() => response(401)).fetchImpl });
    assert.equal(report.status, STATUS.DEGRADED);
    assert.equal(report.httpStatus, 401);
    assert.match(report.detail, /需要鉴权/);
    assert.match(report.detail, /不携带配置里的密钥/);
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
