/**
 * 页面头部：标题 + 副标题 + **写入位置条** + 主按钮 + 刷新。
 *
 * 写入位置条是 BUG-2 的直接产物：用户上次的困惑是「加了但工具没出现」，
 * 根本原因是他看不出配置写进了哪个 profile。所以这里把「当前实际写入的文件
 * 绝对路径 + profile 名 + 这条路径是谁决定的」三件事并排铺在页面顶部，
 * 一眼就能核对——而不是藏在一句副文案的句子里。
 *
 * 搜索框与状态筛选是 P1-2，**本版不渲染**（留空而不是渲染一个禁用的输入框——
 * 一个点不动的搜索框比没有更让人困惑）。
 */
import React from 'react';
import { PlusIcon, RefreshIcon } from './Icons.jsx';

/**
 * 路径来源 → 一句人话。键与 `paths.js` 的 `PATH_SOURCES` 值一一对应；
 * 未知来源返回空串（不显示，绝不编造解释）。
 * @type {Readonly<Record<string, string>>}
 */
const SOURCE_NOTE = Object.freeze({
  'config.patchFile': '由插件配置 config.patchFile 指定',
  profileContext: '由当前宿主 profile 决定',
  'config.dshHome': '由插件配置 dshHome 指定',
  '$DSH_HOME': '由环境变量 $DSH_HOME 决定',
  '~/.dsh': '宿主未报告 profile，已回落到默认位置',
});

/**
 * @param {object} props 属性。
 * @param {string} [props.fileDisplay] 配置文件展示路径。
 * @param {string} [props.profile] 实际生效的 profile 名。
 * @param {string} [props.source] 路径来源（见 `paths.js` 的 `PATH_SOURCES`）。
 * @param {boolean} [props.busy] 是否正在刷新。
 * @param {() => void} props.onAdd 点击「添加 MCP」。
 * @param {() => void} props.onRefresh 点击刷新。
 * @returns {JSX.Element} 头部。
 */
export function Toolbar({ fileDisplay = '', profile = '', source = '', busy = false, onAdd, onRefresh }) {
  const note = typeof SOURCE_NOTE[source] === 'string' ? SOURCE_NOTE[source] : '';
  return (
    <>
      <div className="dshmcp-head">
        <div>
          <h2 className="dshmcp-title">MCP 服务器</h2>
          <p className="dshmcp-subtitle">
            管理已接入的 MCP 服务器。配置只写入下面这个文件的受管段，profile 不同则宿主读取的文件也不同。
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

      <div className="dshmcp-target">
        <span className="dshmcp-target-label">写入位置</span>
        <code className="dshmcp-target-path">{fileDisplay === '' ? '正在解析…' : fileDisplay}</code>
        {profile === '' ? null : <span className="dshmcp-chip">profile: {profile}</span>}
        {note === '' ? null : <span className="dshmcp-target-note">{note}</span>}
      </div>
    </>
  );
}
