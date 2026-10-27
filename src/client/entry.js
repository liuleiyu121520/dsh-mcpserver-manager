/**
 * 客户端 bundle 入口。
 *
 * dsh 的客户端加载器（window.__ModuleLoader__）要的形态就是 `{ inject, apply }`；
 * 本文件只做再导出，真正的注册逻辑在 launchpad.js（唯一宿主耦合点）。
 */
export { apply, inject } from './launchpad.js';
