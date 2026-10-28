/**
 * 卡片列表：受管分组 + 「非本插件管理 · 只读」分组。
 *
 * 只读分组采用**分组标题 + 卡片置灰**而不是列表底部一行灰字（team-lead 裁决
 * A4）：用户手写的、别的插件写的 MCP 条目同样是"当前接入情况"的一部分，
 * 该被看见，只是不能由本插件改写。
 */
import React from 'react';
import { ServerCard } from './ServerCard.jsx';

/**
 * @param {object} props 属性。
 * @param {object[]} props.items ServerItem 列表。
 * @param {string} [props.highlighted] 需要高亮的 serverName。
 * @param {boolean} [props.busy] 是否有操作进行中。
 * @param {(name: string, enabled: boolean) => void} props.onToggle 启停。
 * @param {(name: string) => void} props.onRemove 删除。
 * @param {(name: string) => void} props.onEdit 编辑。
 * @param {(name: string) => Promise<object|null>} props.onHealth 健康检查。
 * @param {(name: string) => Promise<object|null>} props.onLoadTools 读工具表。
 * @returns {JSX.Element} 列表。
 */
export function ServerList({
  items,
  highlighted = '',
  busy = false,
  onToggle,
  onRemove,
  onEdit,
  onHealth,
  onLoadTools,
}) {
  const managed = items.filter((item) => item.managed === true);
  const readonly = items.filter((item) => item.managed !== true);
  return (
    <React.Fragment>
      {managed.length === 0 ? null : (
        <div className="dshmcp-group">
          {managed.map((item) => (
            <ServerCard
              key={item.serverName ?? item.raw}
              item={item}
              highlighted={highlighted !== '' && item.serverName === highlighted}
              busy={busy}
              onToggle={onToggle}
              onRemove={onRemove}
              onEdit={onEdit}
              onHealth={onHealth}
              onLoadTools={onLoadTools}
            />
          ))}
        </div>
      )}
      {readonly.length === 0 ? null : (
        <div className="dshmcp-group is-readonly">
          <p className="dshmcp-group-title">非本插件管理 · 只读</p>
          {readonly.map((item) => (
            <ServerCard
              key={item.serverName ?? item.raw}
              item={item}
              busy={busy}
              onToggle={onToggle}
              onRemove={onRemove}
              onHealth={onHealth}
              onLoadTools={onLoadTools}
            />
          ))}
        </div>
      )}
    </React.Fragment>
  );
}
