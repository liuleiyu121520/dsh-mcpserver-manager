/**
 * Host 半入口。
 *
 * 职责只有四件：归一化 patch config → 按优先级解析 patch 文件路径（**宿主
 * `profileContext` 优先**）→ 建 store 并注册 `/api/dsh-mcpserver-manager/*`
 * 路由 → 起一个版本检查定时器。除此之外不做任何事——本插件不需要重启宿主
 * （profile 已声明 `patchReload: live`），也不缓存文件内容（缓存只会制造与
 * 磁盘的不一致）。
 *
 * 底座 inject `webServer` + `connection` + `timer`：前两个是宿主底座服务，缺任
 * 一都说明宿主版本不对。`timer` 只给"检查更新"用，拿不到就退化成"只能手点
 * 检查"（见 `update.js` 的 `startTimers`），不影响任何写配置的能力。
 * `profileContext` **不是** inject 项——它由宿主在 profile 启动时挂到
 * cordis 的 Context 上（`Present only in a profile launched by dsh`），所以只能
 * 用 `ctx.get('profileContext')` 探测，缺了就回落到显式配置 / 环境变量。
 */
import { normalizeConfig } from './config.js';
import { createPatchStore } from './patch-store.js';
import { PATH_SOURCES } from './paths.js';
import { registerRoutes } from './routes.js';
import { createUpdater } from './update.js';

export const inject = ['webServer', 'connection', 'timer'];

/**
 * 真正属于「回落」的路径来源。
 *
 * 只有这三层是"宿主没给 profileContext，我们只能猜"：
 * `config.dshHome` / `$DSH_HOME` / `~/.dsh`。
 *
 * `profileContext` 与 `config.patchFile` **都不在里面**，原因不同：
 * - `profileContext` 是宿主权威，本来就不是回落；
 * - `config.patchFile` 是用户**显式指定到文件**的最高优先级，它结构性地压过
 *   profileContext——「宿主未提供 profileContext」这个前提对它永远不成立。
 *   把它算进来会打出事实上错误的日志（例如宿主明明提供了 profileContext、
 *   用户又配了 patchFile 时，日志会断言宿主没提供），而这条日志的唯一用途
 *   就是排障：说错话比不说更坏。
 *
 * @type {ReadonlySet<string>}
 */
const FALLBACK_SOURCES = new Set([
  PATH_SOURCES.CONFIG_DSH_HOME,
  PATH_SOURCES.ENV_DSH_HOME,
  PATH_SOURCES.DEFAULT_DSH_HOME,
]);


/**
 * 造一个"只打 serverName / 错误码 / 路径"的日志函数。
 *
 * 这一层手里流过的对象里有 env 明文与 `!!js` 表达式，任何一次
 * `logger.info(JSON.stringify(x))` 都会把它们送进日志文件。
 *
 * 返回的函数本身是 info 通道（路由层按 `logger(message)` 用它），另挂一个
 * `logger.warn`。`warn` 取不到宿主 logger 的 `warn` 方法时**退回 info 并在行内
 * 打上 `[WARN]`**——静默降级等于没有警告，而这条警告正是排查"回落到错误
 * profile"时唯一的线索。
 *
 * @param {object} ctx cordis 上下文。
 * @returns {((message: string) => void) & {warn: (message: string) => void}} 日志函数。
 */
function createLogger(ctx) {
  /**
   * 出一个日志行。
   * @param {'info'|'warn'} level 级别。
   * @param {string} message 正文。
   * @returns {void}
   */
  const emit = (level, message) => {
    try {
      const logger = ctx.logger ?? (typeof ctx.get === 'function' ? ctx.get('logger') : undefined);
      if (logger === null || logger === undefined) return;
      const line = level === 'info'
        ? `[dsh-mcpserver-manager] ${message}`
        : `[dsh-mcpserver-manager] [WARN] ${message}`;
      const sink = logger[level];
      if (typeof sink === 'function') {
        sink.call(logger, line);
        return;
      }
      if (level !== 'info' && typeof logger.info === 'function') logger.info(line);
    } catch {
      // 日志本身绝不能让业务流程失败。
    }
  };

  const log = (message) => emit('info', message);
  log.warn = (message) => emit('warn', message);
  return log;
}

