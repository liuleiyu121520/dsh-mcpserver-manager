/**
 * 插件自身 Config 的 schema 与归一化。
 *
 * cordis 层的 `config` 是用户手写的，写错不该让插件消失——所以
 * `normalizeConfig()` **永不抛错**，任何未知/非法值一律回落默认值。
 */

/** @typedef {{ profile: string, backup: boolean, dshHome: string }} PluginConfig */

/**
 * 默认值。`dshHome` 为空串表示「未显式指定」，此时走 `$DSH_HOME` → `~/.dsh`。
 * @type {Readonly<PluginConfig>}
 */
export const DEFAULT_CONFIG = Object.freeze({ profile: 'web', backup: true, dshHome: '' });

/** profile 名的合法形状：目录名，只允许安全字符。 */
const PROFILE_RE = /^[A-Za-z0-9_-]{1,32}$/;

/**
 * 归一化配置。
 *
 * @param {unknown} raw cordis 层传入的 config（通常是普通对象）。
 * @returns {PluginConfig} 归一化后的配置（新对象，调用方可随意改）。
 */
export function normalizeConfig(raw) {
  const source = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const profile =
    typeof source.profile === 'string' && PROFILE_RE.test(source.profile.trim())
      ? source.profile.trim()
      : DEFAULT_CONFIG.profile;
  const backup = typeof source.backup === 'boolean' ? source.backup : DEFAULT_CONFIG.backup;
  // 显式路径：空白串视为未设置（绝不能解析成当前工作目录）。
  const dshHome =
    typeof source.dshHome === 'string' && source.dshHome.trim() !== ''
      ? source.dshHome.trim()
      : DEFAULT_CONFIG.dshHome;
  return { profile, backup, dshHome };
}
