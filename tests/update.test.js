/**
 * 版本检查与原地升级单测。
 *
 * 三条要害：
 * 1. **当前版本号来自 `PLUGIN_VERSION`**，不是 `package.json`——升级之后运行中的
 *    Host 仍是旧代码，读文件会得出"已是最新"的假结论（这条用"不读文件"来断言）；
 * 2. **安装 spec 必须钉死 tag**（`#vX.Y.Z`），否则检查与安装之间推一个提交，
 *    用户点"更新到 v0.5.0"就装上了别的东西；
 * 3. **失败时 `latest` 置 null**：离线不该留着过期的新版本提示。
 *
 * 全程注入假 fetch 与假 pluginManager，**不联网、不装包**。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CHECK_TIMEOUT_MS,
  FIRST_CHECK_DELAY_MS,
  RECHECK_INTERVAL_MS,
  UPDATE_ENDPOINT,
  UPDATE_REPOSITORY,
  createUpdater,
  isNewer,
} from '../src/update.js';
import { PLUGIN_VERSION } from '../src/version.js';

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * 造一个返回指定 tag 的假 fetch。
 * @param {string} tag release tag。
 * @returns {{fetchImpl: Function, calls: string[]}} 假 fetch 与调用记录。
 */
function releaseFetch(tag) {
  /** @type {string[]} */
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({ tag_name: tag, html_url: `https://github.com/x/y/releases/tag/${tag}` }),
    };
  };
  return { fetchImpl, calls };
}

/**
 * 造一个最小 ctx。
 * @param {object} [services] 服务表。
 * @returns {object} ctx。
 */
const ctxWith = (services = {}) => ({ get: (name) => services[name] });

describe('update · 版本比较', () => {
  it('按点分数字比，带不带 v 都认', () => {
    assert.equal(isNewer('0.4.0', '0.3.0'), true);
    assert.equal(isNewer('v0.4.0', '0.3.0'), true);
    assert.equal(isNewer('0.3.0', '0.3.0'), false);
    assert.equal(isNewer('0.3.0', '0.4.0'), false);
    assert.equal(isNewer('0.10.0', '0.9.9'), true, '不能按字符串比（"0.10" < "0.9" 是错的）');
    assert.equal(isNewer('1.0', '0.9.9'), true, '段数不同也要能比');
    assert.equal(isNewer('', '0.1.0'), false);
  });
});

