/**
 * 添加 MCP 弹窗：JSON 编辑器 + 示例下拉 + 实时错误区 + 写入位置提示。
 *
 * 校验用的是 `../validate.js` —— **与 Host 后端同一个文件**（esbuild 把它内联
 * 进本 bundle），所以"前端判过的后端一定判过"，不存在两份规则漂移。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { validateServerInput } from '../validate.js';
import { InfoIcon, WarningIcon } from './Icons.jsx';

/** 两套示例（stdio / streamable-http），与官方配置格式 1:1。 */
const SAMPLES = Object.freeze([
  Object.freeze({
    label: 'stdio（本地命令）',
    value: JSON.stringify(
      {
        serverName: 'github',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_TOKEN: '!!js process.env.GITHUB_TOKEN' },
      },
      null,
      2,
    ),
  }),
  Object.freeze({
    label: 'streamable-http（远程服务）',
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
 * @param {string} [props.fileDisplay] 配置文件展示路径。
 * @param {string[]} [props.existingServerNames] 已占用的 serverName。
 * @param {string[]} [props.existingIds] 已占用的条目 id。
 * @param {(raw: string) => Promise<void>} props.onSubmit 提交；抛错时弹窗保持打开。
 * @param {() => void} props.onCancel 取消。
 * @returns {JSX.Element} 弹窗。
 */
export function AddDialog({ fileDisplay = '', existingServerNames = [], existingIds = [], onSubmit, onCancel }) {
  const [text, setText] = useState(SAMPLES[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [remoteError, setRemoteError] = useState('');

  const result = useMemo(
    () => validateServerInput(text, { existingServerNames, existingIds }),
    [text, existingServerNames, existingIds],
  );
  const issues = result.issues.filter((issue) => issue.level === 'error' || issue.level === 'warn');
  const canSubmit = result.ok === true && submitting === false;

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
          <h3 className="dshmcp-dialog-title">添加 MCP 服务器</h3>
          <button type="button" className="dshmcp-btn is-ghost" onClick={onCancel} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="dshmcp-dialog-body">
          <div className="dshmcp-field">
            <span className="dshmcp-field-label">JSON 配置</span>
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
                <span>{remoteError}</span>
              </div>
            </div>
          )}

          <div className="dshmcp-hint">
            <span className="dshmcp-hint-icon">
              <InfoIcon />
            </span>
            <span>
              写入位置
              {fileDisplay === '' ? ' MCP 维护配置文件' : <span className="dshmcp-path"> {fileDisplay}</span>}
              ；保存后 DSH 将自动热重载，无需重启。
            </span>
          </div>
        </div>
        <div className="dshmcp-dialog-foot">
          <button type="button" className="dshmcp-btn is-secondary" onClick={onCancel} disabled={submitting}>
            取消
          </button>
          <button type="button" className="dshmcp-btn" onClick={submit} disabled={!canSubmit}>
            {submitting ? '提交中…' : '确定'}
          </button>
        </div>
      </div>
    </div>
  );
}
