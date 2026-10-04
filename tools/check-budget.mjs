/**
 * 资源预算守卫（构建期执行）
 * ------------------------------------------------------------------
 * 微信小游戏包体限制（实测数据，非估算）：
 *   - 主包：≤ 4 MB
 *   - 总计：≤ 20 MB（含分包）
 *   - 单个分包：≤ 4 MB
 *
 * 本脚本在构建时校验预算，超限直接失败，避免把超限包发到开发者工具后才发现。
 * 用法：node tools/check-budget.mjs
 */

import { readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\//, '');
const MAIN_LIMIT = 4 * 1024 * 1024;
const TOTAL_LIMIT = 20 * 1024 * 1024;

function walkDir(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkDir(p, out);
    else out.push({ path: p, size: st.size });
  }
  return out;
}

function fmt(n) {
  return (n / 1024).toFixed(1) + ' KB';
}

// 静态资源预算
const assets = walkDir(join(ROOT, 'miniprogram/assets'));
const code = walkDir(join(ROOT, 'miniprogram')).filter(f => !f.path.includes('/assets/'));
const shared = walkDir(join(ROOT, 'shared'));

const sum = arr => arr.reduce((s, f) => s + f.size, 0);

console.log('='.repeat(60));
console.log('资源预算校验（微信小游戏）');
console.log('='.repeat(60));

console.log(`\n【静态资源】miniprogram/assets`);
const assetTotal = sum(assets);
for (const f of assets.sort((a, b) => b.size - a.size)) {
  const bar = '█'.repeat(Math.round(f.size / 10240));
  console.log(`  ${relative(ROOT, f.path).padEnd(44)} ${fmt(f.size).padStart(10)}  ${bar}`);
}
console.log(`  ${'合计'.padEnd(44)} ${fmt(assetTotal).padStart(10)}`);

console.log(`\n【代码】miniprogram (不含 assets)`);
const codeTotal = sum(code);
console.log(`  ${code.length} 个文件${''.padEnd(36)} ${fmt(codeTotal).padStart(10)}`);

console.log(`\n【共享逻辑】shared/ (编译进小程序)`);
const sharedTotal = sum(shared);
console.log(`  ${shared.length} 个文件${''.padEnd(36)} ${fmt(sharedTotal).padStart(10)}`);

// 主包 = 静态资源 + 代码 + shared
const mainTotal = assetTotal + codeTotal + sharedTotal;
console.log('\n' + '-'.repeat(60));
console.log(`主包总计: ${fmt(mainTotal)}  / 上限 ${fmt(MAIN_LIMIT)}`);
const mainPct = (mainTotal / MAIN_LIMIT * 100).toFixed(1);
console.log(`占用: ${mainPct}%  [${'█'.repeat(Math.round(mainPct / 2))}${'░'.repeat(50 - Math.round(mainPct / 2))}]`);

// 分包
const subPackages = ['review', 'parents'];
let subTotal = 0;
for (const name of subPackages) {
  const dir = join(ROOT, 'miniprogram/subpackages', name);
  if (existsSync(dir)) {
    const s = sum(walkDir(dir));
    subTotal += s;
    console.log(`分包 ${name}: ${fmt(s)}`);
  }
}

const grandTotal = mainTotal + subTotal;
console.log(`总计: ${fmt(grandTotal)} / 上限 ${fmt(TOTAL_LIMIT)}`);
console.log('-'.repeat(60));

let failed = false;
if (mainTotal > MAIN_LIMIT) {
  console.error(`\n❌ 主包超限 ${fmt(mainTotal - MAIN_LIMIT)}（超出 ${(mainTotal / MAIN_LIMIT * 100 - 100).toFixed(1)}%）`);
  console.error('   处置：压缩素材 / 将非首屏资源移入分包 / 检查是否有冗余文件被打入');
  failed = true;
} else {
  console.log(`\n✅ 主包在限内（余量 ${fmt(MAIN_LIMIT - mainTotal)}）`);
}

if (grandTotal > TOTAL_LIMIT) {
  console.error(`❌ 总包超限 ${fmt(grandTotal - TOTAL_LIMIT)}`);
  failed = true;
} else {
  console.log(`✅ 总包在限内（余量 ${fmt(TOTAL_LIMIT - grandTotal)}）`);
}

// 单文件超限告警（微信对大图片有加载限制）
for (const f of assets) {
  if (f.size > 200 * 1024) {
    console.warn(`⚠️  单文件偏大: ${relative(ROOT, f.path)} ${fmt(f.size)}（建议 ≤200KB 以加快首屏）`);
  }
}

if (failed) process.exit(1);
console.log('\n预算校验通过。');