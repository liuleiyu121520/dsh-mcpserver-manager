/**
 * 版本一致性门禁。
 *
 * `PLUGIN_VERSION` 是 Host 上报、页面比对的锚点：它一旦和 `package.json` 漂移，
 * "运行中的 Host 是旧版本"这个判断就会骗人（升级后明明不一致却报一致，或者
 * 反过来一直报警）。所以这两处必须逐字符相等，且由测试守，不靠人记。
 *
 * 第二个用例守的是"接线"：页面必须真的拿快照里的 `version` 去比。少了这行，
 * 常量再正确也没人用——这正是那种"测了一个恒真值"的假绿。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PLUGIN_VERSION } from '../src/version.js';

const root = fileURLToPath(new URL('..', import.meta.url));

describe('version · 版本号不许漂移', () => {
  it('src/version.js 与 package.json 的 version 完全一致', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert.equal(
      PLUGIN_VERSION,
      pkg.version,
      `src/version.js 是 ${PLUGIN_VERSION}，package.json 是 ${pkg.version} —— 两处必须同步改`,
    );
  });

  it('版本号形如 X.Y.Z', () => {
    assert.match(PLUGIN_VERSION, /^\d+\.\d+\.\d+$/);
  });

  it('页面真的拿快照里的 version 去比（不是只定义了个常量）', () => {
    const source = readFileSync(join(root, 'src/client/McpManager.jsx'), 'utf8');
    assert.ok(source.includes("from '../version.js'"), 'McpManager 必须 import PLUGIN_VERSION');
    assert.ok(/snapshot\?\.version/.test(source), '必须从快照读 Host 版本');
    assert.ok(/hostVersion\s*!==\s*PLUGIN_VERSION/.test(source), '必须做不等比较');
  });

  it('Host 在 GET /servers 里上报版本', () => {
    const source = readFileSync(join(root, 'src/routes.js'), 'utf8');
    assert.ok(source.includes('version: PLUGIN_VERSION'), 'routes.js 必须把版本放进响应');
  });
});
