/**
 * 页面容器：拉数据 / 三态分发 / 全局 banner / 新条目高亮 / 增删改的操作编排。
 *
 * 这一层是所有异步动作的唯一出口：卡片只管"点了要发生什么"，请求、错误翻译、
 * 结果提示都在这里——否则每个组件都要自己维护一套 banner 与 toast。
 *
 * 样式以 `<style>{CSS}</style>` 内联渲染（照 `dsh-hub` 实测写法）——客户端
 * bundle 是单文件产物，没有 CSS 侧信道可用，也不该去碰宿主的 DOM。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  beginUpgrade,
  checkServerHealth,
  checkUpdateState,
  createServer,
  dismissUpdate,
  editServer,
  getUpdateState,
  healthSummary,
  listServerTools,
  listServers,
  messageFor,
  readServerConfig,
  readUpgradeState,
  removeServer,
  repairEntries,
  toggleServer,
} from './api.js';
import { CSS } from './styles.js';
import { PLUGIN_VERSION } from '../version.js';
import { AddDialog } from './AddDialog.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { EmptyState } from './EmptyState.jsx';
import { ServerList } from './ServerList.jsx';
import { Toolbar } from './Toolbar.jsx';
import { DownloadIcon, WarningIcon } from './Icons.jsx';

/** 新条目高亮时长（毫秒）。 */
const HIGHLIGHT_MS = 1500;

/** toast 停留时长（毫秒）。够读完一句话，又不至于挡住下一屏。 */
const TOAST_MS = 3200;

/** 升级轮询上限：150 次 × 1s。装包（pnpm）在慢网下可能要几分钟。 */
const UPGRADE_POLL_LIMIT = 150;

/**
 * 刷新图标的最短旋转时长（毫秒）。
 *
 * 读一个几 KB 的本地文件只要几毫秒，请求一结束图标就归位——用户看到的
 * "什么都没发生"。给一个下限，让"点到了、正在读、读完了"这件事有可见的过程。
 */
const MIN_SPIN_MS = 450;

/**
 * 升级失败码 → 一句人话。
 *
 * Host 侧故意只回码（`plugin-manager-unavailable` / `unreachable`），文案归前端：
 * 同一件事在两个地方写两遍必然漂移。
 * @param {string} code 错误码或消息。
 * @returns {string} 文案。
 */
