/**
 * 页面头部：标题 + 副标题 + 主按钮 + 刷新。
 *
 * 刷新只在"列表里有东西"时才渲染：空态下方的空态卡片已经有一个「添加 MCP」
 * 主按钮，刷新一个空列表不会有任何变化，那个按钮只会让人以为漏加载了什么。
 *
 * 搜索框与状态筛选是 P1-2，**本版不渲染**（留空而不是渲染一个禁用的输入框——
 * 一个点不动的搜索框比没有更让人困惑）。
 */
import React from 'react';
import { PlusIcon, RefreshIcon } from './Icons.jsx';

/**
 * @param {object} props 属性。
 * @param {boolean} [props.busy] 是否正在刷新。
 * @param {boolean} [props.showRefresh] 是否渲染刷新按钮（列表非空才渲染）。
 * @param {() => void} props.onAdd 点击「添加 MCP」。
 * @param {() => void} props.onRefresh 点击刷新。
 * @returns {JSX.Element} 头部。
 */
export function Toolbar({ busy = false, showRefresh = false, onAdd, onRefresh }) {
  return (
    <div className="dshmcp-head">
      <div>
        <h2 className="dshmcp-title">MCP 服务器</h2>
        <p className="dshmcp-subtitle">管理已接入的 MCP 服务器。</p>
      </div>
      <div className="dshmcp-actions">
        {showRefresh ? (
          <button
            type="button"
            className="dshmcp-btn is-ghost"
            onClick={onRefresh}
            disabled={busy}
            title="刷新列表"
            aria-label="刷新列表"
          >
            <RefreshIcon />
          </button>
        ) : null}
        <button type="button" className="dshmcp-btn" onClick={onAdd}>
          <PlusIcon />
          添加 MCP
        </button>
      </div>
    </div>
  );
}
