#!/usr/bin/env node
/**
 * 构建脚本：esbuild 打客户端 bundle + 拷贝 Host 半 + 校验。
 *
 * 两半分开处理（与 dsh-ssh 同形状）：
 * - Host 半是纯 ESM JS，没有编译需求，"构建" = 目录扫描拷贝 + `node --check`；
 * - 客户端半必须打成**一个文件** lib/client.js：esbuild（bundle, cjs,
 *   react/react-dom 外链）产出后，外面套上 dsh 客户端模块加载器契约
 *   （window.__ModuleLoader__.load）。React 由宿主通过 factory 的 require
 *   参数提供，绝不能打进 bundle——否则宿主会加载两份 React。
 *
 * `--check` 模式：全流程跑进临时目录、**再与现有 `lib/` 逐字节比对**——不一致就
 * 非零退出。只"构建成功"不算通过：`lib/` 是入库产物（用户 `github:owner/repo`
 * 安装时不执行构建），陈旧产物会被直接装上，所以门禁必须证明"仓库里的 lib/
 * 就是现在这份 src/ 的产物"。
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const checkMode = process.argv.includes('--check');

/**
 * Host 半文件：`src/*.js` 自动发现，原样拷贝进 lib/。
 *
 * 目录扫描而不是硬编码数组：新增一个模块只需落一个文件，不会漏拷。
 * `src/client/` 是子目录，不在扫描范围内——客户端代码已被 esbuild 打进
 * lib/client.js，不需要单独拷贝。
 * @type {string[]}
 */
