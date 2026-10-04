/**
 * 静态自检：在无浏览器环境下抓出运行期才会暴露的错误
 * ------------------------------------------------------------------
 * 动机：端到端跑起来后发现三类问题连续命中——
 *   1. 相对路径层级错（result-scene 的 ../../shared/ 写成 ../shared/）
 *   2. 导入符号不存在（UI.drawStar、drawStar 从 fx 而非 ui 导出）
 *   3. 作用域缺失（drawGradeGrid 用 W 但 W 只在 draw() 里定义）
 * 这三类错误的共同点：**语法合法，静态语法检查查不出，只有真正执行才炸**。
 * 本脚本把「真正执行一遍每个模块的顶层代码」提前到CI 阶段。
 *
 * 用法：node tools/check-runtime.mjs
 */

import { readdirSync, statSync, existsSync, readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { join, dirname, relative, resolve, extname } from 'path';
import { tmpdir } from 'os';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\//, '');
const DIRS = ['shared', 'miniprogram'];

let errors = [];
let warnings = [];

// ===== 1. 校验所有相对导入的目标文件真实存在 =====
function checkImports() {
  const files = [];
  for (const d of DIRS) collect(join(ROOT, d), files);

  for (const f of files) {
    const code = readFileSync(f, 'utf8');
    const re = /from\s+['"](\.[^'"]+)['"]/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      const spec = m[1];
      // 手动解析相对路径层级（避免依赖 Node 的 ESM 解析时机）
      const target = resolve(dirname(f), spec);
      if (!existsSync(target)) {
        // 猜测正确路径
        const alt = resolve(dirname(f), '../' + spec.replace(/^\.\.\//, ''));
        const hint = existsSync(alt) ? alt : null;
        errors.push({
          file: relative(ROOT, f),
          msg: `导入路径不存在: '${spec}'${hint ? `（疑似应为 '${relative(dirname(f), hint).replace(/\\/g, '/')}'）` : ''}`
        });
      }
    }
  }
}

// ===== 2. 校验跨模块导入的符号确实被导出 =====
function checkNamedImports() {
  const files = [];
  for (const d of DIRS) collect(join(ROOT, d), files);

  // 收集每个文件的导出符号
  const exportsMap = new Map();
  for (const f of files) {
    const code = readFileSync(f, 'utf8');
    const names = new Set();
    // export const/let/function/class X
    let m;
    const re1 = /^export\s+(?:const|let|var|function\*?|async function|class)\s+([A-Za-z_$][\w$]*)/gm;
    while ((m = re1.exec(code)) !== null) names.add(m[1]);
    // export { a, b as c }
    const re2 = /^export\s*\{([^}]*)\}/gm;
    while ((m = re2.exec(code)) !== null) {
      m[1].split(',').forEach(p => {
        const t = p.trim();
        if (!t) return;
        const mm = t.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
        if (mm) names.add(mm[2] || mm[1]);
      });
    }
    if (/^export\s+default/m.test(code)) names.add('default');
    // export * from
    if (/^export\s*\*/m.test(code)) names.add('*');
    exportsMap.set(resolve(f), names);
  }

  for (const f of files) {
    const code = readFileSync(f, 'utf8');
    const re = /import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      const spec = m[2];
      const target = resolve(dirname(f), spec);
      if (!existsSync(target)) continue;
      const avail = exportsMap.get(target);
      if (!avail) continue;

      m[1].split(',').forEach(p => {
        const name = p.trim().split(/\s+as\s+/)[0].trim();
        if (!name) return;
        if (!avail.has(name) && !avail.has('*')) {
          errors.push({
            file: relative(ROOT, f),
            msg: `导入了 '${name}'，但 ${spec} 未导出它`
          });
        }
      });
    }
  }
}

// ===== 3. 校验命名空间导入（import * as X）后使用的成员确实存在 =====
function checkNamespaceUsage() {
  const files = [];
  for (const d of DIRS) collect(join(ROOT, d), files);

  for (const f of files) {
    const code = readFileSync(f, 'utf8');
    const nsMap = new Map();
    const re = /import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*['"](\.[^'"]+)['"]/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      nsMap.set(m[1], resolve(dirname(f), m[2]));
    }
    if (!nsMap.size) continue;

    // 收集目标模块导出
    for (const [ns, target] of nsMap) {
      if (!existsSync(target)) continue;
      const tcode = readFileSync(target, 'utf8');
      const avail = new Set();
      let mm;
      const r1 = /^export\s+(?:const|let|var|function\*?|async function|class)\s+([A-Za-z_$][\w$]*)/gm;
      while ((mm = r1.exec(tcode)) !== null) avail.add(mm[1]);
      const r2 = /^export\s*\{([^}]*)\}/gm;
      while ((mm = r2.exec(tcode)) !== null) {
        mm[1].split(',').forEach(p => {
          const t = p.trim();
          if (!t) return;
          const m3 = t.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
          if (m3) avail.add(m3[2] || m3[1]);
        });
      }

      // 找该文件里所有 ns.xxx 的使用
      const usage = new Set();
      const ru = new RegExp(`\\b${ns}\\.([A-Za-z_$][\\w$]*)`, 'g');
      let mu;
      while ((mu = ru.exec(code)) !== null) usage.add(mu[1]);

      for (const u of usage) {
        if (!avail.has(u)) {
          errors.push({
            file: relative(ROOT, f),
            msg: `使用了 ${ns}.${u}，但 ${relative(dirname(f), target).replace(/\\/g, '/')} 未导出它`
          });
        }
      }
    }
  }
}

