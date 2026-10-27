/**
 * 核心不变式的**强化**回归：段外字节不变 / 幂等 / 原子写回滚 / `!!js` 保真 /
 * 路径解析回落。
 *
 * 与 `patch-store.test.js` 的分工：那边是逐条手写的定点用例，这边是**随机
 * fuzz + 注入故障**，专门盯"改了一个模块，另一条不变量被悄悄带坏"这类回归
 * （BUG-1 改的就是 serialize.js，而 serialize 在写入链路正中间，必须盯住）。
 *
 * 全部在 tmp 目录里跑，**绝不触碰真实配置文件**。
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as nodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  BEGIN_ANCHOR,
  END_ANCHOR,
  createPatchStore,
  findAnchors,
} from '../src/patch-store.js';
import { resolveDshHome, resolvePatchPath } from '../src/paths.js';
import { rng } from './helpers.js';

/**
 * 建一个临时 patch 文件。
 * @param {string} [content] 初始内容。
 * @returns {{path: string, dir: string}} 路径。
 */
function tempFile(content = undefined) {
  const dir = mkdtempSync(join(tmpdir(), 'dshmcp-inv-'));
  const path = join(dir, 'cordis.patch.yml');
  if (content !== undefined) writeFileSync(path, content);
  return { path, dir };
}

/**
 * 切出受管段之外的内容（不含锚点行本身）。
 * @param {string} text 文件全文。
 * @returns {{before: string[], after: string[]}|null} 段外行数组；锚点不 ok 返回 null。
 */
function outside(text) {
  const found = findAnchors(text.split(/\r?\n/));
  if (found.state !== 'ok') return null;
  const lines = text.split(/\r?\n/);
  return { before: lines.slice(0, found.beginLine), after: lines.slice(found.endLine + 1) };
}

/** 转成 CRLF。 */
const crlf = (text) => text.replace(/\n/g, '\r\n');

/** 一条合法 MCP 条目的 JSON 文本。 */
const cfg = (name, extra = {}) =>
  JSON.stringify({ serverName: name, transport: 'stdio', command: `cmd-${name}`, env: { T: '!!js process.env.T' }, ...extra });

/** 刁钻初始文件：刻意把"用户资产"里最容易被引爆的形态都摆上。 */
const FIXTURES = {
  '用户注释 + 尾部内容': `plugins:\n  foo: bar\n\n${BEGIN_ANCHOR}\n${END_ANCHOR}\n# 尾部注释\ntail: 1\n`,
  'CRLF': crlf(`# 用户注释\n${BEGIN_ANCHOR}\n${END_ANCHOR}\nafter: 1\n`),
  '文件末尾无换行': `head: 1\n${BEGIN_ANCHOR}\n${END_ANCHOR}`,
  'CRLF + 末尾无换行': crlf(`head: 1\n${BEGIN_ANCHOR}\n${END_ANCHOR}`),
  '锚点紧贴条目': `x: 1\n${BEGIN_ANCHOR}\n- id: mcp-a\n  name: '@deepseek-ai/dsh-mcp-client'\n  config:\n    serverName: a\n    transport: stdio\n    command: npx\n${END_ANCHOR}\n- id: hand\n  name: '@deepseek-ai/dsh-mcp-client'\n  config:\n    serverName: handmade\n    transport: stdio\n    command: /bin/sh\n    env:\n      SECRET: !!js process.env.SECRET\nz: 9\n`,
  '无锚点 + 手写条目': `# 只有用户内容\n- id: hand\n  name: '@deepseek-ai/dsh-mcp-client'\n  config:\n    serverName: handmade\n    transport: stdio\n    command: /bin/sh\n    env:\n      T: !!js process.env.T\n`,
  '!!js 到处都是': `# !!js 别动我\n${BEGIN_ANCHOR}\n- id: mcp-a\n  name: '@deepseek-ai/dsh-mcp-client'\n  disabled: !!js process.env.OFF\n  config:\n    serverName: a\n    transport: stdio\n    command: !!js process.env.CMD\n    env:\n      T: !!js process.env.T\n${END_ANCHOR}\n- id: other\n  name: other-plugin\n  config:\n    k: !!js process.env.K\n`,
  '空文件': '',
};

