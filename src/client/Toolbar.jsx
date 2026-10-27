/**
 * 页面头部：标题 + 副标题（含写入路径）+ 主按钮 + 刷新。
 *
 * 搜索框与状态筛选是 P1-2，**本版不渲染**（留空而不是渲染一个禁用的输入框——
 * 一个点不动的搜索框比没有更让人困惑）。
 */
import React from 'react';
import { PlusIcon, RefreshIcon } from './Icons.jsx';

/**
 * @param {object} props 属性。
 * @param {string} [props.fileDisplay] 配置文件展示路径。
 * @param {boolean} [props.busy] 是否正在刷新。
 * @param {() => void} props.onAdd 点击「添加 MCP」。
 * @param {() => void} props.onRefresh 点击刷新。
 * @returns {JSX.Element} 头部。
 */
export function Toolbar({ fileDisplay = '', busy = false, onAdd, onRefresh }) {
  return (
    <div className="dshmcp-head">
      <div>
        <h2 className="dshmcp-title">MCP 服务器</h2>
        <p className="dshmcp-subtitle">
          管理已接入的 MCP 服务器。配置将写入当前 DSH 的 MCP 维护配置文件
          {fileDisplay === '' ? '' : <span className="dshmcp-path"> {fileDisplay}</span>}。
        </p>
      </div>
      <div className="dshmcp-actions">
        <button type="button" className="dshmcp-btn is-ghost" onClick={onRefresh} disabled={busy} title="刷新列表" aria-label="刷新列表">
          <RefreshIcon />
        </button>
        <button type="button" className="dshmcp-btn" onClick={onAdd}>
          <PlusIcon />
          添加 MCP
        </button>
      </div>
    </div>
  );
}