/**
 * 探测宿主 profile 上下文。
 *
 * 三条纪律：
 * 1. 只用 `ctx.get('profileContext')`（与本仓库既有写法一致：`ctx.get('logger')`、
 *    `ctx.get('pluginManager')`）。**不写** `ctx.profileContext`——服务未提供时
 *    那个属性访问在 cordis 的 Proxy 上可能直接抛错；
 * 2. `ctx.get` 本身也可能抛错（服务注册表未就绪 / 假 ctx），所以整个探测包在
 *    try 里：**取不到就当没有**，这不是异常路径；
 * 3. 探测失败必须是**静默**的：BUG-2 的修复不能引入"启动时报错"这种新故障。
 *
 * @param {object} ctx cordis 上下文。
 * @returns {object|undefined} `profileContext` 的普通对象视图；不存在时为 undefined。
 */
function probeProfileContext(ctx) {
  try {
    if (ctx === null || typeof ctx !== 'object' || typeof ctx.get !== 'function') return undefined;
    const value = ctx.get('profileContext');
    if (value === null || typeof value !== 'object') return undefined;
    return value;
  } catch {
    return undefined;
  }
}

/**
 * 插件激活：装配 store、路由与版本检查定时器。
 *
 * @param {object} ctx cordis 上下文（已注入 webServer / connection / timer）。
 * @param {object} [config] 插件配置（cordis 层传入，未归一化）。
 * @returns {() => void} dispose：路由与定时器都由 `ctx.effect` 托管（宿主停用
 *   插件时自动撤销），进程内也没有需要显式回收的资源，所以这里是一个诚实的
 *   空操作。
 */
export function apply(ctx, config = {}) {
  const normalized = normalizeConfig(config);
  const logger = createLogger(ctx);
  const profileContext = probeProfileContext(ctx);
  const store = createPatchStore({ config: normalized, profileContext });
  // 更新器与 patch 存储没有交集：它只碰 `pluginManager` / `timer` / 网络，
  // 传 ctx 是为了在请求时才去取那两个可选服务（注册时可能还没就绪）。
  const updater = createUpdater({ ctx, logger });
  registerRoutes(ctx, store, logger, { updater });
  // 定时检查挂在 ctx.effect 上：宿主停用插件时定时器随之撤销，不留后台轮询。
  ctx.effect(updater.startTimers, 'dsh-mcpserver-manager: release check timer');
  // 回落是一次**要在日志里留痕**的降级：某个满足 engines 但没 provide
  // profileContext 的宿主会让这里静默落回 `~/.dsh/profiles/web`，那等于原 BUG
  // 复现。只改可观测性，不改任何解析行为。
  // 判定必须收窄到 FALLBACK_SOURCES：`config.patchFile` 是用户显式指定，
  // 对它说「宿主未提供 profileContext，已回落」既是误报、也会永消不掉。
  if (FALLBACK_SOURCES.has(store.source)) {
    logger.warn(
      `宿主未提供 profileContext，已回落到 ${store.source}：${store.fileDisplay}` +
        `（profile=${store.profile}）。若这不是你期望的 profile，请检查宿主版本或显式配置 patchFile。`,
    );
  } else if (store.source === PATH_SOURCES.CONFIG_FILE) {
    // 显式指定不是降级，但它值得一条 info：用户改了 patchFile 之后要在日志里
    // 看到它真的生效了。**不带** `[WARN]`、**不带**「宿主未提供」这类前提，
    // 也不提 profile——patchFile 不一定是 `profiles/<name>/` 形状，此时 profile
    // 只是个兜底标签，写进日志会误导。
    logger(`使用配置中显式指定的 patchFile：${store.fileDisplay}`);
  }
  // 日志必须打得足够具体：用户核对「到底写进了哪个 profile 的哪个文件」全靠这一行。
  // 但 `profile` 这一栏在 patchFile 场景下是**兜底标签**（路径不是 `profiles/<name>/`
  // 形状时退回 `config.profile`，默认 web），写出来就是错的——而这一行正是排障时
  // 要用户贴出来的。宁可不显示，也不能显示错的：保留 `profile=` 这个 key 便于 grep，
  // 值换成「未指定，由 patchFile 决定」。
  const profileLabel = store.source === PATH_SOURCES.CONFIG_FILE
    ? '(未指定，由 patchFile 决定)'
    : store.profile;
  logger(
    `mounted profile=${profileLabel} file=${store.fileDisplay} source=${store.source}`,
  );
  return () => {};
}
