/**
 * 准入守卫单测：`src/guard.js` 的双 API 兼容 + 结构性围栏 + 「绝不抛」承诺。
 *
 * 背景（0.4.5 报障「列表 400 空 body」的根因）：dsh 0.2.2-rc.3 移除了
 * `connection.requestRejection`，换成 `admit(request)`（`{rejection}` 信封）。
 * 旧守卫直接调旧方法并在 try-catch 之外——每个请求都抛 TypeError，宿主兜底成
 * HTTP 400 空 body。这份测试把守卫的每一条决策都钉住：任何输入都不许抛异常。
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { isLoopbackHost, rejectionFor, structuralRejection } from '../src/guard.js';
import { createPatchStore } from '../src/patch-store.js';
import { SERVERS_PATH, registerRoutes } from '../src/routes.js';

/**
 * 造一个最小 req：默认回环 Host，无 Origin/Referer。
 * @param {Record<string, string|undefined>} [headers] 追加/覆盖的请求头。
 * @returns {object} req。
 */
function reqFor(headers = {}) {
  return { method: 'GET', url: SERVERS_PATH, headers: { host: '127.0.0.1:4242', ...headers } };
}

/**
 * 新 API 形状的 ctx（dsh ≥0.2.2-rc.3：`admit` 返回 `{rejection}` 信封）。
 * @param {(req: object) => unknown} impl admit 实现。
 * @returns {object} ctx。
 */
const ctxWithAdmit = (impl) => ({ connection: { admit: impl } });

/**
 * 旧 API 形状的 ctx（<0.2.2-rc.3：`requestRejection` 返回裸状态码；与现有
 * routes.test.js 的 mock 同形状，验证它们继续兼容）。
 * @param {(req: object) => unknown} impl requestRejection 实现。
 * @returns {object} ctx。
 */
const ctxWithLegacy = (impl) => ({ connection: { requestRejection: impl } });

describe('guard · 新 API：admit 信封', () => {
  it('无 rejection 字段 / undefined / null —— 放行（宿主已自己做过来源检查）', () => {
    assert.equal(rejectionFor(ctxWithAdmit(() => undefined), reqFor()), undefined);
    assert.equal(rejectionFor(ctxWithAdmit(() => ({ rejection: undefined })), reqFor()), undefined);
    assert.equal(rejectionFor(ctxWithAdmit(() => null), reqFor()), undefined);
  });

  it('401 / 403 —— 硬拒，返回原状态码', () => {
    assert.equal(rejectionFor(ctxWithAdmit(() => ({ rejection: 401 })), reqFor()), 401);
    assert.equal(rejectionFor(ctxWithAdmit(() => ({ rejection: 403 })), reqFor()), 403);
  });

  it('503 —— 视为无决策：落结构性围栏，回环请求放行', () => {
    assert.equal(rejectionFor(ctxWithAdmit(() => ({ rejection: 503 })), reqFor()), undefined);
  });

  it('503 + 非回环 Host —— 结构性 403', () => {
    assert.equal(rejectionFor(ctxWithAdmit(() => ({ rejection: 503 })), reqFor({ host: '10.9.8.7' })), 403);
  });

  it('非数字 rejection（合同外形状）—— 不放大成 5xx，按无决策处理', () => {
    assert.equal(rejectionFor(ctxWithAdmit(() => ({ rejection: '403' })), reqFor()), undefined);
    assert.equal(rejectionFor(ctxWithAdmit(() => ({ rejection: NaN })), reqFor()), undefined);
  });
});

describe('guard · 旧 API：requestRejection 裸状态码', () => {
  it('同样的四种结论', () => {
    assert.equal(rejectionFor(ctxWithLegacy(() => undefined), reqFor()), undefined);
    assert.equal(rejectionFor(ctxWithLegacy(() => 401), reqFor()), 401);
    assert.equal(rejectionFor(ctxWithLegacy(() => 403), reqFor()), 403);
    assert.equal(rejectionFor(ctxWithLegacy(() => 503), reqFor()), undefined);
  });

  it('503 + 非回环 Host —— 结构性 403', () => {
    assert.equal(rejectionFor(ctxWithLegacy(() => 503), reqFor({ host: '10.9.8.7' })), 403);
  });

  it('现有 mock 形状（routes.test.js 的 { requestRejection: () => undefined }）继续兼容', () => {
    assert.equal(rejectionFor({ connection: { requestRejection: () => undefined } }, reqFor()), undefined);
  });
});

