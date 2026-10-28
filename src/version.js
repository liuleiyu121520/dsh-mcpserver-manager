/**
 * 插件版本 —— Host 与客户端**唯一同源**的版本常量。
 *
 * 为什么需要它：DSH 的客户端 bundle 与 Host 半是两个加载时机——页面刷新就会
 * 重新取 `lib/client.js`，而 Host 的模块图只在**进程启动时**加载一次。于是
 * 「刚升级、还没重启宿主」这段时间里，页面是新的、Host 是旧的，两边跑同一份
 * `validate.js` 的两个不同版本，用户看到的就是「一条警告 + 一条自相矛盾的报错」。
 *
 * Host 在 `GET /servers` 里带上自己的版本，页面拿它跟这个常量比，不一致就明说
 * 「运行中的 Host 是旧版本，重启 DSH」。**版本号必须与 package.json 一致**，
 * 由 `tests/version.test.js` 守着。
 *
 * 它同时是**在线更新检查的"当前版本"**（`update.js`）。刻意不从 package.json
 * 读：升级后运行中的 Host 还是旧代码，读文件会得出"已是最新"的假结论。
 */
export const PLUGIN_VERSION = '0.4.4';
