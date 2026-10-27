/**
 * 路径解析：纯函数，无 I/O，可注入 env，因此可直接在单测里断言。
 *
 * 优先级（team-lead 裁决 A1，与官方 `@deepseek-ai/dsh-home-paths` 语义一致）：
 *
 *   显式配置路径（config.dshHome）> `$DSH_HOME` > `~/.dsh`
 *
 * 两条硬约束：
 * 1. **空串 / 纯空白的 `$DSH_HOME` 视为未设置**——`resolve('')` 会返回当前工作
 *    目录，那会把插件指向一个完全错误的位置；
 * 2. 一切路径都经本模块产出，其它模块禁止硬编码 `~/.dsh`。
 */
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { normalizeConfig } from './config.js';

/** DSH 根目录下 profile 所在的子目录名。 */
const PROFILES_DIR = 'profiles';
/** cordis patch 层的文件名。 */
const PATCH_FILE = 'cordis.patch.yml';

/**
 * 取一个非空的环境变量值（两端空白会被裁掉）。
 * @param {Record<string, unknown>} env 环境变量表。
 * @param {string} key 键名。
 * @returns {string} 非空值；缺失或纯空白时为空串。
 */
function envValue(env, key) {
  const value = env === null || typeof env !== 'object' ? undefined : env[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 解析用户主目录（用于把绝对路径折叠成 `~/...` 展示）。
 *
 * @param {Record<string, unknown>} env 环境变量表（可注入，默认 `process.env`）。
 * @returns {string} 主目录绝对路径。
 */
export function resolveHomeDir(env = process.env) {
  const home = envValue(env, 'HOME');
  return home !== '' ? home : homedir();
}

/**
 * 解析 DSH 根目录。
 *
 * @param {Record<string, unknown>} env 环境变量表（可注入，默认 `process.env`）。
 * @returns {string} DSH 根目录绝对路径。
 */
export function resolveDshHome(env = process.env) {
  const explicit = envValue(env, 'DSH_HOME');
  if (explicit !== '') return resolve(explicit);
  return resolve(resolveHomeDir(env), '.dsh');
}

/**
 * 解析 patch 文件绝对路径。
 *
 * @param {{ profile?: string, dshHome?: string }} [config] 插件配置（未归一化也可）。
 * @param {Record<string, unknown>} [env] 环境变量表。
 * @returns {string} `<dshHome>/profiles/<profile>/cordis.patch.yml`
 */
export function resolvePatchPath(config = {}, env = process.env) {
  const normalized = normalizeConfig(config);
  const home = normalized.dshHome !== '' ? resolve(normalized.dshHome) : resolveDshHome(env);
  return join(home, PROFILES_DIR, normalized.profile, PATCH_FILE);
}

/**
 * 展示用路径：把**用户主目录**前缀折叠成 `~`，其余原样。
 *
 * 路径要出现在 UI 上（「写入位置 ~/.dsh/profiles/web/cordis.patch.yml」），
 * 但绝对路径不该完整地铺在页面上。折叠的是 `$HOME` 而不是 DSH 根目录——
 * 用户认的是 `~/.dsh`，不是 `~/profiles`。
 *
 * @param {string} abs 绝对路径。
 * @param {string} home 用户主目录（通常是 `resolveHomeDir()` 的结果）。
 * @returns {string} 展示路径。
 */
export function toDisplayPath(abs, home) {
  const prefix = home.endsWith('/') ? home : `${home}/`;
  return abs.startsWith(prefix) ? `~/${abs.slice(prefix.length)}` : abs;
}
