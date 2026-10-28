/**
 * 页面头部：标题 + 副标题（含版本号）+ 刷新 + 主按钮。
 *
 * 两条"什么时候不渲染"的规则，都是为了不出现"点了没反应"的控件：
 * 1. **列表为空时整块动作区都不渲染**（刷新 + 添加）：空态卡片里已经有一个
 *    「添加 MCP」主按钮，头上再来一个只是重复；刷新一个空列表也不会有任何
 *    变化，那个按钮只会让人以为漏加载了什么；
 * 2. **版本号是按钮**：点它手动检查更新，并把结果用 toast 说出来。没有这个
 *    入口的话，"自动检查失败过一次"的用户就再也没法重试了（除非重启）。
 *
 * 搜索框与状态筛选是 P1-2，**本版不渲染**（留空而不是渲染一个禁用的输入框——
 * 一个点不动的搜索框比没有更让人困惑）。
 */
import React from 'react';
import { PlusIcon, RefreshIcon } from './Icons.jsx';

/**
 * @param {object} props 属性。
 * @param {boolean} [props.busy] 是否有操作进行中（会禁用按钮）。
 * @param {boolean} [props.refreshing] 是否正在刷新（图标转起来）。
 * @param {boolean} [props.showActions] 是否渲染动作区（列表非空才渲染）。
 * @param {string} [props.version] 插件版本号（空串则不渲染版本按钮）。
 * @param {boolean} [props.checking] 是否正在查更新。
 * @param {() => void} props.onAdd 点击「添加 MCP」。
 * @param {() => void} props.onRefresh 点击刷新。
 * @param {() => void} props.onCheckUpdate 点击版本号。
 * @returns {JSX.Element} 头部。
 */
export function Toolbar({
  busy = false,
  refreshing = false,
  showActions = false,
  version = '',
  checking = false,
  onAdd,
  onRefresh,
  onCheckUpdate,
}) {
  return (
    <div className="dshmcp-head">
      <div>
        <h2 className="dshmcp-title">MCP 服务器</h2>
        <p className="dshmcp-subtitle">
          管理已接入的 MCP 服务器。
          {version === '' ? null : (
            <button
              type="button"
              className="dshmcp-version"
              onClick={onCheckUpdate}
              disabled={checking === true}
              title="点击检查更新"
            >
              {checking === true ? '检查中…' : `v${version}`}
            </button>
          )}
        </p>
      </div>
      {showActions === true ? (
        <div className="dshmcp-actions">
          <button
            type="button"
            className={refreshing === true ? 'dshmcp-btn is-ghost dshmcp-spin' : 'dshmcp-btn is-ghost'}
            onClick={onRefresh}
            disabled={busy || refreshing}
            title="刷新列表"
            aria-label="刷新列表"
            aria-busy={refreshing === true}
          >
            <RefreshIcon />
          </button>
          <button type="button" className="dshmcp-btn" onClick={onAdd}>
            <PlusIcon />
            添加 MCP
          </button>
        </div>
      ) : null}
    </div>
  );
}
