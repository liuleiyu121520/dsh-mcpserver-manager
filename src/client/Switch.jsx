/**
 * 启停开关。
 *
 * 为什么不再用「停用 / 启用」文字按钮：按钮上写的是**动作**，用户想确认的是
 * **状态**。一排服务器里扫一眼"哪几个是关的"，开关的位置本身就是答案，文字
 * 按钮得逐个读标签。
 *
 * 无障碍：`role="switch"` + `aria-checked` 是这类控件的标准语义（读屏会念
 * "开关 已打开"），比 `aria-pressed` 的切换按钮更准确。
 */
import React from 'react';

/**
 * @param {object} props 属性。
 * @param {boolean} props.checked 是否开启。
 * @param {boolean} [props.disabled] 是否禁用。
 * @param {string} props.label 无障碍名称（如「启用 github」）。
 * @param {(next: boolean) => void} props.onChange 状态变更回调（参数是目标状态）。
 * @returns {JSX.Element} 开关。
 */
export function Switch({ checked, disabled = false, label, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked === true}
      aria-label={label}
      className={checked === true ? 'dshmcp-switch is-on' : 'dshmcp-switch'}
      disabled={disabled}
      onClick={() => onChange(checked !== true)}
    >
      <span className="dshmcp-switch-knob" />
    </button>
  );
}
