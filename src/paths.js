/**
 * 路径解析：纯函数，无 I/O，可注入 env，因此可直接在单测里断言。
 *
 * 优先级（**本文件唯一的真相**，改这里等于改行为）：
 *
 *   1. 显式 `config.patchFile`（绝对路径，精确到文件）—— 测试与高级用户的逃生门
 *   2. 宿主 `profileContext.patchPath` —— **正常运行走这条**，宿主说哪个 profile
 *      就是哪个 profile（BUG-2 的根因就是缺了这一层，导致 desktop 用户被写进 web）
 *   3. `config.dshHome` + `profiles/<profile>/cordis.patch.yml`
 *   4. `$DSH_HOME` + 同上
 *   5. `~/.dsh` + 同上
 *
 * 三条硬约束：
 * 1. **空串 / 纯空白的 `$DSH_HOME`（或 `config.dshHome`）视为未设置**——
 *    `resolve('')` 会返回当前工作目录，那会把插件指向一个完全错误的位置；
 *    同理，`config.patchFile` 与 `profileContext.patchPath` **只接受绝对路径**，
 *    相对路径一律视为无效并回落下一层（否则同样会落到 cwd）；
 * 2. `profileContext` 只以**普通对象**的形式传进来，本模块**不碰 `ctx`**：
 *    取值（`ctx.get('profileContext')`）是装配层（`index.js`）的职责，这样本模块
 *    才能保持纯函数、可单测；
 * 3. 一切路径都经本模块产出，其它模块禁止硬编码 `~/.dsh`。
 */
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { normalizeConfig } from './config.js';

/** DSH 根目录下 profile 所在的子目录名。 */
const PROFILES_DIR = 'profiles';
/** cordis patch 层的文件名。 */
const PATCH_FILE = 'cordis.patch.yml';
/** profile 名的形状（与 config.js 里的 PROFILE_RE 同源）。 */
const PROFILE_RE = /^[A-Za-z0-9_-]{1,32}$/;

/**
 * 路径结论的来源。它是**可观测证据**：日志与页面都靠它回答
 * 「这条路径到底是谁决定的」。
 *
 * @type {Readonly<Record<string, string>>}
 */
export const PATH_SOURCES = Object.freeze({
  /** 显式 `config.patchFile`（最高优先级）。 */
  CONFIG_FILE: 'config.patchFile',
  /** 宿主 `profileContext.patchPath`（正常运行时的实际来源）。 */
  PROFILE_CONTEXT: 'profileContext',
  /** 显式 `config.dshHome`。 */
  CONFIG_DSH_HOME: 'config.dshHome',
  /** `$DSH_HOME` 环境变量。 */
  ENV_DSH_HOME: '$DSH_HOME',
  /** 兜底 `~/.dsh`。 */
  DEFAULT_DSH_HOME: '~/.dsh',
});

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
 * 取一个对象的非空字符串字段。
 * @param {unknown} source 来源对象。
 * @param {string} key 字段名。
 * @returns {string} 非空值（已裁剪）；缺失或纯空白时为空串。
 */
