/**
 * 路径解析单测：纯函数，无 I/O，重点守两条——「空串 $DSH_HOME 绝不解析成工作目录」
 * 与「宿主 `profileContext` 优先」（BUG-2：desktop 用户的配置被写进 web profile）。
 */
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  PATH_SOURCES,
  profileFromPatchPath,
  readProfileContext,
  resolveDshHome,
  resolvePatchPath,
  resolvePatchTarget,
  toDisplayPath,
} from '../src/paths.js';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';

/** 一个「宿主报告了 desktop profile」的典型上下文（字段名与官方 ProfileContext 一致）。 */
const DESKTOP_CONTEXT = Object.freeze({
  name: 'desktop',
  dir: '/Users/u/.dsh/profiles/desktop',
  patchPath: '/Users/u/.dsh/profiles/desktop/cordis.patch.yml',
  installAnchor: '/Users/u/.dsh/profiles/desktop',
  cwd: '/Users/u/work',
  home: '/Users/u/.dsh',
  startedBundles: [],
  overlays: [],
  telemetryDisabledEnv: undefined,
});

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

describe('paths · resolvePatchPath（回落链）', () => {
  it('默认 profile 是 web', () => {
    assert.equal(
      resolvePatchPath({}, { HOME: '/home/u' }),
      join(resolve('/home/u', '.dsh'), 'profiles', 'web', 'cordis.patch.yml'),
    );
  });

  it('config.profile 可覆盖（没有 profileContext 时）', () => {
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

describe('paths · profileContext（宿主权威，BUG-2 的核心）', () => {
  it('有 profileContext 时优先用它的 patchPath —— 即使 dshHome / profile 指向别处', () => {
    const file = resolvePatchPath(
      { dshHome: '/opt/dsh', profile: 'web' },
      { HOME: '/home/u' },
      DESKTOP_CONTEXT,
    );
    assert.equal(file, resolve('/Users/u/.dsh/profiles/desktop/cordis.patch.yml'));
    assert.equal(file.includes('/profiles/web/'), false, 'desktop 宿主绝不能落到 web 文件');
  });

  it('profileContext 也压制 $DSH_HOME 环境变量', () => {
    assert.equal(
      resolvePatchPath({}, { HOME: '/home/u', DSH_HOME: '/env/dsh' }, DESKTOP_CONTEXT),
      resolve('/Users/u/.dsh/profiles/desktop/cordis.patch.yml'),
    );
  });

  it('profile / dshHome / source 三项都来自 profileContext', () => {
    const target = resolvePatchTarget({}, { HOME: '/home/u' }, DESKTOP_CONTEXT);
    assert.equal(target.profile, 'desktop');
    assert.equal(target.dshHome, '/Users/u/.dsh');
    assert.equal(target.source, PATH_SOURCES.PROFILE_CONTEXT);
  });

  it('profileContext 为 undefined → 回落原逻辑，不崩', () => {
    assert.equal(
      resolvePatchPath({ profile: 'desktop' }, { HOME: '/home/u' }, undefined),
      '/home/u/.dsh/profiles/desktop/cordis.patch.yml',
    );
    assert.equal(resolvePatchPath({}, { HOME: '/home/u' }, undefined), '/home/u/.dsh/profiles/web/cordis.patch.yml');
  });

  it('profileContext 为 null / 非对象 / 空对象 → 视为未提供，不崩', () => {
    for (const broken of [null, 'nonsense', 42, true, [], {}]) {
      assert.equal(
        resolvePatchPath({}, { HOME: '/home/u' }, broken),
        '/home/u/.dsh/profiles/web/cordis.patch.yml',
        `${JSON.stringify(broken)} 不该被当成有效 profileContext`,
      );
    }
  });

  it('patchPath 为空白串 / 非字符串 → 视为未提供', () => {
    for (const patchPath of ['', '   ', 42, null, undefined, {}]) {
      assert.equal(
        readProfileContext({ name: 'desktop', patchPath }),
        null,
        `patchPath=${JSON.stringify(patchPath)} 不该被接受`,
      );
    }
  });

  it('name 缺失或形状非法时，从 patchPath 推断 profile', () => {
    assert.equal(
      resolvePatchTarget({}, { HOME: '/home/u' }, { patchPath: '/Users/u/.dsh/profiles/desktop/cordis.patch.yml' })
        .profile,
      'desktop',
    );
    const weird = resolvePatchTarget(
      {},
      { HOME: '/home/u' },
      { name: '../etc', patchPath: '/Users/u/.dsh/profiles/desktop/cordis.patch.yml' },
    );
    assert.equal(weird.profile, 'desktop', '非法 name 不该出现在页面/日志里');
  });

  it('name 合法但 patchPath 形状不认识时，profile 用 name', () => {
    const target = resolvePatchTarget({}, { HOME: '/home/u' }, { name: 'desktop', patchPath: '/tmp/x/custom.yml' });
    assert.equal(target.filePath, '/tmp/x/custom.yml');
    assert.equal(target.profile, 'desktop');
  });
});

describe('paths · profileContext.patchPath 必须是绝对路径（与 config.patchFile 对等）', () => {
  it('相对路径一律视为无效 → 回落下一层，绝不落到 cwd', () => {
    const variants = [
      'cordis.patch.yml',
      './rel/cordis.patch.yml',
      'profiles/web/cordis.patch.yml',
      '../x/cordis.patch.yml',
      './',
    ];
    for (const patchPath of variants) {
      assert.equal(
        readProfileContext({ name: 'desktop', patchPath }),
        null,
        `${patchPath} 不该被接受为 patchPath`,
      );
      const file = resolvePatchPath({}, { HOME: '/home/u' }, { name: 'desktop', patchPath });
      assert.equal(file, '/home/u/.dsh/profiles/web/cordis.patch.yml', `${patchPath} 应回落到默认层`);
      assert.equal(file.startsWith(process.cwd()), false, `${patchPath} 落到了 cwd：${file}`);
    }
  });

  it('Windows 盘符风格：POSIX 下不是绝对路径 → 无效；真绝对（win32）则原样采用', () => {
    const winPath = 'C:\\Users\\u\\.dsh\\profiles\\desktop\\cordis.patch.yml';
    if (isAbsolute(winPath)) {
      assert.equal(readProfileContext({ name: 'desktop', patchPath: winPath }).patchPath, winPath);
      return;
    }
    assert.equal(readProfileContext({ name: 'desktop', patchPath: winPath }), null);
    const file = resolvePatchPath({}, { HOME: '/home/u' }, { name: 'desktop', patchPath: winPath });
    assert.equal(file, '/home/u/.dsh/profiles/web/cordis.patch.yml');
    assert.equal(file.startsWith(process.cwd()), false, `盘符风格不该被解析到 cwd：${file}`);
  });

  it('绝对路径照旧采用（这条修复不误伤正常路径）', () => {
    const context = { name: 'desktop', patchPath: '/Users/u/.dsh/profiles/desktop/cordis.patch.yml' };
    assert.equal(readProfileContext(context).patchPath, '/Users/u/.dsh/profiles/desktop/cordis.patch.yml');
    assert.equal(
      resolvePatchPath({}, { HOME: '/home/u' }, context),
      '/Users/u/.dsh/profiles/desktop/cordis.patch.yml',
    );
  });
});

describe('paths · 完整优先级链（每层都被下一层抢占一条）', () => {
  it('① 显式 config.patchFile 抢占 profileContext', () => {
    const target = resolvePatchTarget(
      { patchFile: '/tmp/explicit/cordis.patch.yml' },
      { HOME: '/home/u' },
      DESKTOP_CONTEXT,
    );
    assert.equal(target.filePath, '/tmp/explicit/cordis.patch.yml');
    assert.equal(target.source, PATH_SOURCES.CONFIG_FILE);
  });

  it('② profileContext 抢占 config.dshHome + profile', () => {
    const target = resolvePatchTarget({ dshHome: '/opt/dsh', profile: 'web' }, { HOME: '/home/u' }, DESKTOP_CONTEXT);
    assert.equal(target.filePath, '/Users/u/.dsh/profiles/desktop/cordis.patch.yml');
    assert.equal(target.source, PATH_SOURCES.PROFILE_CONTEXT);
  });

  it('③ config.dshHome 抢占 $DSH_HOME（profileContext 不存在时）', () => {
    const target = resolvePatchTarget({ dshHome: '/opt/dsh' }, { HOME: '/home/u', DSH_HOME: '/env/dsh' }, undefined);
    assert.equal(target.filePath, join(resolve('/opt/dsh'), 'profiles', 'web', 'cordis.patch.yml'));
    assert.equal(target.dshHome, resolve('/opt/dsh'));
    assert.equal(target.source, PATH_SOURCES.CONFIG_DSH_HOME);
  });

  it('④ $DSH_HOME 抢占 ~/.dsh 兜底', () => {
    const target = resolvePatchTarget({}, { HOME: '/home/u', DSH_HOME: '/env/dsh' }, undefined);
    assert.equal(target.filePath, join(resolve('/env/dsh'), 'profiles', 'web', 'cordis.patch.yml'));
    assert.equal(target.source, PATH_SOURCES.ENV_DSH_HOME);
  });

  it('⑤ 什么都没给 → ~/.dsh/profiles/web', () => {
    const target = resolvePatchTarget({}, { HOME: '/home/u' }, undefined);
    assert.equal(target.filePath, '/home/u/.dsh/profiles/web/cordis.patch.yml');
    assert.equal(target.source, PATH_SOURCES.DEFAULT_DSH_HOME);
  });
});

describe('paths · config.patchFile（显式到文件）', () => {
  it('接受绝对路径，profile 从路径推断、dshHome 从路径推断', () => {
    const target = resolvePatchTarget({ patchFile: '/opt/dsh/profiles/staging/cordis.patch.yml' }, { HOME: '/home/u' });
    assert.equal(target.filePath, '/opt/dsh/profiles/staging/cordis.patch.yml');
    assert.equal(target.profile, 'staging');
    assert.equal(target.dshHome, '/opt/dsh');
  });

  it('形状不识别的绝对路径：给了就用，但 profile 回落到 config.profile', () => {
    const target = resolvePatchTarget({ patchFile: '/tmp/any/patch.yml', profile: 'desktop' }, { HOME: '/home/u' });
    assert.equal(target.filePath, '/tmp/any/patch.yml');
    assert.equal(target.profile, 'desktop');
    assert.equal(target.dshHome, '/home/u/.dsh', '推不出 DSH 根目录时用兜底值');
  });

  it('相对路径被忽略（否则会悄悄变成相对宿主 cwd —— BUG-2 的同款陷阱）', () => {
    const target = resolvePatchTarget({ patchFile: 'profiles/web/cordis.patch.yml' }, { HOME: '/home/u' });
    assert.equal(target.filePath, '/home/u/.dsh/profiles/web/cordis.patch.yml');
    assert.equal(target.filePath.startsWith(process.cwd()), false);
  });

  it('空白串视为未设置', () => {
    assert.equal(resolvePatchPath({ patchFile: '   ' }, { HOME: '/home/u' }), '/home/u/.dsh/profiles/web/cordis.patch.yml');
  });
});

describe('paths · 空白 $DSH_HOME 与 profileContext 混用也绝不落到 cwd', () => {
  it('profileContext 为 undefined + 空白 $DSH_HOME → ~/.dsh', () => {
    for (const dshHome of ['', '   ', '\t\n ']) {
      const file = resolvePatchPath({}, { HOME: '/home/u', DSH_HOME: dshHome }, undefined);
      assert.equal(file, '/home/u/.dsh/profiles/web/cordis.patch.yml');
      assert.equal(file.startsWith(process.cwd()), false);
    }
  });

  it('profileContext 存在 + 空白 $DSH_HOME → 用宿主路径（不是 cwd）', () => {
    const file = resolvePatchPath({}, { HOME: '/home/u', DSH_HOME: '  ' }, DESKTOP_CONTEXT);
    assert.equal(file, '/Users/u/.dsh/profiles/desktop/cordis.patch.yml');
    assert.equal(file.startsWith(process.cwd()), false);
  });

  it('config.dshHome 为空白串时也回落 ~/.dsh', () => {
    assert.equal(resolvePatchPath({ dshHome: '   ' }, { HOME: '/home/u' }), '/home/u/.dsh/profiles/web/cordis.patch.yml');
  });
});

describe('paths · profileFromPatchPath', () => {
  it('识别标准形状', () => {
    assert.equal(profileFromPatchPath('/home/u/.dsh/profiles/desktop/cordis.patch.yml'), 'desktop');
  });

  it('不是 profiles/<name>/cordis.patch.yml 时返回 null', () => {
    assert.equal(profileFromPatchPath('/home/u/.dsh/cordis.patch.yml'), null);
    assert.equal(profileFromPatchPath('/home/u/.dsh/profiles/desktop/other.yml'), null);
    assert.equal(profileFromPatchPath('/home/u/.dsh/profiles/../x/cordis.patch.yml'), null);
    assert.equal(profileFromPatchPath(''), null);
  });
});

describe('paths · toDisplayPath', () => {
  it('把 dshHome 前缀换成 ~', () => {
    assert.equal(
      toDisplayPath('/home/u/.dsh/profiles/web/cordis.patch.yml', '/home/u'),
      '~/.dsh/profiles/web/cordis.patch.yml',
    );
  });

  it('desktop profile 的展示路径保留 profile 段（页面证据）', () => {
    assert.equal(
      toDisplayPath('/Users/u/.dsh/profiles/desktop/cordis.patch.yml', '/Users/u'),
      '~/.dsh/profiles/desktop/cordis.patch.yml',
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

  it('patchFile 只认非空绝对路径', () => {
    assert.equal(normalizeConfig({ patchFile: '/a/b/cordis.patch.yml' }).patchFile, '/a/b/cordis.patch.yml');
    assert.equal(normalizeConfig({ patchFile: '  /a/b/cordis.patch.yml  ' }).patchFile, '/a/b/cordis.patch.yml');
    assert.equal(normalizeConfig({ patchFile: 'rel/cordis.patch.yml' }).patchFile, '');
    assert.equal(normalizeConfig({ patchFile: '' }).patchFile, '');
    assert.equal(normalizeConfig({ patchFile: 42 }).patchFile, '');
  });
});
