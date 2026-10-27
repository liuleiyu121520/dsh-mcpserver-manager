/**
 * 空态：图标 + 主文案 + 副文案（含写入路径）+ 主按钮。
 *
 * 空态是**默认路径**而不是异常路径——目标文件里通常一条 MCP 都没有，所以
 * 这里是新用户看到的第一屏，文案必须说清"配置会写到哪里"。
 */
import React from 'react';
import { EmptyIcon, PlusIcon } from './Icons.jsx';

/**
 * @param {object} props 属性。
 * @param {string} [props.fileDisplay] 配置文件展示路径。
 * @param {() => void} props.onAdd 点击「添加 MCP」。
 * @returns {JSX.Element} 空态。
 */
export function EmptyState({ fileDisplay = '', onAdd }) {
  return (
    <div className="dshmcp-empty">
      <span className="dshmcp-empty-icon">
        <EmptyIcon />
      </span>
      <p className="dshmcp-empty-title">还没有配置 MCP 服务器</p>
      <p className="dshmcp-empty-text">
        粘贴一段 JSON 配置即可接入，配置会写入
        {fileDisplay === '' ? ' MCP 维护配置文件' : <span className="dshmcp-path"> {fileDisplay}</span>}。
      </p>
      <button type="button" className="dshmcp-btn" onClick={onAdd}>
        <PlusIcon />
        添加 MCP
      </button>
    </div>
  );
}