function upgradeErrorText(code) {
  if (code === 'plugin-manager-unavailable') return '宿主没有提供插件管理器，请在「设置 → 插件」里手动更新';
  if (code === 'unreachable') return '查询 GitHub 失败，请检查网络后重试';
  return String(code);
}

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
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingRemove, setPendingRemove] = useState('');
  const [toast, setToast] = useState(null);
  const [update, setUpdate] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [repairing, setRepairing] = useState(false);

  /**
   * 弹一条短提示。用对象而不是字符串：连着两次同样的文案也要重新计时。
   * @param {string} text 文案。
   * @returns {void}
   */
  const notify = (text) => setToast({ text });

  /**
   * 拉取列表。
   *
   * `announce` 只在**用户自己按了刷新**时为 true：首屏加载、增删改之后的重拉
   * 都各有各的提示，再补一条"已刷新"就是噪音。而用户按了按钮必须有回音——
   * 本地文件几毫秒就读完，没有 toast 的话这一下看起来就是"按钮没反应"。
   *
   * @param {boolean} [announce] 是否用 toast 说出结果。
   * @returns {Promise<void>} 完成即 resolve。
   */
  const refresh = useCallback(async (announce = false) => {
    setBusy(true);
    setRefreshing(true);
    const startedAt = Date.now();
    try {
      const data = await listServers();
      setSnapshot(data);
      setLoadError('');
      setPhase('ready');
      if (announce === true) {
        const count = Array.isArray(data?.items) ? data.items.length : 0;
        setToast({ text: count === 0 ? '已刷新 · 还没有 MCP 服务器' : `已刷新 · 共 ${count} 个服务器` });
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
      setPhase('error');
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_SPIN_MS && typeof setTimeout === 'function') {
        await new Promise((resolve) => {
          setTimeout(resolve, MIN_SPIN_MS - elapsed);
        });
      }
      setBusy(false);
      setRefreshing(false);
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

  useEffect(() => {
    if (toast === null) return undefined;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let alive = true;
    // 只读 Host 缓存的结论：不打网络，页面打开是瞬时的。
    getUpdateState()
      .then((data) => {
        if (alive === true) setUpdate(data);
      })
      .catch(() => {
        // 更新检查是附带功能，失败不该在页面上留下任何痕迹。
      });
    return () => {
      alive = false;
    };
  }, []);

  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const fileDisplay = typeof snapshot?.fileDisplay === 'string' ? snapshot.fileDisplay : '';
  const taken = snapshot?.taken ?? { serverNames: [], ids: [] };
  const anchorsBroken = snapshot?.anchors === 'broken';
  // 旧版写坏的条目（扁平顶层，宿主不会加载）。Host < 0.4.3 不返回这个字段。
  const legacy = Array.isArray(snapshot?.legacy) ? snapshot.legacy : [];
  // 页面刷新就会换新的 bundle，Host 却只在进程启动时加载一次。两者版本不一致
  // 意味着"升级了但没重启"，此时两边校验规则不同，用户会看到互相矛盾的提示。
  const hostVersion = typeof snapshot?.version === 'string' ? snapshot.version : '';
  const staleHost = phase === 'ready' && hostVersion !== PLUGIN_VERSION;
  const updateReady =
    update !== null &&
    update.enabled !== false &&
    update.updateAvailable === true &&
    update.dismissed !== true;

  /**
   * 统一兜底：把操作异常翻成顶部 banner。
   * @param {unknown} error 异常。
   * @returns {void}
   */
  const showError = (error) => {
    const code = error !== null && typeof error === 'object' ? String(error.code ?? '') : '';
    const base = error instanceof Error ? error.message : String(error);
    const rolledBack = error !== null && typeof error === 'object' && error.rolledBack === true;
    // Host 是旧进程时，新端点（工具列表 / 健康检查 / 更新）根本不存在——此时
    // 报错文本会是"该条目已不存在"这类误导性结论。直接把真正的原因补在末尾。
    const stale = staleHost === true ? '（Host 是旧版本，重启 DSH 后重试）' : '';
    setBanner(
      `${code === '' ? '' : `${messageFor(code)}：`}${base}${rolledBack ? '（文件已回滚）' : ''}${stale}`,
    );
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
    await refresh(false);
    const added = data.item !== null && typeof data.item === 'object' ? data.item : null;
    if (added === null) return;
    const addedName = typeof added.serverName === 'string' ? added.serverName : '';
    setHighlighted(addedName);
    notify(`已添加 ${addedName === '' ? 'MCP 服务器' : addedName}`);
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
      await refresh(false);
      notify(`已删除 ${serverName}`);
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
      await refresh(false);
      // 启停要重启宿主才真正生效（cordis 的 disabled 由加载器读），
      // 这句话必须说，否则用户会以为开关坏了。
      notify(`${serverName} 已${enabled === true ? '启用' : '停用'}，重启 DSH 后生效`);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  /**
   * 健康检查。
   * @param {string} serverName 名称。
   * @returns {Promise<object|null>} 报告；失败为 null。
   */
  const onHealth = async (serverName) => {
    try {
      const data = await checkServerHealth(serverName);
      const report = data.report ?? null;
      if (report !== null) {
        const summary = healthSummary(report);
        notify(`${serverName} · ${summary === '' ? '检查完成' : summary}`);
      }
      return report;
    } catch (error) {
      showError(error);
      return null;
    }
  };

  /**
   * 打开编辑弹窗：先把该条目的 JSON 拉回来（密钥已由 Host 置空）。
   * @param {string} serverName 名称。
   * @returns {Promise<void>} 完成即 resolve。
   */
  const onEdit = async (serverName) => {
    setBusy(true);
    try {
      const source = await readServerConfig(serverName);
      const masked =
        source !== null && typeof source.maskedKeys === 'object' && source.maskedKeys !== null
          ? Object.values(source.maskedKeys)
              .flat()
              .filter((key) => typeof key === 'string')
          : [];
      setBanner('');
      setEditing({
        serverName,
        text: typeof source.text === 'string' ? source.text : '',
        maskedKeys: masked,
      });
    } catch (error) {
      // 只读 / 不可解析条目的入口本来就不渲染，走到这里说明文件在这期间变了
      // ——提示"刷新后重试"比弹一个空编辑器有用。
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  /**
   * 提交编辑。
   * @param {string} raw 新配置文本。
   * @returns {Promise<void>} 完成即 resolve；抛错时弹窗保持打开。
   */
  const onEditSubmit = async (raw) => {
    const original = editing === null ? '' : editing.serverName;
    const data = await editServer(original, raw);
    setEditing(null);
    setBanner('');
    await refresh();
    const savedName = typeof data?.item?.serverName === 'string' ? data.item.serverName : original;
    setHighlighted(savedName);
    notify(data?.renamed === true ? `已保存，并改名为 ${savedName}` : `已保存 ${savedName}`);
  };

  /**
   * 读工具表。
   * @param {string} serverName 名称。
   * @returns {Promise<object|null>} 工具表；失败为 null。
   */
  const onLoadTools = async (serverName) => {
    try {
      return await listServerTools(serverName);
    } catch (error) {
      showError(error);
      return null;
    }
  };

  /**
   * 手动检查更新。
   * @returns {Promise<void>} 完成即 resolve。
   */
  const onCheckUpdate = async () => {
    if (checkingUpdate === true) return;
    setCheckingUpdate(true);
    try {
      const data = await checkUpdateState();
      setUpdate(data);
      if (data.error !== null && data.error !== undefined) {
        notify('检查更新失败：访问 GitHub 未成功');
      } else if (data.updateAvailable === true) {
        notify(`发现新版本 v${data.latest}`);
      } else {
        notify(`已是最新版本 v${data.current}`);
      }
    } catch (error) {
      showError(error);
    } finally {
      setCheckingUpdate(false);
    }
  };

  /**
   * 忽略当前这个新版本。
   * @returns {Promise<void>} 完成即 resolve。
   */
  const onDismissUpdate = async () => {
    try {
      setUpdate(await dismissUpdate());
    } catch (error) {
      showError(error);
    }
  };

  /**
   * 轮询升级进度，直到不再 running。
   * @returns {Promise<object|null>} 结束时的状态；超时为 null。
   */
  const waitForUpgrade = async () => {
    for (let attempt = 0; attempt < UPGRADE_POLL_LIMIT; attempt += 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
      let state;
      try {
        state = await readUpgradeState();
      } catch {
        return null;
      }
      if (state.update !== null && state.update !== undefined) setUpdate(state.update);
      if (state.running !== true) return state;
    }
    return null;
  };

  /**
   * 开始原地升级。
   * @returns {Promise<void>} 完成即 resolve。
   */
  const onUpgrade = async () => {
    if (upgrading === true) return;
    setUpgrading(true);
    try {
      const started = await beginUpgrade();
      if (started.update !== null && started.update !== undefined) setUpdate(started.update);
      const settled = await waitForUpgrade();
      if (settled === null) {
        notify('更新还没结束，稍后回来看看版本号');
        return;
      }
      if (settled.error !== null && settled.error !== undefined && settled.error !== '') {
        showError(new Error(upgradeErrorText(settled.error)));
        return;
      }
      const installed = settled.result !== null && typeof settled.result === 'object' ? settled.result : {};
      const version = typeof installed.version === 'string' ? installed.version : '新版本';
      notify(
        installed.application === 'applied'
          ? `已更新到 v${version}，已生效`
          : `已更新到 v${version}，重启 DSH 后生效`,
      );
    } catch (error) {
      showError(error);
    } finally {
      setUpgrading(false);
    }
  };

  /**
   * 修复旧版写坏的条目形状。
   *
   * 0.4.2 及之前把条目直接写在顶层，而 `cordis.patch.yml` 是**补丁列表**——
   * 顶层那条只会被当成"给某个已存在条目改配置"，找不到目标就静默跳过。于是
   * 配置看起来全对、DSH 里一个工具都没有。光换代码不会让这些条目开始工作，
   * 必须有一步显式的迁移。
   * @returns {Promise<void>} 完成即 resolve。
   */
  const onRepair = async () => {
    if (repairing === true) return;
    setRepairing(true);
    try {
      const data = await repairEntries();
      setBanner('');
      await refresh();
      const count = typeof data.repaired === 'number' ? data.repaired : 0;
      notify(`已修复 ${count} 条，重启 DSH 后生效`);
    } catch (error) {
      showError(error);
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div className="dshmcp-page">
      <style>{CSS}</style>

      <Toolbar
        busy={busy}
        refreshing={refreshing}
        showActions={items.length > 0}
        version={PLUGIN_VERSION}
        checking={checkingUpdate}
        onAdd={() => {
          setBanner('');
          setAdding(true);
        }}
        onRefresh={() => refresh(true)}
        onCheckUpdate={onCheckUpdate}
      />

      {updateReady ? (
        <div className="dshmcp-banner is-update" role="status">
          <DownloadIcon />
          <div className="dshmcp-banner-body">
            <div>
              有新版本 v{update.latest}
              <span className="dshmcp-banner-note"> · 当前 v{update.current}</span>
            </div>
            <div className="dshmcp-banner-note">
              {upgrading === true
                ? '正在从 GitHub 安装，装完这里会自己变。'
                : '确认后原地安装，profile 的依赖会一起更新。'}
            </div>
          </div>
          <button type="button" className="dshmcp-btn" disabled={upgrading === true} onClick={onUpgrade}>
            {upgrading === true ? '更新中…' : '更新'}
          </button>
          <button
            type="button"
            className="dshmcp-btn is-ghost"
            disabled={upgrading === true}
            onClick={onDismissUpdate}
            aria-label="忽略此版本"
          >
            ✕
          </button>
        </div>
      ) : null}

      {staleHost ? (
        <div className="dshmcp-banner" role="alert">
          <WarningIcon />
          <div className="dshmcp-banner-body">
            <div>
              页面 v{PLUGIN_VERSION}，
              {hostVersion === '' ? '运行中的 Host 没有报告版本' : `运行中的 Host 是 v${hostVersion}`}
            </div>
            <div className="dshmcp-banner-note">Host 半还是重启前的旧代码，重启 DSH 后才会用上新的校验规则。</div>
          </div>
        </div>
      ) : null}

      {banner === '' ? null : (
        <div className="dshmcp-banner" role="alert">
          <WarningIcon />
          <div className="dshmcp-banner-body">
            <div>{banner}</div>
            <div className="dshmcp-banner-note">配置文件未被破坏，可重试或刷新后重来。</div>
          </div>
          <button type="button" className="dshmcp-btn is-secondary" onClick={() => refresh(false)}>
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

      {legacy.length === 0 ? null : (
        <div className="dshmcp-banner is-warn" role="alert">
          <WarningIcon />
          <div className="dshmcp-banner-body">
            <div>
              有 {legacy.length} 条条目是旧版写入的，DSH 不会加载
              {legacy.length <= 3 ? `（${legacy.join('、')}）` : ''}
            </div>
            <div className="dshmcp-banner-note">
              0.4.2 及之前把条目直接写在顶层，而配置文件要的是「- insert:」补丁形状；宿主找不到目标条目就静默跳过了。
              修复只动本插件受管段内的条目，段外一个字节不变。
            </div>
          </div>
          <button type="button" className="dshmcp-btn" disabled={repairing === true} onClick={onRepair}>
            {repairing === true ? '修复中…' : '修复'}
          </button>
        </div>
      )}

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
          <button type="button" className="dshmcp-btn is-secondary" onClick={() => refresh(false)}>
            重试
          </button>
        </div>
      ) : null}

      {phase === 'ready' && items.length === 0 ? (
        <EmptyState
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
          onEdit={onEdit}
          onHealth={onHealth}
          onLoadTools={onLoadTools}
        />
      ) : null}

      {adding === true ? (
        <AddDialog
          existingServerNames={Array.isArray(taken.serverNames) ? taken.serverNames : []}
          existingIds={Array.isArray(taken.ids) ? taken.ids : []}
          staleHost={staleHost}
          onSubmit={onAdd}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {/*
        编辑弹窗。两处与"新增"不同，都在这一层算好再传下去：
        - `key` 逼一次重挂载：改另一条时 hook 槽位必须清空，否则编辑器里还留着
          上一条的文本；
        - 唯一性校验要摘掉自己，否则"只改 url"会被自己的名字判成重名。
      */}
      {editing !== null ? (
        <AddDialog
          key={`edit:${editing.serverName}`}
          mode="edit"
          serverName={editing.serverName}
          initialText={editing.text}
          maskedKeys={editing.maskedKeys}
          existingServerNames={(Array.isArray(taken.serverNames) ? taken.serverNames : []).filter(
            (name) => name !== editing.serverName,
          )}
          existingIds={(Array.isArray(taken.ids) ? taken.ids : []).filter(
            (id) => id !== `mcp-${editing.serverName}`,
          )}
          staleHost={staleHost}
          onSubmit={onEditSubmit}
          onCancel={() => setEditing(null)}
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

      {toast === null ? null : (
        <div className="dshmcp-toast" role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}
