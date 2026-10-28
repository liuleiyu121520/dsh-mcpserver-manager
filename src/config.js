/**
 * 插件自身 Config 的 schema 与归一化。
 *
 * cordis 层的 `config` 是用户手写的，写错不该让插件消失——所以
 * `normalizeConfig()` **永不抛错**，任何未知/非法值一律回落默认值。
 */
import { isAbsolute } from 'node:path';

/** @typedef {{ profile: string, backup: boolean, dshHome: string, patchFile: string, probeHeaders: boolean }} PluginConfig */

/**
 * 默认值。
 *
 * - `dshHome` 为空串表示「未显式指定」，此时走宿主 `profileContext` → `$DSH_HOME` → `~/.dsh`；
 * - `patchFile` 为空串表示「未显式指定到文件」，是给测试与高级用户的**最高优先级**
 *   逃生门：正常运行永远走宿主给的 `profileContext.patchPath`；
 * - `probeHeaders` 决定健康检查**要不要带上条目里配置的请求头**。默认 `true`：
 *   不带的话，任何需要鉴权的服务都只能回一句"401 需要鉴权"，探测等于没用。
 *   介意密钥离开宿主的话可以关掉，代价是那类服务永远只能得到"需留意"。
 * @type {Readonly<PluginConfig>}
 */
export const DEFAULT_CONFIG = Object.freeze({
  profile: 'web',
  backup: true,
  dshHome: '',
  patchFile: '',
  probeHeaders: true,
});

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
  // 显式文件路径：只接受**绝对路径**。相对路径会被 `resolve()` 解析成
  // 「相对宿主 cwd」，那正是本 BUG 的同款陷阱（用户以为写到了 X，实际写到 Y），
  // 所以宁可视为未设置，让它回落到宿主权威路径。
  const patchFile =
    typeof source.patchFile === 'string' &&
    source.patchFile.trim() !== '' &&
    isAbsolute(source.patchFile.trim())
      ? source.patchFile.trim()
      : DEFAULT_CONFIG.patchFile;
  const probeHeaders =
    typeof source.probeHeaders === 'boolean' ? source.probeHeaders : DEFAULT_CONFIG.probeHeaders;
  return { profile, backup, dshHome, patchFile, probeHeaders };
}
