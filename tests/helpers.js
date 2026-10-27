/**
 * 测试脚手架：一个内存版 fs。
 *
 * patch-store 的全部逻辑都经由注入的 `fs` 落盘，所以"崩溃发生在 rename 之前"
 * 这类场景不需要真的去拔电源——替换掉 fs 就能复现，而且可重复。
 */
import { createHash } from 'node:crypto';

/**
 * 建一个内存文件系统。
 *
 * @param {Record<string, string>} [initial] 初始文件内容。
 * @returns {object} fs 假实现（带 `files`、`calls`、`failOn` 三个可观测字段）。
 */
export function createMemFs(initial = {}) {
  /** @type {Map<string, string>} */
  const files = new Map(Object.entries(initial));
  /** @type {string[]} */
  const calls = [];
  /** @type {((path: string, op: string) => boolean)|null} */
  let failOn = null;

  const memFs = {
    files,
    calls,
    /** 设置失败注入器：返回 true 表示该次操作抛错。 */
    setFailOn(fn) {
      failOn = fn;
    },
    existsSync(path) {
      return files.has(path);
    },
    readFileSync(path) {
      if (!files.has(path)) {
        const error = new Error(`ENOENT: no such file, open '${path}'`);
        error.code = 'ENOENT';
        throw error;
      }
      return files.get(path);
    },
    writeFileSync(path, data) {
      calls.push(`write:${path}`);
      if (failOn !== null && failOn(path, 'write') === true) throw new Error(`injected write failure: ${path}`);
      files.set(path, data);
    },
    copyFileSync(from, to) {
      calls.push(`copy:${from}->${to}`);
      if (!files.has(from)) throw new Error(`ENOENT: ${from}`);
      files.set(to, files.get(from));
    },
    renameSync(from, to) {
      calls.push(`rename:${from}->${to}`);
      if (failOn !== null && failOn(from, 'rename') === true) throw new Error(`injected rename failure: ${from}`);
      files.set(to, files.get(from));
      files.delete(from);
    },
    unlinkSync(path) {
      calls.push(`unlink:${path}`);
      files.delete(path);
    },
    mkdirSync() {
      // 内存 fs 里目录永远存在。
    },
    // fsync 在 patch-store 里是 best-effort：这里故意不支持，验证"不支持也不影响正确性"。
    openSync() {
      throw new Error('openSync unsupported in memfs');
    },
    closeSync() {
      // no-op
    },
    fsyncSync() {
      // no-op
    },
  };
  return memFs;
}

/**
 * 文本 md5（用于"内容没变"的断言）。
 * @param {string} text 文本。
 * @returns {string} md5。
 */
export function md5(text) {
  return createHash('md5').update(text, 'utf8').digest('hex');
}

/**
 * 确定性伪随机（xorshift32）：随机增删序列必须可复现，否则跑绿的测试也可能
 * 下一次跑红。
 * @param {number} seed 种子。
 * @returns {() => number} [0,1) 随机数发生器。
 */
export function rng(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

/**
 * 切出文件的"段外"两部分（不含锚点行本身）。
 *
 * I1 不变量的断言就靠它：段后内容必须严格不变；段前内容允许"多出一个空行"
 * （首次建段时会补一个空行分隔），所以断言用 `startsWith` 而不是 `===`。
 *
 * @param {string} text 文件全文。
 * @param {(lines: string[]) => {state: string, beginLine: number, endLine: number}} anchors findAnchors。
 * @returns {{before: string, after: string}} 段外文本。
 */
export function outsideParts(text, anchors) {
  const lines = text.split(/\r?\n/);
  const found = anchors(lines);
  if (found.state !== 'ok') return { before: text, after: '' };
  return {
    before: lines.slice(0, found.beginLine).join('\n'),
    after: lines.slice(found.endLine + 1).join('\n'),
  };
}