describe('invariants · 段外字节不变（随机 add/remove/toggle fuzz）', () => {
  for (const [label, initial] of Object.entries(FIXTURES)) {
    it(`${label}：40 次随机操作后段外逐字节不变`, async () => {
      const { path } = tempFile(initial);
      const store = createPatchStore({ filePath: path });
      const expectOutside = outside(initial);
      const random = rng(20261028);
      /** @type {string[]} */
      const names = [];
      let ops = 0;

      for (let i = 0; i < 40; i += 1) {
        const roll = random();
        const known = names[Math.floor(random() * names.length)];
        try {
          if (names.length === 0 || roll < 0.45) {
            const name = `srv${i}`;
            await store.add(cfg(name));
            names.push(name);
            ops += 1;
          } else if (roll < 0.75) {
            await store.setEnabled(known, random() < 0.5);
            ops += 1;
          } else {
            await store.remove(known);
            names.splice(names.indexOf(known), 1);
            ops += 1;
          }
        } catch {
          // 随机的重复名/未知名会抛业务错误，不影响本不变量。
        }
        const text = readFileSync(path, 'utf8');
        const nowOutside = outside(text);
        if (expectOutside !== null) {
          assert.ok(nowOutside !== null, `${label}: 操作后锚点被破坏`);
          assert.deepEqual(
            nowOutside.before,
            expectOutside.before,
            `${label} 第 ${i} 次操作后段前内容变了`,
          );
          assert.deepEqual(
            nowOutside.after,
            expectOutside.after,
            `${label} 第 ${i} 次操作后段后内容变了`,
          );
        } else {
          // 原本无锚点：ensureBlock 是**追加**，原内容必须是结果前缀。
          assert.ok(
            text.startsWith(initial.replace(/\s+$/, '')),
            `${label} 第 ${i} 次操作后原内容不再是前缀：\n${text}`,
          );
        }
      }
      assert.ok(ops > 0, 'fuzz 至少要有一次有效操作');
    });
  }
});

describe('invariants · 幂等与原子写回滚', () => {
  it('重复 add 同名 → duplicate-server，且文件一字节不动', async () => {
    const { path } = tempFile(`${BEGIN_ANCHOR}\n${END_ANCHOR}\n`);
    const store = createPatchStore({ filePath: path });
    const input = cfg('gh');
    await store.add(input);
    const afterFirst = readFileSync(path, 'utf8');
    await assert.rejects(() => store.add(input), (error) => error.code === 'duplicate-server');
    assert.equal(readFileSync(path, 'utf8'), afterFirst, '被拒的 add 不该动文件');
  });

  it('rename 前崩溃 → write-failed + 内容复原 + 不留 .tmp 残骸', async () => {
    const initial = `${BEGIN_ANCHOR}\n- id: mcp-a\n  name: '@deepseek-ai/dsh-mcp-client'\n  config:\n    serverName: a\n    transport: stdio\n    command: npx\n${END_ANCHOR}\n`;
    const { path, dir } = tempFile(initial);
    const store = createPatchStore({
      filePath: path,
      fs: { ...nodeFs, renameSync: () => { throw new Error('boom-rename'); } },
    });
    await assert.rejects(() => store.add(cfg('b')), (error) => error.code === 'write-failed');
    assert.equal(readFileSync(path, 'utf8'), initial, '内容必须复原');
    assert.equal(
      readdirSync(dir).some((name) => name.endsWith('.tmp')),
      false,
      `不应留下 .tmp：${readdirSync(dir).join(',')}`,
    );
  });

  it('写 tmp 崩溃 → write-failed + 内容复原 + 不留 .tmp 残骸', async () => {
    const initial = `${BEGIN_ANCHOR}\n${END_ANCHOR}\n`;
    const { path, dir } = tempFile(initial);
    const store = createPatchStore({
      filePath: path,
      fs: {
        ...nodeFs,
        writeFileSync: (p, data) => {
          if (String(p).endsWith('.tmp')) throw new Error('boom-tmp');
          return nodeFs.writeFileSync(p, data);
        },
      },
    });
    await assert.rejects(() => store.add(cfg('b')), (error) => error.code === 'write-failed');
    assert.equal(readFileSync(path, 'utf8'), initial);
    assert.equal(
      readdirSync(dir).some((name) => name.endsWith('.tmp')),
      false,
      `不应留下 .tmp：${readdirSync(dir).join(',')}`,
    );
  });

  it('原本不存在的文件写入失败后被删掉，不留半截文件', async () => {
    const { path, dir } = tempFile(undefined);
    const store = createPatchStore({
      filePath: path,
      fs: { ...nodeFs, renameSync: () => { throw new Error('boom'); } },
    });
    await assert.rejects(() => store.add(cfg('ghost')), (error) => error.code === 'write-failed');
    assert.equal(nodeFs.existsSync(path), false, '失败后不该留下新建的文件');
    assert.equal(
      readdirSync(dir).some((name) => name.endsWith('.tmp')),
      false,
      `不应留下 .tmp：${readdirSync(dir).join(',')}`,
    );
  });
});