describe('guard · 服务缺席与异常：任何路径都不抛', () => {
  it('connection 缺席 —— 只剩结构性围栏', () => {
    assert.equal(rejectionFor({}, reqFor()), undefined);
    assert.equal(rejectionFor({ connection: undefined }, reqFor()), undefined);
    assert.equal(rejectionFor({}, reqFor({ host: '10.9.8.7' })), 403);
  });

  it('ctx 是 null / 原始值 —— 不抛，按无决策', () => {
    assert.equal(rejectionFor(null, reqFor()), undefined);
    assert.equal(rejectionFor(42, reqFor()), undefined);
  });

  it('ctx.connection 读取本身抛错（cordis Proxy 形状再变）—— 不抛', () => {
    const ctx = { get connection() { throw new Error('service registry not ready'); } };
    assert.equal(rejectionFor(ctx, reqFor()), undefined);
    assert.equal(rejectionFor(ctx, reqFor({ host: '10.9.8.7' })), 403);
  });

  it('admit 抛错 —— 视为无决策，落结构性围栏', () => {
    const ctx = ctxWithAdmit(() => { throw new Error('provider exploded'); });
    assert.equal(rejectionFor(ctx, reqFor()), undefined);
    assert.equal(rejectionFor(ctx, reqFor({ host: '10.9.8.7' })), 403);
  });

  it('requestRejection 抛错 —— 同样不抛', () => {
    const ctx = ctxWithLegacy(() => { throw new Error('provider exploded'); });
    assert.equal(rejectionFor(ctx, reqFor()), undefined);
    assert.equal(rejectionFor(ctx, reqFor({ host: '10.9.8.7' })), 403);
  });
});

describe('guard · 结构性围栏（复刻宿主 isTrustedApiRequest）', () => {
  it('非回环 Host / 缺 Host —— 403 host-not-loopback', () => {
    assert.equal(structuralRejection(reqFor({ host: '10.9.8.7' })), 403);
    assert.equal(structuralRejection(reqFor({ host: undefined })), 403);
  });

  it('sec-fetch-site: cross-site —— 403', () => {
    assert.equal(structuralRejection(reqFor({ 'sec-fetch-site': 'cross-site' })), 403);
  });

  it('同站 / 同源 / none 标记不拒', () => {
    assert.equal(structuralRejection(reqFor({ 'sec-fetch-site': 'same-origin' })), undefined);
    assert.equal(structuralRejection(reqFor({ 'sec-fetch-site': 'same-site' })), undefined);
    assert.equal(structuralRejection(reqFor({ 'sec-fetch-site': 'none' })), undefined);
  });

  it('Origin 与 Host authority 不一致 —— 403（主机 / 端口 / scheme 各来一遍）', () => {
    assert.equal(structuralRejection(reqFor({ origin: 'http://evil.example' })), 403);
    assert.equal(structuralRejection(reqFor({ origin: 'http://127.0.0.1:9999' })), 403);
    assert.equal(structuralRejection(reqFor({ origin: 'https://127.0.0.1:4242' })), 403);
  });

  it('同源 Origin / Referer —— 放行', () => {
    assert.equal(structuralRejection(reqFor({ origin: 'http://127.0.0.1:4242' })), undefined);
    assert.equal(structuralRejection(reqFor({ referer: 'http://127.0.0.1:4242/page' })), undefined);
  });

  it('Referer 与 Host 不一致 —— 403 referer-mismatch', () => {
    assert.equal(structuralRejection(reqFor({ referer: 'http://evil.example/x' })), 403);
  });

  it('Origin 不是可解析的 authority —— 403 origin-invalid', () => {
    assert.equal(structuralRejection(reqFor({ origin: '::garbage::' })), 403);
  });

  it('完全无 Origin/Referer 的回环请求 —— 放行（curl / 桌面端探测的正常形态）', () => {
    assert.equal(structuralRejection(reqFor()), undefined);
  });

  it('::1：带方括号的 Host 头放行；isLoopbackHost 认裸拼写', () => {
    assert.equal(structuralRejection(reqFor({ host: '[::1]:4242' })), undefined);
    assert.equal(structuralRejection(reqFor({ host: 'localhost:3000' })), undefined);
    assert.equal(isLoopbackHost('::1'), true);
    assert.equal(isLoopbackHost('[::1]'), true);
    assert.equal(isLoopbackHost('localhost:8080'), true);
    assert.equal(isLoopbackHost('10.0.0.1'), false);
    assert.equal(isLoopbackHost(''), false);
  });

  it('Host 头是裸 ::1（不合规范的拼写，浏览器都带方括号）—— 拒（忠实复刻宿主判定）', () => {
    assert.equal(structuralRejection(reqFor({ host: '::1' })), 403);
  });
});

