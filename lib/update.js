/**
 * 在线版本检查与原地升级。
 *
 * 与 `dsh-wallpaper` 同一条路（那边已经跑通，宿主版本换了也不会翻车）：
 * 查 GitHub Releases 的 `latest` → 比版本号 → 需要时用
 * `pluginManager.installBundle('github:owner/repo#vX.Y.Z')` 原地装。
 *
 * 四个关键约束，每个都对应一次踩过的坑：
 *
 * 1. **`current` 取 `PLUGIN_VERSION`，不读 `package.json`**。插件升级后，
 *    运行中的 Host 半是**旧代码**，而 `package.json` 已经是新版本了——读文件
 *    会得出"已是最新"的假结论，把"装了但没重启"这个真实状态藏起来。
 *    `PLUGIN_VERSION` 跟着代码走，说的才是"现在跑的是什么"；
 * 2. **检查失败时 `latest` 一律置 null**。宁可"没有提示"也不要"离线时还挂着
 *    一个过期的新版本提示"——后者会让人反复点一个注定失败的更新按钮；
 * 3. **`#v<tag>` 钉死 tag**。装 `#main` 的话，检查到安装之间的每一次提交都
 *    可能换掉内容，用户点"更新到 v0.4.0"却装上了别的；
 * 4. **检查与"重新检查"分两条路由**。GET 只读缓存状态（页面每次打开都能立刻
 *    出结果、不打 GitHub），POST `/update/check` 才真的发请求。合成一条的话，
 *    浏览器缓存与"用户刚点了检查"会互相打架。
 *
 * 网络请求一律 8s 超时：没有超时的 `fetch` 会让"检查更新"这个动作在弱网下
 * 永久挂起，而它只是个附带功能，不该拖住页面。
 */
import { PLUGIN_VERSION } from './version.js';

/** 有新版本时从哪儿查。置空即关闭在线检查（纯离线部署）。 */
export const UPDATE_ENDPOINT = 'https://api.github.com/repos/liuleiyu121520/dsh-mcpserver-manager/releases/latest';

/** 原地升级时从哪儿装。必须能被 pnpm 解析成 `github:owner/repo`。 */
export const UPDATE_REPOSITORY = 'github:liuleiyu121520/dsh-mcpserver-manager';

/** 单次查询的超时（毫秒）。 */
export const CHECK_TIMEOUT_MS = 8000;

/** 启动后首次检查的延迟：让宿主先把插件都挂完，别和启动抢网络。 */
export const FIRST_CHECK_DELAY_MS = 15000;

/** 周期检查间隔（6 小时）。 */
export const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * 比较点分数字版本；`remote` 比 `local` 新时返回 true。
 *
 * 只做数字比较，不认 `-rc.1` 这类后缀：发布用的是稳定 tag，把它当版本语义
 * 库用会引入一整套 semver 依赖（本插件零运行时依赖）。`Number.parseInt`
 * 遇到非数字段得 NaN，`|| 0` 兜住。
 * @param {string} remote 远端版本。
 * @param {string} local 本地版本。
 * @returns {boolean} 是否更新。
 */
