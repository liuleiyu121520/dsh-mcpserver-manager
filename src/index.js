/**
 * Host 半入口。
 *
 * 职责只有三件：归一化 patch config → 按优先级解析 patch 文件路径（**宿主
 * `profileContext` 优先**）→ 建 store 并注册 `/api/dsh-mcpserver-manager/*`
 * 路由。除此之外不做任何事——本插件不需要重启宿主（profile 已声明
 * `patchReload: live`），也不缓存文件内容（缓存只会制造与磁盘的不一致）。
 *
 * 底座只 inject `webServer` + `connection`：这两个是宿主底座服务，缺任一都
 * 说明宿主版本不对，而其它可选服务本插件一概不用，因此不存在"缺一半就降级"
 * 的分支。`profileContext` **不是** inject 项——它由宿主在 profile 启动时挂到
 * cordis 的 Context 上（`Present only in a profile launched by dsh`），所以只能
 * 用 `ctx.get('profileContext')` 探测，缺了就回落到显式配置 / 环境变量。
 */
import { normalizeConfig } from './config.js';
import { createPatchStore } from './patch-store.js';
import { registerRoutes } from './routes.js';

export const inject = ['webServer', 'connection'];

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
 * 插件激活：装配 store 与路由。
 *
 * @param {object} ctx cordis 上下文（已注入 webServer / connection）。
 * @param {object} [config] 插件配置（cordis 层传入，未归一化）。
 * @returns {() => void} dispose：路由由 `ctx.effect` 托管（宿主停用插件时自动
 *   撤销），进程内也没有需要显式回收的资源，所以这里是一个诚实的空操作。
 */
export function apply(ctx, config = {}) {
  const normalized = normalizeConfig(config);
  const logger = createLogger(ctx);
  const profileContext = probeProfileContext(ctx);
  const store = createPatchStore({ config: normalized, profileContext });
  registerRoutes(ctx, store, logger);
  // 回落是一次**要在日志里留痕**的降级：某个满足 engines 但没 provide
  // profileContext 的宿主会让这里静默落回 `~/.dsh/profiles/web`，那等于原 BUG
  // 复现。只改可观测性，不改任何解析行为。
  if (store.source !== 'profileContext') {
    logger.warn(
      `宿主未提供 profileContext，已回落到 ${store.source}：${store.fileDisplay}` +
        `（profile=${store.profile}）。若这不是你期望的 profile，请检查宿主版本或显式配置 patchFile。`,
    );
  }
  // 日志必须打得足够具体：用户核对「到底写进了哪个 profile 的哪个文件」全靠这一行。
  logger(
    `mounted profile=${store.profile} file=${store.fileDisplay} source=${store.source}`,
  );
  return () => {};
}
