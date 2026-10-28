/**
 * `npm run check` 的**门禁有效性**测试。
 *
 * 为什么需要这组测试：`check` 曾经只是"在临时目录里构建成功"，从不比对仓库里
 * 现有的 `lib/`。于是"改了代码不构建"照样绿——而 `lib/` 是入库产物，用户用
 * `github:owner/repo` 安装时宿主不执行构建，直接装上陈旧产物。
 *
 * 做法：把 `src/` + `lib/` + `scripts/` 复制进临时项目，用**子进程**跑
 * `node scripts/build.mjs --check`（不 import 构建逻辑——那等于用被测代码
 * 给自己打分）。一个未篡改的副本必须 0 退出，各种篡改必须非 0 退出。
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
/** 没有构建产物时跳过：`npm test` 不该因为没构建就红（与 client-bundle.test.js 一致）。 */
const hasLib = existsSync(join(root, 'lib', 'client.js'));

/**
 * 把项目复制到临时目录。
 *
 * `node_modules` 用软链：`build.mjs` 要 `import 'esbuild'`，而 ESM 的裸模块解析
 * 是按**脚本所在位置**向上找的，临时目录里没有 node_modules 就解析不到。
 *
 * @returns {string} 临时项目根目录。
 */
function copyProject() {
  const dir = mkdtempSync(join(tmpdir(), 'dshmcp-gate-'));
  for (const entry of ['src', 'lib', 'scripts', 'package.json']) {
    cpSync(join(root, entry), join(dir, entry), { recursive: true });
  }
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
}

/**
 * 在指定项目里跑 `node scripts/build.mjs --check`。
 *
 * @param {string} dir 项目根目录。
 * @returns {{code: number, output: string}} 退出码与 stdout+stderr。
 */
function runCheck(dir) {
  try {
    const stdout = execFileSync(process.execPath, [join('scripts', 'build.mjs'), '--check'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output: stdout };
  } catch (error) {
    const out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    return { code: typeof error.status === 'number' ? error.status : -1, output: out };
  }
}

describe('build --check · 门禁必须能拦住陈旧产物', { skip: !hasLib }, () => {
  it('未篡改的副本：退出码 0，并明确报告 lib/ 已比对', () => {
    const dir = copyProject();
    try {
      const { code, output } = runCheck(dir);
      assert.equal(code, 0, `未篡改副本不该失败：\n${output}`);
      assert.ok(output.includes('lib/ verified'), `应报告逐字节比对结果：\n${output}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('改了 src/ 但没重新构建：退出码非 0，并点名漂移文件', () => {
    const dir = copyProject();
    try {
      appendFileSync(join(dir, 'src', 'paths.js'), '\n// 篡改：没有重新构建\n');
      const { code, output } = runCheck(dir);
      assert.notEqual(code, 0, `陈旧产物必须让门禁变红：\n${output}`);
      assert.ok(output.includes('lib/paths.js'), `应点名 lib/paths.js：\n${output}`);
      assert.ok(output.includes('内容不同'), `应说明是内容漂移：\n${output}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('产物被手工改过（src 未变）：退出码非 0', () => {
    const dir = copyProject();
    try {
      appendFileSync(join(dir, 'lib', 'validate.js'), '\n// 手改产物\n');
      const { code, output } = runCheck(dir);
      assert.notEqual(code, 0, `手改产物必须让门禁变红：\n${output}`);
      assert.ok(output.includes('内容不同 lib/validate.js'), output);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('产物缺失 / 多余：都按漂移报出来', () => {
    const dir = copyProject();
    try {
      unlinkSync(join(dir, 'lib', 'serialize.js'));
      writeFileSync(join(dir, 'lib', 'ghost.js'), '// 构建不再产出这个文件\n');
      const { code, output } = runCheck(dir);
      assert.notEqual(code, 0, `缺失/多余产物必须让门禁变红：\n${output}`);
      assert.ok(output.includes('缺失 lib/serialize.js'), output);
      assert.ok(output.includes('多余 lib/ghost.js'), output);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('门禁只读不写：跑完 check 之后 lib/ 逐字节不变', () => {
    const dir = copyProject();
    try {
      const before = readFileSync(join(dir, 'lib', 'paths.js'), 'utf8');
      const { code } = runCheck(dir);
      assert.equal(code, 0);
      assert.equal(readFileSync(join(dir, 'lib', 'paths.js'), 'utf8'), before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