// ===== 4. 实际执行每个模块，捕获运行期错误 =====
async function checkExecution() {
  for (const d of DIRS) {
    const base = join(ROOT, d);
    const files = [];
    collect(base, files);
    for (const f of files) {
      try {
        await import('file://' + f.replace(/\\/g, '/'));
      } catch (e) {
        // 平台相关模块在 Node 下必然失败（wx 未定义），单独归类
        if (/wx is not defined|document is not defined|window is not defined|navigator/.test(e.message)) {
          warnings.push(`${relative(ROOT, f)}: 需浏览器/小游戏环境（${e.message.slice(0, 40)}）`);
          continue;
        }
        errors.push({ file: relative(ROOT, f), msg: '执行失败: ' + e.message });
      }
    }
  }
}

// ===== 5. 粗检：W/H 这类设计稿尺寸量是否「完全未声明」=====
// 只抓「一个声明都没有」的粗错；精细作用域分析由 checkExecution 覆盖。
function checkCommonGlobals() {
  const files = [];
  for (const d of DIRS) collect(join(ROOT, d), files);
  for (const f of files) {
    const code = readFileSync(f, 'utf8');
    for (const name of ['W', 'H']) {
      const hasDecl = new RegExp('\\b(const|let|var)\\s+[^;{]*\\b' + name + '\\s*[=,;)]').test(code);
      const uses = new RegExp('[^\\w.]' + name + '\\b').test(code);
      if (uses && !hasDecl) {
        errors.push({ file: relative(ROOT, f), msg: `使用了 ${name} 但未声明` });
      }
    }
  }
}

function collect(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    // 跳过测试目录：其中的文件带副作用（会打印、执行断言），
    // 不属于「被游戏代码引用的模块」，混入会污染本脚本的输出。
    if (statSync(p).isDirectory()) {
      if (n === '__test__' || n === 'test' || n === 'tests') continue;
      collect(p, out);
    } else if (extname(p) === '.js') {
      if (/\.test\.js$/.test(p) || /\.spec\.js$/.test(p)) continue;
      out.push(p);
    }
  }
  return out;
}

console.log('运行时静态自检');
console.log('='.repeat(56));

checkImports();
checkNamedImports();
checkNamespaceUsage();
checkCommonGlobals();
await checkExecution();

if (warnings.length) {
  console.log(`\n提示（${warnings.length} 项，需特定运行环境）:`);
  warnings.slice(0, 5).forEach(w => console.log('  · ' + w));
}

if (errors.length) {
  console.log(`\n❌ 发现 ${errors.length} 个问题:\n`);
  // 按文件分组
  const byFile = new Map();
  for (const e of errors) {
    if (!byFile.has(e.file)) byFile.set(e.file, []);
    byFile.get(e.file).push(e.msg);
  }
  for (const [f, msgs] of byFile) {
    console.log(`  ${f}`);
    msgs.forEach(m => console.log(`    - ${m}`));
  }
  console.log('\n修复后重跑：node tools/check-runtime.mjs');
  process.exit(1);
}

console.log('\n✅ 全部通过：导入路径、导出符号、命名空间成员、作用域、执行均无问题');

// ===== 6. 命中区与绘制区一致性 =====
/**
 * 动机：实测踩过「卡片画在 y=316、命中区判 y<=452」这类分叉，
 * 表现是「看得到但点不动」，且语法与运行都不报错，极难发现。
 * 这里比对同一元素在绘制与命中逻辑中用到的坐标常量是否一致。
 */
function checkHitDrawParity() {
  const files = [];
  for (const d of DIRS) collect(join(ROOT, d), files);

  const RULES = [
    // [文件, 含义, 必须在文件中出现一致次数的表达式]
    { f: 'scenes/home-scene.js', what: '年级卡 x 基准', expr: '36 + col * 204' },
    { f: 'scenes/home-scene.js', what: '年级卡 y 基准', expr: '316 + row * 148' },
    { f: 'scenes/home-scene.js', what: '年级卡高度', expr: '130' }
  ];

  for (const r of RULES) {
    const p = join(ROOT, 'miniprogram', r.f);
    if (!existsSync(p)) continue;
    const code = readFileSync(p, 'utf8');
    const n = code.split(r.expr).length - 1;
    if (n < 2) {
      errors.push({
        file: 'miniprogram/' + r.f,
        msg: `${r.what}（'${r.expr}'）在绘制与命中逻辑中未同时出现（只出现 ${n} 次）—— 疑似命中区与绘制区分叉`
      });
    }
  }
}
checkHitDrawParity();
