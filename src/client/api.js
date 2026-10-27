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
