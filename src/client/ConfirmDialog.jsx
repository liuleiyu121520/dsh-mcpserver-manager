/**
 * 删除二次确认弹窗。
 *
 * 删除是**不可逆**的（虽然写盘前有 `.bak`，但用户不一定知道怎么找回），
 * 所以必须走一次显式确认，且危险按钮是红字而不是实心主按钮——一个视图里
 * 只应有一个实心主按钮（PRD §4.5-6）。
 */
import React from 'react';
import { WarningIcon } from './Icons.jsx';

/**
 * @param {object} props 属性。
 * @param {string} props.serverName 待删除的 MCP 名称。
 * @param {boolean} [props.busy] 是否正在提交。
 * @param {() => Promise<void>} props.onConfirm 确认（抛错时由调用方处理）。
 * @param {() => void} props.onCancel 取消。
 * @returns {JSX.Element} 弹窗。
 */
export function ConfirmDialog({ serverName, busy = false, onConfirm, onCancel }) {
  const [pending, setPending] = React.useState(false);
  const working = busy || pending;

  /**
   * 确认删除。
   * @returns {Promise<void>} 完成即 resolve。
   */
  const confirm = async () => {
    if (working === true) return;
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="dshmcp-mask-layer" role="dialog" aria-modal="true">
      <div className="dshmcp-dialog">
        <div className="dshmcp-dialog-head">
          <h3 className="dshmcp-dialog-title">删除 MCP 服务器</h3>
          <button type="button" className="dshmcp-btn is-ghost" onClick={onCancel} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="dshmcp-dialog-body">
          <div className="dshmcp-issue is-error">
            <WarningIcon />
            <span>
              确定要删除 <strong>{serverName}</strong> 吗？该条目会从受管段移除，其配置将不再生效。
            </span>
          </div>
          <div className="dshmcp-hint">
            <span>删除前会自动备份一份到配置文件的 .bak，需要时可手工恢复。</span>
          </div>
        </div>
        <div className="dshmcp-dialog-foot">
          <button type="button" className="dshmcp-btn is-secondary" onClick={onCancel} disabled={working}>
            取消
          </button>
          <button type="button" className="dshmcp-btn is-danger" onClick={confirm} disabled={working}>
            {working ? '删除中…' : '删除'}
          </button>
        </div>
      </div>
    </div>
  );
}
