/**
 * 跨端构建脚本：ESM 源码 → 微信小游戏 CommonJS
 * ------------------------------------------------------------------
 * 【为什么需要】
 * 微信开发者工具**不支持 ESM**（实测确认：无 import/export 支持、
 * 动态 import() 在部分基础库版本直接失败、require 相对路径必须带 .js 后缀）。
 * 而 H5 版本可以原生用 ESM。
 *
 * 【本项目的解法：单一事实源 + 零依赖转译】
 * 不引入Rollup/esbuild 等构建工具链（那会带来数百个 npm 依赖，
 * 与「零依赖、可离线构建」的目标冲突），改为：
 *   1. shared/ 保持 ESM 源码，作为唯一真源
 *   2. 本脚本做**正则级词法转译**：import/export → require/exports
 *   3. 输出到 dist/mp/，由微信开发者工具直接打开
 *
 * 【可靠性边界（重要）】
 * 这是**词法转译**而非完整解析器，只处理本项目已使用的语法子集：
 *   import { a, b } from './x.js'      → const { a, b } = require('./x.js')
 *   import X from './x.js'             → const X = require('./x.js')
 *   export const/function/class/let   → 声明后追加 exports.x = x
 *   export { a, b }                   → exports.a = a; exports.b = b
 *   export default X                  → exports.default = X
 * 若日后引入了含模板字符串内插 import() 的代码，需人工复核。
 *
 * 用法：node tools/build-mp.mjs
 */

import { readdirSync, statSync, existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'fs';
import { join, dirname, relative, extname } from 'path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\//, '');
const SRC_DIRS = ['shared', 'miniprogram'];
const OUT_DIR = join(ROOT, 'dist/mp');

/** 把 ESM import 语句转成 CommonJS */
function transpileImports(code) {
  const out = [];
  const re = /^[ \t]*import\s+(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"];?[ \t]*$/gm;
  let last = 0, m;
  while ((m = re.exec(code)) !== null) {
    out.push(code.slice(last, m.index));
    const clause = m[1];
    const spec = m[2];
    const line = `const ${clause ? clause.trim() : ''} = require('${spec}');`;
    out.push(clause ? line : `require('${spec}');`);
    last = re.lastIndex;
  }
  out.push(code.slice(last));
  return out.join('');
}

/** 收集并转换 export */
function transpileExports(code) {
  let out = code;

  // export const/let/function/class NAME  →  声明 + 尾部导出
  const declRe = /^([ \t]*)export\s+(const|let|var|function|class|async function)\s+([A-Za-z_$][\w$]*)/gm;
  const exported = [];
  let m;
  while ((m = declRe.exec(out)) !== null) {
    const indent = m[1], kind = m[2], name = m[3];
    // 移除 export 关键字
    out = out.slice(0, m.index) + `${indent}${kind} ${name}` +
      out.slice(m.index + m[0].length);
    exported.push(name);
    // 重新扫描剩余部分（因为字符串长度变了）
    declRe.lastIndex = m.index + (indent + kind + ' ' + name).length;
  }

  // export function name(...) → function name(...)  （带参数列表的情况）
  // 已由上面的正则覆盖，因为 function 后面紧跟 name

  // export { a, b as c }
  out = out.replace(/^[ \t]*export\s*\{([^}]*)\};?[ \t]*$/gm, (full, inner) => {
    inner.split(',').forEach(pair => {
      const p = pair.trim();
      if (!p) return;
      const m2 = p.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (m2) exported.push(`${m2[2] || m2[1]}`);
    });
    return '';
  });

  // export default X
  out = out.replace(/^[ \t]*export\s+default\s+/gm, 'exports.default = ');

  // 尾部统一导出
  if (exported.length) {
    out += '\n' + exported.map(n => `try { exports.${n} = ${n}; } catch (e) {}`).join('\n') + '\n';
  }
  return out;
}

function transpile(code) {
  let out = transpileImports(code);
  out = transpileExports(out);
  // ESM 没有 __dirname 需求，但小游戏里require 相对路径必须带 .js
  return out;
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (extname(p) === '.js') out.push(p);
  }
  return out;
}

console.log('构建：ESM → 微信小游戏 CommonJS');
console.log('='.repeat(50));

if (existsSync(OUT_DIR)) {
  rmSync(OUT_DIR, { recursive: true, force: true });
}
mkdirSync(OUT_DIR, { recursive: true });

let count = 0;
for (const dirName of SRC_DIRS) {
  const dir = join(ROOT, dirName);
  const files = walk(dir);
  for (const f of files) {
    const rel = relative(dir, f);
    const dest = join(OUT_DIR, dirName, rel);
    mkdirSync(dirname(dest), { recursive: true });
    const code = readFileSync(f, 'utf8');
    writeFileSync(dest, transpile(code), 'utf8');
    count++;
  }
  console.log(`  ${dirName}/ → dist/mp/${dirName}/  (${files.length} 个文件)`);
}

// 复制静态资源
const assetsSrc = join(ROOT, 'miniprogram/assets');
if (existsSync(assetsSrc)) {
  cpSync(assetsSrc, join(OUT_DIR, 'miniprogram/assets'), { recursive: true });
  console.log(`  assets → dist/mp/miniprogram/assets`);
}

console.log('='.repeat(50));
console.log(`共转换 ${count} 个 JS 文件 → dist/mp/`);

// 冒烟测试：检查转换产物里是否还有 ESM 语法
const outFiles = walk(OUT_DIR);
const problems = [];
for (const f of outFiles) {
  const code = readFileSync(f, 'utf8');
  if (/^\s*import\s+[\s{*'"]/m.test(code)) problems.push(`${relative(OUT_DIR, f)} 仍含 import`);
  if (/^\s*export\s+(const|let|function|class|default)/m.test(code)) problems.push(`${relative(OUT_DIR, f)} 仍含 export`);
}
if (problems.length) {
  console.error('\n❌ 转译不完整：');
  problems.forEach(p => console.error('   ' + p));
  process.exit(1);
}
console.log('✅ 转译冒烟测试通过：无残留 ESM 语法');