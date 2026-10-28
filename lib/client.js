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
var xe=Object.create;var z=Object.defineProperty;var we=Object.getOwnPropertyDescriptor;var Ne=Object.getOwnPropertyNames;var ke=Object.getPrototypeOf,Se=Object.prototype.hasOwnProperty;var Ee=(s,r)=>{for(var e in r)z(s,e,{get:r[e],enumerable:!0})},F=(s,r,e,a)=>{if(r&&typeof r=="object"||typeof r=="function")for(let i of Ne(r))!Se.call(s,i)&&i!==e&&z(s,i,{get:()=>r[i],enumerable:!(a=we(r,i))||a.enumerable});return s};var S=(s,r,e)=>(e=s!=null?xe(ke(s)):{},F(r||!s||!s.__esModule?z(e,"default",{value:s,enumerable:!0}):e,s)),Ce=s=>F(z({},"__esModule",{value:!0}),s);var Fe={};Ee(Fe,{apply:()=>me,inject:()=>ce});module.exports=Ce(Fe);var pe=S(require("react"),1);var t=S(require("react"),1);var Me="/api/dsh-mcpserver-manager",J=Object.freeze({"invalid-json":"JSON \u8BED\u6CD5\u6709\u8BEF\uFF0C\u8BF7\u5BF9\u7167\u9519\u8BEF\u63D0\u793A\u4FEE\u6539","invalid-config":"\u914D\u7F6E\u6821\u9A8C\u672A\u901A\u8FC7\uFF0C\u8BF7\u5BF9\u7167\u9519\u8BEF\u63D0\u793A\u4FEE\u6539","duplicate-server":"\u540C\u540D MCP \u5DF2\u5B58\u5728\uFF0C\u8BF7\u6362\u4E00\u4E2A serverName","unknown-server":"\u8BE5\u6761\u76EE\u5DF2\u4E0D\u5B58\u5728\uFF0C\u8BF7\u5237\u65B0\u5217\u8868","readonly-entry":"\u8BE5\u6761\u76EE\u975E\u672C\u63D2\u4EF6\u7BA1\u7406\uFF0C\u65E0\u6CD5\u4FEE\u6539","unparsable-entry":"\u8BE5\u6761\u76EE\u683C\u5F0F\u8D85\u51FA\u53EF\u89E3\u6790\u8303\u56F4\uFF0C\u8BF7\u624B\u5DE5\u7F16\u8F91\u914D\u7F6E\u6587\u4EF6","anchors-broken":"\u53D7\u7BA1\u6BB5\u6807\u8BB0\u88AB\u7834\u574F\uFF0C\u8BF7\u624B\u5DE5\u4FEE\u590D cordis.patch.yml","file-changed":"\u914D\u7F6E\u6587\u4EF6\u5DF2\u88AB\u5916\u90E8\u4FEE\u6539\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5","disable-by-expression":"\u8BE5\u6761\u76EE\u7684\u542F\u7528\u72B6\u6001\u7531\u8868\u8FBE\u5F0F\u63A7\u5236\uFF0C\u8BF7\u624B\u5DE5\u4FEE\u6539","file-unreadable":"\u65E0\u6CD5\u8BFB\u53D6\u914D\u7F6E\u6587\u4EF6\uFF0C\u8BF7\u68C0\u67E5\u6587\u4EF6\u6743\u9650","write-failed":"\u5199\u5165\u5931\u8D25\uFF0C\u6587\u4EF6\u5DF2\u56DE\u6EDA","body-too-large":"\u914D\u7F6E\u5185\u5BB9\u8FC7\u5927","method-not-allowed":"\u8BF7\u6C42\u65B9\u5F0F\u4E0D\u88AB\u652F\u6301","internal-error":"\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"});function W(s){return J[s]??J["internal-error"]}async function _(s,r={}){let e;try{e=await fetch(`${Me}${s}`,{cache:"no-store",headers:{"content-type":"application/json"},...r})}catch{let n=new Error("\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u8FDE\u63A5\u540E\u91CD\u8BD5");throw n.code="network-error",n}let a=null;try{a=await e.json()}catch{let i=new Error("\u670D\u52A1\u7AEF\u8FD4\u56DE\u4E86\u65E0\u6CD5\u89E3\u6790\u7684\u54CD\u5E94");throw i.code="internal-error",i}if(e.ok!==!0||a?.ok!==!0){let i=typeof a?.error?.code=="string"?a.error.code:"internal-error",n=new Error(typeof a?.error?.message=="string"&&a.error.message!==""?a.error.message:W(i));throw n.code=i,n.errors=Array.isArray(a?.error?.errors)?a.error.errors:[],n.rolledBack=a?.error?.rolledBack===!0,n}return a.data??{}}function U(){return _("/servers")}function G(s){return _("/servers",{method:"POST",body:JSON.stringify({raw:s})})}function K(s){return _(`/servers/${encodeURIComponent(s)}`,{method:"DELETE"})}function V(s,r){return _(`/servers/${encodeURIComponent(s)}/toggle`,{method:"POST",body:JSON.stringify({enabled:r})})}var q=`
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

.dshmcp-target {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 12px; border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #f9fafb);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l1, #e5e7eb);
}
.dshmcp-target-label {
  flex: 0 0 auto; font-size: 11px; line-height: 16px; font-weight: 600;
  letter-spacing: 0.02em; color: var(--dsw-alias-label-tertiary, #6b7280);
}
.dshmcp-target-path {
  min-width: 0; font-size: 12px; line-height: 18px;
  font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  color: var(--dsw-alias-label-primary, #1f2328);
  overflow-wrap: anywhere;
}
.dshmcp-target-note { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary, #6b7280); }

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
`;var p=S(require("react"),1);var Oe=/^[A-Za-z0-9_-]{1,32}$/,$e=Object.freeze(["stdio","streamable-http"]),Ae=Object.freeze({toolCallTimeoutMs:6e4,maxInstructionBytes:32768,failOnStartupError:!1}),Ie=Object.freeze(["serverName","transport","command","args","env","cwd","url","headers","toolCallTimeoutMs","maxInstructionBytes","failOnStartupError","reconnect"]),Z=Object.freeze(["serverName","transport","command","args","env","cwd","url","headers","toolCallTimeoutMs","maxInstructionBytes","failOnStartupError","reconnect"]),b="error",je="warn";function Q(s){return s!==null&&typeof s=="object"&&!Array.isArray(s)}function Y(s){if(!Q(s))return!1;for(let r of Object.keys(s))if(typeof s[r]!="string")return!1;return!0}function Te(s,r){let e=Math.max(0,Math.min(r,s.length)),a=1,i=-1;for(let n=0;n<e;n+=1)s[n]===`
`&&(a+=1,i=n);return{line:a,column:e-i}}function ze(s){let r=s.length,e=0,a=()=>{for(;e<r&&(s[e]===" "||s[e]==="	"||s[e]===`
`||s[e]==="\r");)e+=1},i=()=>{if(s[e]!=='"')return!1;for(e+=1;e<r;){let d=s[e];if(d==="\\"){e+=2;continue}if(d==='"')return e+=1,!0;if(d===`
`||d==="\r")return!1;e+=1}return!1},n=()=>{(s[e]==="-"||s[e]==="+")&&(e+=1);let d=0;for(;e<r&&s[e]>="0"&&s[e]<="9";)e+=1,d+=1;if(d===0)return!1;if(s[e]==="."){e+=1;let l=0;for(;e<r&&s[e]>="0"&&s[e]<="9";)e+=1,l+=1;if(l===0)return!1}if(s[e]==="e"||s[e]==="E"){e+=1,(s[e]==="-"||s[e]==="+")&&(e+=1);let l=0;for(;e<r&&s[e]>="0"&&s[e]<="9";)e+=1,l+=1;if(l===0)return!1}return!0},c=d=>{let l=d==="{"?"}":"]";if(e+=1,a(),e<r&&s[e]===l)return e+=1,!0;for(;;){if(d==="{"){if(a(),e>=r||s[e]!=='"'||i()!==!0||(a(),s[e]!==":")||(e+=1,o()!==!0))return!1}else if(o()!==!0)return!1;if(a(),e>=r)return!1;if(s[e]===","){e+=1;continue}return s[e]===l?(e+=1,!0):!1}},o=()=>{if(a(),e>=r)return!1;let d=s[e];return d==='"'?i():d==="{"||d==="["?c(d):s.startsWith("true",e)||s.startsWith("false",e)||s.startsWith("null",e)?(e+=d==="n"||d==="t"?4:5,!0):d==="-"||d>="0"&&d<="9"?n():!1};return a(),e>=r?0:o()!==!0||(a(),e<r)?e:-1}function _e(s){try{return{ok:!0,value:JSON.parse(s)}}catch(r){let e=r instanceof Error?r.message:String(r),a=e.replace(/ is not valid JSON$/,"").replace(/ in JSON at position \d+[\s\S]*$/,"").replace(/, (?:\.\.\.)?"[\s\S]*$/,"").trim(),i=/at position (\d+)/.exec(e),n=/\(line (\d+) column (\d+)\)/.exec(e);if(n!==null)return{ok:!1,message:e,reason:a,line:Number(n[1]),column:Number(n[2])};let c=i===null?-1:Number(i[1]);if(c<0&&(c=ze(s)),c<0)return{ok:!1,message:e,reason:a};let{line:o,column:d}=Te(s,c);return{ok:!1,message:e,reason:a,line:o,column:d}}}function g(s,r,e,a){return{level:s,code:r,path:e,message:a}}function Be(s){let r=[];if(!Q(s))return r.push(g(b,"E_ROOT","$","\u914D\u7F6E\u5FC5\u987B\u662F\u4E00\u4E2A JSON \u5BF9\u8C61")),{issues:r,normalized:null};let e=s,a=e.transport;typeof a=="string"&&$e.includes(a)||r.push(g(b,"E_TRANSPORT","$.transport","transport \u5FC5\u586B\uFF0C\u53EA\u80FD\u662F stdio \u6216 streamable-http"));let n=e.serverName;typeof n=="string"&&Oe.test(n)||r.push(g(b,"E_NAME","$.serverName","serverName \u53EA\u80FD\u5305\u542B\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u4E0B\u5212\u7EBF\u548C\u8FDE\u5B57\u7B26\uFF0C\u957F\u5EA6 1\u201332")),a==="stdio"&&(typeof e.command!="string"||e.command.trim()==="")&&r.push(g(b,"E_COMMAND","$.command","stdio \u4F20\u8F93\u5FC5\u987B\u63D0\u4F9B command")),e.args!==void 0&&(Array.isArray(e.args)&&e.args.every(w=>typeof w=="string")||r.push(g(b,"E_ARGS","$.args","args \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4"))),e.env!==void 0&&!Y(e.env)&&r.push(g(b,"E_ENV","$.env","env \u5FC5\u987B\u662F\u300C\u5B57\u7B26\u4E32: \u5B57\u7B26\u4E32\u300D\u5BF9\u8C61")),e.cwd!==void 0&&(typeof e.cwd!="string"||e.cwd==="")&&r.push(g(b,"E_CWD","$.cwd","cwd \u5FC5\u987B\u662F\u5B57\u7B26\u4E32"));let o=!1;if(a==="streamable-http"&&(o=typeof e.url=="string"&&Le(e.url),o||r.push(g(b,"E_URL","$.url","streamable-http \u4F20\u8F93\u5FC5\u987B\u63D0\u4F9B\u5408\u6CD5\u7684 url"))),e.headers!==void 0&&!Y(e.headers)&&r.push(g(b,"E_HEADERS","$.headers","headers \u5FC5\u987B\u662F\u300C\u5B57\u7B26\u4E32: \u5B57\u7B26\u4E32\u300D\u5BF9\u8C61")),e.toolCallTimeoutMs!==void 0){let l=e.toolCallTimeoutMs;(!Number.isInteger(l)||l<1||l>6e5)&&r.push(g(b,"E_TIMEOUT","$.toolCallTimeoutMs","toolCallTimeoutMs \u5FC5\u987B\u662F 1\u2013600000 \u7684\u6574\u6570"))}if(e.maxInstructionBytes!==void 0){let l=e.maxInstructionBytes;(!Number.isInteger(l)||l<1)&&r.push(g(b,"E_BYTES","$.maxInstructionBytes","maxInstructionBytes \u5FC5\u987B\u662F\u6B63\u6574\u6570"))}if(e.failOnStartupError!==void 0&&typeof e.failOnStartupError!="boolean"&&r.push(g(b,"E_FAIL","$.failOnStartupError","failOnStartupError \u5FC5\u987B\u662F\u5E03\u5C14\u503C")),a==="stdio")for(let l of["url","headers"])e[l]!==void 0&&r.push(g(b,"E_MISMATCH",`$.${l}`,`stdio \u4F20\u8F93\u4E0D\u652F\u6301 ${l} \u5B57\u6BB5`));if(a==="streamable-http")for(let l of["command","args","cwd"])e[l]!==void 0&&r.push(g(b,"E_MISMATCH",`$.${l}`,`streamable-http \u4F20\u8F93\u4E0D\u652F\u6301 ${l} \u5B57\u6BB5`));for(let l of Object.keys(e))Ie.includes(l)||r.push(g(je,"W_UNKNOWN",`$.${l}`,`\u672A\u77E5\u5B57\u6BB5 "${l}" \u4E0D\u5728\u5DF2\u77E5\u5B57\u6BB5\u5185\uFF0C\u5C06\u539F\u6837\u5199\u5165\uFF1B\u82E5 DSH \u4E0D\u652F\u6301\u5219\u4F1A\u88AB\u5FFD\u7565`));let d=r.some(l=>l.level===b);return{issues:r,normalized:d?null:Pe(e)}}function Le(s){try{let r=new URL(s);return r.protocol==="http:"||r.protocol==="https:"}catch{return!1}}function Pe(s){let r={};for(let e of Z)s[e]!==void 0&&(r[e]=s[e]);for(let e of Object.keys(s))Z.includes(e)||(r[e]=s[e]);for(let[e,a]of Object.entries(Ae))r[e]===void 0&&(r[e]=a);return r}function We(s,r={}){let e=[];if(s===null||typeof s!="object")return e;let a=Array.isArray(r.serverNames)?r.serverNames:[],i=Array.isArray(r.ids)?r.ids:[],n=typeof s.serverName=="string"?s.serverName:"";n!==""&&a.includes(n)&&e.push(g(b,"E_DUP","$.serverName",`serverName "${n}" \u5DF2\u5B58\u5728\uFF0C\u8BF7\u6362\u4E00\u4E2A\u540D\u5B57`));let c=n===""?"":`mcp-${n}`;return c!==""&&i.includes(c)&&e.push(g(b,"E_DUP","$.id",`\u6761\u76EE id "${c}" \u5DF2\u88AB\u5360\u7528\uFF0C\u8BF7\u6362\u4E00\u4E2A serverName`)),e}function X(s,r={}){let e=_e(s);if(e.ok!==!0){let o=typeof e.line=="number"?e.line:0,d=typeof e.column=="number"?e.column:0,l=o>0?`\u7B2C ${o} \u884C\u7B2C ${d} \u5217`:"\u672A\u77E5\u4F4D\u7F6E";return{ok:!1,value:null,issues:[{level:b,code:"E_JSON",path:"$",line:o>0?o:void 0,column:d>0?d:void 0,message:`JSON \u8BED\u6CD5\u9519\u8BEF\uFF08${l}\uFF09\uFF1A${e.reason}`}]}}let{issues:a,normalized:i}=Be(e.value),n=We(i,{serverNames:r.existingServerNames??[],ids:r.existingIds??[]}),c=a.concat(n);return{ok:!c.some(o=>o.level===b),value:i,issues:c}}var h=S(require("react"),1);function B({size:s=16}){return h.default.createElement("svg",{width:s,height:s,viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round","aria-hidden":"true"},h.default.createElement("path",{d:"M8 3.5v9M3.5 8h9"}))}function R({size:s=16}){return h.default.createElement("svg",{width:s,height:s,viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round","aria-hidden":"true"},h.default.createElement("circle",{cx:"3.5",cy:"8",r:"0.75",fill:"currentColor",stroke:"none"}),h.default.createElement("circle",{cx:"8",cy:"8",r:"0.75",fill:"currentColor",stroke:"none"}),h.default.createElement("circle",{cx:"12.5",cy:"8",r:"0.75",fill:"currentColor",stroke:"none"}))}function ee({size:s=16}){return h.default.createElement("svg",{width:s,height:s,viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true"},h.default.createElement("path",{d:"M13.5 8a5.5 5.5 0 1 1-1.9-4.16"}),h.default.createElement("path",{d:"M13.5 2.5V5.5H10.5"}))}function E({size:s=16}){return h.default.createElement("svg",{width:s,height:s,viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true"},h.default.createElement("path",{d:"M8 2.5 14.5 13.5H1.5L8 2.5Z"}),h.default.createElement("path",{d:"M8 6.5v3M8 11.5h.01"}))}function se({size:s=16}){return h.default.createElement("svg",{width:s,height:s,viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round","aria-hidden":"true"},h.default.createElement("circle",{cx:"8",cy:"8",r:"5.75"}),h.default.createElement("path",{d:"M8 7.5v4M8 5h.01"}))}function re({size:s=48}){return h.default.createElement("svg",{width:s,height:s,viewBox:"0 0 48 48",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true"},h.default.createElement("rect",{x:"7",y:"11",width:"34",height:"26",rx:"4"}),h.default.createElement("path",{d:"M7 19h34"}),h.default.createElement("path",{d:"M18 27l4 4-4 4"}),h.default.createElement("path",{d:"M30 35h8"}))}var D=Object.freeze([Object.freeze({label:"stdio\uFF08\u672C\u5730\u547D\u4EE4\uFF09",value:JSON.stringify({serverName:"github",transport:"stdio",command:"npx",args:["-y","@modelcontextprotocol/server-github"],env:{GITHUB_TOKEN:"!!js process.env.GITHUB_TOKEN"}},null,2)}),Object.freeze({label:"streamable-http\uFF08\u8FDC\u7A0B\u670D\u52A1\uFF09",value:JSON.stringify({serverName:"remote",transport:"streamable-http",url:"https://example.com/mcp",headers:{Authorization:"Bearer your-token"}},null,2)})]);function ae({fileDisplay:s="",existingServerNames:r=[],existingIds:e=[],onSubmit:a,onCancel:i}){let[n,c]=(0,p.useState)(D[0].value),[o,d]=(0,p.useState)(!1),[l,w]=(0,p.useState)(""),x=(0,p.useMemo)(()=>X(n,{existingServerNames:r,existingIds:e}),[n,r,e]),I=x.issues.filter(f=>f.level==="error"||f.level==="warn"),O=x.ok===!0&&o===!1;(0,p.useEffect)(()=>{w("")},[n]);let $=async()=>{if(!(x.ok!==!0||o===!0)){d(!0),w("");try{await a(n)}catch(f){w(f instanceof Error?f.message:String(f))}finally{d(!1)}}};return p.default.createElement("div",{className:"dshmcp-mask-layer",role:"dialog","aria-modal":"true"},p.default.createElement("div",{className:"dshmcp-dialog"},p.default.createElement("div",{className:"dshmcp-dialog-head"},p.default.createElement("h3",{className:"dshmcp-dialog-title"},"\u6DFB\u52A0 MCP \u670D\u52A1\u5668"),p.default.createElement("button",{type:"button",className:"dshmcp-btn is-ghost",onClick:i,"aria-label":"\u5173\u95ED"},"\u2715")),p.default.createElement("div",{className:"dshmcp-dialog-body"},p.default.createElement("div",{className:"dshmcp-field"},p.default.createElement("span",{className:"dshmcp-field-label"},"JSON \u914D\u7F6E"),p.default.createElement("select",{className:"dshmcp-select",value:"",onChange:f=>{let N=D.find(j=>j.label===f.target.value);N!==void 0&&c(N.value)}},p.default.createElement("option",{value:""},"\u586B\u5165\u793A\u4F8B \u25BE"),D.map(f=>p.default.createElement("option",{key:f.label,value:f.label},f.label)))),p.default.createElement("textarea",{className:"dshmcp-editor",spellCheck:!1,value:n,onChange:f=>c(f.target.value)}),I.length===0?null:p.default.createElement("div",{className:"dshmcp-issues"},I.map(f=>p.default.createElement("div",{key:`${f.code}:${f.path}`,className:`dshmcp-issue ${f.level==="warn"?"is-warn":"is-error"}`},p.default.createElement(E,null),p.default.createElement("span",null,typeof f.line=="number"?`\u7B2C ${f.line} \u884C\uFF1A`:"",f.message)))),l===""?null:p.default.createElement("div",{className:"dshmcp-issues"},p.default.createElement("div",{className:"dshmcp-issue is-error"},p.default.createElement(E,null),p.default.createElement("span",null,l))),p.default.createElement("div",{className:"dshmcp-hint"},p.default.createElement("span",{className:"dshmcp-hint-icon"},p.default.createElement(se,null)),p.default.createElement("span",null,"\u5199\u5165\u4F4D\u7F6E",s===""?" MCP \u7EF4\u62A4\u914D\u7F6E\u6587\u4EF6":p.default.createElement("span",{className:"dshmcp-path"}," ",s),"\uFF1B\u4FDD\u5B58\u540E DSH \u5C06\u81EA\u52A8\u70ED\u91CD\u8F7D\uFF0C\u65E0\u9700\u91CD\u542F\u3002"))),p.default.createElement("div",{className:"dshmcp-dialog-foot"},p.default.createElement("button",{type:"button",className:"dshmcp-btn is-secondary",onClick:i,disabled:o},"\u53D6\u6D88"),p.default.createElement("button",{type:"button",className:"dshmcp-btn",onClick:$,disabled:!O},o?"\u63D0\u4EA4\u4E2D\u2026":"\u786E\u5B9A"))))}var v=S(require("react"),1);function ne({serverName:s,busy:r=!1,onConfirm:e,onCancel:a}){let[i,n]=v.default.useState(!1),c=r||i;return v.default.createElement("div",{className:"dshmcp-mask-layer",role:"dialog","aria-modal":"true"},v.default.createElement("div",{className:"dshmcp-dialog"},v.default.createElement("div",{className:"dshmcp-dialog-head"},v.default.createElement("h3",{className:"dshmcp-dialog-title"},"\u5220\u9664 MCP \u670D\u52A1\u5668"),v.default.createElement("button",{type:"button",className:"dshmcp-btn is-ghost",onClick:a,"aria-label":"\u5173\u95ED"},"\u2715")),v.default.createElement("div",{className:"dshmcp-dialog-body"},v.default.createElement("div",{className:"dshmcp-issue is-error"},v.default.createElement(E,null),v.default.createElement("span",null,"\u786E\u5B9A\u8981\u5220\u9664 ",v.default.createElement("strong",null,s)," \u5417\uFF1F\u8BE5\u6761\u76EE\u4F1A\u4ECE\u53D7\u7BA1\u6BB5\u79FB\u9664\uFF0C\u5176\u914D\u7F6E\u5C06\u4E0D\u518D\u751F\u6548\u3002")),v.default.createElement("div",{className:"dshmcp-hint"},v.default.createElement("span",null,"\u5220\u9664\u524D\u4F1A\u81EA\u52A8\u5907\u4EFD\u4E00\u4EFD\u5230\u914D\u7F6E\u6587\u4EF6\u7684 .bak\uFF0C\u9700\u8981\u65F6\u53EF\u624B\u5DE5\u6062\u590D\u3002"))),v.default.createElement("div",{className:"dshmcp-dialog-foot"},v.default.createElement("button",{type:"button",className:"dshmcp-btn is-secondary",onClick:a,disabled:c},"\u53D6\u6D88"),v.default.createElement("button",{type:"button",className:"dshmcp-btn is-danger",onClick:async()=>{if(c!==!0){n(!0);try{await e()}finally{n(!1)}}},disabled:c},c?"\u5220\u9664\u4E2D\u2026":"\u5220\u9664"))))}var C=S(require("react"),1);function oe({fileDisplay:s="",onAdd:r}){return C.default.createElement("div",{className:"dshmcp-empty"},C.default.createElement("span",{className:"dshmcp-empty-icon"},C.default.createElement(re,null)),C.default.createElement("p",{className:"dshmcp-empty-title"},"\u8FD8\u6CA1\u6709\u914D\u7F6E MCP \u670D\u52A1\u5668"),C.default.createElement("p",{className:"dshmcp-empty-text"},"\u7C98\u8D34\u4E00\u6BB5 JSON \u914D\u7F6E\u5373\u53EF\u63A5\u5165\uFF0C\u914D\u7F6E\u4F1A\u5199\u5165",s===""?" MCP \u7EF4\u62A4\u914D\u7F6E\u6587\u4EF6":C.default.createElement("span",{className:"dshmcp-path"}," ",s),"\u3002"),C.default.createElement("button",{type:"button",className:"dshmcp-btn",onClick:r},C.default.createElement(B,null),"\u6DFB\u52A0 MCP"))}var M=S(require("react"),1);var m=S(require("react"),1);function De(s){return typeof s!="number"||!Number.isFinite(s)?"\u9ED8\u8BA4":`${Math.round(s/1e3)}s`}function H({item:s,highlighted:r=!1,onToggle:e,onRemove:a,busy:i=!1}){let[n,c]=(0,m.useState)(!1),o=typeof s.serverName=="string"&&s.serverName!==""?s.serverName:"\uFF08\u65E0\u6CD5\u89E3\u6790\uFF09",d=s.managed===!0&&s.parsable===!0,l=["dshmcp-card",s.enabled===!0?"":"is-off",r===!0?"is-new":""].filter(x=>x!=="").join(" "),w=x=>{c(!1),x()};return m.default.createElement("div",{className:l},m.default.createElement("div",{className:"dshmcp-card-head"},m.default.createElement("span",{className:`dshmcp-dot${s.enabled===!0?"":" is-off"}`}),m.default.createElement("span",{className:"dshmcp-card-title"},o),typeof s.transport=="string"?m.default.createElement("span",{className:"dshmcp-chip"},s.transport):null,s.enabled===!0?null:m.default.createElement("span",{className:"dshmcp-chip is-off"},"\u5DF2\u505C\u7528"),s.parsable===!1?m.default.createElement("span",{className:"dshmcp-chip is-off"},"\u65E0\u6CD5\u89E3\u6790 \xB7 \u53EA\u8BFB"):null,m.default.createElement("span",{className:"dshmcp-card-spacer"}),s.disabledBy==="expression"?m.default.createElement("span",{className:"dshmcp-chip is-off",title:"\u8BE5\u6761\u76EE\u7684\u542F\u7528\u72B6\u6001\u7531 !!js \u8868\u8FBE\u5F0F\u63A7\u5236"},"\u8868\u8FBE\u5F0F\u63A7\u5236"):d?m.default.createElement("button",{type:"button",className:"dshmcp-btn is-secondary",disabled:i,onClick:()=>e(o,s.enabled!==!0)},s.enabled===!0?"\u505C\u7528":"\u542F\u7528"):null,d?m.default.createElement("div",{className:"dshmcp-card-menu"},m.default.createElement("button",{type:"button",className:"dshmcp-btn is-ghost",disabled:i,onClick:()=>c(!n),title:"\u66F4\u591A\u64CD\u4F5C","aria-label":"\u66F4\u591A\u64CD\u4F5C"},m.default.createElement(R,null)),n?m.default.createElement("div",{className:"dshmcp-menu"},m.default.createElement("button",{type:"button",className:"dshmcp-menu-item",disabled:!0,title:"\u7F16\u8F91\uFF08\u5373\u5C06\u4E0A\u7EBF\uFF09"},"\u7F16\u8F91\uFF08\u5373\u5C06\u4E0A\u7EBF\uFF09"),m.default.createElement("button",{type:"button",className:"dshmcp-menu-item",disabled:!0,title:"\u590D\u5236\u4E3A JSON\uFF08\u5373\u5C06\u4E0A\u7EBF\uFF09"},"\u590D\u5236\u4E3A JSON\uFF08\u5373\u5C06\u4E0A\u7EBF\uFF09"),m.default.createElement("button",{type:"button",className:"dshmcp-menu-item",onClick:()=>w(()=>e(o,s.enabled!==!0))},s.enabled===!0?"\u505C\u7528":"\u542F\u7528"),m.default.createElement("button",{type:"button",className:"dshmcp-menu-item is-danger",onClick:()=>w(()=>a(o))},"\u5220\u9664")):null):null),s.parsable===!1?m.default.createElement("pre",{className:"dshmcp-raw"},s.raw):m.default.createElement(m.default.Fragment,null,m.default.createElement("div",{className:"dshmcp-cmd",title:s.summary},s.summary===""?"\u2014":s.summary),m.default.createElement("div",{className:"dshmcp-sep"}),m.default.createElement("div",{className:"dshmcp-meta"},m.default.createElement("span",{className:"dshmcp-meta-item"},"\u73AF\u5883",s.envKeys.length===0?m.default.createElement("span",null," \u65E0"):m.default.createElement("span",null," ",s.envKeys.join("\u3001")," ",m.default.createElement("span",{className:"dshmcp-mask"},"\u2022\u2022\u2022\u2022"))),m.default.createElement("span",{className:"dshmcp-meta-item"},"\u8D85\u65F6 ",De(s.toolCallTimeoutMs)),typeof s.cwd=="string"?m.default.createElement("span",{className:"dshmcp-meta-item"},"\u76EE\u5F55 ",s.cwd):null)))}function te({items:s,highlighted:r="",busy:e=!1,onToggle:a,onRemove:i}){let n=s.filter(o=>o.managed===!0),c=s.filter(o=>o.managed!==!0);return M.default.createElement(M.default.Fragment,null,n.length===0?null:M.default.createElement("div",{className:"dshmcp-group"},n.map(o=>M.default.createElement(H,{key:o.serverName??o.raw,item:o,highlighted:r!==""&&o.serverName===r,busy:e,onToggle:a,onRemove:i}))),c.length===0?null:M.default.createElement("div",{className:"dshmcp-group is-readonly"},M.default.createElement("p",{className:"dshmcp-group-title"},"\u975E\u672C\u63D2\u4EF6\u7BA1\u7406 \xB7 \u53EA\u8BFB"),c.map(o=>M.default.createElement(H,{key:o.serverName??o.raw,item:o,busy:e,onToggle:a,onRemove:i}))))}var y=S(require("react"),1);var ie=Object.freeze({"config.patchFile":"\u7531\u63D2\u4EF6\u914D\u7F6E config.patchFile \u6307\u5B9A",profileContext:"\u7531\u5F53\u524D\u5BBF\u4E3B profile \u51B3\u5B9A","config.dshHome":"\u7531\u63D2\u4EF6\u914D\u7F6E dshHome \u6307\u5B9A",$DSH_HOME:"\u7531\u73AF\u5883\u53D8\u91CF $DSH_HOME \u51B3\u5B9A","~/.dsh":"\u5BBF\u4E3B\u672A\u62A5\u544A profile\uFF0C\u5DF2\u56DE\u843D\u5230\u9ED8\u8BA4\u4F4D\u7F6E"});function le({fileDisplay:s="",profile:r="",source:e="",busy:a=!1,onAdd:i,onRefresh:n}){let c=typeof ie[e]=="string"?ie[e]:"";return y.default.createElement(y.default.Fragment,null,y.default.createElement("div",{className:"dshmcp-head"},y.default.createElement("div",null,y.default.createElement("h2",{className:"dshmcp-title"},"MCP \u670D\u52A1\u5668"),y.default.createElement("p",{className:"dshmcp-subtitle"},"\u7BA1\u7406\u5DF2\u63A5\u5165\u7684 MCP \u670D\u52A1\u5668\u3002\u914D\u7F6E\u53EA\u5199\u5165\u4E0B\u9762\u8FD9\u4E2A\u6587\u4EF6\u7684\u53D7\u7BA1\u6BB5\uFF0Cprofile \u4E0D\u540C\u5219\u5BBF\u4E3B\u8BFB\u53D6\u7684\u6587\u4EF6\u4E5F\u4E0D\u540C\u3002")),y.default.createElement("div",{className:"dshmcp-actions"},y.default.createElement("button",{type:"button",className:"dshmcp-btn is-ghost",onClick:n,disabled:a,title:"\u5237\u65B0\u5217\u8868","aria-label":"\u5237\u65B0\u5217\u8868"},y.default.createElement(ee,null)),y.default.createElement("button",{type:"button",className:"dshmcp-btn",onClick:i},y.default.createElement(B,null),"\u6DFB\u52A0 MCP"))),y.default.createElement("div",{className:"dshmcp-target"},y.default.createElement("span",{className:"dshmcp-target-label"},"\u5199\u5165\u4F4D\u7F6E"),y.default.createElement("code",{className:"dshmcp-target-path"},s===""?"\u6B63\u5728\u89E3\u6790\u2026":s),r===""?null:y.default.createElement("span",{className:"dshmcp-chip"},"profile: ",r),c===""?null:y.default.createElement("span",{className:"dshmcp-target-note"},c)))}var He=1500;function de(){let[s,r]=(0,t.useState)("loading"),[e,a]=(0,t.useState)(null),[i,n]=(0,t.useState)(""),[c,o]=(0,t.useState)(""),[d,l]=(0,t.useState)(""),[w,x]=(0,t.useState)(!1),[I,O]=(0,t.useState)(!1),[$,f]=(0,t.useState)(""),N=(0,t.useCallback)(async()=>{x(!0);try{let u=await U();a(u),n(""),r("ready")}catch(u){n(u instanceof Error?u.message:String(u)),r("error")}finally{x(!1)}},[]);(0,t.useEffect)(()=>{N()},[N]),(0,t.useEffect)(()=>{if(d==="")return;let u=setTimeout(()=>l(""),He);return()=>clearTimeout(u)},[d]);let j=u=>{let k=u!==null&&typeof u=="object"?String(u.code??""):"",P=u instanceof Error?u.message:String(u),ye=u!==null&&typeof u=="object"&&u.rolledBack===!0;o(`${k===""?"":`${W(k)}\uFF1A`}${P}${ye?"\uFF08\u6587\u4EF6\u5DF2\u56DE\u6EDA\uFF09":""}`)},fe=async u=>{let k=await G(u);O(!1),o(""),await N(),k.item!==null&&typeof k.item=="object"&&l(typeof k.item.serverName=="string"?k.item.serverName:"")},ue=async u=>{x(!0);try{await K(u),f(""),o(""),await N()}catch(k){j(k)}finally{x(!1)}},he=async(u,k)=>{x(!0);try{await V(u,k),o(""),await N()}catch(P){j(P)}finally{x(!1)}},L=Array.isArray(e?.items)?e.items:[],A=typeof e?.fileDisplay=="string"?e.fileDisplay:"",be=typeof e?.profile=="string"?e.profile:"",ge=typeof e?.source=="string"?e.source:"",T=e?.taken??{serverNames:[],ids:[]},ve=e?.anchors==="broken";return t.default.createElement("div",{className:"dshmcp-page"},t.default.createElement("style",null,q),t.default.createElement(le,{fileDisplay:A,profile:be,source:ge,busy:w,onAdd:()=>{o(""),O(!0)},onRefresh:N}),c===""?null:t.default.createElement("div",{className:"dshmcp-banner",role:"alert"},t.default.createElement(E,null),t.default.createElement("div",{className:"dshmcp-banner-body"},t.default.createElement("div",null,c),t.default.createElement("div",{className:"dshmcp-banner-note"},"\u914D\u7F6E\u6587\u4EF6\u672A\u88AB\u7834\u574F\uFF0C\u53EF\u91CD\u8BD5\u6216\u5237\u65B0\u540E\u91CD\u6765\u3002")),t.default.createElement("button",{type:"button",className:"dshmcp-btn is-secondary",onClick:N},"\u91CD\u8BD5"),t.default.createElement("button",{type:"button",className:"dshmcp-btn is-ghost",onClick:()=>o(""),"aria-label":"\u5173\u95ED\u63D0\u793A"},"\u2715")),ve?t.default.createElement("div",{className:"dshmcp-banner",role:"alert"},t.default.createElement(E,null),t.default.createElement("div",{className:"dshmcp-banner-body"},t.default.createElement("div",null,"\u53D7\u7BA1\u6BB5\u6807\u8BB0\u88AB\u7834\u574F\uFF0C\u5DF2\u5207\u6362\u4E3A\u53EA\u8BFB"),t.default.createElement("div",{className:"dshmcp-banner-note"},"\u8BF7\u624B\u5DE5\u4FEE\u590D ",A===""?"\u914D\u7F6E\u6587\u4EF6":A," \u91CC\u7684",t.default.createElement("span",{className:"dshmcp-path"}," # >>> / # <<< ")," \u951A\u70B9\uFF0C\u4F7F\u5176\u6210\u5BF9\u4E14\u987A\u5E8F\u6B63\u786E\u3002"))):null,s==="loading"?t.default.createElement("div",null,t.default.createElement("div",{className:"dshmcp-skeleton"}),t.default.createElement("div",{className:"dshmcp-skeleton"})):null,s==="error"?t.default.createElement("div",{className:"dshmcp-banner",role:"alert"},t.default.createElement(E,null),t.default.createElement("div",{className:"dshmcp-banner-body"},t.default.createElement("div",null,"\u52A0\u8F7D\u5931\u8D25\uFF1A",i),t.default.createElement("div",{className:"dshmcp-banner-note"},"\u9875\u9762\u4E0D\u4F1A\u5361\u5728\u52A0\u8F7D\u6001\uFF0C\u53EF\u76F4\u63A5\u91CD\u8BD5\u3002")),t.default.createElement("button",{type:"button",className:"dshmcp-btn is-secondary",onClick:N},"\u91CD\u8BD5")):null,s==="ready"&&L.length===0?t.default.createElement(oe,{fileDisplay:A,onAdd:()=>{o(""),O(!0)}}):null,s==="ready"&&L.length>0?t.default.createElement(te,{items:L,highlighted:d,busy:w,onToggle:he,onRemove:f}):null,I===!0?t.default.createElement(ae,{fileDisplay:A,existingServerNames:Array.isArray(T.serverNames)?T.serverNames:[],existingIds:Array.isArray(T.ids)?T.ids:[],onSubmit:fe,onCancel:()=>O(!1)}):null,$===""?null:t.default.createElement(ne,{serverName:$,busy:w,onConfirm:()=>ue($),onCancel:()=>f("")}))}var ce=["slots","sessions"];function me(s){s.slots.inject("settings.section",()=>s.slots.register({name:"settings.section",id:"dsh-mcpserver-manager",order:17,label:"MCP \u7BA1\u7406"},()=>pe.default.createElement(de,null)))}
    })(module, module.exports, require);
    return module.exports;
  },
})
