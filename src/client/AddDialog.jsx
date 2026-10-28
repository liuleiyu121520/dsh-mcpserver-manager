/**
 * 添加 / 编辑 MCP 弹窗：JSON 编辑器 + 示例下拉 + 解析结果行 + 实时错误区。
 *
 * 校验用的是 `../validate.js` —— **与 Host 后端同一个文件**（esbuild 把它内联
 * 进本 bundle），所以"前端判过的后端一定判过"，不存在两份规则漂移。
 *
 * 示例默认给 Claude / Cursor 那种 `{ "mcpServers": { … } }` 形状：用户从各家
 * 文档复制过来的基本都是它，第一屏就给对形状，比让他先踩一次错更省事。
 *
 * **编辑模式**（`mode: 'edit'`）的三处不同，都是为了不误导人：
 * 1. 示例下拉不渲染——点一下就把用户自己的配置整段覆盖掉，是个纯陷阱；
 * 2. 密钥值是**空串**（Host 从不下发密钥），提示行必须说清"留空 = 沿用原值"，
 *    否则用户会以为自己的 token 被删了；
 * 3. 唯一性校验要排除自己（由调用方过滤 `existingServerNames`），不然"只改 url"
 *    会被判成重名。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { validateServerInput } from '../validate.js';
import { InfoIcon, WarningIcon } from './Icons.jsx';

/** 三套示例，覆盖最常见来源。 */
const SAMPLES = Object.freeze([
  Object.freeze({
    label: 'Claude / Cursor · 本地命令',
    value: JSON.stringify(
      {
        mcpServers: {
          github: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_TOKEN: '!!js process.env.GITHUB_TOKEN' },
          },
        },
      },
      null,
      2,
    ),
  }),
  Object.freeze({
    label: 'Claude / Cursor · 远程服务',
    value: JSON.stringify(
      {
        mcpServers: {
          remote: {
            type: 'http',
            url: 'https://example.com/mcp',
            headers: { Authorization: 'Bearer your-token' },
          },
        },
      },
      null,
      2,
    ),
  }),
  Object.freeze({
    label: 'DSH 原生写法',
    value: JSON.stringify(
      {
        serverName: 'remote',
        transport: 'streamable-http',
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer your-token' },
      },
      null,
      2,
    ),
  }),
]);

/**
 * @param {object} props 属性。
 * @param {'create'|'edit'} [props.mode] 模式。
 * @param {string} [props.serverName] 编辑模式下正在改的名字。
 * @param {string} [props.initialText] 编辑模式下的初始 JSON（Host 已把密钥置空）。
 * @param {string[]} [props.maskedKeys] 被置空的密钥字段名。
 * @param {string[]} [props.existingServerNames] 已占用的 serverName。
 * @param {string[]} [props.existingIds] 已占用的条目 id。
 * @param {boolean} [props.staleHost] 运行中的 Host 是不是旧版本。
 * @param {(raw: string) => Promise<void>} props.onSubmit 提交；抛错时弹窗保持打开。
 * @param {() => void} props.onCancel 取消。
 * @returns {JSX.Element} 弹窗。
 */