describe('update · 检查', () => {
  it('查到更新的版本 → updateAvailable:true，并带 release 链接', async () => {
    const { fetchImpl, calls } = releaseFetch('v0.5.0');
    const updater = createUpdater({ ctx: ctxWith(), fetchImpl, currentVersion: '0.4.0' });
    const payload = await updater.check().then(() => updater.payload());
    assert.equal(calls.length, 1);
    assert.equal(payload.current, '0.4.0');
    assert.equal(payload.latest, '0.5.0');
    assert.equal(payload.updateAvailable, true);
    assert.match(payload.url, /releases\/tag\/v0\.5\.0/);
    assert.equal(payload.error, null);
    assert.equal(payload.enabled, true);
  });

  it('已是最新 → updateAvailable:false', async () => {
    const { fetchImpl } = releaseFetch('v0.4.0');
    const updater = createUpdater({ ctx: ctxWith(), fetchImpl, currentVersion: '0.4.0' });
    await updater.check();
    assert.equal(updater.payload().updateAvailable, false);
  });

  it('网络失败 → latest 置 null（离线不该留着过期的新版本提示）', async () => {
    const updater = createUpdater({
      ctx: ctxWith(),
      fetchImpl: async () => {
        throw new Error('offline');
      },
      currentVersion: '0.4.0',
    });
    await updater.check();
    const payload = updater.payload();
    assert.equal(payload.latest, null);
    assert.equal(payload.updateAvailable, false);
    assert.equal(payload.error, 'unreachable');
  });

  it('非 2xx / 没有 tag_name → 同样视为查不到', async () => {
    const notFound = createUpdater({
      ctx: ctxWith(),
      fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }),
      currentVersion: '0.4.0',
    });
    await notFound.check();
    assert.equal(notFound.payload().latest, null);
    const noTag = createUpdater({
      ctx: ctxWith(),
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
      currentVersion: '0.4.0',
    });
    await noTag.check();
    assert.equal(noTag.payload().latest, null);
  });

  it('endpoint 置空 → 不发请求，且 enabled:false（离线部署）', async () => {
    const { fetchImpl, calls } = releaseFetch('v9.9.9');
    const updater = createUpdater({ ctx: ctxWith(), fetchImpl, endpoint: '', currentVersion: '0.4.0' });
    await updater.check();
    assert.equal(calls.length, 0);
    assert.equal(updater.payload().enabled, false);
  });

  it('忽略只压住这一个版本，出更新版本照旧提示', async () => {
    const { fetchImpl } = releaseFetch('v0.5.0');
    const updater = createUpdater({ ctx: ctxWith(), fetchImpl, currentVersion: '0.4.0' });
    const dismissed = await updater.dismiss();
    assert.equal(dismissed.dismissed, true);
    assert.equal(dismissed.updateAvailable, true, 'upgradeAvailable 仍为真，只是界面不提示');
  });

  it('超时上限是个有限值（没有超时的 fetch 会让"检查更新"永久挂起）', () => {
    assert.ok(Number.isFinite(CHECK_TIMEOUT_MS) && CHECK_TIMEOUT_MS > 0);
    assert.ok(Number.isFinite(FIRST_CHECK_DELAY_MS) && FIRST_CHECK_DELAY_MS > 0);
    assert.ok(Number.isFinite(RECHECK_INTERVAL_MS) && RECHECK_INTERVAL_MS >= 60 * 60 * 1000);
  });
});

