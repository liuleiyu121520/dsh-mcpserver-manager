/**
 * 设置页适配层 —— 本插件与宿主的唯一耦合点。
 *
 * 只依赖宿主 slots 协议的两件事：
 * 1. `ctx.slots.inject('settings.section', factory)` 注册一个设置分区；
 * 2. `ctx.slots.register({name, id, order, label}, render)` 返回幂等 dispose。
 *
 * `order: 17`：DSH HUB 市场用 16，17 未占用（team-lead 已核实）。
 * label 直接返回中文常量：v0.1.0 只做中文（i18n 是 P1-8）。
 */
import React from 'react';
import { McpManager } from './McpManager.jsx';

export const inject = ['slots', 'sessions'];

/**
 * 注册「设置 → MCP 管理」分区。
 * @param {object} ctx 客户端 cordis 上下文（已注入 slots）。
 * @returns {void}
 */
export function apply(ctx) {
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'dsh-mcpserver-manager',
        order: 17,
        label: 'MCP 管理',
      },
      () => <McpManager />,
    ),
  );
}
