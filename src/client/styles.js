/**
 * 组件样式：一段**纯字符串 CSS**，由 `McpManager` 用 `<style>{CSS}</style>`
 * 渲染（照 `dsh-hub` 客户端实测写法），不用任何 DOM API。
 *
 * 三条硬规则：
 * 1. 全部选择器以 `.dshmcp-` 打头——这是"不污染宿主样式"的全部保证；
 * 2. 色值一律 `var(--dsw-alias-*, #fallback)`，fallback 只用于变量缺失兜底，
 *    **除 fallback 外不出现第二处硬编码色**（主题跟随由 CSS 变量天然完成）；
 * 3. 间距只用 4/8/12/16/24，字号只用 11/12/13/14（+ 页面标题 20），
 *    圆角只用 6/8/10/12。
 */
export const CSS = `
.dshmcp-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 760px;
  font-family: var(--dsw-font-family, inherit);
  color: var(--dsw-alias-label-primary, #1f2328);
}
.dshmcp-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.dshmcp-title { margin: 0; font-size: 20px; line-height: 28px; font-weight: 600; color: var(--dsw-alias-label-primary, #1f2328); }
.dshmcp-subtitle { margin: 8px 0 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-tertiary, #6b7280); }
.dshmcp-path { font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.dshmcp-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }

.dshmcp-btn {
  display: inline-flex; align-items: center; gap: 4px;
  height: 32px; padding: 0 12px; border: none; border-radius: 8px;
  font-size: 12px; font-weight: 600; line-height: 1; cursor: pointer;
  background: var(--dsw-alias-button-primary-fill, #2563eb);
  color: var(--dsw-alias-label-primary-foreground, #ffffff);
}
.dshmcp-btn:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover, #1d4ed8); }
.dshmcp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.dshmcp-btn.is-secondary {
  background: var(--dsw-alias-bg-layer-3, #f3f4f6);
  color: var(--dsw-alias-label-primary, #1f2328);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2, #e5e7eb);
  font-weight: 400;
}
.dshmcp-btn.is-secondary:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #e5e7eb); }
.dshmcp-btn.is-danger { background: transparent; color: var(--dsw-alias-state-error-primary, #dc2626); font-weight: 400; }
.dshmcp-btn.is-danger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #e5e7eb); }
.dshmcp-btn.is-ghost {
  width: 28px; height: 28px; padding: 0; justify-content: center;
  background: transparent; color: var(--dsw-alias-label-tertiary, #6b7280);
}
.dshmcp-btn.is-ghost:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #e5e7eb); }

.dshmcp-banner {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 12px; border-radius: 8px; font-size: 12px; line-height: 18px;
  background: var(--dsw-alias-bg-overlay, transparent);
  color: var(--dsw-alias-state-error-primary, #dc2626);
  border-left: 3px solid var(--dsw-alias-state-error-primary, #dc2626);
}
.dshmcp-banner-body { flex: 1 1 auto; min-width: 0; }
.dshmcp-banner-note { margin-top: 4px; color: var(--dsw-alias-label-tertiary, #6b7280); }

.dshmcp-group { display: flex; flex-direction: column; gap: 12px; }
.dshmcp-group-title {
  margin: 12px 0 0; font-size: 11px; line-height: 16px; font-weight: 600;
  letter-spacing: 0.02em; color: var(--dsw-alias-label-tertiary, #6b7280);
}
.dshmcp-group.is-readonly .dshmcp-card { opacity: 0.6; }

.dshmcp-card {
  padding: 16px; border-radius: 10px;
  background: var(--dsw-alias-settings-card-fill, #ffffff);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-settings-card-stroke, #e5e7eb), var(--dsw-alias-shadow, none);
}
.dshmcp-card.is-new { box-shadow: inset 0 0 0 2px var(--dsw-alias-state-business-primary, #2563eb), var(--dsw-alias-shadow, none); }
.dshmcp-card-head { display: flex; align-items: center; gap: 8px; }
.dshmcp-dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; background: var(--dsw-alias-state-business-primary, #2563eb); }
.dshmcp-dot.is-off { background: var(--dsw-alias-label-dimmed, #9ca3af); }
.dshmcp-card-title { font-size: 14px; line-height: 20px; font-weight: 600; color: var(--dsw-alias-label-primary, #1f2328); }
.dshmcp-card-spacer { flex: 1 1 auto; }
.dshmcp-card-menu { position: relative; flex: 0 0 auto; }

.dshmcp-chip {
  padding: 2px 8px; border-radius: 6px; font-size: 11px; line-height: 16px;
  background: var(--dsw-alias-bg-layer-2, #f3f4f6);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l1, #e5e7eb);
  color: var(--dsw-alias-label-secondary, #4b5563);
}
.dshmcp-chip.is-off { color: var(--dsw-alias-label-dimmed, #9ca3af); }

.dshmcp-cmd {
  margin-top: 8px; font-size: 12px; line-height: 18px;
  font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  color: var(--dsw-alias-label-secondary, #4b5563);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dshmcp-sep { height: 1px; margin: 12px 0; background: var(--dsw-alias-border-l1, #e5e7eb); }
.dshmcp-meta { display: flex; align-items: center; gap: 16px; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary, #6b7280); }
.dshmcp-meta-item { display: inline-flex; align-items: center; gap: 4px; }
.dshmcp-mask { letter-spacing: 1px; }

.dshmcp-menu {
  position: absolute; right: 0; top: 32px; z-index: 10; min-width: 144px;
  padding: 4px; border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  box-shadow: var(--dsw-alias-shadow, 0 4px 16px rgba(0, 0, 0, 0.12)), inset 0 0 0 1px var(--dsw-alias-border-l3, #e5e7eb);
}
.dshmcp-menu-item {
  display: block; width: 100%; padding: 8px; border: none; border-radius: 6px;
  background: transparent; text-align: left; cursor: pointer;
  font-size: 12px; line-height: 16px; font-family: var(--dsw-font-family, inherit);
  color: var(--dsw-alias-label-primary, #1f2328);
}
.dshmcp-menu-item:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #e5e7eb); }
.dshmcp-menu-item:disabled { color: var(--dsw-alias-label-dimmed, #9ca3af); cursor: not-allowed; }
.dshmcp-menu-item.is-danger { color: var(--dsw-alias-state-error-primary, #dc2626); }

.dshmcp-empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 24px; border-radius: 10px; text-align: center;
  background: var(--dsw-alias-settings-card-fill, #ffffff);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-settings-card-stroke, #e5e7eb), var(--dsw-alias-shadow, none);
}
.dshmcp-empty-icon { color: var(--dsw-alias-label-dimmed, #9ca3af); }
.dshmcp-empty-title { margin: 0; font-size: 14px; line-height: 20px; font-weight: 600; color: var(--dsw-alias-label-primary, #1f2328); }
.dshmcp-empty-text { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-tertiary, #6b7280); }

.dshmcp-skeleton { height: 76px; border-radius: 10px; background: var(--dsw-alias-bg-skeleton, #e5e7eb); animation: dshmcp-breathe 1.4s ease-in-out infinite; }
.dshmcp-skeleton + .dshmcp-skeleton { margin-top: 12px; }
@keyframes dshmcp-breathe { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }

.dshmcp-mask-layer {
  position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center;
  background: var(--dsw-alias-bg-overlay, rgba(0, 0, 0, 0.4));
}
.dshmcp-dialog {
  width: 560px; max-width: calc(100vw - 32px); padding: 24px; border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  box-shadow: var(--dsw-alias-shadow, 0 12px 32px rgba(0, 0, 0, 0.18)), inset 0 0 0 1px var(--dsw-alias-border-l3, #e5e7eb);
}
.dshmcp-dialog-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.dshmcp-dialog-title { margin: 0; font-size: 14px; line-height: 20px; font-weight: 600; color: var(--dsw-alias-label-primary, #1f2328); }
.dshmcp-dialog-body { margin-top: 16px; }
.dshmcp-dialog-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 24px; }
.dshmcp-field { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.dshmcp-field-label { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary, #4b5563); }

.dshmcp-editor {
  width: 100%; min-height: 200px; padding: 12px; border: none; border-radius: 8px; resize: vertical;
  font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px; line-height: 20px;
  color: var(--dsw-alias-label-primary, #1f2328);
  background: var(--dsw-alias-bg-layer-1, #f9fafb);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2, #e5e7eb);
  box-sizing: border-box;
}
.dshmcp-editor:focus { outline: none; box-shadow: inset 0 0 0 2px var(--dsw-alias-brand-primary, #2563eb); }

.dshmcp-issues { margin-top: 12px; display: flex; flex-direction: column; gap: 4px; }
.dshmcp-issue { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; line-height: 18px; }
.dshmcp-issue.is-error { color: var(--dsw-alias-state-error-primary, #dc2626); }
.dshmcp-issue.is-warn { color: var(--dsw-alias-state-warning-primary, #d97706); }
.dshmcp-hint { display: flex; align-items: flex-start; gap: 8px; margin-top: 16px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary, #6b7280); }
.dshmcp-hint-icon { flex: 0 0 auto; color: var(--dsw-alias-label-dimmed, #9ca3af); }

.dshmcp-raw {
  margin: 8px 0 0; padding: 12px; border-radius: 8px; overflow: auto;
  font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px; line-height: 18px; white-space: pre;
  background: var(--dsw-alias-bg-layer-1, #f9fafb);
  color: var(--dsw-alias-label-tertiary, #6b7280);
}
.dshmcp-select {
  height: 28px; padding: 0 8px; border-radius: 8px; cursor: pointer;
  font-size: 12px; font-family: var(--dsw-font-family, inherit);
  color: var(--dsw-alias-label-primary, #1f2328);
  background: var(--dsw-alias-bg-layer-1, #f9fafb);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2, #e5e7eb);
}
`;
