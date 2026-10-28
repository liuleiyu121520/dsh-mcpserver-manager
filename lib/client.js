/**
 * dsh-mcpserver-manager 客户端 bundle —— 由 scripts/build.mjs 生成，请勿手改。
 *
 * 外层是 dsh 客户端模块加载器契约（window.__ModuleLoader__.load）；
 * 内层是 esbuild 的 CJS 产物，跑在一个自带的 module 作用域里。
 * React 由宿主通过 factory 的 require 参数提供，没有打进本文件。
 */
window.__ModuleLoader__.load({
  id: 'dsh-mcpserver-manager',
  factory(require) {
    const module = { exports: {} };
    (function (module, exports, require) {
var sr=Object.create;var X=Object.defineProperty;var tr=Object.getOwnPropertyDescriptor;var ar=Object.getOwnPropertyNames;var nr=Object.getPrototypeOf,or=Object.prototype.hasOwnProperty;var ir=(e,s)=>{for(var r in s)X(e,r,{get:s[r],enumerable:!0})},ie=(e,s,r,t)=>{if(s&&typeof s=="object"||typeof s=="function")for(let n of ar(s))!or.call(e,n)&&n!==r&&X(e,n,{get:()=>s[n],enumerable:!(t=tr(s,n))||t.enumerable});return e};var A=(e,s,r)=>(r=e!=null?sr(nr(e)):{},ie(s||!e||!e.__esModule?X(r,"default",{value:e,enumerable:!0}):r,e)),lr=e=>ie(X({},"__esModule",{value:!0}),e);var Tr={};ir(Tr,{apply:()=>Fe,inject:()=>Be});module.exports=lr(Tr);var De=A(require("react"),1);var a=A(require("react"),1);var dr="/api/dsh-mcpserver-manager",le=Object.freeze({"invalid-json":"JSON \u8BED\u6CD5\u6709\u8BEF\uFF0C\u8BF7\u5BF9\u7167\u9519\u8BEF\u63D0\u793A\u4FEE\u6539","invalid-config":"\u914D\u7F6E\u6821\u9A8C\u672A\u901A\u8FC7\uFF0C\u8BF7\u5BF9\u7167\u9519\u8BEF\u63D0\u793A\u4FEE\u6539","duplicate-server":"\u540C\u540D MCP \u5DF2\u5B58\u5728\uFF0C\u8BF7\u6362\u4E00\u4E2A serverName","unknown-server":"\u8BE5\u6761\u76EE\u5DF2\u4E0D\u5B58\u5728\uFF0C\u8BF7\u5237\u65B0\u5217\u8868","readonly-entry":"\u8BE5\u6761\u76EE\u975E\u672C\u63D2\u4EF6\u7BA1\u7406\uFF0C\u65E0\u6CD5\u4FEE\u6539","unparsable-entry":"\u8BE5\u6761\u76EE\u683C\u5F0F\u8D85\u51FA\u53EF\u89E3\u6790\u8303\u56F4\uFF0C\u8BF7\u624B\u5DE5\u7F16\u8F91\u914D\u7F6E\u6587\u4EF6","anchors-broken":"\u53D7\u7BA1\u6BB5\u6807\u8BB0\u88AB\u7834\u574F\uFF0C\u8BF7\u624B\u5DE5\u4FEE\u590D cordis.patch.yml","file-changed":"\u914D\u7F6E\u6587\u4EF6\u5DF2\u88AB\u5916\u90E8\u4FEE\u6539\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5","disable-by-expression":"\u8BE5\u6761\u76EE\u7684\u542F\u7528\u72B6\u6001\u7531\u8868\u8FBE\u5F0F\u63A7\u5236\uFF0C\u8BF7\u624B\u5DE5\u4FEE\u6539","file-unreadable":"\u65E0\u6CD5\u8BFB\u53D6\u914D\u7F6E\u6587\u4EF6\uFF0C\u8BF7\u68C0\u67E5\u6587\u4EF6\u6743\u9650","write-failed":"\u5199\u5165\u5931\u8D25\uFF0C\u6587\u4EF6\u5DF2\u56DE\u6EDA","body-too-large":"\u914D\u7F6E\u5185\u5BB9\u8FC7\u5927","method-not-allowed":"\u8BF7\u6C42\u65B9\u5F0F\u4E0D\u88AB\u652F\u6301","internal-error":"\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"});function se(e){return le[e]??le["internal-error"]}var de=Object.freeze({healthy:"\u6B63\u5E38",degraded:"\u9700\u7559\u610F",unreachable:"\u8FDE\u4E0D\u4E0A",disabled:"\u5DF2\u505C\u7528",unknown:"\u672A\u77E5"}),pe=Object.freeze({healthy:"is-ok",degraded:"is-warn",unreachable:"is-bad",disabled:"is-off",unknown:"is-off"});function Y(e){let s=typeof e=="string"?e:"unknown";return{label:de[s]??de.unknown,className:pe[s]??pe.unknown}}async function $(e,s={}){let r;try{r=await fetch(`${dr}${e}`,{cache:"no-store",headers:{"content-type":"application/json"},...s})}catch{let o=new Error("\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u8FDE\u63A5\u540E\u91CD\u8BD5");throw o.code="network-error",o}let t=null;try{t=await r.json()}catch{let n=new Error("\u670D\u52A1\u7AEF\u8FD4\u56DE\u4E86\u65E0\u6CD5\u89E3\u6790\u7684\u54CD\u5E94");throw n.code="internal-error",n}if(r.ok!==!0||t?.ok!==!0){let n=typeof t?.error?.code=="string"?t.error.code:"internal-error",o=new Error(typeof t?.error?.message=="string"&&t.error.message!==""?t.error.message:se(n));throw o.code=n,o.errors=Array.isArray(t?.error?.errors)?t.error.errors:[],o.rolledBack=t?.error?.rolledBack===!0,o}return t.data??{}}function ce(){return $("/servers")}function ue(e){return $("/servers",{method:"POST",body:JSON.stringify({raw:e})})}function me(e){return $(`/servers/${encodeURIComponent(e)}`,{method:"DELETE"})}function fe(e,s){return $(`/servers/${encodeURIComponent(e)}/toggle`,{method:"POST",body:JSON.stringify({enabled:s})})}function he(e){return $(`/servers/${encodeURIComponent(e)}/tools`)}function be(e){return $(`/servers/${encodeURIComponent(e)}/check`,{method:"POST",body:"{}"})}function ge(){return $("/update")}function ve(){return $("/update/check",{method:"POST",body:"{}"})}function ye(){return $("/update",{method:"POST",body:"{}"})}function xe(){return $("/upgrade",{method:"POST",body:"{}"})}function we(){return $("/upgrade")}var Ne=`
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

/*
 * \u906E\u7F69\u5C42\u7167 DSH \u539F\u751F Modal \u7684\u5199\u6CD5\uFF1A--dsw-alias-bg-mask-1 + --dsw-mask-blur
 * \uFF08\u89C1 ui-settings-general/SettingsRoot.module.css \u7684 .mask\uFF09\u3002
 * \u65E9\u5148\u7528\u7684\u662F --dsw-alias-bg-overlay\uFF0C\u90A3\u4E2A\u53D8\u91CF\u5728\u90E8\u5206\u4E3B\u9898\u91CC\u4E0D\u5B58\u5728\uFF0C\u515C\u5E95\u503C
 * \u76F4\u63A5\u628A\u80CC\u666F\u6D82\u6210\u4E86\u4E0D\u900F\u660E\u9ED1\u2014\u2014"\u5F39\u7A97\u540E\u9762\u770B\u4E0D\u89C1\u4E1C\u897F"\u5C31\u662F\u8FD9\u4E48\u6765\u7684\u3002
 */
.dshmcp-mask-layer {
  position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.24));
  -webkit-backdrop-filter: var(--dsw-mask-blur, blur(2px));
  backdrop-filter: var(--dsw-mask-blur, blur(2px));
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

/*
 * \u7248\u672C\u53F7\u505A\u6210\u6309\u94AE\uFF08\u70B9\u5B83\u624B\u52A8\u68C0\u67E5\u66F4\u65B0\uFF09\uFF1A\u7EAF\u6587\u672C\u7684\u8BDD\u6CA1\u4EBA\u77E5\u9053\u90A3\u91CC\u80FD\u70B9\uFF0C
 * \u7528\u865A\u4E0B\u5212\u7EBF\u7ED9\u4E00\u4E2A"\u53EF\u4EE5\u70B9"\u7684\u6700\u4F4E\u6697\u793A\uFF0C\u53C8\u4E0D\u81F3\u4E8E\u50CF\u94FE\u63A5\u90A3\u6837\u62A2\u6CE8\u610F\u529B\u3002
 */
.dshmcp-version {
  margin-left: 8px; padding: 0; border: none; background: transparent; cursor: pointer;
  font-size: 11px; line-height: 16px; font-family: var(--dsw-font-family, inherit);
  color: var(--dsw-alias-label-tertiary, #6b7280);
  text-decoration: underline dotted;
}
.dshmcp-version:hover:not(:disabled) { color: var(--dsw-alias-label-primary, #1f2328); }
.dshmcp-version:disabled { cursor: progress; }

/* \u65CB\u8F6C\u52A8\u753B\u53EA\u4F5C\u7528\u4E8E svg\uFF1A\u6309\u94AE\u672C\u8EAB\u7684\u8FB9\u6846/\u80CC\u666F\u4E0D\u8BE5\u8DDF\u7740\u8F6C\u3002 */
.dshmcp-spin svg { animation: dshmcp-spin-turn 900ms linear infinite; }
@keyframes dshmcp-spin-turn { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.dshmcp-chevron { flex: 0 0 auto; transition: transform 120ms ease; }
.dshmcp-chevron.is-open { transform: rotate(90deg); }

/*
 * \u5F00\u5173\u3002\u5C3A\u5BF8\u56FA\u5B9A 32\xD718\uFF08\u62C7\u6307 14 + \u4E24\u4FA7 2px \u7559\u767D\uFF09\uFF0C\u70B9\u51FB\u70ED\u533A\u7531\u6309\u94AE\u81EA\u8EAB\u6491\u5F00\uFF0C
 * \u6BD4"\u8BA9\u7528\u6237\u53BB\u70B9\u4E00\u4E2A 14px \u7684\u5706\u70B9"\u53EF\u9760\u5F97\u591A\u3002
 */
.dshmcp-switch {
  position: relative; flex: 0 0 auto; width: 32px; height: 18px; padding: 0;
  border: none; border-radius: 9px; cursor: pointer;
  background: var(--dsw-alias-label-dimmed, #9ca3af);
  transition: background 120ms ease;
}
.dshmcp-switch.is-on { background: var(--dsw-alias-state-business-primary, #2563eb); }
.dshmcp-switch:disabled { opacity: 0.5; cursor: not-allowed; }
.dshmcp-switch-knob {
  position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%;
  background: var(--dsw-alias-label-primary-foreground, #ffffff);
  transition: transform 120ms ease;
}
.dshmcp-switch.is-on .dshmcp-switch-knob { transform: translateX(14px); }

.dshmcp-tools { margin-top: 12px; }
.dshmcp-tools-toggle {
  display: inline-flex; align-items: center; gap: 4px; padding: 0; border: none;
  background: transparent; cursor: pointer;
  font-size: 11px; line-height: 16px; font-family: var(--dsw-font-family, inherit);
  color: var(--dsw-alias-label-secondary, #4b5563);
}
.dshmcp-tools-toggle:hover { color: var(--dsw-alias-label-primary, #1f2328); }
.dshmcp-tools-note { margin-top: 8px; font-size: 11px; line-height: 18px; color: var(--dsw-alias-label-tertiary, #6b7280); }
.dshmcp-tools-list { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.dshmcp-tool { padding: 8px 12px; border-radius: 8px; background: var(--dsw-alias-bg-layer-1, #f9fafb); }
.dshmcp-tool-head { display: flex; align-items: center; gap: 8px; }
.dshmcp-tool-name {
  font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary, #1f2328);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dshmcp-tool-params { margin-left: auto; flex: 0 0 auto; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary, #6b7280); }
.dshmcp-tool-desc {
  margin-top: 2px; font-size: 11px; line-height: 18px; color: var(--dsw-alias-label-tertiary, #6b7280);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

/* \u5065\u5EB7\u68C0\u67E5\u7ED3\u8BBA\uFF1A\u5DE6\u4FA7\u8272\u6761\u533A\u5206\u4E09\u6863\uFF0C"\u9700\u7559\u610F"\u548C"\u8FDE\u4E0D\u4E0A"\u5FC5\u987B\u4E00\u773C\u5206\u5F97\u5F00\u3002 */
.dshmcp-health {
  display: flex; align-items: flex-start; gap: 8px; margin-top: 12px;
  padding: 8px 12px; border-radius: 8px;
  font-size: 11px; line-height: 16px;
  background: var(--dsw-alias-bg-layer-1, #f9fafb);
  border-left: 3px solid var(--dsw-alias-label-dimmed, #9ca3af);
  color: var(--dsw-alias-label-secondary, #4b5563);
}
.dshmcp-health.is-ok { border-left-color: var(--dsw-alias-state-success-primary, #16a34a); }
.dshmcp-health.is-warn { border-left-color: var(--dsw-alias-state-warning-primary, #d97706); }
.dshmcp-health.is-bad { border-left-color: var(--dsw-alias-state-error-primary, #dc2626); }
.dshmcp-health.is-off { border-left-color: var(--dsw-alias-label-dimmed, #9ca3af); }
.dshmcp-health-title { flex: 0 0 auto; font-weight: 600; }
.dshmcp-health-detail { flex: 1 1 auto; min-width: 0; color: var(--dsw-alias-label-tertiary, #6b7280); }

/* \u6709\u65B0\u7248\u6A2A\u5E45\uFF1A\u4E2D\u6027\u6837\u5F0F\u800C\u4E0D\u662F\u9519\u8BEF\u7EA2\u2014\u2014"\u6709\u65B0\u7248\u672C"\u4E0D\u662F\u6545\u969C\u3002 */
.dshmcp-banner.is-update {
  color: var(--dsw-alias-label-primary, #1f2328);
  border-left-color: var(--dsw-alias-state-business-primary, #2563eb);
}

/* \u64CD\u4F5C\u7ED3\u679C\u63D0\u793A\uFF1A\u5E95\u90E8\u5C45\u4E2D\uFF0C\u77ED\u3001\u53EF\u8BFB\u3001\u81EA\u5DF1\u6D88\u5931\uFF0C\u4E0D\u9700\u8981\u7528\u6237\u5173\u3002 */
.dshmcp-toast {
  position: fixed; left: 50%; bottom: 24px; z-index: 60;
  max-width: calc(100vw - 48px); padding: 8px 16px; border-radius: 8px;
  transform: translateX(-50%);
  font-size: 12px; line-height: 18px; font-family: var(--dsw-font-family, inherit);
  color: var(--dsw-alias-label-primary, #1f2328);
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  box-shadow: var(--dsw-alias-shadow, 0 8px 24px rgba(0, 0, 0, 0.16)), inset 0 0 0 1px var(--dsw-alias-border-l3, #e5e7eb);
  animation: dshmcp-toast-in 160ms ease-out;
}
@keyframes dshmcp-toast-in {
  from { opacity: 0; transform: translate(-50%, 8px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
`;var Z="0.4.0";var m=A(require("react"),1);var pr=/^[A-Za-z0-9_-]{1,32}$/,cr=Object.freeze(["stdio","streamable-http"]),ur=Object.freeze(["mcpServers","servers"]),mr=Object.freeze({stdio:"stdio",sse:"streamable-http",http:"streamable-http",https:"streamable-http","streamable-http":"streamable-http",streamablehttp:"streamable-http",streamable_http:"streamable-http"}),fr=Object.freeze({toolCallTimeoutMs:6e4,maxInstructionBytes:32768,failOnStartupError:!1}),hr=Object.freeze(["serverName","transport","command","args","env","cwd","url","headers","toolCallTimeoutMs","maxInstructionBytes","failOnStartupError","reconnect","disabled"]),ke=Object.freeze(["serverName","transport","command","args","env","cwd","url","headers","toolCallTimeoutMs","maxInstructionBytes","failOnStartupError","reconnect","disabled"]),y="error",D="warn";function Q(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}function Se(e){if(!Q(e))return!1;for(let s of Object.keys(e))if(typeof e[s]!="string")return!1;return!0}function br(e,s){let r=Math.max(0,Math.min(s,e.length)),t=1,n=-1;for(let o=0;o<r;o+=1)e[o]===`
`&&(t+=1,n=o);return{line:t,column:r-n}}function gr(e){let s=e.length,r=0,t=()=>{for(;r<s&&(e[r]===" "||e[r]==="	"||e[r]===`
`||e[r]==="\r");)r+=1},n=()=>{if(e[r]!=='"')return!1;for(r+=1;r<s;){let d=e[r];if(d==="\\"){r+=2;continue}if(d==='"')return r+=1,!0;if(d===`
`||d==="\r")return!1;r+=1}return!1},o=()=>{(e[r]==="-"||e[r]==="+")&&(r+=1);let d=0;for(;r<s&&e[r]>="0"&&e[r]<="9";)r+=1,d+=1;if(d===0)return!1;if(e[r]==="."){r+=1;let p=0;for(;r<s&&e[r]>="0"&&e[r]<="9";)r+=1,p+=1;if(p===0)return!1}if(e[r]==="e"||e[r]==="E"){r+=1,(e[r]==="-"||e[r]==="+")&&(r+=1);let p=0;for(;r<s&&e[r]>="0"&&e[r]<="9";)r+=1,p+=1;if(p===0)return!1}return!0},c=d=>{let p=d==="{"?"}":"]";if(r+=1,t(),r<s&&e[r]===p)return r+=1,!0;for(;;){if(d==="{"){if(t(),r>=s||e[r]!=='"'||n()!==!0||(t(),e[r]!==":")||(r+=1,u()!==!0))return!1}else if(u()!==!0)return!1;if(t(),r>=s)return!1;if(e[r]===","){r+=1;continue}return e[r]===p?(r+=1,!0):!1}},u=()=>{if(t(),r>=s)return!1;let d=e[r];return d==='"'?n():d==="{"||d==="["?c(d):e.startsWith("true",r)||e.startsWith("false",r)||e.startsWith("null",r)?(r+=d==="n"||d==="t"?4:5,!0):d==="-"||d>="0"&&d<="9"?o():!1};return t(),r>=s?0:u()!==!0||(t(),r<s)?r:-1}function vr(e){try{return{ok:!0,value:JSON.parse(e)}}catch(s){let r=s instanceof Error?s.message:String(s),t=r.replace(/ is not valid JSON$/,"").replace(/ in JSON at position \d+[\s\S]*$/,"").replace(/, (?:\.\.\.)?"[\s\S]*$/,"").trim(),n=/at position (\d+)/.exec(r),o=/\(line (\d+) column (\d+)\)/.exec(r);if(o!==null)return{ok:!1,message:r,reason:t,line:Number(o[1]),column:Number(o[2])};let c=n===null?-1:Number(n[1]);if(c<0&&(c=gr(e)),c<0)return{ok:!1,message:r,reason:t};let{line:u,column:d}=br(e,c);return{ok:!1,message:r,reason:t,line:u,column:d}}}function g(e,s,r,t){return{level:e,code:s,path:r,message:t}}function yr(e,s){let r=ur.find(p=>e[p]!==void 0);if(r===void 0)return null;let t=e[r];if(!Q(t))return s.push(g(y,"E_WRAPPER",`$.${r}`,`${r} \u5FC5\u987B\u662F\u4E00\u4E2A\u5BF9\u8C61`)),{input:null};let n=Object.keys(t);if(n.length===0)return s.push(g(y,"E_WRAPPER",`$.${r}`,`${r} \u91CC\u6CA1\u6709\u4EFB\u4F55\u670D\u52A1\u5668`)),{input:null};if(n.length>1){let p=n.slice(0,5).join("\u3001")+(n.length>5?"\u2026":"");return s.push(g(y,"E_WRAPPER_MULTI",`$.${r}`,`${r} \u91CC\u6709 ${n.length} \u4E2A\u670D\u52A1\u5668\uFF08${p}\uFF09\uFF0C\u4E00\u6B21\u53EA\u80FD\u6DFB\u52A0\u4E00\u4E2A`)),{input:null}}let o=n[0],c=t[o];if(!Q(c))return s.push(g(y,"E_WRAPPER",`$.${r}.${o}`,`${r}.${o} \u5FC5\u987B\u662F\u4E00\u4E2A\u5BF9\u8C61`)),{input:null};let u=Object.keys(e).filter(p=>p!==r);u.length>0&&s.push(g(D,"W_WRAPPER_EXTRA","$",`\u5DF2\u6309 ${r} \u91CC\u7684 "${o}" \u89E3\u6790\uFF0C\u540C\u7EA7\u5B57\u6BB5\uFF08${u.slice(0,5).join("\u3001")}\uFF09\u672A\u91C7\u7528`));let d={...c};return d.serverName!==void 0&&d.serverName!==o&&s.push(g(D,"W_NAME_OVERRIDDEN","$.serverName",`serverName \u53D6\u96C6\u5408\u952E "${o}"\uFF0C\u6761\u76EE\u91CC\u5199\u7684\u90A3\u4E2A\u5DF2\u5FFD\u7565`)),d.serverName=o,{input:d}}function Ee(e,s){let r=typeof e.transport=="string"?e.transport:void 0;if(r===void 0){for(let o of["transportType","type"])if(typeof e[o]=="string"){r=e[o];break}}if(delete e.transportType,delete e.type,r===void 0){typeof e.command=="string"?(e.transport="stdio",s.push(g(D,"W_INFER_TRANSPORT","$.transport","\u672A\u5199\u4F20\u8F93\u65B9\u5F0F\uFF0C\u6309 command \u63A8\u65AD\u4E3A stdio"))):typeof e.url=="string"&&(e.transport="streamable-http",s.push(g(D,"W_INFER_TRANSPORT","$.transport","\u672A\u5199\u4F20\u8F93\u65B9\u5F0F\uFF0C\u6309 url \u63A8\u65AD\u4E3A streamable-http")));return}let t=r.trim().toLowerCase(),n=mr[t];if(n===void 0){e.transport=r;return}e.transport=n,t==="sse"?s.push(g(D,"W_SSE","$.transport","DSH \u4E0D\u652F\u6301 SSE\uFF0C\u5DF2\u6309 streamable-http \u5199\u5165\uFF1B\u8FDE\u4E0D\u4E0A\u65F6\u8BF7\u6539\u7528\u8BE5\u670D\u52A1\u7684 streamable-http \u5730\u5740")):e.transport!==r&&s.push(g(D,"W_TRANSPORT_ALIAS","$.transport",`\u4F20\u8F93\u65B9\u5F0F "${r}" \u5DF2\u5F52\u4E00\u4E3A ${n}`))}function xr(e,s){let r=yr(e,s);if(r!==null)return r.input===null?null:(Ee(r.input,s),r.input);let t={...e};return Ee(t,s),t}function wr(e){let s=[];if(!Q(e))return s.push(g(y,"E_ROOT","$","\u914D\u7F6E\u5FC5\u987B\u662F\u4E00\u4E2A JSON \u5BF9\u8C61")),{issues:s,normalized:null};let r=xr(e,s);if(r===null)return{issues:s,normalized:null};let t=r,n=t.transport;typeof n=="string"&&cr.includes(n)||s.push(g(y,"E_TRANSPORT","$.transport",typeof n=="string"?`\u4E0D\u652F\u6301 transport "${n}"\uFF0C\u53EA\u80FD\u662F stdio \u6216 streamable-http`:"transport \u5FC5\u586B\uFF0C\u53EA\u80FD\u662F stdio \u6216 streamable-http"));let c=t.serverName;typeof c=="string"&&pr.test(c)||s.push(g(y,"E_NAME","$.serverName","serverName \u53EA\u80FD\u5305\u542B\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u4E0B\u5212\u7EBF\u548C\u8FDE\u5B57\u7B26\uFF0C\u957F\u5EA6 1\u201332")),n==="stdio"&&(typeof t.command!="string"||t.command.trim()==="")&&s.push(g(y,"E_COMMAND","$.command","stdio \u4F20\u8F93\u5FC5\u987B\u63D0\u4F9B command")),t.args!==void 0&&(Array.isArray(t.args)&&t.args.every(w=>typeof w=="string")||s.push(g(y,"E_ARGS","$.args","args \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4"))),t.env!==void 0&&!Se(t.env)&&s.push(g(y,"E_ENV","$.env","env \u5FC5\u987B\u662F\u300C\u5B57\u7B26\u4E32: \u5B57\u7B26\u4E32\u300D\u5BF9\u8C61")),t.cwd!==void 0&&(typeof t.cwd!="string"||t.cwd==="")&&s.push(g(y,"E_CWD","$.cwd","cwd \u5FC5\u987B\u662F\u5B57\u7B26\u4E32"));let d=!1;if(n==="streamable-http"&&(d=typeof t.url=="string"&&Nr(t.url),d||s.push(g(y,"E_URL","$.url","streamable-http \u4F20\u8F93\u5FC5\u987B\u63D0\u4F9B\u5408\u6CD5\u7684 url"))),t.headers!==void 0&&!Se(t.headers)&&s.push(g(y,"E_HEADERS","$.headers","headers \u5FC5\u987B\u662F\u300C\u5B57\u7B26\u4E32: \u5B57\u7B26\u4E32\u300D\u5BF9\u8C61")),t.toolCallTimeoutMs!==void 0){let h=t.toolCallTimeoutMs;(!Number.isInteger(h)||h<1||h>6e5)&&s.push(g(y,"E_TIMEOUT","$.toolCallTimeoutMs","toolCallTimeoutMs \u5FC5\u987B\u662F 1\u2013600000 \u7684\u6574\u6570"))}if(t.maxInstructionBytes!==void 0){let h=t.maxInstructionBytes;(!Number.isInteger(h)||h<1)&&s.push(g(y,"E_BYTES","$.maxInstructionBytes","maxInstructionBytes \u5FC5\u987B\u662F\u6B63\u6574\u6570"))}if(t.failOnStartupError!==void 0&&typeof t.failOnStartupError!="boolean"&&s.push(g(y,"E_FAIL","$.failOnStartupError","failOnStartupError \u5FC5\u987B\u662F\u5E03\u5C14\u503C")),t.disabled!==void 0&&typeof t.disabled!="boolean"&&s.push(g(y,"E_DISABLED","$.disabled","disabled \u5FC5\u987B\u662F\u5E03\u5C14\u503C")),n==="stdio")for(let h of["url","headers"])t[h]!==void 0&&s.push(g(y,"E_MISMATCH",`$.${h}`,`stdio \u4F20\u8F93\u4E0D\u652F\u6301 ${h} \u5B57\u6BB5`));if(n==="streamable-http")for(let h of["command","args","cwd"])t[h]!==void 0&&s.push(g(y,"E_MISMATCH",`$.${h}`,`streamable-http \u4F20\u8F93\u4E0D\u652F\u6301 ${h} \u5B57\u6BB5`));for(let h of Object.keys(t))hr.includes(h)||s.push(g(D,"W_UNKNOWN",`$.${h}`,`\u672A\u77E5\u5B57\u6BB5 "${h}" \u4E0D\u5728\u5DF2\u77E5\u5B57\u6BB5\u5185\uFF0C\u5C06\u539F\u6837\u5199\u5165\uFF1B\u82E5 DSH \u4E0D\u652F\u6301\u5219\u4F1A\u88AB\u5FFD\u7565`));let p=s.some(h=>h.level===y);return{issues:s,normalized:p?null:kr(t)}}function Nr(e){try{let s=new URL(e);return s.protocol==="http:"||s.protocol==="https:"}catch{return!1}}function kr(e){let s={};for(let r of ke)e[r]!==void 0&&(s[r]=e[r]);for(let r of Object.keys(e))ke.includes(r)||(s[r]=e[r]);for(let[r,t]of Object.entries(fr))s[r]===void 0&&(s[r]=t);return s}function Sr(e,s={}){let r=[];if(e===null||typeof e!="object")return r;let t=Array.isArray(s.serverNames)?s.serverNames:[],n=Array.isArray(s.ids)?s.ids:[],o=typeof e.serverName=="string"?e.serverName:"";o!==""&&t.includes(o)&&r.push(g(y,"E_DUP","$.serverName",`serverName "${o}" \u5DF2\u5B58\u5728\uFF0C\u8BF7\u6362\u4E00\u4E2A\u540D\u5B57`));let c=o===""?"":`mcp-${o}`;return c!==""&&n.includes(c)&&r.push(g(y,"E_DUP","$.id",`\u6761\u76EE id "${c}" \u5DF2\u88AB\u5360\u7528\uFF0C\u8BF7\u6362\u4E00\u4E2A serverName`)),r}function $e(e,s={}){let r=vr(e);if(r.ok!==!0){let u=typeof r.line=="number"?r.line:0,d=typeof r.column=="number"?r.column:0,p=u>0?`\u7B2C ${u} \u884C\u7B2C ${d} \u5217`:"\u672A\u77E5\u4F4D\u7F6E";return{ok:!1,value:null,issues:[{level:y,code:"E_JSON",path:"$",line:u>0?u:void 0,column:d>0?d:void 0,message:`JSON \u8BED\u6CD5\u9519\u8BEF\uFF08${p}\uFF09\uFF1A${r.reason}`}]}}let{issues:t,normalized:n}=wr(r.value),o=Sr(n,{serverNames:s.existingServerNames??[],ids:s.existingIds??[]}),c=t.concat(o);return{ok:!c.some(u=>u.level===y),value:n,issues:c}}var b=A(require("react"),1);function R({size:e=16}){return b.default.createElement("svg",{width:e,height:e,viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round","aria-hidden":"true"},b.default.createElement("path",{d:"M8 3.5v9M3.5 8h9"}))}function Ce({size:e=16}){return b.default.createElement("svg",{width:e,height:e,viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round","aria-hidden":"true"},b.default.createElement("circle",{cx:"3.5",cy:"8",r:"0.75",fill:"currentColor",stroke:"none"}),b.default.createElement("circle",{cx:"8",cy:"8",r:"0.75",fill:"currentColor",stroke:"none"}),b.default.createElement("circle",{cx:"12.5",cy:"8",r:"0.75",fill:"currentColor",stroke:"none"}))}function Oe({size:e=16}){return b.default.createElement("svg",{width:e,height:e,viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true"},b.default.createElement("path",{d:"M13.5 8a5.5 5.5 0 1 1-1.9-4.16"}),b.default.createElement("path",{d:"M13.5 2.5V5.5H10.5"}))}function T({size:e=16}){return b.default.createElement("svg",{width:e,height:e,viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true"},b.default.createElement("path",{d:"M8 2.5 14.5 13.5H1.5L8 2.5Z"}),b.default.createElement("path",{d:"M8 6.5v3M8 11.5h.01"}))}function Me({size:e=16}){return b.default.createElement("svg",{width:e,height:e,viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round","aria-hidden":"true"},b.default.createElement("circle",{cx:"8",cy:"8",r:"5.75"}),b.default.createElement("path",{d:"M8 7.5v4M8 5h.01"}))}function Ae({size:e=48}){return b.default.createElement("svg",{width:e,height:e,viewBox:"0 0 48 48",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true"},b.default.createElement("rect",{x:"7",y:"11",width:"34",height:"26",rx:"4"}),b.default.createElement("path",{d:"M7 19h34"}),b.default.createElement("path",{d:"M18 27l4 4-4 4"}),b.default.createElement("path",{d:"M30 35h8"}))}function Te({size:e=16}){return b.default.createElement("svg",{width:e,height:e,viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true"},b.default.createElement("path",{d:"M1.5 8.5h2.6l1.5-3.5 2.4 7 1.7-3.5h4.8"}))}function Ie({size:e=16,open:s=!1}){return b.default.createElement("svg",{width:e,height:e,viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round",className:s===!0?"dshmcp-chevron is-open":"dshmcp-chevron","aria-hidden":"true"},b.default.createElement("path",{d:"M6 4.5 9.5 8 6 11.5"}))}function _e({size:e=16}){return b.default.createElement("svg",{width:e,height:e,viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true"},b.default.createElement("path",{d:"M8 2.5v7"}),b.default.createElement("path",{d:"M5 6.5 8 9.5l3-3"}),b.default.createElement("path",{d:"M2.5 11.5v1a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1"}))}var te=Object.freeze([Object.freeze({label:"Claude / Cursor \xB7 \u672C\u5730\u547D\u4EE4",value:JSON.stringify({mcpServers:{github:{command:"npx",args:["-y","@modelcontextprotocol/server-github"],env:{GITHUB_TOKEN:"!!js process.env.GITHUB_TOKEN"}}}},null,2)}),Object.freeze({label:"Claude / Cursor \xB7 \u8FDC\u7A0B\u670D\u52A1",value:JSON.stringify({mcpServers:{remote:{type:"http",url:"https://example.com/mcp",headers:{Authorization:"Bearer your-token"}}}},null,2)}),Object.freeze({label:"DSH \u539F\u751F\u5199\u6CD5",value:JSON.stringify({serverName:"remote",transport:"streamable-http",url:"https://example.com/mcp",headers:{Authorization:"Bearer your-token"}},null,2)})]);function Le({existingServerNames:e=[],existingIds:s=[],staleHost:r=!1,onSubmit:t,onCancel:n}){let[o,c]=(0,m.useState)(te[0].value),[u,d]=(0,m.useState)(!1),[p,h]=(0,m.useState)(""),w=(0,m.useMemo)(()=>$e(o,{existingServerNames:e,existingIds:s}),[o,e,s]),B=w.issues.filter(v=>v.level==="error"||v.level==="warn"),F=w.ok===!0&&u===!1,I=w.ok===!0&&w.value!==null?w.value:null;(0,m.useEffect)(()=>{h("")},[o]);let S=async()=>{if(!(w.ok!==!0||u===!0)){d(!0),h("");try{await t(o)}catch(v){h(v instanceof Error?v.message:String(v))}finally{d(!1)}}};return m.default.createElement("div",{className:"dshmcp-mask-layer",role:"dialog","aria-modal":"true"},m.default.createElement("div",{className:"dshmcp-dialog"},m.default.createElement("div",{className:"dshmcp-dialog-head"},m.default.createElement("h3",{className:"dshmcp-dialog-title"},"\u6DFB\u52A0 MCP \u670D\u52A1\u5668"),m.default.createElement("button",{type:"button",className:"dshmcp-btn is-ghost",onClick:n,"aria-label":"\u5173\u95ED"},"\u2715")),m.default.createElement("div",{className:"dshmcp-dialog-body"},m.default.createElement("div",{className:"dshmcp-field"},m.default.createElement("span",{className:"dshmcp-field-label"},"JSON \u914D\u7F6E"),m.default.createElement("select",{className:"dshmcp-select",value:"",onChange:v=>{let O=te.find(_=>_.label===v.target.value);O!==void 0&&c(O.value)}},m.default.createElement("option",{value:""},"\u586B\u5165\u793A\u4F8B \u25BE"),te.map(v=>m.default.createElement("option",{key:v.label,value:v.label},v.label)))),m.default.createElement("textarea",{className:"dshmcp-editor",spellCheck:!1,value:o,onChange:v=>c(v.target.value)}),B.length===0?null:m.default.createElement("div",{className:"dshmcp-issues"},B.map(v=>m.default.createElement("div",{key:`${v.code}:${v.path}`,className:`dshmcp-issue ${v.level==="warn"?"is-warn":"is-error"}`},m.default.createElement(T,null),m.default.createElement("span",null,typeof v.line=="number"?`\u7B2C ${v.line} \u884C\uFF1A`:"",v.message)))),p===""?null:m.default.createElement("div",{className:"dshmcp-issues"},m.default.createElement("div",{className:"dshmcp-issue is-error"},m.default.createElement(T,null),m.default.createElement("span",null,"\u670D\u52A1\u7AEF\u672A\u901A\u8FC7\uFF1A",p,r===!0?"\uFF08Host \u662F\u65E7\u7248\u672C\uFF0C\u91CD\u542F DSH \u540E\u91CD\u8BD5\uFF09":""))),I===null?null:m.default.createElement("div",{className:"dshmcp-hint"},m.default.createElement("span",{className:"dshmcp-hint-icon"},m.default.createElement(Me,null)),m.default.createElement("span",null,"\u5C06\u5199\u5165 ",m.default.createElement("span",{className:"dshmcp-path"},I.serverName)," \xB7 ",I.transport,I.disabled===!0?" \xB7 \u9ED8\u8BA4\u505C\u7528":""))),m.default.createElement("div",{className:"dshmcp-dialog-foot"},m.default.createElement("button",{type:"button",className:"dshmcp-btn is-secondary",onClick:n,disabled:u},"\u53D6\u6D88"),m.default.createElement("button",{type:"button",className:"dshmcp-btn",onClick:S,disabled:!F},u?"\u63D0\u4EA4\u4E2D\u2026":"\u786E\u5B9A"))))}var k=A(require("react"),1);function Pe({serverName:e,busy:s=!1,onConfirm:r,onCancel:t}){let[n,o]=k.default.useState(!1),c=s||n;return k.default.createElement("div",{className:"dshmcp-mask-layer",role:"dialog","aria-modal":"true"},k.default.createElement("div",{className:"dshmcp-dialog"},k.default.createElement("div",{className:"dshmcp-dialog-head"},k.default.createElement("h3",{className:"dshmcp-dialog-title"},"\u5220\u9664 MCP \u670D\u52A1\u5668"),k.default.createElement("button",{type:"button",className:"dshmcp-btn is-ghost",onClick:t,"aria-label":"\u5173\u95ED"},"\u2715")),k.default.createElement("div",{className:"dshmcp-dialog-body"},k.default.createElement("div",{className:"dshmcp-issue is-error"},k.default.createElement(T,null),k.default.createElement("span",null,"\u786E\u5B9A\u8981\u5220\u9664 ",k.default.createElement("strong",null,e)," \u5417\uFF1F\u8BE5\u6761\u76EE\u4F1A\u4ECE\u53D7\u7BA1\u6BB5\u79FB\u9664\uFF0C\u5176\u914D\u7F6E\u5C06\u4E0D\u518D\u751F\u6548\u3002")),k.default.createElement("div",{className:"dshmcp-hint"},k.default.createElement("span",null,"\u5220\u9664\u524D\u4F1A\u81EA\u52A8\u5907\u4EFD\u4E00\u4EFD\u5230\u914D\u7F6E\u6587\u4EF6\u7684 .bak\uFF0C\u9700\u8981\u65F6\u53EF\u624B\u5DE5\u6062\u590D\u3002"))),k.default.createElement("div",{className:"dshmcp-dialog-foot"},k.default.createElement("button",{type:"button",className:"dshmcp-btn is-secondary",onClick:t,disabled:c},"\u53D6\u6D88"),k.default.createElement("button",{type:"button",className:"dshmcp-btn is-danger",onClick:async()=>{if(c!==!0){o(!0);try{await r()}finally{o(!1)}}},disabled:c},c?"\u5220\u9664\u4E2D\u2026":"\u5220\u9664"))))}var z=A(require("react"),1);function je({onAdd:e}){return z.default.createElement("div",{className:"dshmcp-empty"},z.default.createElement("span",{className:"dshmcp-empty-icon"},z.default.createElement(Ae,null)),z.default.createElement("p",{className:"dshmcp-empty-title"},"\u8FD8\u6CA1\u6709\u914D\u7F6E MCP \u670D\u52A1\u5668"),z.default.createElement("p",{className:"dshmcp-empty-text"},"\u7C98\u8D34 JSON \u914D\u7F6E\u5373\u53EF\u63A5\u5165\uFF0C\u652F\u6301 Claude / Cursor \u683C\u5F0F\u3002"),z.default.createElement("button",{type:"button",className:"dshmcp-btn",onClick:e},z.default.createElement(R,null),"\u6DFB\u52A0 MCP"))}var U=A(require("react"),1);var l=A(require("react"),1);var ae=A(require("react"),1);function He({checked:e,disabled:s=!1,label:r,onChange:t}){return ae.default.createElement("button",{type:"button",role:"switch","aria-checked":e===!0,"aria-label":r,className:e===!0?"dshmcp-switch is-on":"dshmcp-switch",disabled:s,onClick:()=>t(e!==!0)},ae.default.createElement("span",{className:"dshmcp-switch-knob"}))}function Er(e){return typeof e!="number"||!Number.isFinite(e)?"\u9ED8\u8BA4":`${Math.round(e/1e3)}s`}function $r(e,s){return e.enabled!==!0?"\u8BE5\u670D\u52A1\u5668\u5DF2\u505C\u7528\uFF0C\u5DE5\u5177\u4E0D\u4F1A\u6CE8\u518C\u3002":s!==null&&s.available===!1?"\u5BBF\u4E3B\u6CA1\u6709\u63D0\u4F9B tools \u670D\u52A1\uFF0C\u8BFB\u4E0D\u5230\u5DE5\u5177\u5217\u8868\u3002":"\u5F53\u524D\u6CA1\u6709\u6CE8\u518C\u4EFB\u4F55\u5DE5\u5177\uFF1A\u82E5\u521A\u6539\u8FC7\u914D\u7F6E\uFF0C\u91CD\u542F DSH \u540E\u624D\u4F1A\u751F\u6548\uFF1B\u5426\u5219\u770B DSH \u65E5\u5FD7\u91CC\u7684\u8FDE\u63A5\u9519\u8BEF\u3002"}function ne({item:e,highlighted:s=!1,onToggle:r,onRemove:t,onHealth:n,onLoadTools:o,busy:c=!1}){let[u,d]=(0,l.useState)(!1),[p,h]=(0,l.useState)(!1),[w,B]=(0,l.useState)(null),[F,I]=(0,l.useState)(!1),[S,v]=(0,l.useState)(null),[O,_]=(0,l.useState)(!1),M=typeof e.serverName=="string"&&e.serverName!==""?e.serverName:"\uFF08\u65E0\u6CD5\u89E3\u6790\uFF09",L=e.managed===!0&&e.parsable===!0,W=["dshmcp-card",e.enabled===!0?"":"is-off",s===!0?"is-new":""].filter(x=>x!=="").join(" "),V=typeof e.toolCount=="number"?e.toolCount:null,J=S===null?null:Y(S.status),P=x=>{d(!1),x()},G=async()=>{if(p===!0){h(!1);return}if(h(!0),!(w!==null||typeof o!="function")){I(!0);try{B(await o(M))}finally{I(!1)}}},E=async()=>{if(!(O===!0||typeof n!="function")){_(!0);try{v(await n(M))}finally{_(!1)}}};return l.default.createElement("div",{className:W},l.default.createElement("div",{className:"dshmcp-card-head"},l.default.createElement("span",{className:`dshmcp-dot${e.enabled===!0?"":" is-off"}`}),l.default.createElement("span",{className:"dshmcp-card-title"},M),typeof e.transport=="string"?l.default.createElement("span",{className:"dshmcp-chip"},e.transport):null,e.enabled===!0?null:l.default.createElement("span",{className:"dshmcp-chip is-off"},"\u5DF2\u505C\u7528"),e.parsable===!1?l.default.createElement("span",{className:"dshmcp-chip is-off"},"\u65E0\u6CD5\u89E3\u6790 \xB7 \u53EA\u8BFB"):null,l.default.createElement("span",{className:"dshmcp-card-spacer"}),e.parsable===!1?null:l.default.createElement("button",{type:"button",className:O===!0?"dshmcp-btn is-ghost dshmcp-spin":"dshmcp-btn is-ghost",disabled:O===!0,onClick:E,title:"\u5065\u5EB7\u68C0\u67E5","aria-label":"\u5065\u5EB7\u68C0\u67E5"},l.default.createElement(Te,null)),e.disabledBy==="expression"?l.default.createElement("span",{className:"dshmcp-chip is-off",title:"\u8BE5\u6761\u76EE\u7684\u542F\u7528\u72B6\u6001\u7531 !!js \u8868\u8FBE\u5F0F\u63A7\u5236"},"\u8868\u8FBE\u5F0F\u63A7\u5236"):L?l.default.createElement(He,{checked:e.enabled===!0,disabled:c===!0,label:`${e.enabled===!0?"\u505C\u7528":"\u542F\u7528"} ${M}`,onChange:x=>r(M,x)}):null,L?l.default.createElement("div",{className:"dshmcp-card-menu"},l.default.createElement("button",{type:"button",className:"dshmcp-btn is-ghost",disabled:c,onClick:()=>d(!u),title:"\u66F4\u591A\u64CD\u4F5C","aria-label":"\u66F4\u591A\u64CD\u4F5C"},l.default.createElement(Ce,null)),u?l.default.createElement("div",{className:"dshmcp-menu"},l.default.createElement("button",{type:"button",className:"dshmcp-menu-item",onClick:()=>P(()=>r(M,e.enabled!==!0))},e.enabled===!0?"\u505C\u7528":"\u542F\u7528"),l.default.createElement("button",{type:"button",className:"dshmcp-menu-item is-danger",onClick:()=>P(()=>t(M))},"\u5220\u9664")):null):null),e.parsable===!1?l.default.createElement("pre",{className:"dshmcp-raw"},e.raw):l.default.createElement(l.default.Fragment,null,l.default.createElement("div",{className:"dshmcp-cmd",title:e.summary},e.summary===""?"\u2014":e.summary),l.default.createElement("div",{className:"dshmcp-sep"}),l.default.createElement("div",{className:"dshmcp-meta"},l.default.createElement("span",{className:"dshmcp-meta-item"},"\u73AF\u5883",e.envKeys.length===0?l.default.createElement("span",null," \u65E0"):l.default.createElement("span",null," ",e.envKeys.join("\u3001")," ",l.default.createElement("span",{className:"dshmcp-mask"},"\u2022\u2022\u2022\u2022"))),Array.isArray(e.headerKeys)&&e.headerKeys.length>0?l.default.createElement("span",{className:"dshmcp-meta-item"},"\u8BF7\u6C42\u5934 ",e.headerKeys.join("\u3001")," ",l.default.createElement("span",{className:"dshmcp-mask"},"\u2022\u2022\u2022\u2022")):null,l.default.createElement("span",{className:"dshmcp-meta-item"},"\u8D85\u65F6 ",Er(e.toolCallTimeoutMs)),typeof e.cwd=="string"?l.default.createElement("span",{className:"dshmcp-meta-item"},"\u76EE\u5F55 ",e.cwd):null)),V===null||e.parsable!==!0?null:l.default.createElement("div",{className:"dshmcp-tools"},l.default.createElement("button",{type:"button",className:"dshmcp-tools-toggle",onClick:G,"aria-expanded":p===!0},l.default.createElement(Ie,{open:p===!0}),e.toolsAvailable===!1?"\u5DE5\u5177\u6570\u672A\u77E5":`\u5171 ${V} \u4E2A\u5DE5\u5177`),p!==!0?null:F===!0?l.default.createElement("div",{className:"dshmcp-tools-note"},"\u8BFB\u53D6\u4E2D\u2026"):w===null?l.default.createElement("div",{className:"dshmcp-tools-note"},"\u65E0\u6CD5\u8BFB\u53D6\u5DE5\u5177\u5217\u8868\u3002"):w.tools.length===0?l.default.createElement("div",{className:"dshmcp-tools-note"},$r(e,w)):l.default.createElement("div",{className:"dshmcp-tools-list"},w.tools.map(x=>l.default.createElement("div",{className:"dshmcp-tool",key:x.name},l.default.createElement("div",{className:"dshmcp-tool-head"},l.default.createElement("span",{className:"dshmcp-tool-name"},x.rawName),l.default.createElement("span",{className:"dshmcp-tool-params"},x.parameters===0?"\u65E0\u53C2\u6570":`${x.parameters} \u4E2A\u53C2\u6570`)),x.description===""?null:l.default.createElement("div",{className:"dshmcp-tool-desc",title:x.description},x.description))))),S===null||J===null?null:l.default.createElement("div",{className:`dshmcp-health ${J.className}`},l.default.createElement("span",{className:"dshmcp-health-title"},"\u5065\u5EB7\u68C0\u67E5 \xB7 ",J.label,typeof S.latencyMs=="number"?` \xB7 ${S.latencyMs}ms`:""),l.default.createElement("span",{className:"dshmcp-health-detail"},S.detail)))}function ze({items:e,highlighted:s="",busy:r=!1,onToggle:t,onRemove:n,onHealth:o,onLoadTools:c}){let u=e.filter(p=>p.managed===!0),d=e.filter(p=>p.managed!==!0);return U.default.createElement(U.default.Fragment,null,u.length===0?null:U.default.createElement("div",{className:"dshmcp-group"},u.map(p=>U.default.createElement(ne,{key:p.serverName??p.raw,item:p,highlighted:s!==""&&p.serverName===s,busy:r,onToggle:t,onRemove:n,onHealth:o,onLoadTools:c}))),d.length===0?null:U.default.createElement("div",{className:"dshmcp-group is-readonly"},U.default.createElement("p",{className:"dshmcp-group-title"},"\u975E\u672C\u63D2\u4EF6\u7BA1\u7406 \xB7 \u53EA\u8BFB"),d.map(p=>U.default.createElement(ne,{key:p.serverName??p.raw,item:p,busy:r,onToggle:t,onRemove:n,onHealth:o,onLoadTools:c}))))}var C=A(require("react"),1);function Ue({busy:e=!1,refreshing:s=!1,showActions:r=!1,version:t="",checking:n=!1,onAdd:o,onRefresh:c,onCheckUpdate:u}){return C.default.createElement("div",{className:"dshmcp-head"},C.default.createElement("div",null,C.default.createElement("h2",{className:"dshmcp-title"},"MCP \u670D\u52A1\u5668"),C.default.createElement("p",{className:"dshmcp-subtitle"},"\u7BA1\u7406\u5DF2\u63A5\u5165\u7684 MCP \u670D\u52A1\u5668\u3002",t===""?null:C.default.createElement("button",{type:"button",className:"dshmcp-version",onClick:u,disabled:n===!0,title:"\u70B9\u51FB\u68C0\u67E5\u66F4\u65B0"},n===!0?"\u68C0\u67E5\u4E2D\u2026":`v${t}`))),r===!0?C.default.createElement("div",{className:"dshmcp-actions"},C.default.createElement("button",{type:"button",className:s===!0?"dshmcp-btn is-ghost dshmcp-spin":"dshmcp-btn is-ghost",onClick:c,disabled:e||s,title:"\u5237\u65B0\u5217\u8868","aria-label":"\u5237\u65B0\u5217\u8868","aria-busy":s===!0},C.default.createElement(Oe,null)),C.default.createElement("button",{type:"button",className:"dshmcp-btn",onClick:o},C.default.createElement(R,null),"\u6DFB\u52A0 MCP")):null)}var Cr=1500,Or=3200,Mr=150;function Ar(e){return e==="plugin-manager-unavailable"?"\u5BBF\u4E3B\u6CA1\u6709\u63D0\u4F9B\u63D2\u4EF6\u7BA1\u7406\u5668\uFF0C\u8BF7\u5728\u300C\u8BBE\u7F6E \u2192 \u63D2\u4EF6\u300D\u91CC\u624B\u52A8\u66F4\u65B0":e==="unreachable"?"\u67E5\u8BE2 GitHub \u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5":String(e)}function We(){let[e,s]=(0,a.useState)("loading"),[r,t]=(0,a.useState)(null),[n,o]=(0,a.useState)(""),[c,u]=(0,a.useState)(""),[d,p]=(0,a.useState)(""),[h,w]=(0,a.useState)(!1),[B,F]=(0,a.useState)(!1),[I,S]=(0,a.useState)(!1),[v,O]=(0,a.useState)(""),[_,M]=(0,a.useState)(null),[L,W]=(0,a.useState)(null),[V,J]=(0,a.useState)(!1),[P,G]=(0,a.useState)(!1),E=i=>M({text:i}),x=(0,a.useCallback)(async()=>{w(!0),F(!0);try{let i=await ce();t(i),o(""),s("ready")}catch(i){o(i instanceof Error?i.message:String(i)),s("error")}finally{w(!1),F(!1)}},[]);(0,a.useEffect)(()=>{x()},[x]),(0,a.useEffect)(()=>{if(d==="")return;let i=setTimeout(()=>p(""),Cr);return()=>clearTimeout(i)},[d]),(0,a.useEffect)(()=>{if(_===null)return;let i=setTimeout(()=>M(null),Or);return()=>clearTimeout(i)},[_]),(0,a.useEffect)(()=>{let i=!0;return ge().then(f=>{i===!0&&W(f)}).catch(()=>{}),()=>{i=!1}},[]);let K=Array.isArray(r?.items)?r.items:[],oe=typeof r?.fileDisplay=="string"?r.fileDisplay:"",q=r?.taken??{serverNames:[],ids:[]},Je=r?.anchors==="broken",ee=typeof r?.version=="string"?r.version:"",re=e==="ready"&&ee!==Z,Ve=L!==null&&L.enabled!==!1&&L.updateAvailable===!0&&L.dismissed!==!0,j=i=>{let f=i!==null&&typeof i=="object"?String(i.code??""):"",N=i instanceof Error?i.message:String(i),H=i!==null&&typeof i=="object"&&i.rolledBack===!0,rr=re===!0?"\uFF08Host \u662F\u65E7\u7248\u672C\uFF0C\u91CD\u542F DSH \u540E\u91CD\u8BD5\uFF09":"";u(`${f===""?"":`${se(f)}\uFF1A`}${N}${H?"\uFF08\u6587\u4EF6\u5DF2\u56DE\u6EDA\uFF09":""}${rr}`)},Ge=async i=>{let f=await ue(i);S(!1),u(""),await x();let N=f.item!==null&&typeof f.item=="object"?f.item:null;if(N===null)return;let H=typeof N.serverName=="string"?N.serverName:"";p(H),E(`\u5DF2\u6DFB\u52A0 ${H===""?"MCP \u670D\u52A1\u5668":H}`)},Ke=async i=>{w(!0);try{await me(i),O(""),u(""),await x(),E(`\u5DF2\u5220\u9664 ${i}`)}catch(f){j(f)}finally{w(!1)}},qe=async(i,f)=>{w(!0);try{await fe(i,f),u(""),await x(),E(`${i} \u5DF2${f===!0?"\u542F\u7528":"\u505C\u7528"}\uFF0C\u91CD\u542F DSH \u540E\u751F\u6548`)}catch(N){j(N)}finally{w(!1)}},Xe=async i=>{try{let N=(await be(i)).report??null;return N!==null&&E(`${i} \u5065\u5EB7\u68C0\u67E5\uFF1A${Y(N.status).label}`),N}catch(f){return j(f),null}},Ye=async i=>{try{return await he(i)}catch(f){return j(f),null}},Ze=async()=>{if(V!==!0){J(!0);try{let i=await ve();W(i),i.error!==null&&i.error!==void 0?E("\u68C0\u67E5\u66F4\u65B0\u5931\u8D25\uFF1A\u8BBF\u95EE GitHub \u672A\u6210\u529F"):i.updateAvailable===!0?E(`\u53D1\u73B0\u65B0\u7248\u672C v${i.latest}`):E(`\u5DF2\u662F\u6700\u65B0\u7248\u672C v${i.current}`)}catch(i){j(i)}finally{J(!1)}}},Qe=async()=>{try{W(await ye())}catch(i){j(i)}},Re=async()=>{for(let i=0;i<Mr;i+=1){await new Promise(N=>{setTimeout(N,1e3)});let f;try{f=await we()}catch{return null}if(f.update!==null&&f.update!==void 0&&W(f.update),f.running!==!0)return f}return null},er=async()=>{if(P!==!0){G(!0);try{let i=await xe();i.update!==null&&i.update!==void 0&&W(i.update);let f=await Re();if(f===null){E("\u66F4\u65B0\u8FD8\u6CA1\u7ED3\u675F\uFF0C\u7A0D\u540E\u56DE\u6765\u770B\u770B\u7248\u672C\u53F7");return}if(f.error!==null&&f.error!==void 0&&f.error!==""){j(new Error(Ar(f.error)));return}let N=f.result!==null&&typeof f.result=="object"?f.result:{},H=typeof N.version=="string"?N.version:"\u65B0\u7248\u672C";E(N.application==="applied"?`\u5DF2\u66F4\u65B0\u5230 v${H}\uFF0C\u5DF2\u751F\u6548`:`\u5DF2\u66F4\u65B0\u5230 v${H}\uFF0C\u91CD\u542F DSH \u540E\u751F\u6548`)}catch(i){j(i)}finally{G(!1)}}};return a.default.createElement("div",{className:"dshmcp-page"},a.default.createElement("style",null,Ne),a.default.createElement(Ue,{busy:h,refreshing:B,showActions:K.length>0,version:Z,checking:V,onAdd:()=>{u(""),S(!0)},onRefresh:x,onCheckUpdate:Ze}),Ve?a.default.createElement("div",{className:"dshmcp-banner is-update",role:"status"},a.default.createElement(_e,null),a.default.createElement("div",{className:"dshmcp-banner-body"},a.default.createElement("div",null,"\u6709\u65B0\u7248\u672C v",L.latest,a.default.createElement("span",{className:"dshmcp-banner-note"}," \xB7 \u5F53\u524D v",L.current)),a.default.createElement("div",{className:"dshmcp-banner-note"},P===!0?"\u6B63\u5728\u4ECE GitHub \u5B89\u88C5\uFF0C\u88C5\u5B8C\u8FD9\u91CC\u4F1A\u81EA\u5DF1\u53D8\u3002":"\u786E\u8BA4\u540E\u539F\u5730\u5B89\u88C5\uFF0Cprofile \u7684\u4F9D\u8D56\u4F1A\u4E00\u8D77\u66F4\u65B0\u3002")),a.default.createElement("button",{type:"button",className:"dshmcp-btn",disabled:P===!0,onClick:er},P===!0?"\u66F4\u65B0\u4E2D\u2026":"\u66F4\u65B0"),a.default.createElement("button",{type:"button",className:"dshmcp-btn is-ghost",disabled:P===!0,onClick:Qe,"aria-label":"\u5FFD\u7565\u6B64\u7248\u672C"},"\u2715")):null,re?a.default.createElement("div",{className:"dshmcp-banner",role:"alert"},a.default.createElement(T,null),a.default.createElement("div",{className:"dshmcp-banner-body"},a.default.createElement("div",null,"\u9875\u9762 v",Z,"\uFF0C",ee===""?"\u8FD0\u884C\u4E2D\u7684 Host \u6CA1\u6709\u62A5\u544A\u7248\u672C":`\u8FD0\u884C\u4E2D\u7684 Host \u662F v${ee}`),a.default.createElement("div",{className:"dshmcp-banner-note"},"Host \u534A\u8FD8\u662F\u91CD\u542F\u524D\u7684\u65E7\u4EE3\u7801\uFF0C\u91CD\u542F DSH \u540E\u624D\u4F1A\u7528\u4E0A\u65B0\u7684\u6821\u9A8C\u89C4\u5219\u3002"))):null,c===""?null:a.default.createElement("div",{className:"dshmcp-banner",role:"alert"},a.default.createElement(T,null),a.default.createElement("div",{className:"dshmcp-banner-body"},a.default.createElement("div",null,c),a.default.createElement("div",{className:"dshmcp-banner-note"},"\u914D\u7F6E\u6587\u4EF6\u672A\u88AB\u7834\u574F\uFF0C\u53EF\u91CD\u8BD5\u6216\u5237\u65B0\u540E\u91CD\u6765\u3002")),a.default.createElement("button",{type:"button",className:"dshmcp-btn is-secondary",onClick:x},"\u91CD\u8BD5"),a.default.createElement("button",{type:"button",className:"dshmcp-btn is-ghost",onClick:()=>u(""),"aria-label":"\u5173\u95ED\u63D0\u793A"},"\u2715")),Je?a.default.createElement("div",{className:"dshmcp-banner",role:"alert"},a.default.createElement(T,null),a.default.createElement("div",{className:"dshmcp-banner-body"},a.default.createElement("div",null,"\u53D7\u7BA1\u6BB5\u6807\u8BB0\u88AB\u7834\u574F\uFF0C\u5DF2\u5207\u6362\u4E3A\u53EA\u8BFB"),a.default.createElement("div",{className:"dshmcp-banner-note"},"\u8BF7\u624B\u5DE5\u4FEE\u590D ",oe===""?"\u914D\u7F6E\u6587\u4EF6":oe," \u91CC\u7684",a.default.createElement("span",{className:"dshmcp-path"}," # >>> / # <<< ")," \u951A\u70B9\uFF0C\u4F7F\u5176\u6210\u5BF9\u4E14\u987A\u5E8F\u6B63\u786E\u3002"))):null,e==="loading"?a.default.createElement("div",null,a.default.createElement("div",{className:"dshmcp-skeleton"}),a.default.createElement("div",{className:"dshmcp-skeleton"})):null,e==="error"?a.default.createElement("div",{className:"dshmcp-banner",role:"alert"},a.default.createElement(T,null),a.default.createElement("div",{className:"dshmcp-banner-body"},a.default.createElement("div",null,"\u52A0\u8F7D\u5931\u8D25\uFF1A",n),a.default.createElement("div",{className:"dshmcp-banner-note"},"\u9875\u9762\u4E0D\u4F1A\u5361\u5728\u52A0\u8F7D\u6001\uFF0C\u53EF\u76F4\u63A5\u91CD\u8BD5\u3002")),a.default.createElement("button",{type:"button",className:"dshmcp-btn is-secondary",onClick:x},"\u91CD\u8BD5")):null,e==="ready"&&K.length===0?a.default.createElement(je,{onAdd:()=>{u(""),S(!0)}}):null,e==="ready"&&K.length>0?a.default.createElement(ze,{items:K,highlighted:d,busy:h,onToggle:qe,onRemove:O,onHealth:Xe,onLoadTools:Ye}):null,I===!0?a.default.createElement(Le,{existingServerNames:Array.isArray(q.serverNames)?q.serverNames:[],existingIds:Array.isArray(q.ids)?q.ids:[],staleHost:re,onSubmit:Ge,onCancel:()=>S(!1)}):null,v===""?null:a.default.createElement(Pe,{serverName:v,busy:h,onConfirm:()=>Ke(v),onCancel:()=>O("")}),_===null?null:a.default.createElement("div",{className:"dshmcp-toast",role:"status"},_.text))}var Be=["slots","sessions"];function Fe(e){e.slots.inject("settings.section",()=>e.slots.register({name:"settings.section",id:"dsh-mcpserver-manager",order:17,label:"MCP \u7BA1\u7406"},()=>De.default.createElement(We,null)))}
    })(module, module.exports, require);
    return module.exports;
  },
})