const HOST_FILES = readdirSync(join(root, 'src'), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
  .map((entry) => entry.name)
  .sort();

// 入口必须存在：目录扫描若因路径变化扫空，构建要以明确原因失败，
// 而不是安静产出一个没有 index.js 的 lib/。
if (!HOST_FILES.includes('index.js')) {
  throw new Error(`build: src/index.js not found (scanned: ${HOST_FILES.join(', ') || 'none'})`);
}
/** 客户端入口与产物。 */
const CLIENT_ENTRY = join('src', 'client', 'entry.js');
const CLIENT_OUT = join('lib', 'client.js');

/**
 * 客户端 bundle 体积预算（字节，120KB）。
 *
 * 宿主每次启动都要把这个文件读进内存并执行。本插件零运行时依赖，实测在
 * 30KB 量级，预算只起"防回归"作用（PRD P1-9）。按 **UTF-8 字节**记，
 * 与 `ls -la` 对得上。
 */
const MAX_CLIENT_BYTES = 120 * 1024;

/**
 * 构建客户端 CJS bundle 到指定路径。
 *
 * `loader: {'.js': 'jsx'}`：客户端源码按设计用 .js/.jsx 混排，.js 统一按 jsx
 * 解析——它是 js 的语法超集，对纯 JS 文件无副作用。
 * @param {string} outfile 输出文件（相对 root）。
 * @returns {Promise<void>}
 */
async function bundleClient(outfile) {
  await build({
    entryPoints: [join(root, CLIENT_ENTRY)],
    outfile,
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: ['es2020'],
    minify: true,
    loader: { '.css': 'text', '.js': 'jsx' },
    // classic 运行时：JSX 只依赖 React.createElement，外链面收窄到 react 一个。
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    external: ['react', 'react-dom'],
    legalComments: 'none',
    logLevel: 'warning',
  });
}

/**
 * 把 esbuild 产物包进 dsh 客户端模块加载器契约。
 *
 * esbuild 的 CJS 代码引用 module/exports/require；这里给它一个自带的
 * module 作用域（IIFE 传参），require 由 loader 的 factory 参数提供。
 * 纯字符串拼接，不用 eval。
 * @param {string} bundlePath esbuild 产物路径。
 * @returns {string} 完整的 lib/client.js 内容。
 */
function wrapClientBundle(bundlePath) {
  const bundle = readFileSync(bundlePath, 'utf8').trimEnd();
  return [
    '/**',
    ' * dsh-mcpserver-manager 客户端 bundle —— 由 scripts/build.mjs 生成，请勿手改。',
    ' *',
    ' * 外层是 dsh 客户端模块加载器契约（window.__ModuleLoader__.load）；',
    ' * 内层是 esbuild 的 CJS 产物，跑在一个自带的 module 作用域里。',
    ' * React 由宿主通过 factory 的 require 参数提供，没有打进本文件。',
    ' */',
    "window.__ModuleLoader__.load({",
    "  id: 'dsh-mcpserver-manager',",
    '  factory(require) {',
    '    const module = { exports: {} };',
    '    (function (module, exports, require) {',
    bundle,
    '    })(module, module.exports, require);',
    '    return module.exports;',
    '  },',
    '})',
    '',
  ].join('\n');
}

/**
 * 校验客户端产物：加载器注册在、外链只剩 react/react-dom、体积在预算内。
 * @param {string} source lib/client.js 全文。
 * @returns {string[]} 发现的外链模块 id 列表（校验信息用）。
 */
function validateClientBundle(source) {
  if (!source.includes('__ModuleLoader__.load')) {
    throw new Error('client bundle: missing __ModuleLoader__.load registration');
  }
  if (!source.includes("id: 'dsh-mcpserver-manager'")) {
    throw new Error("client bundle: module id must be 'dsh-mcpserver-manager'");
  }
  /** @type {Set<string>} */
  const externals = new Set();
  const pattern = /\brequire\(\s*(['"])([^'"]+)\1\s*\)/g;
  let match;
  while ((match = pattern.exec(source)) !== null) externals.add(match[2]);
  const leaked = [...externals].filter((id) => id !== 'react' && id !== 'react-dom');
  if (leaked.length > 0) {
    throw new Error(`client bundle: unexpected external require(s): ${leaked.join(', ')}`);
  }
  if (!externals.has('react')) {
    throw new Error('client bundle: react must be an external require');
  }
  if (source.includes('ReactCurrentDispatcher')) {
    throw new Error('client bundle: react internals leaked into the bundle');
  }
  // 裸 `React.createElement`：某个写了 JSX 的模块忘了 import React，esbuild 会
  // 安静地编译成"读全局 React"——浏览器里没有这个全局，加载期才炸。这里拦住。
  if (/\bReact\.createElement\b/.test(source)) {
    throw new Error(
      'client bundle: bare global `React.createElement` found — a JSX module is missing `import React from \'react\'`',
    );
  }
  const bytes = Buffer.byteLength(source, 'utf8');
  if (bytes > MAX_CLIENT_BYTES) {
    throw new Error(
      `client bundle: ${bytes} bytes exceeds the ${MAX_CLIENT_BYTES}-byte budget ` +
        `(over by ${bytes - MAX_CLIENT_BYTES}); trim the client or raise MAX_CLIENT_BYTES on purpose`,
    );
  }
  return [...externals];
}

/**
 * 用 node --check 校验一个 JS 文件的语法（ESM，package.json type: module）。
 * @param {string} path 文件路径。
 * @returns {void}
 */
function checkSyntax(path) {
  execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' });
}

/**
 * 校验 `src/validate.js` 的前后端同源硬约束。
 *
 * 这个文件会被 esbuild 打进浏览器 bundle：一旦它 import 了 node 内置模块或
 * 触碰 window/document，客户端就会在加载期炸掉。构建期用 grep 守住，不另建
 * lint（PRD D1 / 架构 §4.1）。
 * @returns {void}
 */
function assertValidateIsIsomorphic() {
  const source = readFileSync(join(root, 'src', 'validate.js'), 'utf8');
  const forbidden = [
    /\bfrom\s+['"]node:/,
    /\brequire\(\s*['"]/,
    /\bwindow\b/,
    /\bdocument\b/,
    /\bprocess\./,
    /\bBuffer\b/,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(source)) {
      throw new Error(`src/validate.js must stay isomorphic: forbidden pattern ${pattern} found`);
    }
  }
}

/**
 * 把「现在这份 `src/` 的构建产物」与仓库里现有的 `lib/` 逐字节比对。
 *
 * 为什么必须有这一步：`lib/` 是入库产物，用户用 `github:owner/repo` 安装时
 * 不执行构建。只证明"能构建成功"完全不代表"仓库里的 lib/ 就是这份 src/ 的
 * 产物"——陈旧产物照样绿，然后被装上、带着旧 BUG 跑。
 *
 * 三类漂移分开报，因为它们对应的修法不同：
 * - **内容不同**：最常见，改了代码没 build；
 * - **缺失**：构建会产出但 lib/ 里没有；
 * - **多余**：lib/ 里有、构建不再产出（模块改名/删除后的残骸）。
 *
 * @param {string} clientSource 本次构建出的 `lib/client.js` 全文。
 * @returns {string[]} 漂移描述；空数组表示 `lib/` 与源码一致。
 */
function compareLib(clientSource) {
  const libDir = join(root, 'lib');
  /** @type {Map<string, Buffer>} 文件名 → 期望内容 */
  const expected = new Map();
  expected.set('client.js', Buffer.from(clientSource, 'utf8'));
  for (const file of HOST_FILES) {
    // Host 半是原样拷贝，所以期望内容就是 src/ 里的字节。
    expected.set(file, readFileSync(join(root, 'src', file)));
  }

  const present = existsSync(libDir)
    ? readdirSync(libDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort()
    : [];
  if (present.length === 0) {
    return [`缺失 lib/ 目录或为空（期望 ${expected.size} 个产物文件）`];
  }

  /** @type {string[]} */
  const drift = [];
  for (const [name, want] of expected) {
    if (!present.includes(name)) {
      drift.push(`缺失 lib/${name}`);
      continue;
    }
    const actual = readFileSync(join(libDir, name));
    if (!actual.equals(want)) {
      drift.push(`内容不同 lib/${name}（lib 里 ${actual.length} bytes，重新构建应为 ${want.length} bytes）`);
    }
  }
  for (const name of present) {
    if (!expected.has(name)) drift.push(`多余 lib/${name}（现在的构建不再产出它）`);
  }
  return drift;
}

/** 主流程。 */
async function main() {
  let workDir = root;
  let tempDir = null;
  if (checkMode) {
    // --check：产物进临时目录，绝不碰 lib/。
    tempDir = mkdtempSync(join(tmpdir(), 'dsh-mcp-build-'));
    workDir = tempDir;
    mkdirSync(join(workDir, 'lib'), { recursive: true });
  } else {
    rmSync(join(root, 'lib'), { recursive: true, force: true });
    mkdirSync(join(root, 'lib'), { recursive: true });
  }

  try {
    assertValidateIsIsomorphic();

    // 1) 客户端 bundle。
    await bundleClient(join(workDir, CLIENT_OUT));
    const clientSource = wrapClientBundle(join(workDir, CLIENT_OUT));
    if (!checkMode) writeFileSync(join(root, CLIENT_OUT), clientSource);
    const externals = validateClientBundle(clientSource);

    // 2) Host 半拷贝 + 语法校验。
    for (const file of HOST_FILES) {
      const from = join(root, 'src', file);
      const to = join(workDir, 'lib', file);
      if (!checkMode) cpSync(from, to);
      checkSyntax(checkMode ? from : to);
    }

    // 3) --check 的核心：产物必须与仓库里的 lib/ 逐字节一致。
    //    没有这一步，门禁只能证明"代码能编译"，证明不了"入库产物是新的"。
    if (checkMode) {
      const drift = compareLib(clientSource);
      if (drift.length > 0) {
        throw new Error(
          [
            'lib/ 与当前 src/ 不一致 —— 仓库里的产物是陈旧的，请跑 `npm run build` 后再提交：',
            ...drift.map((line) => `  - ${line}`),
          ].join('\n'),
        );
      }
    }

    const mode = checkMode ? 'check' : 'build';
    const clientBytes = Buffer.byteLength(clientSource, 'utf8');
    const budgetPercent = Math.round((clientBytes / MAX_CLIENT_BYTES) * 1000) / 10;
    const verifyNote = checkMode
      ? ` · lib/ verified (${HOST_FILES.length + 1} 个产物逐字节一致, temp dir removed)`
      : '';
    console.log(
      `dsh-mcpserver-manager ${mode}: lib/client.js (${clientBytes} bytes = ${budgetPercent}% of the ` +
        `${MAX_CLIENT_BYTES}-byte budget, externals: ${externals.join(', ') || 'none'}) ` +
        `+ ${HOST_FILES.length} host files${verifyNote}`,
    );
  } finally {
    if (tempDir !== null) rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`build failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