function stringField(source, key) {
  if (source === null || typeof source !== 'object') return '';
  const value = /** @type {Record<string, unknown>} */ (source)[key];
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
 * 把宿主给的 `profileContext` 归一化成只含本模块需要的三个字段。
 *
 * `profileContext` 在 cordis 的类型里是「Present only in a profile launched by dsh」——
 * 测试进程、独立脚本里它就是不存在，所以**任何**非法形态都必须安静地返回 null，
 * 由调用方回落到下一层优先级，而不是抛错。
 *
 * `patchPath` 必须是**绝对路径**：`resolve('cordis.patch.yml')` 会解析成
 * 「相对宿主 cwd」，那是本 BUG 的同款陷阱（文件头承诺「绝不落到 cwd」，这里就是
 * 兑现处）。与 `config.patchFile` 的 `isAbsolute` 校验对等——两层防御同一条规则。
 *
 * @param {unknown} profileContext 宿主上下文对象（可为 undefined）。
 * @returns {{name: string, patchPath: string, home: string}|null} 归一化结果。
 */
export function readProfileContext(profileContext) {
  if (profileContext === null || typeof profileContext !== 'object') return null;
  const patchPath = stringField(profileContext, 'patchPath');
  if (patchPath === '') return null;
  if (!isAbsolute(patchPath)) return null;
  const name = stringField(profileContext, 'name');
  return {
    // 名字只用于展示；不合形状就交给「从路径推断」那一层，绝不把怪字符送到页面上。
    name: PROFILE_RE.test(name) ? name : '',
    patchPath,
    home: stringField(profileContext, 'home'),
  };
}

/**
 * 从 `<...>/profiles/<profile>/cordis.patch.yml` 形状的路径里推断 profile 名。
 *
 * @param {string} filePath 绝对文件路径。
 * @returns {string|null} profile 名；形状不符返回 null。
 */
export function profileFromPatchPath(filePath) {
  if (typeof filePath !== 'string' || filePath === '') return null;
  if (basename(filePath) !== PATCH_FILE) return null;
  const profileDir = dirname(filePath);
  const name = basename(profileDir);
  if (basename(dirname(profileDir)) !== PROFILES_DIR) return null;
  return PROFILE_RE.test(name) ? name : null;
}

/**
 * 从 `<...>/profiles/<profile>/cordis.patch.yml` 形状的路径里推断 DSH 根目录。
 *
 * @param {string} filePath 绝对文件路径。
 * @returns {string|null} DSH 根目录；形状不符返回 null。
 */
export function dshHomeFromPatchPath(filePath) {
  if (profileFromPatchPath(filePath) === null) return null;
  return dirname(dirname(dirname(filePath)));
}

/**
 * 解析 patch 文件的**目标**（路径 + profile 名 + 来源）。
 *
 * 这是本模块的主入口：`resolvePatchPath` 只是它的 `.filePath` 视图，之所以
 * 保留后者，是因为调用点读起来更直白，且已有大量测试按它断言。
 *
 * @param {{ profile?: string, dshHome?: string, patchFile?: string }} [config] 插件配置（未归一化也可）。
 * @param {Record<string, unknown>} [env] 环境变量表。
 * @param {unknown} [profileContext] 宿主 `profileContext`（可为 undefined / 非法→忽略）。
 * @returns {{filePath: string, dshHome: string, profile: string, source: string}} 目标。
 */
export function resolvePatchTarget(config = {}, env = process.env, profileContext = undefined) {
  const normalized = normalizeConfig(config);

  // 1. 显式文件路径：精确到文件，谁也抢不走。
  if (normalized.patchFile !== '') {
    const filePath = resolve(normalized.patchFile);
    return {
      filePath,
      profile: profileFromPatchPath(filePath) ?? normalized.profile,
      dshHome: dshHomeFromPatchPath(filePath) ?? resolveDshHome(env),
      source: PATH_SOURCES.CONFIG_FILE,
    };
  }

  // 2. 宿主权威：它说哪个 profile，就是哪个 profile。
  const context = readProfileContext(profileContext);
  if (context !== null) {
    const filePath = resolve(context.patchPath);
    return {
      filePath,
      profile: context.name !== ''
        ? context.name
        : (profileFromPatchPath(filePath) ?? normalized.profile),
      dshHome: context.home !== ''
        ? resolve(context.home)
        : (dshHomeFromPatchPath(filePath) ?? resolveDshHome(env)),
      source: PATH_SOURCES.PROFILE_CONTEXT,
    };
  }

  // 3 / 4 / 5. 回落链：显式 dshHome > $DSH_HOME > ~/.dsh。
  const explicitHome = normalized.dshHome !== '' ? resolve(normalized.dshHome) : '';
  const envHome = envValue(env, 'DSH_HOME');
  const source = explicitHome !== ''
    ? PATH_SOURCES.CONFIG_DSH_HOME
    : envHome !== ''
      ? PATH_SOURCES.ENV_DSH_HOME
      : PATH_SOURCES.DEFAULT_DSH_HOME;
  const home = explicitHome !== '' ? explicitHome : resolveDshHome(env);
  return {
    filePath: join(home, PROFILES_DIR, normalized.profile, PATCH_FILE),
    profile: normalized.profile,
    dshHome: home,
    source,
  };
}

/**
 * 解析 patch 文件绝对路径（`resolvePatchTarget` 的 `.filePath` 视图）。
 *
 * @param {{ profile?: string, dshHome?: string, patchFile?: string }} [config] 插件配置（未归一化也可）。
 * @param {Record<string, unknown>} [env] 环境变量表。
 * @param {unknown} [profileContext] 宿主 `profileContext`（可为 undefined）。
 * @returns {string} patch 文件绝对路径。
 */
export function resolvePatchPath(config = {}, env = process.env, profileContext = undefined) {
  return resolvePatchTarget(config, env, profileContext).filePath;
}

/**
 * 展示用路径：把**用户主目录**前缀折叠成 `~`，其余原样。
 *
 * 路径要出现在 UI 上（「写入位置 ~/.dsh/profiles/desktop/cordis.patch.yml」），
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