export function AddDialog({
  mode = 'create',
  serverName = '',
  initialText = '',
  maskedKeys = [],
  existingServerNames = [],
  existingIds = [],
  staleHost = false,
  onSubmit,
  onCancel,
}) {
  const editing = mode === 'edit';
  const [text, setText] = useState(editing && initialText !== '' ? initialText : SAMPLES[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [remoteError, setRemoteError] = useState('');

  const result = useMemo(
    () => validateServerInput(text, { existingServerNames, existingIds }),
    [text, existingServerNames, existingIds],
  );
  const issues = result.issues.filter((issue) => issue.level === 'error' || issue.level === 'warn');
  const canSubmit = result.ok === true && submitting === false;
  const parsed = result.ok === true && result.value !== null ? result.value : null;
  const masked = Array.isArray(maskedKeys) ? maskedKeys : [];

  // 切换示例时清掉上一次的远端错误，避免旧报错一直挂着。
  useEffect(() => {
    setRemoteError('');
  }, [text]);

  /**
   * 提交。
   * @returns {Promise<void>} 完成即 resolve。
   */
  const submit = async () => {
    if (result.ok !== true || submitting === true) return;
    setSubmitting(true);
    setRemoteError('');
    try {
      await onSubmit(text);
    } catch (error) {
      setRemoteError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dshmcp-mask-layer" role="dialog" aria-modal="true">
      <div className="dshmcp-dialog">
        <div className="dshmcp-dialog-head">
          <h3 className="dshmcp-dialog-title">{editing ? '编辑 MCP 服务器' : '添加 MCP 服务器'}</h3>
          <button type="button" className="dshmcp-btn is-ghost" onClick={onCancel} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="dshmcp-dialog-body">
          <div className="dshmcp-field">
            <span className="dshmcp-field-label">JSON 配置</span>
            {editing ? (
              <span className="dshmcp-field-note">
                正在编辑 <span className="dshmcp-path">{serverName}</span>
              </span>
            ) : (
              <select
                className="dshmcp-select"
                value=""
                onChange={(event) => {
                  const sample = SAMPLES.find((item) => item.label === event.target.value);
                  if (sample !== undefined) setText(sample.value);
                }}
              >
                <option value="">填入示例 ▾</option>
                {SAMPLES.map((sample) => (
                  <option key={sample.label} value={sample.label}>
                    {sample.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <textarea
            className="dshmcp-editor"
            spellCheck={false}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />

          {issues.length === 0 ? null : (
            <div className="dshmcp-issues">
              {issues.map((issue) => (
                <div
                  key={`${issue.code}:${issue.path}`}
                  className={`dshmcp-issue ${issue.level === 'warn' ? 'is-warn' : 'is-error'}`}
                >
                  <WarningIcon />
                  <span>
                    {typeof issue.line === 'number' ? `第 ${issue.line} 行：` : ''}
                    {issue.message}
                  </span>
                </div>
              ))}
            </div>
          )}
          {remoteError === '' ? null : (
            <div className="dshmcp-issues">
              <div className="dshmcp-issue is-error">
                <WarningIcon />
                <span>
                  {/* 标明来源：本地校验与 Host 校验用的虽同一份规则，但 Host 可能
                      是重启前的旧版本，两者说法不一致时必须能分清是谁在拦。 */}
                  服务端未通过：{remoteError}
                  {staleHost === true ? '（Host 是旧版本，重启 DSH 后重试）' : ''}
                </span>
              </div>
            </div>
          )}

          {parsed === null ? null : (
            <div className="dshmcp-hint">
              <span className="dshmcp-hint-icon">
                <InfoIcon />
              </span>
              <span>
                将写入 <span className="dshmcp-path">{parsed.serverName}</span> · {parsed.transport}
                {parsed.disabled === true ? ' · 默认停用' : ''}
                {editing && parsed.serverName !== serverName ? ' · 改名会替换掉原条目' : ''}
              </span>
            </div>
          )}

          {editing === false ? null : (
            <div className="dshmcp-hint">
              <span className="dshmcp-hint-icon">
                <InfoIcon />
              </span>
              <span>
                {masked.length === 0 ? '本条目没有密钥字段。' : `${masked.join('、')} 的值已隐藏，留空表示沿用原值。`}
              </span>
            </div>
          )}
        </div>
        <div className="dshmcp-dialog-foot">
          <button type="button" className="dshmcp-btn is-secondary" onClick={onCancel} disabled={submitting}>
            取消
          </button>
          <button type="button" className="dshmcp-btn" onClick={submit} disabled={!canSubmit}>
            {submitting ? '提交中…' : editing ? '保存' : '确定'}
          </button>
        </div>
      </div>
    </div>
  );
}
