/**
 * 内联 SVG 图标集。
 *
 * 不引图标库：既统一了线宽风格（stroke 1.5 / currentColor），也把 bundle
 * 体积压住（PRD §4.5-7）。除空态图标（48px）外一律 16px。
 */
import React from 'react';

/**
 * 加号（主按钮「添加 MCP」）。
 * @param {{size?: number}} props 属性。
 * @returns {JSX.Element} 图标。
 */
export function PlusIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  );
}

/**
 * 更多（卡片「⋯」菜单）。
 * @param {{size?: number}} props 属性。
 * @returns {JSX.Element} 图标。
 */
export function MoreIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="3.5" cy="8" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="8" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * 刷新。
 * @param {{size?: number}} props 属性。
 * @returns {JSX.Element} 图标。
 */
export function RefreshIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.9-4.16" />
      <path d="M13.5 2.5V5.5H10.5" />
    </svg>
  );
}

/**
 * 警告（错误 banner / 错误区）。
 * @param {{size?: number}} props 属性。
 * @returns {JSX.Element} 图标。
 */
export function WarningIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2.5 14.5 13.5H1.5L8 2.5Z" />
      <path d="M8 6.5v3M8 11.5h.01" />
    </svg>
  );
}

/**
 * 说明（写入位置提示行）。
 * @param {{size?: number}} props 属性。
 * @returns {JSX.Element} 图标。
 */
export function InfoIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 7.5v4M8 5h.01" />
    </svg>
  );
}

/**
 * 空态大图标（48px）。
 * @param {{size?: number}} props 属性。
 * @returns {JSX.Element} 图标。
 */
export function EmptyIcon({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="7" y="11" width="34" height="26" rx="4" />
      <path d="M7 19h34" />
      <path d="M18 27l4 4-4 4" />
      <path d="M30 35h8" />
    </svg>
  );
}

/**
 * 心跳（健康检查按钮）。
 * @param {{size?: number}} props 属性。
 * @returns {JSX.Element} 图标。
 */
export function PulseIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.5 8.5h2.6l1.5-3.5 2.4 7 1.7-3.5h4.8" />
    </svg>
  );
}

/**
 * 折叠箭头（工具列表展开/收起）。
 * @param {{size?: number, open?: boolean}} props 属性。
 * @returns {JSX.Element} 图标。
 */
export function ChevronIcon({ size = 16, open = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={open === true ? 'dshmcp-chevron is-open' : 'dshmcp-chevron'}
      aria-hidden="true"
    >
      <path d="M6 4.5 9.5 8 6 11.5" />
    </svg>
  );
}

/**
 * 下载/更新（有新版本横幅）。
 * @param {{size?: number}} props 属性。
 * @returns {JSX.Element} 图标。
 */
export function DownloadIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2.5v7" />
      <path d="M5 6.5 8 9.5l3-3" />
      <path d="M2.5 11.5v1a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1" />
    </svg>
  );
}
