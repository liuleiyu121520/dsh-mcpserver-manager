/**
 * patch-store 的单测 —— 全项目风险最高的一块，架构 §6.4 的六条不变量在这里
 * 逐条被断言。
 *
 * 所有用例都在内存 fs / tmp 目录里跑，**绝不触碰真实配置文件**。
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  BEGIN_ANCHOR,
  END_ANCHOR,
  applyDisable,
  createPatchStore,
  ensureBlock,
  findAnchors,
  insertEntry,
  removeEntry,
  replaceEntry,
  restoreSecretValues,
  scan,
} from '../src/patch-store.js';
import { MCP_CLIENT_NAME, serializeEntry } from '../src/serialize.js';
import { createMemFs, md5, outsideParts, rng } from './helpers.js';

/** 一条合法 MCP 条目的 JSON 文本。 */
const configJson = (name) =>
  JSON.stringify({ serverName: name, transport: 'stdio', command: 'node', args: ['server.js'] });

/**
 * 建一个挂在内存 fs 上的 store。
 * @param {string} initial 初始文件内容。
 * @param {object} [extra] 额外选项。
 * @returns {{store: object, fs: object, path: string}} store 与其 fs。
 */
function storeOn(initial, extra = {}) {
  const path = '/tmp/dsh/cordis.patch.yml';
  const fs = createMemFs(initial === null ? {} : { [path]: initial });
  const store = createPatchStore({ filePath: path, fs, now: () => 1700000000000, ...extra });
  return { store, fs, path };
}

/** 六种初始文件（架构 §6.4 I1 要求）。 */
const FIXTURES = [
  ['空文件', ''],
  ['仅注释', '# 这是我的 patch 层\n# 第二行注释\n'],
  [
    '仅一条非 MCP 条目',
    '# patch\n- id: ui-settings-general\n  name: "@deepseek-ai/dsh-client-ui-settings-general"\n  config:\n    welcomeNoticeVersion: 2026-09-28.1\n',
  ],
  [
    '用户手写 MCP 条目（无受管段）',
    '# patch\n- id: mcp-hand\n  name: "@deepseek-ai/dsh-mcp-client"\n  config:\n    serverName: hand\n    transport: stdio\n    command: npx\n',
  ],
  [
    '已有受管段且有条目',
    `# patch\n${BEGIN_ANCHOR}\n- id: mcp-a\n  name: "@deepseek-ai/dsh-mcp-client"\n  config:\n    serverName: a\n${END_ANCHOR}\n`,
  ],
  ['受管段为空', `# patch\n${BEGIN_ANCHOR}\n${END_ANCHOR}\n`],
];

