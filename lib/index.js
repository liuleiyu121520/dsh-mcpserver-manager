/**
 * Host 半入口。
 *
 * 职责只有三件：归一化 patch config → 按优先级解析 patch 文件路径 → 建 store
 * 并注册 `/api/dsh-mcpserver-manager/*` 路由。除此之外不做任何事——本插件不
 * 需要重启宿主（profile 已声明 `patchReload: live`），也不缓存文件内容
 * （缓存只会制造与磁盘的不一致）。
 *
 * 底座只 inject `webServer` + `connection`：这两个是宿主底座服务，缺任一都
 * 说明宿主版本不对，而其它可选服务本插件一概不用，因此不存在"缺一半就降级"
 * 的分支。
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
 * @param {object} ctx cordis 上下文。
 * @returns {(message: string) => void} 日志函数。
 */
function createLogger(ctx) {
  return (message) => {
    try {
      const logger = ctx.logger ?? (typeof ctx.get === 'function' ? ctx.get('logger') : undefined);
      if (logger !== undefined && typeof logger.info === 'function') {
        logger.info(`[dsh-mcpserver-manager] ${message}`);
      }
    } catch {
      // 日志本身绝不能让业务流程失败。
    }
  };
}

/**
 * 插件激活：装配 store 与路由。
 *
 * @param {object} ctx cordis 上下文（已注入 webServer / connection）。
 * @returns {() => void} dispose：路由由 `ctx.effect` 托管（宿主停用插件时自动
 *   撤销），进程内也没有需要显式回收的资源，所以这里是一个诚实的空操作。
 */
export function apply(ctx, config = {}) {
  const normalized = normalizeConfig(config);
  const logger = createLogger(ctx);
  const store = createPatchStore({ config: normalized });
  registerRoutes(ctx, store, logger);
  logger(`mounted profile=${normalized.profile} file=${store.fileDisplay}`);
  return () => {};
}
