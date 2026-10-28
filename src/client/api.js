/**
 * Host 接口的浏览器侧封装。
 *
 * 全部走**相对路径**（照 `dsh-wallpaper`）：插件不知道自己被挂在哪个 origin 下，
 * 相对路径由浏览器补齐，跨域与端口变更都不用改代码。
 *
 * 错误在这里被统一翻译成"带 code 的 Error"，组件只认 `error.code` 与
 * `error.message`，不需要按 HTTP 状态码分支两套解析路径。
 */

/** API 前缀（与 Host 侧 `PREFIX` 一致）。 */
const BASE = '/api/dsh-mcpserver-manager';

/**
 * 错误码 → 中文文案（架构 §3.5 的十三码 + 通用回落）。
 *
 * @type {Readonly<Record<string, string>>}
 */
const MESSAGES = Object.freeze({
  'invalid-json': 'JSON 语法有误，请对照错误提示修改',
  'invalid-config': '配置校验未通过，请对照错误提示修改',
  'duplicate-server': '同名 MCP 已存在，请换一个 serverName',
  'unknown-server': '该条目已不存在，请刷新列表',
  'readonly-entry': '该条目非本插件管理，无法修改',
  'unparsable-entry': '该条目格式超出可解析范围，请手工编辑配置文件',
  'anchors-broken': '受管段标记被破坏，请手工修复 cordis.patch.yml',
  'file-changed': '配置文件已被外部修改，请刷新后重试',
  'disable-by-expression': '该条目的启用状态由表达式控制，请手工修改',
  'file-unreadable': '无法读取配置文件，请检查文件权限',
  'write-failed': '写入失败，文件已回滚',
  'body-too-large': '配置内容过大',
  'method-not-allowed': '请求方式不被支持',
  'internal-error': '操作失败，请稍后重试',
});

/**
 * 取一个错误码的中文文案。
 * @param {string} code 错误码。
 * @returns {string} 中文文案（未知码回落通用文案）。
 */
export function messageFor(code) {
  return MESSAGES[code] ?? MESSAGES['internal-error'];
}

/**
 * 健康结论 → 一句短标签（卡片、toast 共用）。
 *
 * 文案刻意不用 "健康/不健康"：`degraded`（连得上但没注册工具、需要鉴权）既
 * 不是"坏"也不是"好"，用一个二值标签会把人骗过去。
 * @type {Readonly<Record<string, string>>}
 */
export const HEALTH_LABEL = Object.freeze({
  healthy: '正常',
  degraded: '需留意',
  unreachable: '连不上',
  disabled: '已停用',
  unknown: '未知',
});

/**
 * 健康结论 → 状态类名。
 *
 * 显式映射而不是 `` `is-${status}` ``：拼出来的类名在 CSS 里对不上号时不会报错，
 * 只会安静地没有颜色——那种问题肉眼极难发现。
 * @type {Readonly<Record<string, string>>}
 */
const HEALTH_CLASS = Object.freeze({
  healthy: 'is-ok',
  degraded: 'is-warn',
  unreachable: 'is-bad',
  disabled: 'is-off',
  unknown: 'is-off',
});

/**
 * 取健康结论的展示信息。
 * @param {string} status 状态。
 * @returns {{label: string, className: string}} 文案与类名。
 */
export function healthView(status) {
  const key = typeof status === 'string' ? status : 'unknown';
  return {
    label: HEALTH_LABEL[key] ?? HEALTH_LABEL.unknown,
    className: HEALTH_CLASS[key] ?? HEALTH_CLASS.unknown,
  };
}

/**
 * 把一份健康报告压成一行 toast 文案。
 *
 * 卡片里不再渲染结论条（那是常驻的、挡视线的长文案），但"为什么是需留意"
 * 这个信息不能丢——所以结论、耗时、detail 一起塞进这条一次性提示里。
 * @param {object|null} report 健康报告。
 * @returns {string} 一行文案（空串表示没有结论）。
 */
export function healthSummary(report) {
  if (report === null || typeof report !== 'object') return '';
  const label = healthView(report.status).label;
  const latency = typeof report.latencyMs === 'number' ? ` · ${report.latencyMs}ms` : '';
  const detail = typeof report.detail === 'string' ? report.detail : '';
  return detail === '' ? `${label}${latency}` : `${label}${latency} · ${detail}`;
}

/**
 * 发一个请求并拆信封。
 *
 * @param {string} path 以 `/` 开头的路径。
 * @param {RequestInit} [init] fetch 参数。
 * @returns {Promise<object>} 响应体的 `data`。
 */