describe('update · 升级', () => {
  it('宿主没有 pluginManager → 明确报 plugin-manager-unavailable，不装任何东西', async () => {
    const updater = createUpdater({ ctx: ctxWith(), fetchImpl: releaseFetch('v0.5.0').fetchImpl, currentVersion: '0.4.0' });
    const state = await updater.upgrade();
    assert.equal(state.running, false);
    assert.equal(state.error, 'plugin-manager-unavailable');
    assert.equal(state.result, null);
  });

  it('查不到新版本 → 不装，error:unreachable', async () => {
    /** @type {string[]} */
    const specs = [];
    const updater = createUpdater({
      ctx: ctxWith({ pluginManager: { installBundle: async (spec) => { specs.push(spec); } } }),
      fetchImpl: async () => {
        throw new Error('offline');
      },
      currentVersion: '0.4.0',
    });
    const state = await updater.upgrade();
    assert.equal(state.error, 'unreachable');
    assert.deepEqual(specs, [], '查不到版本就不该调 installBundle');
  });

  it('安装 spec 钉死 tag，并回传 application / version', async () => {
    /** @type {Array<{spec: string, options: object}>} */
    const calls = [];
    const updater = createUpdater({
      ctx: ctxWith({
        pluginManager: {
          installBundle: async (spec, options) => {
            calls.push({ spec, options });
            return { changed: true, application: 'applied', version: '0.5.0', restartReason: null };
          },
        },
      }),
      fetchImpl: releaseFetch('v0.5.0').fetchImpl,
      currentVersion: '0.4.0',
    });
    const state = await updater.upgrade();
    assert.equal(state.running, false);
    assert.equal(state.error, null);
    assert.equal(state.result.application, 'applied');
    assert.equal(state.result.version, '0.5.0');
    assert.deepEqual(calls, [
      { spec: `${UPDATE_REPOSITORY}#v0.5.0`, options: { enabled: true } },
    ]);
    assert.match(calls[0].spec, /#v0\.5\.0$/);
  });

  it('installBundle 抛错 → 状态里带原因，running 复位', async () => {
    const updater = createUpdater({
      ctx: ctxWith({ pluginManager: { installBundle: async () => { throw new Error('pnpm exploded'); } } }),
      fetchImpl: releaseFetch('v0.5.0').fetchImpl,
      currentVersion: '0.4.0',
    });
    const state = await updater.upgrade();
    assert.equal(state.running, false);
    assert.match(state.error, /pnpm exploded/);
  });

  it('startUpgrade 立刻返回 running:true（HTTP 层不等它）', async () => {
    const updater = createUpdater({
      ctx: ctxWith({
        pluginManager: {
          installBundle: () => new Promise((resolve) => setTimeout(() => resolve({ application: 'applied' }), 10)),
        },
      }),
      fetchImpl: releaseFetch('v0.5.0').fetchImpl,
      currentVersion: '0.4.0',
    });
    const started = updater.startUpgrade();
    assert.equal(started.running, true, 'POST /upgrade 必须立刻返回');
    // 等它自己跑完（否则会被测试进程的退出打断）。
    await updater.upgrade();
  });

  it('升级进行中再点一次不会重复安装', async () => {
    /** @type {number} */
    let installs = 0;
    const updater = createUpdater({
      ctx: ctxWith({
        pluginManager: {
          installBundle: () =>
            new Promise((resolve) => {
              installs += 1;
              setTimeout(() => resolve({ application: 'applied' }), 5);
            }),
        },
      }),
      fetchImpl: releaseFetch('v0.5.0').fetchImpl,
      currentVersion: '0.4.0',
    });
    updater.startUpgrade();
    updater.startUpgrade();
    updater.startUpgrade();
    await updater.upgrade();
    assert.equal(installs, 1, '重复点击不该装三次');
  });
});

describe('update · 定时检查', () => {
  it('没有 timer 服务 → 返回一个空清理函数，不抛错（可选服务缺失不该致命）', () => {
    const updater = createUpdater({ ctx: ctxWith(), fetchImpl: releaseFetch('v0.5.0').fetchImpl });
    let dispose;
    assert.doesNotThrow(() => {
      dispose = updater.startTimers();
    });
    assert.equal(typeof dispose, 'function');
    assert.doesNotThrow(() => dispose());
  });

  it('有 timer 时注册一个 timeout + 一个 interval，并在清理时全部撤销', () => {
    /** @type {string[]} */
    const registered = [];
    /** @type {string[]} */
    const disposed = [];
    const timer = {
      timeout(fn, ms) {
        registered.push(`timeout:${ms}`);
        return () => disposed.push('timeout');
      },
      interval(fn, ms) {
        registered.push(`interval:${ms}`);
        return () => disposed.push('interval');
      },
    };
    const updater = createUpdater({ ctx: ctxWith({ timer }), fetchImpl: releaseFetch('v0.5.0').fetchImpl });
    const dispose = updater.startTimers();
    assert.deepEqual(registered, [`timeout:${FIRST_CHECK_DELAY_MS}`, `interval:${RECHECK_INTERVAL_MS}`]);
    dispose();
    assert.deepEqual(disposed, ['timeout', 'interval']);
  });
});

describe('update · 不读 package.json 当当前版本', () => {
  it('用的是 PLUGIN_VERSION，而且 update.js 里没有读文件的动作', () => {
    const source = readFileSync(join(root, 'src/update.js'), 'utf8');
    assert.ok(source.includes("from './version.js'"), '应从 version.js 取版本');
    // 只在"代码行"上判：文档注释里当然会提到 package.json（那是在解释为什么不读它）。
    const codeLines = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'));
    assert.equal(
      codeLines.some((line) => /readFileSync|node:fs|require\(/.test(line)),
      false,
      '当前版本必须跟着代码走，不许从磁盘读',
    );
    const updater = createUpdater({ ctx: ctxWith(), fetchImpl: releaseFetch('v0.0.1').fetchImpl });
    assert.equal(updater.payload().current, PLUGIN_VERSION);
  });

  it('仓库地址与包名一致（否则 installBundle 会装到别的东西）', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert.equal(UPDATE_REPOSITORY, `github:liuleiyu121520/${pkg.name}`);
    assert.ok(UPDATE_ENDPOINT.includes(`/repos/liuleiyu121520/${pkg.name}/releases/latest`));
  });
});
