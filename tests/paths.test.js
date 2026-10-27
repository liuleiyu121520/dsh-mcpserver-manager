/**
 * 路径解析单测：纯函数，无 I/O，重点守"空串 $DSH_HOME 绝不解析成工作目录"这条。
 */
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { resolveDshHome, resolvePatchPath, toDisplayPath } from '../src/paths.js';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';

describe('paths · resolveDshHome', () => {
  it('$DSH_HOME 优先', () => {
    assert.equal(resolveDshHome({ DSH_HOME: '/opt/dsh', HOME: '/home/u' }), resolve('/opt/dsh'));
  });

  it('空串 / 纯空白的 $DSH_HOME 视为未设置（绝不解析成工作目录）', () => {
    assert.equal(resolveDshHome({ DSH_HOME: '', HOME: '/home/u' }), resolve('/home/u', '.dsh'));
    assert.equal(resolveDshHome({ DSH_HOME: '   ', HOME: '/home/u' }), resolve('/home/u', '.dsh'));
    assert.equal(resolveDshHome({ DSH_HOME: '\t\n ', HOME: '/home/u' }), resolve('/home/u', '.dsh'));
  });

  it('没有 $DSH_HOME 时回落到 ~/.dsh', () => {
    assert.equal(resolveDshHome({ HOME: '/home/u' }), resolve('/home/u', '.dsh'));
    assert.equal(resolveDshHome({}), resolve(homedir(), '.dsh'));
  });
});

describe('paths · resolvePatchPath', () => {
  it('默认 profile 是 web', () => {
    assert.equal(
      resolvePatchPath({}, { HOME: '/home/u' }),
      join(resolve('/home/u', '.dsh'), 'profiles', 'web', 'cordis.patch.yml'),
    );
  });

  it('config.profile 可覆盖', () => {
    assert.equal(
      resolvePatchPath({ profile: 'desktop' }, { HOME: '/home/u' }),
      join(resolve('/home/u', '.dsh'), 'profiles', 'desktop', 'cordis.patch.yml'),
    );
  });

  it('显式配置路径优先于 $DSH_HOME（裁决 A1）', () => {
    assert.equal(
      resolvePatchPath({ dshHome: '/opt/dsh' }, { DSH_HOME: '/tmp/ignored' }),
      join(resolve('/opt/dsh'), 'profiles', 'web', 'cordis.patch.yml'),
    );
  });
});

describe('paths · toDisplayPath', () => {
  it('把 dshHome 前缀换成 ~', () => {
    assert.equal(
      toDisplayPath('/home/u/.dsh/profiles/web/cordis.patch.yml', '/home/u'),
      '~/.dsh/profiles/web/cordis.patch.yml',
    );
  });

  it('不在主目录下时原样返回（不伪造 ~ 前缀）', () => {
    assert.equal(toDisplayPath('/opt/dsh/profiles/web/cordis.patch.yml', '/home/u'), '/opt/dsh/profiles/web/cordis.patch.yml');
  });
});

describe('config · normalizeConfig', () => {
  it('缺失字段回落默认值', () => {
    assert.deepEqual(normalizeConfig(undefined), { ...DEFAULT_CONFIG });
    assert.deepEqual(normalizeConfig(null), { ...DEFAULT_CONFIG });
    assert.deepEqual(normalizeConfig('nonsense'), { ...DEFAULT_CONFIG });
  });

  it('非法 profile 回落 web，且永不抛错', () => {
    assert.equal(normalizeConfig({ profile: '../etc' }).profile, 'web');
    assert.equal(normalizeConfig({ profile: '  ' }).profile, 'web');
    assert.equal(normalizeConfig({ profile: 42 }).profile, 'web');
  });

  it('backup 只认布尔', () => {
    assert.equal(normalizeConfig({ backup: false }).backup, false);
    assert.equal(normalizeConfig({ backup: 'yes' }).backup, true);
  });
});