describe('patch-store · 受管段锚点', () => {
  it('ensureBlock 幂等：连续两次输出逐字节相同', () => {
    const first = ensureBlock('# hello\n');
    const second = ensureBlock(first);
    assert.equal(second, first);
    assert.match(first, /^# hello\n\n# >>> dsh-mcpserver-manager:managed:begin/);
    assert.ok(first.endsWith(`${END_ANCHOR}\n`));
  });

  it('锚点齐全 / 缺失 / 损坏三种状态识别正确', () => {
    const lines = (text) => text.split('\n');
    assert.equal(findAnchors(lines(`a\n${BEGIN_ANCHOR}\n- id: x\n${END_ANCHOR}\n`)).state, 'ok');
    assert.equal(findAnchors(lines('a\nb\n')).state, 'missing');
    assert.equal(findAnchors(lines(`${BEGIN_ANCHOR}\n- id: x\n`)).state, 'broken');
    assert.equal(findAnchors(lines(`${END_ANCHOR}\n${BEGIN_ANCHOR}\n`)).state, 'broken');
    assert.equal(findAnchors(lines(`${BEGIN_ANCHOR}\n${BEGIN_ANCHOR}\n${END_ANCHOR}\n`)).state, 'broken');
  });

  it('文件缺少换行结尾时，建段仍保证原内容是结果前缀（I5）', () => {
    const original = '# patch\n- id: x\n  name: "y"';
    const result = ensureBlock(original);
    assert.ok(result.startsWith(`${original}\n`), '原文件内容必须是结果的前缀');
  });
});

describe('patch-store · 不变量 I1：段外字节不变', () => {
  for (const [label, initial] of FIXTURES) {
    it(`${label}：20 次随机增删后段外内容逐字节不变`, async () => {
      const { store, fs, path } = storeOn(initial);
      const before = outsideParts(initial, findAnchors);
      const random = rng(20261027);
      for (let i = 0; i < 20; i += 1) {
        const name = `srv${i}`;
        if (random() < 0.65) {
          try {
            await store.add(configJson(name));
          } catch (error) {
            assert.notEqual(error.code, 'write-failed');
          }
        } else {
          try {
            await store.remove(name);
          } catch (error) {
            assert.equal(error.code, 'unknown-server');
          }
        }
      }
      const finalText = fs.files.get(path) ?? '';
      const after = outsideParts(finalText, findAnchors);
      assert.ok(
        after.before.startsWith(before.before),
        `${label}: 段前内容变了\n--- before ---\n${before.before}\n--- after ---\n${after.before}`,
      );
      assert.equal(after.after, before.after, `${label}: 段后内容变了`);
    });
  }
});

describe('patch-store · 不变量 I2 / I3：崩溃安全与回滚', () => {
  it('rename 前崩溃：文件内容仍是改前内容', async () => {
    const initial = `# patch\n${BEGIN_ANCHOR}\n${END_ANCHOR}\n`;
    const { store, fs, path } = storeOn(initial);
    fs.setFailOn((p, op) => op === 'rename');
    await assert.rejects(() => store.add(configJson('crash')), (error) => error.code === 'write-failed');
    assert.equal(fs.files.get(path), initial, '崩溃后文件内容必须等于改前内容');
    assert.equal(fs.files.has(`${path}.bak`), true, '.bak 必须存在');
  });

  it('写 tmp 时崩溃：文件 md5 与操作前一致，且 .bak 存在（I3）', async () => {
    const initial = `# patch\n${BEGIN_ANCHOR}\n${END_ANCHOR}\n`;
    const beforeMd5 = md5(initial);
    const { store, fs, path } = storeOn(initial);
    fs.setFailOn((p, op) => op === 'write' && p.endsWith('.tmp'));
    await assert.rejects(() => store.add(configJson('boom')), (error) => {
      assert.equal(error.code, 'write-failed');
      assert.equal(error.rolledBack, true);
      return true;
    });
    assert.equal(md5(fs.files.get(path) ?? ''), beforeMd5);
    assert.equal(fs.files.has(`${path}.bak`), true);
    assert.ok(fs.calls.some((call) => call.startsWith('copy:')), '回滚必须真的被调用');
  });

  it('原本不存在的文件写入失败后被删掉，不留半截文件', async () => {
    const { store, fs, path } = storeOn(null);
    fs.setFailOn((p, op) => op === 'rename');
    await assert.rejects(() => store.add(configJson('ghost')), (error) => error.code === 'write-failed');
    assert.equal(fs.files.has(path), false, '失败后不应留下新建的文件');
  });
});

describe('patch-store · 不变量 I4：读不改文件', () => {
  it('read() 前后真实文件的 mtime 与内容均不变', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dshmcp-read-'));
    const path = join(dir, 'cordis.patch.yml');
    const initial = `# patch\n${BEGIN_ANCHOR}\n${END_ANCHOR}\n`;
    writeFileSync(path, initial);
    try {
      const before = statSync(path);
      const store = createPatchStore({ filePath: path });
      await new Promise((done) => setTimeout(done, 15));
      const snapshot = await store.read();
      const after = statSync(path);
      assert.equal(after.mtimeMs, before.mtimeMs, 'read() 不该改 mtime');
      assert.equal(readFileSync(path, 'utf8'), initial);
      assert.equal(snapshot.exists, true);
      assert.equal(snapshot.anchors, 'ok');
      assert.equal(snapshot.items.length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('文件不存在时 read() 返回空态而不是报错', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dshmcp-missing-'));
    try {
      const store = createPatchStore({ filePath: join(dir, 'cordis.patch.yml') });
      const snapshot = await store.read();
      assert.equal(snapshot.exists, false);
      assert.equal(snapshot.anchors, 'missing');
      assert.deepEqual(snapshot.items, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('patch-store · 不变量 I6：env 脱敏', () => {
  it('raw 里不含明文值，但保留 key', async () => {
    const { store } = storeOn(`# patch\n${BEGIN_ANCHOR}\n${END_ANCHOR}\n`);
    await store.add(
      JSON.stringify({
        serverName: 'secret',
        transport: 'stdio',
        command: 'node',
        env: { TOKEN: 'secret-abc' },
      }),
    );
    const snapshot = await store.read();
    const item = snapshot.items.find((entry) => entry.serverName === 'secret');
    assert.ok(item !== undefined);
    assert.equal(item.raw.includes('secret-abc'), false, 'env 明文绝不能出现在 raw 里');
    assert.ok(item.raw.includes('TOKEN'), 'env key 必须保留');
    assert.ok(item.raw.includes('••••'), '必须给出脱敏占位符');
    assert.deepEqual(item.envKeys, ['TOKEN']);
  });

  it('!!js 表达式原样保留（它是引用，不是明文）', () => {
    const text = [
      '- id: mcp-x',
      '  name: "@deepseek-ai/dsh-mcp-client"',
      '  config:',
      '    serverName: x',
      '    env:',
      '      GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN',
      '      PLAIN: "abc"',
    ].join('\n');
    const item = scan(text).items[0];
    assert.ok(item.raw.includes('!!js process.env.GITHUB_TOKEN'), '表达式必须原样保留');
    assert.equal(item.raw.includes('"abc"'), false, '明文值必须被脱敏');
    assert.deepEqual(item.envKeys, ['GITHUB_TOKEN', 'PLAIN']);
  });
});

describe('patch-store · 幂等性', () => {
  it('add 同名两次：第二次 409 duplicate-server 且不落盘', async () => {
    const initial = `# patch\n${BEGIN_ANCHOR}\n${END_ANCHOR}\n`;
    const { store, fs, path } = storeOn(initial);
    await store.add(configJson('github'));
    const afterFirst = fs.files.get(path);
    await assert.rejects(() => store.add(configJson('github')), (error) => error.code === 'duplicate-server');
    assert.equal(fs.files.get(path), afterFirst, '被拒的 add 不该动文件');
  });

  it('remove 两次：第二次 404 unknown-server', async () => {
    const { store } = storeOn(`# patch\n${BEGIN_ANCHOR}\n${END_ANCHOR}\n`);
    await store.add(configJson('gone'));
    await store.remove('gone');
    await assert.rejects(() => store.remove('gone'), (error) => error.code === 'unknown-server');
  });

  it('setEnabled 到同一状态两次：第二次 changed:false 且不落盘', async () => {
    const initial = `# patch\n${BEGIN_ANCHOR}\n${END_ANCHOR}\n`;
    const { store, fs, path } = storeOn(initial);
    await store.add(configJson('toggle'));
    const first = await store.setEnabled('toggle', false);
    assert.equal(first.changed, true);
    const afterDisable = fs.files.get(path);
    const second = await store.setEnabled('toggle', false);
    assert.equal(second.changed, false);
    assert.equal(fs.files.get(path), afterDisable, '幂等的重复操作不该落盘');
    assert.equal(second.item.enabled, false);
  });

  it('停用 → 启用 往返后条目完整恢复（含 env 与 !!js）', async () => {
    const { store, fs, path } = storeOn(`# patch\n${BEGIN_ANCHOR}\n${END_ANCHOR}\n`);
    await store.add(
      JSON.stringify({
        serverName: 'round',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'pkg'],
        env: { TOKEN: '!!js process.env.TOKEN' },
      }),
    );
    const enabledText = fs.files.get(path);
    await store.setEnabled('round', false);
    const disabled = (await store.read()).items.find((item) => item.serverName === 'round');
    assert.equal(disabled.enabled, false);
    assert.ok(fs.files.get(path).includes('disabled: true'));
    await store.setEnabled('round', true);
    const restored = fs.files.get(path);
    assert.equal(restored, enabledText, '往返后必须逐字节回到启用态文本');
  });
});

describe('patch-store · 停用/启用往返矩阵（BUG-2 回归）', () => {
  /**
   * 一条受管段里的 MCP 条目。`extra` 插在 `name` 与 `config` 之间。
   * @param {string} [extra] 额外的条目级键（如 `disabled: false`、用户注释）。
   * @returns {string} 条目文本（不含首尾换行）。
   */
  const item = (extra = '') =>
    [
      '- id: mcp-gh',
      `  name: "${MCP_CLIENT_NAME}"`,
      ...(extra === '' ? [] : [extra]),
      '  config:',
      '    serverName: gh',
      '    transport: stdio',
      '    command: npx',
    ].join('\n');

  /**
   * 造一个"受管段里只有这一条 gh"的 patch 文件。
   * @param {string} [extra] 条目级额外键。
   * @param {boolean} [crlf] 是否用 CRLF。
   * @returns {string} 文件全文。
   */
  const patch = (extra = '', crlf = false) => {
    const lf = `${BEGIN_ANCHOR}\n${item(extra)}\n${END_ANCHOR}\n`;
    return crlf ? lf.replace(/\n/g, '\r\n') : lf;
  };

  /**
   * 在临时目录里跑一遍"停用 → 启用"，返回各阶段文本。
   * @param {string} initial 初始文件内容。
   * @returns {Promise<{base: string, off: string, on: string, file: string}>} 三个阶段的文本。
   */
  async function roundTrip(initial) {
    const dir = mkdtempSync(join(tmpdir(), 'dshmcp-toggle-'));
    const path = join(dir, 'cordis.patch.yml');
    writeFileSync(path, initial);
    try {
      const store = createPatchStore({ filePath: path });
      await store.setEnabled('gh', false);
      const off = readFileSync(path, 'utf8');
      await store.setEnabled('gh', true);
      const on = readFileSync(path, 'utf8');
      return { base: initial, off, on, file: path };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  /** 起始态是"启用"的那些：往返必须逐字节复原。 */
  const REVERSIBLE = [
    ['无 disabled 键（插件自己生成的形态）', patch(), false],
    ['用户手写了 disabled: false', patch('  disabled: false'), false],
    ['条目内含用户注释', patch('  # 用户注释'), false],
    ['CRLF · 无 disabled 键', patch('', true), true],
    ['CRLF · 用户手写了 disabled: false', patch('  disabled: false', true), true],
    ['CRLF · 条目内含用户注释', patch('  # 用户注释', true), true],
  ];

  for (const [label, initial] of REVERSIBLE) {
    it(`${label} → 停用再启用后逐字节复原`, async () => {
      const { base, off, on } = await roundTrip(initial);
      assert.ok(off.includes('disabled: true'), '停用后必须有 disabled: true');
      assert.notEqual(off, base, '停用这一步必须真的改了文件');
      assert.equal(
        on,
        base,
        `往返不一致：\n--- 起始 ---\n${base}\n--- 往返后 ---\n${on}`,
      );
    });
  }

  it('起始就是 disabled: true → 启用时保守写回 disabled: false（绝不整行删掉）', async () => {
    // 团队裁决（既有行为，非 bug）：这条 disabled 行不是本次插入的，所以启用
    // 时写回 `disabled: false` 而不是删掉。多一行 false 无害，删掉不可逆。
    const { on } = await roundTrip(patch('  disabled: true'));
    assert.ok(on.includes('disabled: false'), `应写回 disabled: false，实得：${on}`);
    assert.equal(on.includes('disabled: true'), false);
  });

  it('跨宿主重启：内存标记丢失后启用 → 写回 disabled: false（保住键，不删）', async () => {
    // `insertedDisabled` 是进程内 Set，宿主重启后一定丢。此时启用必须走保守分支。
    const dir = mkdtempSync(join(tmpdir(), 'dshmcp-restart-'));
    const path = join(dir, 'cordis.patch.yml');
    writeFileSync(path, patch());
    try {
      const before = createPatchStore({ filePath: path });
      await before.setEnabled('gh', false);
      assert.ok(readFileSync(path, 'utf8').includes('disabled: true'));

      // 全新的 store = 宿主重启，内存里的 insertedDisabled 是空的。
      const after = createPatchStore({ filePath: path });
      const result = await after.setEnabled('gh', true);
      assert.equal(result.changed, true);
      const text = readFileSync(path, 'utf8');
      assert.ok(text.includes('disabled: false'), `重启后应保守写回 false，实得：${text}`);
      assert.equal((await after.read()).items[0].enabled, true, '条目必须是启用态');
      assert.ok(text.includes(`id: 'mcp-gh'`) || text.includes('id: mcp-gh'), '条目本身不能被破坏');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('applyDisable 直接调用（不传 insertedByUs）走保守分支：写回 false 而非删除', () => {
    const text = patch('  disabled: true');
    const result = applyDisable(text, 'gh', false);
    assert.ok(result !== null);
    assert.ok(result.includes('disabled: false'), '不传标记时应保守保键');
    assert.equal(result.includes('disabled: true'), false);
  });

  it('applyDisable 传 insertedByUs=true 才删除该行', () => {
    const text = patch('  disabled: true');
    const result = applyDisable(text, 'gh', false, true);
    assert.ok(result !== null);
    assert.equal(result.includes('disabled'), false, '标记为"我们插入的"时才删除');
  });

  it('已停用 → 再停用是幂等（changed:false 且不落盘）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dshmcp-idem-'));
    const path = join(dir, 'cordis.patch.yml');
    writeFileSync(path, patch());
    try {
      const store = createPatchStore({ filePath: path });
      await store.setEnabled('gh', false);
      const off = readFileSync(path, 'utf8');
      const second = await store.setEnabled('gh', false);
      assert.equal(second.changed, false);
      assert.equal(readFileSync(path, 'utf8'), off, '幂等操作不该落盘');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('patch-store · 既有行为（不是 bug，别当成缺陷修）', () => {
  it('add → remove 在"原本没有受管段"的文件上：受管段作为脚手架留下，不复原原文件', async () => {
    // 裁决（team-lead）：受管段是**只追加**的脚手架，删空条目不会把它拆掉。
    // 这里把它固化成显式断言，免得后人误判成"删除没删干净"。
    const dir = mkdtempSync(join(tmpdir(), 'dshmcp-scaffold-'));
    const path = join(dir, 'cordis.patch.yml');
    const initial = '# 用户内容\n- id: hand\n  name: "other"\n  config:\n    a: 1\n';
    writeFileSync(path, initial);
    try {
      const store = createPatchStore({ filePath: path });
      await store.add(configJson('mine'));
      await store.remove('mine');
      const final = readFileSync(path, 'utf8');
      assert.ok(final.includes(BEGIN_ANCHOR), '受管段应作为脚手架留下');
      assert.ok(final.includes(END_ANCHOR));
      assert.equal(final.includes('serverName: mine'), false);
      assert.equal(final.includes("serverName: 'mine'"), false, '条目本身必须被删掉');
      // 用户原有内容一个字节都不能少，也不能多（建段时补的分隔空行除外）。
      assert.ok(final.startsWith(initial.replace(/\n$/, '')), '用户原内容必须是结果前缀');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('原本已有受管段时：add → remove 逐字节复原', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dshmcp-scaffold2-'));
    const path = join(dir, 'cordis.patch.yml');
    const initial = `# patch\n${BEGIN_ANCHOR}\n${END_ANCHOR}\n# tail\n`;
    writeFileSync(path, initial);
    try {
      const store = createPatchStore({ filePath: path });
      await store.add(configJson('mine'));
      await store.remove('mine');
      assert.equal(readFileSync(path, 'utf8'), initial, '已有受管段时应逐字节复原');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('混合换行的文件：首次写入会统一成探测到的换行符（既有行为）', async () => {
    // detectNewline 的设计是"整个文件用一种换行"（绝不归一化**内容**，但换行符
    // 本身是全文件统一的）。锚点用 LF、条目用 CRLF 这种畸形输入会被统一成 CRLF。
    const dir = mkdtempSync(join(tmpdir(), 'dshmcp-mixed-'));
    const path = join(dir, 'cordis.patch.yml');
    const mixed =
      `${BEGIN_ANCHOR}\n` +
      '- id: mcp-gh\r\n' +
      `  name: "${MCP_CLIENT_NAME}"\r\n` +
      '  config:\r\n    serverName: gh\r\n' +
      `${END_ANCHOR}\n`;
    writeFileSync(path, mixed);
    try {
      const store = createPatchStore({ filePath: path });
      await store.setEnabled('gh', false);
      const text = readFileSync(path, 'utf8');
      const bareLf = (text.match(/(?<!\r)\n/g) ?? []).length;
      assert.equal(bareLf, 0, '首次写入后不应残留裸 LF（换行符被统一）');
      assert.ok(text.includes('disabled: true'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('patch-store · 初始状态：用户已手写 MCP 但无受管段', () => {
  const initial = [
    '# patch',
    '- id: mcp-hand',
    '  name: "@deepseek-ai/dsh-mcp-client"',
    '  config:',
    '    serverName: hand',
    '    transport: stdio',
    '    command: npx',
    '',
  ].join('\n');

  it('read() 返回 1 条 managed:false', async () => {
    const { store } = storeOn(initial);
    const snapshot = await store.read();
    assert.equal(snapshot.anchors, 'missing');
    assert.equal(snapshot.items.length, 1);
    assert.equal(snapshot.items[0].serverName, 'hand');
    assert.equal(snapshot.items[0].managed, false);
    assert.equal(snapshot.items[0].parsable, true);
  });

  it('随后 add 另一条：用户条目仍在段外且字节不变', async () => {
    const { store, fs, path } = storeOn(initial);
    await store.add(configJson('mine'));
    const text = fs.files.get(path);
    const parts = outsideParts(text, findAnchors);
    const before = outsideParts(initial, findAnchors);
    assert.ok(parts.before.includes('serverName: hand'), '用户条目必须在受管段之外');
    assert.ok(parts.before.startsWith(before.before), '段前内容必须不变');
    assert.equal(parts.after, before.after);
    const snapshot = await store.read();
    assert.equal(snapshot.items.length, 2);
    assert.equal(snapshot.items[0].managed, false);
    assert.equal(snapshot.items[1].managed, true);
  });

  it('对只读条目做写操作 → readonly-entry', async () => {
    const { store } = storeOn(initial);
    await assert.rejects(() => store.remove('hand'), (error) => error.code === 'readonly-entry');
    await assert.rejects(() => store.setEnabled('hand', false), (error) => error.code === 'readonly-entry');
  });

  it('与只读条目重名 → duplicate-server', async () => {
    const { store } = storeOn(initial);
    await assert.rejects(() => store.add(configJson('hand')), (error) => error.code === 'duplicate-server');
  });
});

describe('patch-store · 锚点损坏', () => {
  const broken = `# patch\n${BEGIN_ANCHOR}\n- id: mcp-a\n  name: "@deepseek-ai/dsh-mcp-client"\n  config:\n    serverName: a\n`;

  it('读仍可用，写一律 409 anchors-broken', async () => {
    const { store } = storeOn(broken);
    const snapshot = await store.read();
    assert.equal(snapshot.anchors, 'broken');
    assert.equal(snapshot.items.length, 1);
    await assert.rejects(() => store.add(configJson('b')), (error) => error.code === 'anchors-broken');
    await assert.rejects(() => store.remove('a'), (error) => error.code === 'anchors-broken');
  });
});

describe('patch-store · 纯函数层', () => {
  const base = `# head\n${BEGIN_ANCHOR}\n${END_ANCHOR}\n# tail\n`;

  it('insertEntry 插在 end 锚点之前', () => {
    const result = insertEntry(base, ['- id: mcp-x', '  name: "n"']);
    const lines = result.split('\n');
    assert.equal(lines[lines.indexOf(END_ANCHOR) - 1], '  name: "n"');
  });

  it('removeEntry / replaceEntry / applyDisable 定位不到时返回 null', () => {
    assert.equal(removeEntry(base, 'nope'), null);
    assert.equal(replaceEntry(base, 'nope', ['- id: mcp-y']), null);
    assert.equal(applyDisable(base, 'nope', true), null);
  });

  it('insertEntry → removeEntry 回到原文本', () => {
    const withEntry = insertEntry(base, serializeEntry({ id: 'mcp-x', config: { serverName: 'x' } }));
    assert.equal(removeEntry(withEntry, 'x'), base);
  });

  it('CRLF 文件的换行符被保留', () => {
    const crlf = `# head\r\n${BEGIN_ANCHOR}\r\n${END_ANCHOR}\r\n`;
    const result = insertEntry(crlf, ['- id: mcp-x', '  name: "n"']);
    assert.ok(result.includes('\r\n'));
    assert.equal(result.split('\n').length - 1, result.split('\r\n').length - 1, '不应混入裸 \\n');
  });

  it('外部变更检测用 checksum：读后写前文件被改 → file-changed', async () => {
    const path = '/tmp/dsh/cordis.patch.yml';
    const fs = createMemFs({ [path]: `# patch\n${BEGIN_ANCHOR}\n${END_ANCHOR}\n` });
    const store = createPatchStore({ filePath: path, fs });
    let step = 0;
    const originalRead = fs.readFileSync.bind(fs);
    fs.readFileSync = (p) => {
      const value = originalRead(p);
      // mutate 内的第 2 次读（复核读）之前悄悄把文件改掉。
      step += 1;
      if (step === 2) fs.files.set(p, `${value}# 外部插入的注释\n`);
      return fs.files.get(p);
    };
    await assert.rejects(() => store.add(configJson('race')), (error) => error.code === 'file-changed');
  });
});

describe('patch-store · 解析能力边界', () => {
  it('不可解析的条目降级为 parsable:false，不报错', () => {
    const text = [
      '# >>> dsh-mcpserver-manager:managed:begin',
      '- id: mcp-weird',
      '  name: "@deepseek-ai/dsh-mcp-client"',
      '  config: |',
      '    这是一个块标量，超出可解析范围',
      '# <<< dsh-mcpserver-manager:managed:end',
    ].join('\n');
    const result = scan(text);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].parsable, false);
    assert.ok(result.items[0].raw.length > 0, 'raw 仍要能给 UI 展示');
  });

  it('流样式的 args / env 也照读不误（官方 README 的写法）', () => {
    const text = [
      '- id: mcp-flowargs',
      '  name: "@deepseek-ai/dsh-mcp-client"',
      '  config:',
      '    serverName: flowargs',
      '    transport: stdio',
      '    command: npx',
      "    args: ['-y', 'pkg']",
      '    env: { TOKEN: abc }',
    ].join('\n');
    const item = scan(text).items[0];
    assert.deepEqual(item.args, ['-y', 'pkg']);
    assert.deepEqual(item.envKeys, ['TOKEN']);
    assert.equal(item.summary, 'npx -y pkg');
  });

  it('流样式 config 也能解析（官方 README 的写法）', () => {
    const text = [
      '- id: mcp-flow',
      '  name: "@deepseek-ai/dsh-mcp-client"',
      '  config: { serverName: flow, transport: stdio, command: node }',
    ].join('\n');
    const item = scan(text).items[0];
    assert.equal(item.serverName, 'flow');
    assert.equal(item.transport, 'stdio');
    assert.equal(item.summary, 'node');
    assert.equal(item.parsable, true);
  });

  it('disabled 是 !!js 表达式时，启停被拒（disable-by-expression）', async () => {
    const text = [
      BEGIN_ANCHOR,
      '- id: mcp-expr',
      '  name: "@deepseek-ai/dsh-mcp-client"',
      '  disabled: !!js process.env.OFF',
      '  config:',
      '    serverName: expr',
      '    transport: stdio',
      '    command: node',
      END_ANCHOR,
    ].join('\n');
    const { store } = storeOn(text);
    const item = (await store.read()).items[0];
    assert.equal(item.disabledBy, 'expression');
    await assert.rejects(
      () => store.setEnabled('expr', true),
      (error) => error.code === 'disable-by-expression',
    );
  });

  it('id 撞车时 add 被拒（mcp-<name> 已被别的插件占用）', async () => {
    const initial = `- id: mcp-taken\n  name: "other-plugin"\n${BEGIN_ANCHOR}\n${END_ANCHOR}\n`;
    const { store } = storeOn(initial);
    await assert.rejects(() => store.add(configJson('taken')), (error) => error.code === 'duplicate-server');
  });
});

describe('patch-store · 真实文件系统往返', () => {
  it('在 tmp 目录里真的落盘：建段 → 插入 → .bak 存在 → 删除', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dshmcp-real-'));
    const path = join(dir, 'cordis.patch.yml');
    writeFileSync(
      path,
      '# Your patch layer\n# 别动我\n- id: ui-settings-general\n  name: "x"\n  config:\n    a: 1\n',
    );
    try {
      const store = createPatchStore({ filePath: path });
      const added = await store.add(configJson('real'));
      assert.equal(added.item.serverName, 'real');
      const text = readFileSync(path, 'utf8');
      assert.ok(text.includes('# 别动我'), '注释必须还在');
      assert.ok(text.includes('- id: ui-settings-general'), '别的插件条目必须还在');
      assert.ok(text.includes(BEGIN_ANCHOR));
      assert.ok(text.includes("serverName: 'real'"));
      assert.ok(text.includes('toolCallTimeoutMs: 60000'), '默认值必须补齐');
      assert.ok(text.includes('failOnStartupError: false'));
      await store.remove('real');
      // 注意：序列化出来的是 `serverName: 'real'`（带单引号）。断言必须查带引号的
      // 形式——查 `serverName: real` 是个恒真的空断言，remove 没生效也会通过。
      const removed = readFileSync(path, 'utf8');
      assert.equal(removed.includes("serverName: 'real'"), false, '条目原文必须被删掉');
      assert.equal(removed.includes("- id: 'mcp-real'"), false, '条目 id 行必须被删掉');
      assert.ok(removed.includes('# 别动我'), '删除不该碰段外注释');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('patch-store · 目标文件由宿主 profileContext 决定（BUG-2 回归）', () => {
  /**
   * 建一棵 `<root>/.dsh/profiles/{web,desktop}` 的临时树。
   * @returns {{root: string, dshHome: string, desktop: string, web: string}} 路径集合。
   */
  const tree = () => {
    const root = mkdtempSync(join(tmpdir(), 'dshmcp-profile-'));
    const dshHome = join(root, '.dsh');
    const desktop = join(dshHome, 'profiles', 'desktop', 'cordis.patch.yml');
    const web = join(dshHome, 'profiles', 'web', 'cordis.patch.yml');
    mkdirSync(join(dshHome, 'profiles', 'desktop'), { recursive: true });
    mkdirSync(join(dshHome, 'profiles', 'web'), { recursive: true });
    writeFileSync(web, '# web profile：不该被改\n');
    return { root, dshHome, desktop, web };
  };

  it('profileContext.patchPath 优先：desktop 宿主的配置绝不写进 web 文件', async () => {
    const { root, dshHome, desktop, web } = tree();
    try {
      const store = createPatchStore({
        // 故意把回落链指向 web：profileContext 必须压过它。
        config: { dshHome, profile: 'web' },
        env: { HOME: root },
        profileContext: { name: 'desktop', dir: join(dshHome, 'profiles', 'desktop'), patchPath: desktop, home: dshHome },
      });
      assert.equal(store.filePath, desktop);
      assert.equal(store.profile, 'desktop');
      assert.equal(store.dshHome, dshHome);
      assert.equal(store.source, 'profileContext');
      assert.equal(store.fileDisplay, '~/.dsh/profiles/desktop/cordis.patch.yml');

      await store.add(configJson('gh'));
      assert.ok(readFileSync(desktop, 'utf8').includes("serverName: 'gh'"), 'desktop 文件必须被写入');
      assert.equal(readFileSync(web, 'utf8'), '# web profile：不该被改\n', 'web 文件一个字节都不该动');

      const snapshot = await store.read();
      assert.equal(snapshot.file, desktop);
      assert.equal(snapshot.profile, 'desktop');
      assert.equal(snapshot.source, 'profileContext');
      assert.equal(snapshot.fileDisplay, '~/.dsh/profiles/desktop/cordis.patch.yml');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('没有 profileContext 时按 config.dshHome + profile 回落，且不崩', async () => {
    const { root, dshHome, desktop } = tree();
    try {
      const store = createPatchStore({
        config: { dshHome, profile: 'desktop' },
        env: { HOME: root },
        profileContext: undefined,
      });
      assert.equal(store.filePath, desktop);
      assert.equal(store.profile, 'desktop');
      assert.equal(store.source, 'config.dshHome');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('config.patchFile 连 profileContext 都能压过（逃生门）', async () => {
    const { root, dshHome, desktop } = tree();
    const custom = join(root, 'custom', 'cordis.patch.yml');
    try {
      const store = createPatchStore({
        config: { patchFile: custom },
        env: { HOME: root },
        profileContext: { name: 'desktop', patchPath: desktop, home: dshHome },
      });
      assert.equal(store.filePath, custom);
      assert.equal(store.source, 'config.patchFile');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('显式注入 filePath 仍然最高优先（测试注入面不变）', () => {
    const { root, dshHome, desktop } = tree();
    const injected = join(root, 'injected.yml');
    try {
      const store = createPatchStore({
        filePath: injected,
        config: { patchFile: join(root, 'config.yml') },
        env: { HOME: root },
        profileContext: { name: 'desktop', patchPath: desktop, home: dshHome },
      });
      assert.equal(store.filePath, injected);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('patch-store · Claude 格式落盘（{ mcpServers: { … } }）', () => {
  /**
   * 用户从别处复制来的那条：SSE + headers + disabled。
   * @returns {string} JSON 文本。
   */
  const claudeJson = () =>
    JSON.stringify({
      mcpServers: {
        creis_mcp_server: {
          transportType: 'sse',
          url: 'https://testllmgateway.3g.fang.com/mcp/creis_mcp_server',
          headers: { 'x-litellm-api-key': 'Bearer sk-test' },
          disabled: false,
        },
      },
    });

  it('拆壳后落盘：serverName / transport / url / headers 都在，且没有 config.disabled', async () => {
    const { store, fs, path } = storeOn(`${BEGIN_ANCHOR}\n${END_ANCHOR}\n`);
    await store.add(claudeJson());
    const text = fs.readFileSync(path, 'utf8');
    assert.ok(text.includes("serverName: 'creis_mcp_server'"), text);
    assert.ok(text.includes("transport: 'streamable-http'"), text);
    assert.ok(text.includes("url: 'https://testllmgateway.3g.fang.com/mcp/creis_mcp_server'"), text);
    assert.ok(text.includes("x-litellm-api-key: 'Bearer sk-test'"), text);
    assert.equal(text.includes('disabled'), false, 'disabled:false 不该写进文件（默认就是启用）');
    assert.equal(text.includes('transportType'), false, '外来字段不该落盘');

    // 明文 token 留在文件里（MCP 自己要读），但**绝不进 read() 快照**
    // ——那份快照会经 HTTP 下发给浏览器。
    const snapshot = await store.read();
    assert.equal(JSON.stringify(snapshot).includes('sk-test'), false, 'headers 里的 token 不该进快照');
    assert.ok(snapshot.items[0].raw.includes('x-litellm-api-key'), '头名要保留，用户才知道配了什么');
  });

  it('disabled:true 提到条目级（不是 config 里的字段），并能在重启后读回', async () => {
    const { store, fs, path } = storeOn(`${BEGIN_ANCHOR}\n${END_ANCHOR}\n`);
    const json = JSON.stringify({
      mcpServers: { off: { command: 'npx', args: ['-y', 'x'], disabled: true } },
    });
    const added = await store.add(json);
    assert.equal(added.item.enabled, false);
    assert.equal(added.item.disabledBy, 'native-key');
    const text = fs.readFileSync(path, 'utf8');
    // 缩进 2 空格 = 条目级；缩进 4 空格才会是 config 子键。
    assert.ok(text.includes('\n  disabled: true\n'), text);
    assert.equal(text.includes('    disabled:'), false, 'disabled 不许写进 config 子树');
  });

  it('disabled:true 加进来的条目，启用时整行删掉（那行是我们写的）', async () => {
    const { store, fs, path } = storeOn(`${BEGIN_ANCHOR}\n${END_ANCHOR}\n`);
    await store.add(JSON.stringify({ mcpServers: { off: { command: 'npx', disabled: true } } }));
    await store.setEnabled('off', true);
    const text = fs.readFileSync(path, 'utf8');
    assert.equal(text.includes('disabled'), false, `我们自己写的 disabled 行该整行删掉：\n${text}`);
    assert.equal((await store.read()).items[0].enabled, true);
  });

  it('多条 mcpServers 直接拒，文件一字节不动', async () => {
    const initial = `${BEGIN_ANCHOR}\n${END_ANCHOR}\n`;
    const { store, fs, path } = storeOn(initial);
    await assert.rejects(
      () => store.add(JSON.stringify({ mcpServers: { a: { command: 'n' }, b: { command: 'n' } } })),
      (error) => error.code === 'invalid-config',
    );
    assert.equal(fs.readFileSync(path, 'utf8'), initial);
  });
});

describe('patch-store · 编辑（configSource / replace）', () => {
  /** 一条带密钥的远程条目。 */
  const secretConfig = (overrides = {}) => ({
    serverName: 'remote',
    transport: 'streamable-http',
    url: 'https://a.example/mcp',
    headers: { Authorization: 'Bearer sk-secret-value', 'x-other': 'plain' },
    ...overrides,
  });

  /** 建一个只有一条 remote 的 store。 */
  const withRemote = async () => {
    const ctx = storeOn(`# patch\n${BEGIN_ANCHOR}\n${END_ANCHOR}\n`);
    await ctx.store.add(JSON.stringify(secretConfig()));
    return ctx;
  };

  it('configSource 下发的是空值：只有键名，没有密钥', async () => {
    const { store } = await withRemote();
    const source = await store.configSource('remote');
    assert.equal(source.serverName, 'remote');
    assert.equal(source.id, 'mcp-remote');
    assert.equal(source.text.includes('sk-secret-value'), false, '密钥绝不能下发到浏览器');
    assert.equal(source.text.includes('plain'), false, 'headers 里任何值都不能漏');
    const parsed = JSON.parse(source.text);
    assert.deepEqual(parsed.headers, { Authorization: '', 'x-other': '' });
    assert.deepEqual(source.maskedKeys, { headers: ['Authorization', 'x-other'] });
    assert.equal(parsed.url, 'https://a.example/mcp', '非密钥字段必须原样给回来');
  });

  it('configSource 的 text 能直接回喂校验（编辑框里那份就是合法的提交体）', async () => {
    const { store } = await withRemote();
    const source = await store.configSource('remote');
    const { validateServerInput } = await import('../src/validate.js');
    const result = validateServerInput(source.text, { existingServerNames: [], existingIds: [] });
    assert.equal(result.ok, true, JSON.stringify(result.issues));
  });

  it('只改 url：留空的密钥被还原，明文仍在文件里（不是被空串覆盖）', async () => {
    const { store, fs, path } = await withRemote();
    const source = await store.configSource('remote');
    const edited = JSON.parse(source.text);
    edited.url = 'https://b.example/mcp';
    const result = await store.replace('remote', JSON.stringify(edited));
    assert.equal(result.renamed, false);
    const text = fs.files.get(path);
    assert.ok(text.includes('Bearer sk-secret-value'), '空串 = 沿用原值，密钥必须还在');
    assert.ok(text.includes('https://b.example/mcp'));
    assert.equal((await store.read()).items.length, 1, '不能变成两条');
  });

  it('填了新密钥：新值生效（旧值不许盖回来）', async () => {
    const { store, fs, path } = await withRemote();
    const source = await store.configSource('remote');
    const edited = JSON.parse(source.text);
    edited.headers.Authorization = 'Bearer sk-brand-new';
    await store.replace('remote', JSON.stringify(edited));
    const text = fs.files.get(path);
    assert.ok(text.includes('Bearer sk-brand-new'));
    assert.equal(text.includes('sk-secret-value'), false, '旧密钥必须被替换掉');
  });

  it('把整个密钥键删掉：真的删掉，不会被"还原"救回来', async () => {
    const { store, fs, path } = await withRemote();
    const source = await store.configSource('remote');
    const edited = JSON.parse(source.text);
    delete edited.headers;
    await store.replace('remote', JSON.stringify(edited));
    const text = fs.files.get(path);
    assert.equal(text.includes('Authorization'), false);
    assert.equal((await store.read()).items[0].headerKeys.length, 0);
  });

  it('改名：旧名消失、新名出现，id 跟着改（不是留下两条）', async () => {
    const { store } = await withRemote();
    const source = await store.configSource('remote');
    const edited = JSON.parse(source.text);
    edited.serverName = 'renamed';
    const result = await store.replace('remote', JSON.stringify(edited));
    assert.equal(result.renamed, true);
    assert.equal(result.item.serverName, 'renamed');
    assert.equal(result.item.id, 'mcp-renamed');
    const names = (await store.read()).items.map((entry) => entry.serverName);
    assert.deepEqual(names, ['renamed']);
  });

  it('新配置没提 disabled：沿用原停用状态（改个 url 不会顺手把它启用）', async () => {
    const { store } = await withRemote();
    await store.setEnabled('remote', false);
    const source = await store.configSource('remote');
    const edited = JSON.parse(source.text);
    edited.url = 'https://c.example/mcp';
    await store.replace('remote', JSON.stringify(edited));
    assert.equal((await store.read()).items[0].enabled, false, '停用状态必须保住');
  });

  it('新配置里写了 disabled: false：以用户写的为准', async () => {
    const { store } = await withRemote();
    await store.setEnabled('remote', false);
    const source = await store.configSource('remote');
    const edited = JSON.parse(source.text);
    edited.disabled = false;
    await store.replace('remote', JSON.stringify(edited));
    assert.equal((await store.read()).items[0].enabled, true);
  });

  it('env 里的 !!js 表达式：编辑后仍不加引号（加了引号表达式就静默失效）', async () => {
    const { store, fs, path } = storeOn(`# patch\n${BEGIN_ANCHOR}\n${END_ANCHOR}\n`);
    await store.add(
      JSON.stringify({
        serverName: 'stdio-x',
        transport: 'stdio',
        command: 'npx',
        env: { GITHUB_TOKEN: '!!js process.env.GITHUB_TOKEN', PLAIN: 'sk-plain' },
      }),
    );
    const source = await store.configSource('stdio-x');
    const edited = JSON.parse(source.text);
    // 两个密钥字段都被置空——包括那个表达式。
    assert.deepEqual(edited.env, { GITHUB_TOKEN: '', PLAIN: '' });
    edited.args = ['-y', 'other-pkg'];
    await store.replace('stdio-x', JSON.stringify(edited));
    const text = fs.files.get(path);
    assert.ok(
      text.includes('GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN'),
      `表达式必须原样输出（不加引号），实际：\n${text}`,
    );
    assert.equal(text.includes('"!!js'), false, '被引号包住就变成字面量了，用户的 process.env 会失效');
    assert.ok(text.includes('sk-plain'), '留空的明文密钥要被还原，不能丢');
    assert.ok(text.includes('other-pkg'));
  });

  it('段外（用户手写）条目：configSource 与 replace 都拒绝，且不动文件', async () => {
    const hand = [
      '# 手写',
      '- id: mcp-hand',
      `  name: "${MCP_CLIENT_NAME}"`,
      '  config:',
      '    serverName: hand',
      '    transport: stdio',
      '    command: node',
      '',
    ].join('\n');
    const { store, fs, path } = storeOn(hand);
    const before = fs.files.get(path);
    await assert.rejects(() => store.configSource('hand'), (error) => error.code === 'readonly-entry');
    await assert.rejects(
      () => store.replace('hand', configJson('hand')),
      (error) => error.code === 'readonly-entry',
    );
    assert.equal(fs.files.get(path), before, '被拒的编辑一个字节都不该动');
  });

  it('不存在的名字：unknown-server', async () => {
    const { store } = await withRemote();
    await assert.rejects(() => store.configSource('nope'), (error) => error.code === 'unknown-server');
    await assert.rejects(() => store.replace('nope', configJson('nope')), (error) => error.code === 'unknown-server');
  });

  it('改名撞上别人的名字：duplicate-server（摘自己 ≠ 谁都能过）', async () => {
    const { store } = storeOn(`# patch\n${BEGIN_ANCHOR}\n${END_ANCHOR}\n`);
    await store.add(configJson('a'));
    await store.add(configJson('b'));
    const source = await store.configSource('b');
    const edited = JSON.parse(source.text);
    edited.serverName = 'a';
    await assert.rejects(
      () => store.replace('b', JSON.stringify(edited)),
      (error) => error.code === 'duplicate-server',
    );
  });

  it('编辑后 read() 的快照里仍然没有明文（parsed 是不可枚举属性）', async () => {
    const { store, path } = await withRemote();
    const snapshot = await store.read();
    const item = snapshot.items[0];
    assert.equal(JSON.stringify(snapshot).includes('sk-secret-value'), false, '快照不能带明文');
    assert.equal(JSON.stringify(item).includes('sk-secret-value'), false, 'item 序列化也不能带明文');
    assert.deepEqual({ ...item }.parsed, undefined, '对象展开也要拿不到 parsed');
    assert.equal(typeof item.parsed, 'object', '显式读取才拿得到（configSource 需要）');
    // 保险丝的另一半：文件里必须还有明文，否则"编辑一次就丢密钥"（见上面
    // 「只改 url」那条）。这里只确认快照这条路径是干净的。
    assert.ok(path.endsWith('cordis.patch.yml'));
  });
});

describe('patch-store · restoreSecretValues（纯函数）', () => {
  it('空串 + 原值非空字符串 → 还原；其它一概不碰', () => {
    const next = { env: { A: '', B: '', C: 'new', D: 'kept' }, headers: { H: '' } };
    const previous = { env: { A: 'old-a', B: 42, C: 'old-c', D: 'old-d' }, headers: { H: 'old-h' } };
    const merged = restoreSecretValues(next, previous);
    assert.equal(merged.env.A, 'old-a', '空串才还原');
    assert.equal(merged.env.B, '', '原值不是字符串就一律不还原（数字/布尔不是密钥）');
    assert.equal(merged.env.C, 'new', '用户填了就用用户的');
    assert.equal(merged.env.D, 'kept');
    assert.equal(merged.headers.H, 'old-h');
    assert.equal(next.env.A, '', '入参不能被原地改写');
  });

  it('原值为 null / 缺键时什么都不还原', () => {
    const merged = restoreSecretValues({ env: { A: '' } }, { env: {} });
    assert.equal(merged.env.A, '');
    assert.deepEqual(restoreSecretValues({ env: { A: '' } }, null), { env: { A: '' } });
  });
});
