/**
 * 单张 MCP 卡片：状态点 / 名称 / 命令行 / 元信息 / ⋯ 菜单 / 启停。
 *
 * 只读条目（`managed:false`）不渲染任何写操作入口——能看见但点不动的操作
 * 比没有更糟，所以直接不渲染。
 */
import React, { useState } from 'react';
import { MoreIcon } from './Icons.jsx';

/**
 * 把毫秒渲染成"60s"。
 * @param {number|null} ms 毫秒。
 * @returns {string} 文本。
 */
function formatTimeout(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '默认';
  return `${Math.round(ms / 1000)}s`;
}

/**
 * @param {object} props 属性。
 * @param {object} props.item ServerItem。
 * @param {boolean} [props.highlighted] 是否新条目高亮。
 * @param {(name: string, enabled: boolean) => void} props.onToggle 启停。
 * @param {(name: string) => void} props.onRemove 删除。
 * @param {boolean} [props.busy] 是否有操作进行中。
 * @returns {JSX.Element} 卡片。
 */
export function ServerCard({ item, highlighted = false, onToggle, onRemove, busy = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const name = typeof item.serverName === 'string' && item.serverName !== '' ? item.serverName : '（无法解析）';
  const canOperate = item.managed === true && item.parsable === true;
  const className = [
    'dshmcp-card',
    item.enabled === true ? '' : 'is-off',
    highlighted === true ? 'is-new' : '',
  ]
    .filter((part) => part !== '')
    .join(' ');

  /**
   * 关闭菜单并执行动作。
   * @param {() => void} action 动作。
   * @returns {void}
   */
  const run = (action) => {
    setMenuOpen(false);
    action();
  };

  return (
    <div className={className}>
      <div className="dshmcp-card-head">
        <span className={`dshmcp-dot${item.enabled === true ? '' : ' is-off'}`} />
        <span className="dshmcp-card-title">{name}</span>
        {typeof item.transport === 'string' ? <span className="dshmcp-chip">{item.transport}</span> : null}
        {item.enabled === true ? null : <span className="dshmcp-chip is-off">已停用</span>}
        {item.parsable === false ? <span className="dshmcp-chip is-off">无法解析 · 只读</span> : null}
        <span className="dshmcp-card-spacer" />
        {item.disabledBy === 'expression' ? (
          <span className="dshmcp-chip is-off" title="该条目的启用状态由 !!js 表达式控制">表达式控制</span>
        ) : canOperate ? (
          <button
            type="button"
            className="dshmcp-btn is-secondary"
            disabled={busy}
            onClick={() => onToggle(name, item.enabled !== true)}
          >
            {item.enabled === true ? '停用' : '启用'}
          </button>
        ) : null}
        {canOperate ? (
          <div className="dshmcp-card-menu">
            <button
              type="button"
              className="dshmcp-btn is-ghost"
              disabled={busy}
              onClick={() => setMenuOpen(!menuOpen)}
              title="更多操作"
              aria-label="更多操作"
            >
              <MoreIcon />
            </button>
            {menuOpen ? (
              <div className="dshmcp-menu">
                <button
                  type="button"
                  className="dshmcp-menu-item"
                  disabled
                  title="编辑（即将上线）"
                >
                  编辑（即将上线）
                </button>
                <button
                  type="button"
                  className="dshmcp-menu-item"
                  disabled
                  title="复制为 JSON（即将上线）"
                >
                  复制为 JSON（即将上线）
                </button>
                <button
                  type="button"
                  className="dshmcp-menu-item"
                  onClick={() => run(() => onToggle(name, item.enabled !== true))}
                >
                  {item.enabled === true ? '停用' : '启用'}
                </button>
                <button
                  type="button"
                  className="dshmcp-menu-item is-danger"
                  onClick={() => run(() => onRemove(name))}
                >
                  删除
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {item.parsable === false ? (
        <pre className="dshmcp-raw">{item.raw}</pre>
      ) : (
        <React.Fragment>
          <div className="dshmcp-cmd" title={item.summary}>
            {item.summary === '' ? '—' : item.summary}
          </div>
          <div className="dshmcp-sep" />
          <div className="dshmcp-meta">
            <span className="dshmcp-meta-item">
              环境
              {item.envKeys.length === 0 ? (
                <span> 无</span>
              ) : (
                <span>
                  {' '}
                  {item.envKeys.join('、')} <span className="dshmcp-mask">••••</span>
                </span>
              )}
            </span>
            <span className="dshmcp-meta-item">超时 {formatTimeout(item.toolCallTimeoutMs)}</span>
            {typeof item.cwd === 'string' ? <span className="dshmcp-meta-item">目录 {item.cwd}</span> : null}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}
