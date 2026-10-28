/**
 * 空态：图标 + 主文案 + 主按钮。
 *
 * 空态是**默认路径**而不是异常路径——目标文件里通常一条 MCP 都没有，所以
 * 这里是新用户看到的第一屏。文案只说"能做什么"，路径不再铺在这里
 * （用户在添加弹窗里会看到将要写入的 serverName 与传输方式）。
 */
import React from 'react';
import { EmptyIcon, PlusIcon } from './Icons.jsx';

/**
 * @param {object} props 属性。
 * @param {() => void} props.onAdd 点击「添加 MCP」。
 * @returns {JSX.Element} 空态。
 */
export function EmptyState({ onAdd }) {
  return (
    <div className="dshmcp-empty">
      <span className="dshmcp-empty-icon">
        <EmptyIcon />
      </span>
      <p className="dshmcp-empty-title">还没有配置 MCP 服务器</p>
      <p className="dshmcp-empty-text">粘贴 JSON 配置即可接入，支持 Claude / Cursor 格式。</p>
      <button type="button" className="dshmcp-btn" onClick={onAdd}>
        <PlusIcon />
        添加 MCP
      </button>
    </div>
  );
}
