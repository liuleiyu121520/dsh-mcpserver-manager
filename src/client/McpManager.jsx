/**
 * 页面容器：拉数据 / 三态分发 / 全局 banner / 新条目高亮 / 增删改的操作编排。
 *
 * 样式以 `<style>{CSS}</style>` 内联渲染（照 `dsh-hub` 实测写法）——客户端
 * bundle 是单文件产物，没有 CSS 侧信道可用，也不该去碰宿主的 DOM。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { createServer, listServers, messageFor, removeServer, toggleServer } from './api.js';
import { CSS } from './styles.js';
import { AddDialog } from './AddDialog.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { EmptyState } from './EmptyState.jsx';
import { ServerList } from './ServerList.jsx';
import { Toolbar } from './Toolbar.jsx';
import { WarningIcon } from './Icons.jsx';

/** 新条目高亮时长（毫秒）。 */
const HIGHLIGHT_MS = 1500;

/**
 * @returns {JSX.Element} 页面。
 */
export function McpManager() {
  const [phase, setPhase] = useState('loading');
  const [snapshot, setSnapshot] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [banner, setBanner] = useState('');
  const [highlighted, setHighlighted] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pendingRemove, setPendingRemove] = useState('');

  /**
   * 拉取列表。
   * @returns {Promise<void>} 完成即 resolve。
   */
  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const data = await listServers();
      setSnapshot(data);
      setLoadError('');
      setPhase('ready');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
      setPhase('error');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (highlighted === '') return undefined;
    const timer = setTimeout(() => setHighlighted(''), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlighted]);

  /**
   * 统一兜底：把操作异常翻成顶部 banner。
   * @param {unknown} error 异常。
   * @returns {void}
   */
  const showError = (error) => {
    const code = error !== null && typeof error === 'object' ? String(error.code ?? '') : '';
    const base = error instanceof Error ? error.message : String(error);
    const rolledBack = error !== null && typeof error === 'object' && error.rolledBack === true;
    setBanner(`${code === '' ? '' : `${messageFor(code)}：`}${base}${rolledBack ? '（文件已回滚）' : ''}`);
  };

  /**
   * 新增。
   * @param {string} raw JSON 文本。
   * @returns {Promise<void>} 完成即 resolve。
   */
  const onAdd = async (raw) => {
    const data = await createServer(raw);
    setAdding(false);
    setBanner('');
    await refresh();
    if (data.item !== null && typeof data.item === 'object') {
      setHighlighted(typeof data.item.serverName === 'string' ? data.item.serverName : '');
    }
  };

  /**
   * 删除。
   * @param {string} serverName 名称。
   * @returns {Promise<void>} 完成即 resolve。
   */
  const onRemoveConfirm = async (serverName) => {
    setBusy(true);
    try {
      await removeServer(serverName);
      setPendingRemove('');
      setBanner('');
      await refresh();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  /**
   * 启停。
   * @param {string} serverName 名称。
   * @param {boolean} enabled 目标状态。
   * @returns {Promise<void>} 完成即 resolve。
   */
  const onToggle = async (serverName, enabled) => {
    setBusy(true);
    try {
      await toggleServer(serverName, enabled);
      setBanner('');
      await refresh();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const fileDisplay = typeof snapshot?.fileDisplay === 'string' ? snapshot.fileDisplay : '';
  // profile 与 source 都来自后端快照：页面显示的 profile 必须和真正写入的文件
  // 同源，否则「说的」和「写的」又会分叉（BUG-2 的形态）。
  const profile = typeof snapshot?.profile === 'string' ? snapshot.profile : '';
  const source = typeof snapshot?.source === 'string' ? snapshot.source : '';
  const taken = snapshot?.taken ?? { serverNames: [], ids: [] };
  const anchorsBroken = snapshot?.anchors === 'broken';

  return (
    <div className="dshmcp-page">
      <style>{CSS}</style>

      <Toolbar
        fileDisplay={fileDisplay}
        profile={profile}
        source={source}
        busy={busy}
        onAdd={() => {
          setBanner('');
          setAdding(true);
        }}
        onRefresh={refresh}
      />

      {banner === '' ? null : (
        <div className="dshmcp-banner" role="alert">
          <WarningIcon />
          <div className="dshmcp-banner-body">
            <div>{banner}</div>
            <div className="dshmcp-banner-note">配置文件未被破坏，可重试或刷新后重来。</div>
          </div>
          <button type="button" className="dshmcp-btn is-secondary" onClick={refresh}>
            重试
          </button>
          <button type="button" className="dshmcp-btn is-ghost" onClick={() => setBanner('')} aria-label="关闭提示">
            ✕
          </button>
        </div>
      )}

      {anchorsBroken ? (
        <div className="dshmcp-banner" role="alert">
          <WarningIcon />
          <div className="dshmcp-banner-body">
            <div>受管段标记被破坏，已切换为只读</div>
            <div className="dshmcp-banner-note">
              请手工修复 {fileDisplay === '' ? '配置文件' : fileDisplay} 里的
              <span className="dshmcp-path"> # &gt;&gt;&gt; / # &lt;&lt;&lt; </span> 锚点，使其成对且顺序正确。
            </div>
          </div>
        </div>
      ) : null}

      {phase === 'loading' ? (
        <div>
          <div className="dshmcp-skeleton" />
          <div className="dshmcp-skeleton" />
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="dshmcp-banner" role="alert">
          <WarningIcon />
          <div className="dshmcp-banner-body">
            <div>加载失败：{loadError}</div>
            <div className="dshmcp-banner-note">页面不会卡在加载态，可直接重试。</div>
          </div>
          <button type="button" className="dshmcp-btn is-secondary" onClick={refresh}>
            重试
          </button>
        </div>
      ) : null}

      {phase === 'ready' && items.length === 0 ? (
        <EmptyState
          fileDisplay={fileDisplay}
          onAdd={() => {
            setBanner('');
            setAdding(true);
          }}
        />
      ) : null}

      {phase === 'ready' && items.length > 0 ? (
        <ServerList
          items={items}
          highlighted={highlighted}
          busy={busy}
          onToggle={onToggle}
          onRemove={setPendingRemove}
        />
      ) : null}

      {adding === true ? (
        <AddDialog
          fileDisplay={fileDisplay}
          existingServerNames={Array.isArray(taken.serverNames) ? taken.serverNames : []}
          existingIds={Array.isArray(taken.ids) ? taken.ids : []}
          onSubmit={onAdd}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {pendingRemove === '' ? null : (
        <ConfirmDialog
          serverName={pendingRemove}
          busy={busy}
          onConfirm={() => onRemoveConfirm(pendingRemove)}
          onCancel={() => setPendingRemove('')}
        />
      )}
    </div>
  );
}
