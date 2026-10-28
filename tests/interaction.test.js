/**
 * 交互回归门禁（静态扫描）。
 *
 * 这一轮的四条用户反馈里有三条的成因是"**看起来什么都没发生**"，而这类问题
 * 在渲染测试里很难表达（props 断言全绿，用户依然觉得按钮是坏的）。所以把它们
 * 收敛成几条源码级约定：
 *
 * 1. 用户按刷新 → 必须有回音（`announce` 分支 + 最短旋转时长）；
 * 2. toast 是纯提示，**不许吃点击**——一个盖住页面的 toast 就是新的"点了没反应"；
 * 3. 菜单靠一块全屏透明垫层关闭，不依赖 document 监听（时序/冒泡都不可控）；
 * 4. 健康检查结论只在 toast 里出现一次，卡片里不再留常驻长文案。
 *
 * 纯字符串扫描，毫秒级，不启浏览器。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const CSS = readFileSync(join(root, 'src/client/styles.js'), 'utf8');
const MANAGER = readFileSync(join(root, 'src/client/McpManager.jsx'), 'utf8');
const CARD = readFileSync(join(root, 'src/client/ServerCard.jsx'), 'utf8');

/**
 * 取一条 CSS 规则的声明块。
 * @param {string} selector 选择器（要转义的点号自己带）。
 * @returns {string} 声明块内容；没这条规则返回空串。
 */
function ruleOf(selector) {
  const match = new RegExp(`\\${selector}\\s*\\{([\\s\\S]*?)\\}`).exec(CSS);
  return match === null ? '' : match[1];
}

describe('交互 · 刷新按钮必须有回音', () => {
  it('刷新走 announce 分支（不然本地文件几毫秒读完，用户看到的就是"没反应"）', () => {
    assert.match(
      MANAGER,
      /onRefresh=\{\(\) => refresh\(true\)\}/,
      '刷新按钮必须显式说"这是用户按的"，否则不会有任何提示',
    );
    assert.match(MANAGER, /const refresh = useCallback\(async \(announce = false\)/, 'refresh 要能区分"用户按的"与"内部重拉"');
  });

  it('图标有最短旋转时长（否则动画根本来不及出现）', () => {
    const match = /const MIN_SPIN_MS = (\d+);/.exec(MANAGER);
    assert.ok(match !== null, '应有 MIN_SPIN_MS 常量');
    assert.ok(Number(match[1]) >= 300, `MIN_SPIN_MS 太短，肉眼看不见：${match[1]}ms`);
    assert.ok(MANAGER.includes('Date.now() - startedAt'), '要按实际耗时补齐，不能盲等');
  });

  it('增删改之后的重拉是静默的（它们各有各的提示，别再叠一条"已刷新"）', () => {
    const silentCalls = MANAGER.match(/await refresh\(false\)/g) ?? [];
    assert.ok(silentCalls.length >= 3, `add/remove/toggle 之后应静默刷新，实际只有 ${silentCalls.length} 处`);
  });
});

describe('交互 · 提示不许挡住操作', () => {
  it('toast 设了 pointer-events: none', () => {
    const block = ruleOf('.dshmcp-toast');
    assert.ok(block !== '', '应有 .dshmcp-toast 规则');
    assert.ok(block.includes('pointer-events: none'), 'toast 是纯提示，不该抢走底下按钮的点击');
  });

  it('按钮按下有触感反馈（图标按钮没有这一下就像坏的）', () => {
    assert.match(CSS, /\.dshmcp-btn:active:not\(:disabled\)\s*\{[^}]*transform:\s*scale/, '缺 :active 反馈');
  });
});

describe('交互 · 菜单点外面能关', () => {
  it('有全屏透明垫层，且层级在菜单之下', () => {
    const backdrop = ruleOf('.dshmcp-menu-backdrop');
    assert.ok(backdrop.includes('position: fixed'), '垫层要铺满视口');
    assert.ok(backdrop.includes('inset: 0'), '垫层要铺满视口');
    const backdropZ = /z-index:\s*(\d+)/.exec(backdrop);
    const menuZ = /z-index:\s*(\d+)/.exec(ruleOf('.dshmcp-menu'));
    assert.ok(backdropZ !== null && menuZ !== null, '两层的 z-index 都要显式写');
    assert.ok(Number(backdropZ[1]) < Number(menuZ[1]), '垫层必须在菜单之下，否则菜单自己也点不动');
  });

  it('点垫层就把菜单关掉（不靠 document 监听）', () => {
    assert.match(CARD, /className="dshmcp-menu-backdrop"/, '卡片里应有垫层元素');
    assert.match(CARD, /aria-hidden="true"/, '垫层对读屏器应当是不可见的');
    assert.match(CARD, /setMenuOpen\(false\)/, '垫层点击要能关菜单');
    assert.equal(/document\.addEventListener/.test(CARD), false, '不要引 document 监听：时序和冒泡都不可控');
  });
});

describe('交互 · 健康检查只留一行 toast', () => {
  it('卡片里不再渲染结论区（长文案已经删掉）', () => {
    assert.equal(CARD.includes('dshmcp-health'), false, '卡片不该再有健康结论块');
    assert.equal(CSS.includes('dshmcp-health'), false, '样式也一并不留（死样式迟早被人捡回来用）');
  });

  it('结论压缩成一行交给 toast，且带耗时与原因', () => {
    assert.match(MANAGER, /healthSummary\(report\)/, '结论要经 healthSummary 压成一行');
    assert.match(MANAGER, /notify\(/, '结论走 toast，不再写进卡片');
  });
});