describe('guard · desktop-relay Referer 特例', () => {
  const RELAY = 'dsh-app://app/index.html';

  it('只有 dsh-app://app Referer（桌面端 forwardWebRequest 转发形态）—— 放行', () => {
    assert.equal(structuralRejection(reqFor({ referer: RELAY })), undefined);
  });

  it('与 Origin 或 sec-fetch-site 共存 —— 403（特例不是通行证）', () => {
    assert.equal(structuralRejection(reqFor({ referer: RELAY, origin: 'http://127.0.0.1:4242' })), 403);
    assert.equal(structuralRejection(reqFor({ referer: RELAY, 'sec-fetch-site': 'same-origin' })), 403);
  });

  it('非 app 主机的 dsh-app:// Referer —— 走普通 referer 校验，403 referer-invalid', () => {
    assert.equal(structuralRejection(reqFor({ referer: 'dsh-app://evil/x' })), 403);
  });

  it('特例只影响结构性检查，永不推翻 connection 的硬拒', () => {
    assert.equal(
      rejectionFor(ctxWithAdmit(() => ({ rejection: 403 })), reqFor({ referer: RELAY })),
      403,
    );
  });
});

describe('guard · onRejection 诊断回调', () => {
  it('硬拒时收到固定字段决策；回调抛错不影响决策', () => {
    /** @type {Array<{status: number, source: string, reason: string}>} */
    const seen = [];
    const status = rejectionFor(
      ctxWithAdmit(() => ({ rejection: 401 })),
      reqFor(),
      (decision) => {
        seen.push(decision);
        throw new Error('logger blew up');
      },
    );
    assert.equal(status, 401);
    assert.deepEqual(seen, [{ status: 401, source: 'connection', reason: 'host-rejected' }]);
  });

  it('结构性硬拒的 decision 带 source=structural 与固定原因码', () => {
    /** @type {Array<{status: number, source: string, reason: string}>} */
    const seen = [];
    const status = rejectionFor({}, reqFor({ host: '10.9.8.7' }), (decision) => seen.push(decision));
    assert.equal(status, 403);
    assert.deepEqual(seen, [{ status: 403, source: 'structural', reason: 'host-not-loopback' }]);
  });

  it('放行时不回调', () => {
    let calls = 0;
    rejectionFor(ctxWithAdmit(() => undefined), reqFor(), () => { calls += 1; });
    assert.equal(calls, 0);
  });
});

describe('guard · routes.js 接线（端到端）', () => {
  /** @type {string} */
  let dir;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'dshmcp-guard-'));
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * 挂一遍真实路由（最小假 ctx），返回一个直接打 `GET /servers` 的发送器。
   * @param {object|undefined} connectionService 挂到 `ctx.connection` 上的服务本身。
   * @returns {(headers?: Record<string, string|undefined>) => Promise<object>} 发送器。
   */
  function mount(connectionService) {
    /** @type {Array<{kind: string, path: string, handler: Function}>} */
    const table = [];
    const ctx = {
      connection: connectionService,
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
    registerRoutes(ctx, createPatchStore({ filePath: join(dir, 'cordis.patch.yml') }), () => {});
    const route = table.find((entry) => entry.kind === 'exact' && entry.path === SERVERS_PATH);
    assert.ok(route !== undefined, 'GET /servers 路由必须已注册');
    return async (headers = {}) => {
      const req = { method: 'GET', url: SERVERS_PATH, headers: { host: '127.0.0.1:4242', ...headers } };
      const res = {
        statusCode: 200,
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
      return res;
    };
  }

  it('admit 硬拒 403 —— 403 空 body（沿用守卫语义，不走错误信封）', async () => {
    const send = mount({ admit: () => ({ rejection: 403 }) });
    const res = await send();
    assert.equal(res.statusCode, 403);
    assert.equal(res.body, '');
  });

  it('admit 放行（信封无 rejection 字段）—— 到达 handler，200 JSON 信封', async () => {
    const send = mount({ admit: () => ({ rejection: undefined }) });
    const res = await send();
    assert.equal(res.statusCode, 200);
    const payload = JSON.parse(res.body);
    assert.equal(payload.ok, true);
    assert.equal(typeof payload.revision, 'number');
  });

  it('宿主是新版（无 requestRejection、只有 admit）—— 旧守卫的 TypeError 不再发生', async () => {
    const send = mount({ admit: () => undefined });
    const res = await send();
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).ok, true);
  });

  it('无 connection + 非回环 Host —— 结构性 403 空 body', async () => {
    const send = mount(undefined);
    const res = await send({ host: '10.9.8.7' });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body, '');
  });
});