export function isNewer(remote, local) {
  const parse = (value) =>
    String(value ?? '')
      .replace(/^v/i, '')
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);
  const left = parse(remote);
  const right = parse(local);
  for (let index = 0; index < Math.max(left.length, right.length, 3); index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

/**
 * 造一个更新器。
 *
 * 全部状态都在闭包里：宿主重载插件即复位，没有跨进程的持久化——"用户点了
 * 忽略"只对当前进程里那个版本有效，重启后会重新提示一次（这正是想要的：
 * 忽略是个临时动作，不是配置）。
 *
 * @param {object} params 参数。
 * @param {object} params.ctx cordis 上下文。
 * @param {(message: string) => void} [params.logger] 日志。
 * @param {typeof fetch} [params.fetchImpl] fetch 实现（测试注入）。
 * @param {string} [params.endpoint] 查询地址。
 * @param {string} [params.repository] 安装来源。
 * @param {string} [params.currentVersion] 当前版本。
 * @returns {object} 更新器。
 */
export function createUpdater({
  ctx,
  logger = () => {},
  fetchImpl = globalThis.fetch,
  endpoint = UPDATE_ENDPOINT,
  repository = UPDATE_REPOSITORY,
  currentVersion = PLUGIN_VERSION,
}) {
  /** 最近一次查询的结果。`latest:null` 且 `error:null` 表示"还没查过"。 */
  let state = { checkedAt: null, latest: null, url: null, error: null };
  /** 用户忽略过的版本：只压住这一个，出了更新的版本照旧提示。 */
  let dismissedVersion = null;
  /** 查询中标记：定时器和手动点击不许堆叠请求。 */
  let checking = false;
  /** 升级状态。`running` 期间前端轮询 `/upgrade`。 */
  let upgradeState = { running: false, startedAt: null, finishedAt: null, result: null, error: null };
  /** 正在进行的升级（同一个 promise 反复返回，调用方 await 到的就是"装完"）。 */
  let pending = null;

  /**
   * 取当前的版本结论（页面读的就是这个）。
   * @returns {object} 结论。
   */
  const payload = () => {
    const latest = state.latest;
    return {
      current: currentVersion,
      latest,
      updateAvailable: latest !== null && isNewer(latest, currentVersion),
      checkedAt: state.checkedAt,
      url: state.url,
      error: state.error,
      dismissed: latest !== null && dismissedVersion === latest,
      // 关了在线检查时前端不该显示"检查失败"，这是一个明确的"不检查"。
      enabled: endpoint !== '',
    };
  };

  /**
   * 真的发一次请求。
   * @returns {Promise<{latest: string, url: string|null}|null>} 结果；任何失败都为 null。
   */
  const fetchLatest = async () => {
    if (endpoint === '' || typeof fetchImpl !== 'function') return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    try {
      const response = await fetchImpl(endpoint, {
        headers: { accept: 'application/vnd.github+json' },
        signal: controller.signal,
      });
      if (response.ok !== true) return null;
      const body = await response.json();
      const tag = typeof body?.tag_name === 'string' ? body.tag_name : '';
      if (tag === '') return null;
      return {
        latest: tag.replace(/^v/i, ''),
        url: typeof body?.html_url === 'string' ? body.html_url : null,
      };
    } catch (error) {
      logger(`update check failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  /**
   * 查一次并合并进状态。
   * @returns {Promise<object>} 最新的状态。
   */
  const check = async () => {
    if (checking) return state;
    checking = true;
    try {
      const found = await fetchLatest();
      state = {
        checkedAt: new Date().toISOString(),
        latest: found?.latest ?? null,
        url: found?.url ?? null,
        error: found === null ? 'unreachable' : null,
      };
      return state;
    } finally {
      checking = false;
    }
  };

  /**
   * 忽略当前这个新版本（只压住这一个）。
   * @returns {Promise<object>} 忽略后的结论。
   */
  const dismiss = async () => {
    const snapshot = await check();
    if (snapshot.latest !== null && isNewer(snapshot.latest, currentVersion)) {
      dismissedVersion = snapshot.latest;
    }
    return payload();
  };

  /**
   * 装最新版。**调用方必须保证此刻没有别的升级在跑**（由 `upgrade` /
   * `startUpgrade` 守卫）；第一句就把 `running` 置上，避免两个 await 之间
   * 再进来一个请求。
   * @returns {Promise<object>} 升级状态。
   */
  const runUpgrade = async () => {
    upgradeState = { running: true, startedAt: new Date().toISOString(), finishedAt: null, result: null, error: null };

    let manager;
    try {
      manager = typeof ctx?.get === 'function' ? ctx.get('pluginManager') : undefined;
    } catch {
      manager = undefined;
    }
    if (manager === undefined || manager === null || typeof manager.installBundle !== 'function') {
      upgradeState = {
        running: false,
        startedAt: upgradeState.startedAt,
        finishedAt: new Date().toISOString(),
        result: null,
        error: 'plugin-manager-unavailable',
      };
      logger('upgrade skipped: pluginManager.installBundle is unavailable');
      return upgradeState;
    }

    const snapshot = await check();
    if (snapshot.latest === null) {
      upgradeState = {
        running: false,
        startedAt: upgradeState.startedAt,
        finishedAt: new Date().toISOString(),
        result: null,
        error: 'unreachable',
      };
      return upgradeState;
    }

    try {
      // 钉死 tag：检查与安装之间推了新提交也不会装到别的东西。
      const outcome = await manager.installBundle(`${repository}#v${snapshot.latest}`, { enabled: true });
      upgradeState = {
        running: false,
        startedAt: upgradeState.startedAt,
        finishedAt: new Date().toISOString(),
        result: {
          changed: outcome?.changed === true,
          // `applied` = 热profile，新 bundle 已换上；其余情况要重启。
          application: typeof outcome?.application === 'string' ? outcome.application : 'unknown',
          version: typeof outcome?.version === 'string' ? outcome.version : null,
          restartReason: typeof outcome?.restartReason === 'string' ? outcome.restartReason : null,
          error: typeof outcome?.error?.code === 'string' ? outcome.error.code : null,
        },
        error: null,
      };
      logger(`upgrade ${upgradeState.result.version ?? snapshot.latest} application=${upgradeState.result.application}`);
      // 装完立刻重查一次：成功的话提示自然消失，失败的话状态也是最新的。
      await check();
      dismissedVersion = null;
    } catch (error) {
      upgradeState = {
        running: false,
        startedAt: upgradeState.startedAt,
        finishedAt: new Date().toISOString(),
        result: null,
        error: error instanceof Error ? error.message : String(error),
      };
      logger(`upgrade failed: ${upgradeState.error}`);
    }
    return upgradeState;
  };

  /**
   * 起一次升级并把 promise 记在 `pending` 上。
   *
   * `catch` 是必须的：`startUpgrade` 那条路上没人 await 这个 promise，一旦
   * `runUpgrade` 抛出来（理论上不该，它内部全包了 try），这里不接住就是一条
   * 未处理的 rejection——在某些宿主上会直接把进程打挂。
   * @returns {Promise<object>} 升级状态。
   */
  const begin = () => {
    const settled = runUpgrade().catch((error) => {
      upgradeState = {
        running: false,
        startedAt: upgradeState.startedAt,
        finishedAt: new Date().toISOString(),
        result: null,
        error: error instanceof Error ? error.message : String(error),
      };
      return upgradeState;
    });
    pending = settled.finally(() => {
      pending = null;
    });
    return pending;
  };

  /**
   * 等升级跑完（给测试和"同步等待"场景用）。
   * @returns {Promise<object>} 升级状态。
   */
  const upgrade = async () => (pending !== null ? pending : begin());

  /**
   * 启动升级并立刻返回：HTTP 层不等它，前端轮询 `/upgrade` 看进度。
   * @returns {object} 当前升级状态（`running:true`）。
   */
  const startUpgrade = () => {
    if (pending === null) void begin();
    return upgradeState;
  };

  /**
   * 起定时器：启动 15s 后查一次，之后每 6h 一次。
   *
   * `timer` 是可选的：拿不到就只是没有周期检查（页面上的"检查更新"按钮照旧
   * 能手点），绝不让插件因为少一个可选服务而挂掉。
   * @returns {() => void} 清理函数。
   */
  const startTimers = () => {
    let timer;
    try {
      timer = typeof ctx?.get === 'function' ? ctx.get('timer') : undefined;
    } catch {
      timer = undefined;
    }
    if (timer === null || timer === undefined) return () => {};
    if (typeof timer.timeout !== 'function' || typeof timer.interval !== 'function') return () => {};
    /** @type {unknown[]} */
    const disposers = [];
    try {
      disposers.push(timer.timeout(() => void check(), FIRST_CHECK_DELAY_MS));
      disposers.push(timer.interval(() => void check(), RECHECK_INTERVAL_MS));
    } catch {
      // 定时器注册失败不影响手动检查。
    }
    return () => {
      for (const disposer of disposers) {
        try {
          if (typeof disposer === 'function') disposer();
          else if (disposer !== null && typeof (/** @type {any} */ (disposer).dispose) === 'function') {
            /** @type {any} */ (disposer).dispose();
          }
        } catch {
          // 清理失败无所谓：进程退出时一并回收。
        }
      }
    };
  };

  return {
    payload,
    check,
    dismiss,
    upgrade,
    startUpgrade,
    startTimers,
    /** 只读的当前升级状态（GET /upgrade 用）。 */
    upgradeState: () => upgradeState,
  };
}
