/**
 * 单张 MCP 卡片。
 *
 * 信息层次（从上到下）：状态点 + 名称 + 传输/停用 chip → 命令行 → 环境/请求头/
 * 超时 → 工具列表（可展开）。
 *
 * 只读条目（`managed:false`）不渲染任何写操作入口——能看见但点不动的操作比
 * 没有更糟，所以开关与菜单直接不渲染。健康检查与工具列表**照旧可用**：那是
 * 读操作，对用户手写的条目一样有价值。
 *
 * 健康检查的结论**不在卡片里留痕**：那一块常驻的长文案（结论 + 耗时 + 一段
 * 解释）在列表里占掉三行，而它只在点下去的那一刻有用。结论改走 toast，卡片
 * 只保留那个心跳按钮本身。
 */
import React, { useState } from 'react';
import { ChevronIcon, MoreIcon, PulseIcon } from './Icons.jsx';
import { Switch } from './Switch.jsx';

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
 * 工具列表为空时的那句话。
 *
 * 三件事必须分开说：停用了（本来就不注册）、刚重启（连接还没建好）、真的一个
 * 工具都没有。混成一句"暂无工具"，用户就不知道要不要动手。
 * @param {object} item ServerItem。
 * @param {object|null} catalog 工具表。
 * @returns {string} 说明。
 */
function emptyToolNote(item, catalog) {
  if (item.enabled !== true) return '该服务器已停用，工具不会注册。';
  if (catalog !== null && catalog.available === false) return '宿主没有提供 tools 服务，读不到工具列表。';
  return '当前没有注册任何工具：若刚改过配置，重启 DSH 后才会生效；否则看 DSH 日志里的连接错误。';
}

/**
 * @param {object} props 属性。
 * @param {object} props.item ServerItem。
 * @param {boolean} [props.highlighted] 是否新条目高亮。
 * @param {boolean} [props.busy] 是否有操作进行中。
 * @param {(name: string, enabled: boolean) => void} props.onToggle 启停。
 * @param {(name: string) => void} props.onRemove 删除。
 * @param {(name: string) => void} props.onEdit 编辑。
 * @param {(name: string) => Promise<object|null>} props.onHealth 健康检查。
 * @param {(name: string) => Promise<object|null>} props.onLoadTools 读工具表。
 * @returns {JSX.Element} 卡片。
 */
export function ServerCard({
  item,
  highlighted = false,
  onToggle,
  onRemove,
  onEdit,
  onHealth,
  onLoadTools,
  busy = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  const name = typeof item.serverName === 'string' && item.serverName !== '' ? item.serverName : '（无法解析）';
  const canOperate = item.managed === true && item.parsable === true;
  const className = [
    'dshmcp-card',
    item.enabled === true ? '' : 'is-off',
    highlighted === true ? 'is-new' : '',
  ]
    .filter((part) => part !== '')
    .join(' ');

  // 旧版 Host 不会带这两个字段：toolCount 为 null 时整块工具区不渲染，
  // 而不是显示一个"共 0 个工具"的假结论。
  const toolCount = typeof item.toolCount === 'number' ? item.toolCount : null;

  /**
   * 关闭菜单并执行动作。
   * @param {() => void} action 动作。
   * @returns {void}
   */
  const run = (action) => {
    setMenuOpen(false);
    action();
  };

  /**
   * 展开/收起工具列表。首次展开才去请求，收起不丢缓存。
   * @returns {Promise<void>} 完成即 resolve。
   */
  const toggleTools = async () => {
    if (toolsOpen === true) {
      setToolsOpen(false);
      return;
    }
    setToolsOpen(true);
    if (catalog !== null || typeof onLoadTools !== 'function') return;
    setToolsLoading(true);
    try {
      setCatalog(await onLoadTools(name));
    } finally {
      setToolsLoading(false);
    }
  };

  /**
   * 跑一次健康检查。结论由上层弹 toast，这里只管"正在查"这一件事。
   * @returns {Promise<void>} 完成即 resolve。
   */
  const runHealth = async () => {
    if (checking === true || typeof onHealth !== 'function') return;
    setChecking(true);
    try {
      await onHealth(name);
    } finally {
      setChecking(false);
    }
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
        {item.parsable === false ? null : (
          <button
            type="button"
            className={checking === true ? 'dshmcp-btn is-ghost dshmcp-spin' : 'dshmcp-btn is-ghost'}
            disabled={checking === true}
            onClick={runHealth}
            title="健康检查"
            aria-label="健康检查"
          >
            <PulseIcon />
          </button>
        )}
        {item.disabledBy === 'expression' ? (
          <span className="dshmcp-chip is-off" title="该条目的启用状态由 !!js 表达式控制">表达式控制</span>
        ) : canOperate ? (
          <Switch
            checked={item.enabled === true}
            disabled={busy === true}
            label={`${item.enabled === true ? '停用' : '启用'} ${name}`}
            onChange={(next) => onToggle(name, next)}
          />
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
            {/* 透明垫层：点页面任何地方都关菜单。
                用垫层而不是 document 上的 mousedown 监听，是因为它**不依赖
                事件时序与冒泡**——点菜单项时垫层在下面、点外面时它接到，
                两条路径互不干扰，也不用担心 SSR / 测试环境里没有 document。 */}
            {menuOpen ? (
              <div
                className="dshmcp-menu-backdrop"
                onClick={() => setMenuOpen(false)}
                aria-hidden="true"
              />
            ) : null}
            {menuOpen ? (
              <div className="dshmcp-menu">
                <button type="button" className="dshmcp-menu-item" onClick={() => run(() => onEdit(name))}>
                  编辑
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
            {Array.isArray(item.headerKeys) && item.headerKeys.length > 0 ? (
              <span className="dshmcp-meta-item">
                请求头 {item.headerKeys.join('、')} <span className="dshmcp-mask">••••</span>
              </span>
            ) : null}
            <span className="dshmcp-meta-item">超时 {formatTimeout(item.toolCallTimeoutMs)}</span>
            {typeof item.cwd === 'string' ? <span className="dshmcp-meta-item">目录 {item.cwd}</span> : null}
          </div>
        </React.Fragment>
      )}

      {toolCount === null || item.parsable !== true ? null : (
        <div className="dshmcp-tools">
          <button
            type="button"
            className="dshmcp-tools-toggle"
            onClick={toggleTools}
            aria-expanded={toolsOpen === true}
          >
            <ChevronIcon open={toolsOpen === true} />
            {item.toolsAvailable === false ? '工具数未知' : `共 ${toolCount} 个工具`}
          </button>
          {toolsOpen !== true ? null : toolsLoading === true ? (
            <div className="dshmcp-tools-note">读取中…</div>
          ) : catalog === null ? (
            <div className="dshmcp-tools-note">无法读取工具列表。</div>
          ) : catalog.tools.length === 0 ? (
            <div className="dshmcp-tools-note">{emptyToolNote(item, catalog)}</div>
          ) : (
            <div className="dshmcp-tools-list">
              {catalog.tools.map((tool) => (
                <div className="dshmcp-tool" key={tool.name}>
                  <div className="dshmcp-tool-head">
                    <span className="dshmcp-tool-name">{tool.rawName}</span>
                    <span className="dshmcp-tool-params">
                      {tool.parameters === 0 ? '无参数' : `${tool.parameters} 个参数`}
                    </span>
                  </div>
                  {tool.description === '' ? null : (
                    <div className="dshmcp-tool-desc" title={tool.description}>
                      {tool.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