async function request(path, init = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      ...init,
    });
  } catch (error) {
    const offline = new Error('网络请求失败，请检查连接后重试');
    offline.code = 'network-error';
    throw offline;
  }

  /** @type {any} */
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    const broken = new Error('服务端返回了无法解析的响应');
    broken.code = 'internal-error';
    throw broken;
  }

  if (response.ok !== true || payload?.ok !== true) {
    const code = typeof payload?.error?.code === 'string' ? payload.error.code : 'internal-error';
    const error = new Error(
      typeof payload?.error?.message === 'string' && payload.error.message !== ''
        ? payload.error.message
        : messageFor(code),
    );
    error.code = code;
    error.errors = Array.isArray(payload?.error?.errors) ? payload.error.errors : [];
    error.rolledBack = payload?.error?.rolledBack === true;
    throw error;
  }
  return payload.data ?? {};
}

/**
 * GET /servers —— 列表。
 * @returns {Promise<object>} 快照。
 */
export function listServers() {
  return request('/servers');
}

/**
 * POST /servers —— 新增。
 * @param {string} raw MCP 配置的 JSON 文本。
 * @returns {Promise<object>} `{item}`。
 */
export function createServer(raw) {
  return request('/servers', { method: 'POST', body: JSON.stringify({ raw }) });
}

/**
 * DELETE /servers/<name> —— 删除。
 * @param {string} serverName 身份键。
 * @returns {Promise<object>} `{removed}`。
 */
export function removeServer(serverName) {
  return request(`/servers/${encodeURIComponent(serverName)}`, { method: 'DELETE' });
}

/**
 * POST /servers/<name>/toggle —— 启停。
 * @param {string} serverName 身份键。
 * @param {boolean} enabled 目标状态。
 * @returns {Promise<object>} `{item, changed}`。
 */
export function toggleServer(serverName, enabled) {
  return request(`/servers/${encodeURIComponent(serverName)}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

/**
 * GET /servers/<name>/config —— 取一条条目的可编辑 JSON。
 *
 * `text` 里的 `env` / `headers` 值全部是空串（Host 绝不下发密钥），回填时
 * 空串表示"沿用原值"（见 `patch-store.js` 的 `restoreSecretValues`）。
 * @param {string} serverName 身份键。
 * @returns {Promise<object>} `{serverName, id, transport, text, maskedKeys}`。
 */
export function readServerConfig(serverName) {
  return request(`/servers/${encodeURIComponent(serverName)}/config`);
}

/**
 * POST /servers/<name>/edit —— 用新 JSON 覆盖原条目。
 * @param {string} serverName 原身份键。
 * @param {string} raw 新的 JSON 文本。
 * @returns {Promise<object>} `{item, renamed}`。
 */
export function editServer(serverName, raw) {
  return request(`/servers/${encodeURIComponent(serverName)}/edit`, {
    method: 'POST',
    body: JSON.stringify({ raw }),
  });
}

/**
 * GET /servers/<name>/tools —— 该服务器注册了哪些工具。
 *
 * 懒加载而不是塞进列表快照：列表只显示数量，描述文本只有在用户真的要看的
 * 时候才值得下载。
 * @param {string} serverName 身份键。
 * @returns {Promise<object>} `{serverName, available, count, tools}`。
 */
export function listServerTools(serverName) {
  return request(`/servers/${encodeURIComponent(serverName)}/tools`);
}

/**
 * POST /servers/<name>/check —— 健康检查。
 * @param {string} serverName 身份键。
 * @returns {Promise<object>} `{report}`。
 */
export function checkServerHealth(serverName) {
  return request(`/servers/${encodeURIComponent(serverName)}/check`, { method: 'POST', body: '{}' });
}

/**
 * GET /update —— 版本检查的缓存结论（不触发网络请求）。
 * @returns {Promise<object>} 结论。
 */
export function getUpdateState() {
  return request('/update');
}

/**
 * POST /update/check —— 真的去 GitHub 查一次。
 * @returns {Promise<object>} 结论。
 */
export function checkUpdateState() {
  return request('/update/check', { method: 'POST', body: '{}' });
}

/**
 * POST /update —— 忽略当前这个新版本。
 * @returns {Promise<object>} 结论。
 */
export function dismissUpdate() {
  return request('/update', { method: 'POST', body: '{}' });
}

/**
 * POST /upgrade —— 开始原地升级（立刻返回，进度靠轮询）。
 * @returns {Promise<object>} `{running, ...}`。
 */
export function beginUpgrade() {
  return request('/upgrade', { method: 'POST', body: '{}' });
}

/**
 * GET /upgrade —— 升级进度。
 * @returns {Promise<object>} `{running, result, error, update}`。
 */
export function readUpgradeState() {
  return request('/upgrade');
}