describe('invariants · !!js 保真（用户资产损坏的头号风险）', () => {
  /** @type {Array<[string, string]>} */
  const EXPRESSIONS = [
    ['process.env', '!!js process.env.TOKEN'],
    ['模板串', '!!js `token-${process.env.X}`'],
    ['无空格', '!!jsprocess.env.X'],
    ['裸 tag', '!!js'],
  ];

  for (const [label, expr] of EXPRESSIONS) {
    it(`env 值 ${label}：落盘必须原样，绝不能加引号`, async () => {
      const { path } = tempFile();
      const store = createPatchStore({ filePath: path });
      await store.add(cfg('gh', { env: { K: expr } }));
      const text = readFileSync(path, 'utf8');
      assert.ok(text.includes(expr), `文件里没有原样的 ${JSON.stringify(expr)}：\n${text}`);
      assert.equal(
        text.includes(`'${expr}'`) || text.includes(`"${expr}"`),
        false,
        `${expr} 被引号包了 —— 用户的 process.env 表达式会静默失效：\n${text}`,
      );
    });
  }

  it('command / args 里的 !!js 也原样落盘', async () => {
    const { path } = tempFile();
    const store = createPatchStore({ filePath: path });
    await store.add(cfg('gh', { command: '!!js process.env.CMD', args: ['!!js process.env.A'] }));
    const text = readFileSync(path, 'utf8');
    assert.ok(text.includes('command: !!js process.env.CMD'), text);
    assert.ok(text.includes('- !!js process.env.A'), text);
  });

  it('插件自己写入的 env 明文：文件里保留，但绝不下发给 read()', async () => {
    const { path } = tempFile();
    const store = createPatchStore({ filePath: path });
    const secret = 'hunter2-plaintext';
    await store.add(cfg('gh', { env: { TOKEN: secret } }));
    const text = readFileSync(path, 'utf8');
    assert.ok(text.includes(secret), '文件里必须有明文，否则 MCP 跑不起来');
    const snapshot = await store.read();
    assert.equal(
      JSON.stringify(snapshot).includes(secret),
      false,
      'read() 快照不该有明文（它会经 HTTP 下发到浏览器）',
    );
  });
});

describe('invariants · 路径解析绝不落到工作目录', () => {
  /** @type {Array<[string, Record<string, string>]>} */
  const EMPTY_VARIANTS = [
    ['未设置', {}],
    ['空串', { DSH_HOME: '' }],
    ['纯空格', { DSH_HOME: '   ' }],
    ['制表符换行', { DSH_HOME: '\t\n ' }],
  ];

  for (const [label, override] of EMPTY_VARIANTS) {
    it(`$DSH_HOME ${label} → 回落到 ~/.dsh`, () => {
      const env = { HOME: '/home/u', ...override };
      const home = resolveDshHome(env);
      const patch = resolvePatchPath({}, env);
      assert.equal(home, '/home/u/.dsh', `resolveDshHome 回落错了：${home}`);
      assert.equal(patch, '/home/u/.dsh/profiles/web/cordis.patch.yml', `路径错了：${patch}`);
      // 红线：绝不能解析成当前工作目录（那会把插件指向用户任意目录）。
      assert.equal(patch.startsWith(process.cwd()), false, `解析到了 cwd 下：${patch}`);
    });
  }

  it('config.dshHome 为空白串时也回落 ~/.dsh', () => {
    const patch = resolvePatchPath({ dshHome: '   ' }, { HOME: '/home/u' });
    assert.equal(patch, '/home/u/.dsh/profiles/web/cordis.patch.yml');
  });

  it('显式设置仍然生效（且两端空白被裁掉）', () => {
    assert.equal(resolveDshHome({ HOME: '/home/u', DSH_HOME: '/opt/dsh' }), '/opt/dsh');
    assert.equal(resolveDshHome({ HOME: '/home/u', DSH_HOME: '  /opt/dsh  ' }), '/opt/dsh');
  });
});
