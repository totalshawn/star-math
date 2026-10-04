/**
 * UI 绘制层
 * ------------------------------------------------------------------
 * 坐标严格对齐 docs/UI_SPEC.md §2（672×1280 设计基准）。
 * 所有绘制函数只负责画，不持有游戏状态，便于复用与测试。
 */

import { COLOR, FONT, FONT_STACK, RADIUS, DESIGN } from '../../shared/config.js';
import { drawStar } from '../fx/fx.js';
import { Ease } from '../../shared/characters.js';

/** 圆角矩形路径 */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/** 文字（默认垂直居中） */
function text(ctx, str, x, y, size, color, opts = {}) {
  ctx.save();
  ctx.font = `${opts.weight || 'bold'} ${size}px ${FONT_STACK}`;
  ctx.fillStyle = color;
  ctx.textAlign = opts.align || 'left';
  ctx.textBaseline = opts.baseline || 'middle';
  if (opts.stroke) {
    ctx.lineWidth = opts.strokeWidth || 5;
    ctx.strokeStyle = opts.stroke;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeText(str, x, y);
  }
  ctx.fillText(str, x, y);
  ctx.restore();
}

/** 测量文字宽度 */
export function measure(ctx, str, size, weight = 'bold') {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

// ======================================================================
// L1 顶部 HUD（UI_SPEC §2.2）
// ======================================================================

/**
 * 关卡进度点阵：3行×4列
 * @param {number} current 当前关卡（1 起）
 * @param {number} total已通过关卡数
 */
export function drawProgressDots(ctx, current, total, t) {
  const x0 = 20, y0 = 38, dot = 16, gapX = 6, gapY = 8, stroke = 3;
  for (let i = 0; i < 12; i++) {
    const col = i % 4, row = Math.floor(i / 4);
    const cx = x0 + col * (dot + gapX) + dot / 2;
    const cy = y0 + row * (dot + gapY) + dot / 2;
    const passed = i < total;

    ctx.beginPath();
    if (i === current - 1 && !passed) {
      // 当前关：呼吸缩放 1.0↔1.15 / 900ms
      const k = (Math.sin(t * (Math.PI * 2 / 0.9)) + 1) / 2;
      const sc = 1 + k * 0.15;
      const r = (dot / 2 + 2) * sc;
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = COLOR.PEACH;
      ctx.fill();
      ctx.lineWidth = stroke;
      ctx.strokeStyle = COLOR.ERROR;
      ctx.stroke();
    } else if (passed) {
      ctx.arc(cx, cy, dot / 2, 0, Math.PI * 2);
      ctx.fillStyle = COLOR.GOLD;
      ctx.fill();
      ctx.lineWidth = stroke;
      ctx.strokeStyle = COLOR.GOLD_DEEP;
      ctx.stroke();
    } else {
      ctx.arc(cx, cy, dot / 2, 0, Math.PI * 2);
      ctx.fillStyle = COLOR.N_300;
      ctx.fill();
    }
  }
}

/** 沙漏图标 */
function hourglass(ctx, x, y, s, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s / 2, y - s / 2);
  ctx.lineTo(x + s / 2, y - s / 2);
  ctx.lineTo(x + s / 2, y + s / 2);
  ctx.lineTo(x - s / 2, y + s / 2);
  ctx.closePath();
  ctx.moveTo(x - s / 2 + 3, y - s / 2 + 2);
  ctx.lineTo(x, y);
  ctx.lineTo(x + s / 2 - 3, y - s / 2 + 2);
  ctx.moveTo(x - s / 2 + 3, y + s / 2 - 2);
  ctx.lineTo(x, y);
  ctx.lineTo(x + s / 2 - 3, y + s / 2 - 2);
  ctx.stroke();
  ctx.restore();
}

/** 音符图标 */
function noteIcon(ctx, x, y, s, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.ellipse(x - s * 0.22, y + s * 0.28, s * 0.2, s * 0.15, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - s * 0.04, y + s * 0.28);
  ctx.lineTo(x - s * 0.04, y - s * 0.34);
  ctx.lineTo(x + s * 0.34, y - s * 0.44);
  ctx.lineTo(x + s * 0.34, y + s * 0.14);
  ctx.stroke();
  ctx.restore();
}

/**
 * 顶部 HUD 整体
 * @param {object} s 状态快照 {level, levelsCleared, timeLeft, timeRatio, score, muted}
 */
export function drawHUD(ctx, s, t) {
  drawProgressDots(ctx, s.level, s.levelsCleared, t);

  // 倒计时胶囊
  roundRect(ctx, 116, 32, 250, 70, 35);
  ctx.fillStyle = COLOR.CARD_BG; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = COLOR.BRAND_700;
  ctx.save(); ctx.translate(0, 3); roundRect(ctx, 116, 32, 250, 70, 35);
  ctx.fillStyle = COLOR.BRAND_700; ctx.fill(); ctx.restore();
  roundRect(ctx, 116, 32, 250, 70, 35);
  ctx.fillStyle = COLOR.CARD_BG; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = COLOR.BRAND_700; ctx.stroke();

  hourglass(ctx, 153, 67, 26, COLOR.INK_AUX);
  text(ctx, '时间', 178, 48, FONT.CAPTION, COLOR.INK_AUX, { weight: 'normal' });

  // 时间< 20% 转警告色 + 每秒脉冲
  const low = s.timeRatio < 0.2;
  let tColor = COLOR.INK;
  if (low) {
    tColor = COLOR.ERROR;
    const pulse = 1 + Math.sin(t * Math.PI * 2) * 0.08;
    ctx.save();
    ctx.translate(253, 74); ctx.scale(pulse, pulse); ctx.translate(-253, -74);
  }
  const mm = Math.floor(s.timeLeft / 60);
  const ss = Math.floor(s.timeLeft % 60);
  text(ctx, `${mm}:${String(ss).padStart(2, '0')}`, 178, 74, FONT.TIMER, tColor);
  if (low) ctx.restore();

  // 总分胶囊
  roundRect(ctx, 378, 32, 130, 70, 35);
  ctx.save(); ctx.translate(0, 3);
  roundRect(ctx, 378, 32, 130, 70, 35);
  ctx.fillStyle = COLOR.GOLD_DEEP; ctx.fill(); ctx.restore();
  roundRect(ctx, 378, 32, 130, 70, 35);
  ctx.fillStyle = COLOR.GOLD; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = COLOR.GOLD_DEEP; ctx.stroke();

  text(ctx, '总分', 443, 48, FONT.CAPTION, 'rgba(46,31,94,0.7)');
  text(ctx, String(s.score), 443, 74, FONT.SCORE, COLOR.INK, { align: 'center' });

  // 静音键
  const mx = 510, my = 32, ms = 56;
  ctx.beginPath(); ctx.arc(mx + ms / 2, my + ms / 2, ms / 2, 0, Math.PI * 2);
  ctx.fillStyle = COLOR.CARD_BG; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = COLOR.BRAND_700; ctx.stroke();
  noteIcon(ctx, mx + ms / 2, my + ms / 2, 28, COLOR.INK_SUB);
  if (s.muted) {
    // 斜杠表示静音
    ctx.save();
    ctx.strokeStyle = COLOR.ERROR; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(mx + 12, my + ms - 12);
    ctx.lineTo(mx + ms - 12, my + 12);
    ctx.stroke();
    ctx.restore();
  }
}

// ======================================================================
// L2 数据条（UI_SPEC §2.3）
// ======================================================================

/** 连击段位色 */
export function comboColor(combo) {
  if (combo >= 30) return COLOR.MINT;
  if (combo >= 20) return COLOR.GOLD;
  if (combo >= 10) return COLOR.PEACH;
  return COLOR.SKY;
}

/**
 * 数据条：正解N/10 · 失误N · 连击黄牌
 */
export function drawStatBar(ctx, s, t) {
  /**
   * 三胶囊统一规格：等高 62、同基线 y=112、等宽 206、间距 7。
   * 之前三个宽窄高矮都不同（170/140/222、62/62/74），视觉杂乱。
   */
  const H = 62, Y = 112, W = 206, GAP = 7;
  const X = [20, 20 + W + GAP, 20 + (W + GAP) * 2];

  const pill = (x, label) => {
    roundRect(ctx, x, Y + 3, W, H, 31);
    ctx.save(); ctx.translate(0, 3);
    roundRect(ctx, x, Y + 3, W, H, 31);
    ctx.fillStyle = COLOR.BRAND_700; ctx.fill(); ctx.restore();
    roundRect(ctx, x, Y + 3, W, H, 31);
    ctx.fillStyle = COLOR.CARD_BG; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = COLOR.BRAND_700; ctx.stroke();
  };

  // —— ① 正解：10 点进度
  pill(X[0]);
  const total = s.perLevel;
  const dotGap = (W - 48) / total;
  for (let i = 0; i < total; i++) {
    ctx.beginPath();
    ctx.arc(X[0] + 24 + i * dotGap, Y + 40, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = i < s.correctThisLevel ? COLOR.SUCCESS : COLOR.N_300;
    ctx.fill();
  }
  text(ctx, '正解 ' + s.correctThisLevel + '/' + total, X[0] + 24, Y + 22, FONT.HUD_LABEL, COLOR.INK);

  // —— ② 失误：警示三角 + 数值
  pill(X[1]);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(X[1] + 30, Y + 18); ctx.lineTo(X[1] + 45, Y + 48); ctx.lineTo(X[1] + 15, Y + 48);
  ctx.closePath();
  ctx.fillStyle = COLOR.WARN; ctx.fill();
  ctx.restore();
  text(ctx, '失误 ' + s.wrong, X[1] + 58, Y + 22, FONT.HUD_LABEL, COLOR.INK);

  // —— ③ 连击：黄牌 + 倍率 + 段位点
  const hasCombo = s.combo > 0;
  pill(X[2]);
  if (hasCombo) {
    // 连击越高底色越暖
    const glow = s.combo >= 20 ? 0.55 : s.combo >= 10 ? 0.32 : 0.14;
    ctx.save();
    ctx.globalAlpha = glow;
    roundRect(ctx, X[2] + 3, Y + 6, W - 6, H - 9, 26);
    ctx.fillStyle = comboColor(s.combo); ctx.fill();
    ctx.restore();

    text(ctx, s.combo + ' 连击', X[2] + 22, Y + 22, FONT.HUD_LABEL, COLOR.INK);
    // 倍率徽章
    roundRect(ctx, X[2] + 132, Y + 9, 58, 26, 13);
    ctx.fillStyle = COLOR.BRAND_600; ctx.fill();
    text(ctx, '×' + s.multiplier, X[2] + 161, Y + 22, FONT.CAPTION, COLOR.ON_DARK, { align: 'center' });

    // 段位进度点（并入胶囊内，不再外溢）
    const seg = Math.min(5, (s.combo % 5) + 1);
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(X[2] + 26 + i * 20, Y + 46, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = i < seg ? comboColor(s.combo) : COLOR.N_100;
      ctx.fill();
    }
  } else {
    // 空闲态：灰字提示
    text(ctx, '连击 0', X[2] + 22, Y + 22, FONT.HUD_LABEL, COLOR.INK_DISABLED);
    text(ctx, '连续答对提升倍率', X[2] + 22, Y + 45, FONT.CAPTION, COLOR.INK_DISABLED, { weight: 'normal' });
  }
}

// ======================================================================
// L3 关卡横幅（UI_SPEC §2.4）
// ======================================================================

/**
 * 斜切彩带横幅
 * @param {number} phase 'in'|'stay'|'out'
 */
export function drawLevelBanner(ctx, level, phase, p, w = DESIGN.WIDTH) {
  let dx = 0, alpha = 1;
  if (phase === 'in') {
    const e = Ease.outBack(Math.min(1, p));
    dx = -720 * (1 - e); alpha = Math.min(1, p * 2);
  } else if (phase === 'out') {
    const e = Ease.inQuad === undefined ? p * p * p : Math.pow(p, 3);
    dx = 720 * e; alpha = 1 - p;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(dx, 0);

  // 平行四边形，上下出血
  const yTop = 196, yBot = 266, skew = 26;
  ctx.beginPath();
  ctx.moveTo(-skew - 20, yTop);
  ctx.lineTo(w + 20, yTop - skew);
  ctx.lineTo(w + 20, yBot - skew);
  ctx.lineTo(-skew - 20, yBot);
  ctx.closePath();

  const g = ctx.createLinearGradient(0, yTop, w, yBot);
  g.addColorStop(0, COLOR.BRAND_700);
  g.addColorStop(1, COLOR.BRAND_600);
  ctx.fillStyle = g;
  ctx.fill();

  // 45°斜条纹（clip 在彩带内）
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 12;
  for (let i = -20; i < 60; i++) {
    const x = i * 26;
    ctx.beginPath();
    ctx.moveTo(x, 140);
    ctx.lineTo(x + 160, 300);
    ctx.stroke();
  }
  ctx.restore();

  // 上下金边
  ctx.strokeStyle = COLOR.GOLD;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-skew - 20, yTop); ctx.lineTo(w + 20, yTop - skew);
  ctx.moveTo(-skew - 20, yBot); ctx.lineTo(w + 20, yBot - skew);
  ctx.stroke();

  // EX N
  text(ctx, `EX ${level}`, w / 2, 221, FONT.EX, COLOR.ON_DARK, {
    align: 'center', stroke: COLOR.BRAND_700, strokeWidth: 8
  });
  text(ctx, `第 ${level} 关`, 648, 182, FONT.CAPTION, 'rgba(255,255,255,0.8)', { align: 'right' });

  ctx.restore();
}

// ======================================================================
// L4 角色台（UI_SPEC §2.5）
// ======================================================================

/**
 * 角色台面 + 背光晕 + 装饰
 * @param {number} combo 用于背光晕随连击变色
 */
export function drawStage(ctx, combo, t) {
  // 背光晕（连击≥10 转桃色）
  const gx = 336, gy = 372, gr = 130;
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
  const c = combo >= 10 ? '255,143,177' : '255,201,60';
  const alpha = combo >= 10 ? 0.35 : 0.30;
  g.addColorStop(0, `rgba(${c},${alpha})`);
  g.addColorStop(1, `rgba(${c},0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.fill();

  // 台面高光
  roundRect(ctx, 120, 428, 432, 8, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();

  // 台脚
  [96, 552].forEach(x => {
    roundRect(ctx, x, 466, 24, 22, 6);
    ctx.fillStyle = COLOR.STAGE_EDGE; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = COLOR.BRAND_700; ctx.stroke();
  });

  // 台面
  roundRect(ctx, 48, 436, 576, 34, 17);
  ctx.save(); ctx.translate(0, 5);
  roundRect(ctx, 48, 436, 576, 34, 17);
  ctx.fillStyle = COLOR.BRAND_700; ctx.fill(); ctx.restore();
  roundRect(ctx, 48, 436, 576, 34, 17);
  ctx.fillStyle = COLOR.STAGE_BG; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = COLOR.BRAND_700; ctx.stroke();

  // 台面暗部
  roundRect(ctx, 48, 460, 576, 8, 4);
  ctx.fillStyle = COLOR.STAGE_EDGE; ctx.fill();

  // 左右旋转星装饰
  const rotL = t * 0.105;
  const rotR = -t * 0.105;
  ctx.save();
  ctx.translate(188, 444); ctx.rotate(rotL);
  ctx.fillStyle = COLOR.GOLD;
  ctx.strokeStyle = COLOR.GOLD_DEEP; ctx.lineWidth = 2.5;
  drawStar(ctx, 0, 0, 17, 8, 5); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(516, 444); ctx.rotate(rotR);
  ctx.fillStyle = COLOR.GOLD;
  ctx.strokeStyle = COLOR.GOLD_DEEP; ctx.lineWidth = 2.5;
  drawStar(ctx, 0, 0, 17, 8, 5); ctx.stroke();
  ctx.restore();
}

/**
 * 绘制角色（脚底中心锚点 + 动画变换）
 * @param {object} actor CharacterActor 实例
 * @param {number} baseH 基准高度
 */
export function drawCharacter(ctx, actor, baseH = 168, combo = 0) {
  const img = actor.getImage();
  const tr = actor.transform();

  if (!img || !img.width) {
    // 素材未就绪：画占位（避免空白让人困惑）
    ctx.save();
    ctx.globalAlpha = 0.4;
    roundRect(ctx, 336 - 60, 436 - baseH, 120, baseH, 20);
    ctx.fillStyle = COLOR.BRAND_100; ctx.fill();
    text(ctx, '…', 336, 436 - baseH / 2, 40, COLOR.INK_AUX, { align: 'center' });
    ctx.restore();
    return;
  }

  /**
   * 等比缩放 + 宽度上限（防止偏方素材横向溢出）。
   * 素材宽高比实测 0.622~1.139，若只看高度，bear/chick 会撑出舞台。
   */
  const h = baseH;
  let w = img.width * (baseH / img.height);
  const MAX_W = baseH * 1.05;          // 最宽不超过高度的 1.05 倍
  if (w > MAX_W) { w = MAX_W; }
  const cx = 336 + (actor.cfg.anchorX || 0) * 60;
  const footY = 436;

  ctx.save();
  // 角色在按键层之下，阴影加重表现层级（UI_SPEC §0.3）
  ctx.globalAlpha = 0.9;
  ctx.translate(cx, footY + tr.dy);
  ctx.rotate(tr.rot);
  ctx.scale(tr.scale, tr.scale);
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();

  // 脚下柔和投影
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = COLOR.BRAND_700;
  ctx.beginPath();
  ctx.ellipse(cx, footY + 6, w * 0.34 * tr.scale, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ======================================================================
// L5 题目白卡（UI_SPEC §2.6）
// ======================================================================

/** 题型标签配色 */
export function tagStyle(op) {
  const map = {
    add: { bg: COLOR.SUCCESS, edge: '#0F5C34', fg: COLOR.ON_DARK },
    sub: { bg: COLOR.BRAND_600, edge: COLOR.BRAND_700, fg: COLOR.ON_DARK },
    mul: { bg: '#E07A1F', edge: '#A85410', fg: COLOR.INK },      // 白字对比度不足，用深色
    mul_small: { bg: '#E07A1F', edge: '#A85410', fg: COLOR.INK },
    div: { bg: '#0B7A90', edge: '#0A6072', fg: COLOR.ON_DARK },
    decimal_addsub: { bg: COLOR.BRAND_600, edge: COLOR.BRAND_700, fg: COLOR.ON_DARK },
    decimal_mul: { bg: '#E07A1F', edge: '#A85410', fg: COLOR.INK },
    mixed: { bg: '#C2185B', edge: '#8A1243', fg: COLOR.ON_DARK },
    fraction: { bg: '#5B3FBF', edge: COLOR.BRAND_700, fg: COLOR.ON_DARK }
  };
  return map[op] || { bg: COLOR.BRAND_600, edge: COLOR.BRAND_700, fg: COLOR.ON_DARK };
}

/**
 * 题目白卡：题型标签 + 第N问 + 竖排算式 + 答题位红圈
 */
export function drawQuestionCard(ctx, q, input, opts = {}) {
  const x = 20, y = 480, w = 632, h = 350;

  // 白卡（硬阴影）
  roundRect(ctx, x, y, w, h, RADIUS.CARD);
  ctx.save(); ctx.translate(0, 8);
  roundRect(ctx, x, y, w, h, RADIUS.CARD);
  ctx.fillStyle = COLOR.BRAND_700; ctx.fill(); ctx.restore();
  roundRect(ctx, x, y, w, h, RADIUS.CARD);
  ctx.fillStyle = COLOR.CARD_BG; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = COLOR.INK; ctx.stroke();

  // 分数/混合运算时的浅底区
  if (q && (q.isFraction || q.op === 'mixed')) {
    roundRect(ctx, 44, 566, 584, 242, 18);
    ctx.fillStyle = COLOR.N_50; ctx.fill();
  }

  // 题型标签胶囊
  if (q) {
    const st = tagStyle(q.op);
    const tw = measure(ctx, q.label, FONT.TAG) + 40;
    roundRect(ctx, 44, 502, tw, 46, 23);
    ctx.save(); ctx.translate(0, 3);
    roundRect(ctx, 44, 502, tw, 46, 23);
    ctx.fillStyle = COLOR.BRAND_700; ctx.fill(); ctx.restore();
    roundRect(ctx, 44, 502, tw, 46, 23);
    ctx.fillStyle = st.bg; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = st.edge; ctx.stroke();
    text(ctx, q.label, 64, 525, FONT.TAG, st.fg);
  }

  // 第 N 问
  if (opts.qIndex > 0) {
    text(ctx, `第 ${opts.qIndex} 问`, 628, 516, FONT.CAPTION, COLOR.INK_AUX, { align: 'right' });
  }

  // 算式（竖排右对齐至 x=430）
  if (q) drawEquation(ctx, q);

  // 答题位红圈
  drawAnswerSlot(ctx, input, q);

  // 底部提示
  if (q && q.isDecimal) {
    text(ctx, '答案保留两位小数', 44, 799, FONT.CAPTION, COLOR.INK_AUX);
  } else if (q && q.isFraction) {
    text(ctx, '输入分子即可，例如 3', 44, 799, FONT.CAPTION, COLOR.INK_AUX);
  }
}

/**
 * 竖排算式（复刻参考视频的竖排样式）
 */
function drawEquation(ctx, q) {
  const rightX = 430;
  const centerY = 690;

  // 解析表达式
  let lines;
  const parts = q.expr.split(' ');
  if (q.op === 'fraction' || q.expr.includes('/')) {
    // 分数题：渲染为 a/b ± c/d 上下结构
    const m = q.expr.match(/^(\d+)\/(\d+)\s*([+-])\s*(\d+)\/(\d+)$/);
    if (m) {
      const [, n1, d1, sign, n2, d2] = m;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `bold 44px ${FONT_STACK}`;
      ctx.fillStyle = COLOR.INK;
      ctx.fillText(n1, rightX - 20, centerY - 22);
      ctx.fillText(n2, rightX - 20, centerY + 42);
      // 分数线
      ctx.strokeStyle = COLOR.INK; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(rightX - 56, centerY + 6); ctx.lineTo(rightX + 16, centerY + 6);
      ctx.stroke();
      // 运算符
      ctx.font = `bold 40px ${FONT_STACK}`;
      ctx.fillStyle = COLOR.BRAND_600;
      ctx.fillText(sign, rightX + 52, centerY + 12);
      // 分母
      ctx.font = `bold 40px ${FONT_STACK}`;
      ctx.fillStyle = COLOR.INK;
      ctx.fillText(d1, rightX - 20, centerY + 62);
      ctx.fillText(d2, rightX + 52, centerY + 62);
      ctx.restore();
      return;
    }
  }

  // 普通：a ∘ b（拆两行）
  lines = [parts[0], `${parts[1]} ${parts[2] || ''}`.trim()];

  ctx.save();
  ctx.textAlign = 'right';
  // 自适应缩放：算式过长时等比缩小，最小 0.72
  const rawW = Math.max(measure(ctx, lines[0], FONT.EQUATION), measure(ctx, lines[1], FONT.EQUATION));
  const scale = Math.min(1, 420 / rawW);
  const size = FONT.EQUATION * Math.max(0.72, scale);

  ctx.font = `bold ${size}px ${FONT_STACK}`;
  ctx.fillStyle = COLOR.INK;
  // 第一行（被操作数）
  ctx.fillText(lines[0], rightX, centerY - 42);
  // 第二行（运算符 + 操作数，运算符用品牌紫）
  const opStr = parts[1] || '';
  const numStr = parts[2] || '';
  ctx.font = `bold ${size * 0.75}px ${FONT_STACK}`;
  const opW = measure(ctx, opStr, size * 0.75);
  const numW = measure(ctx, numStr, size);
  // 运算符单独着色
  ctx.textAlign = 'right';
  ctx.fillStyle = COLOR.INK;
  ctx.font = `bold ${size}px ${FONT_STACK}`;
  ctx.fillText(numStr, rightX, centerY + 34);
  ctx.fillStyle = COLOR.BRAND_600;
  ctx.font = `bold ${size * 0.75}px ${FONT_STACK}`;
  ctx.fillText(opStr, rightX - numW - 6, centerY + 34);

  // 分数线（减法/除法下方加线，复刻参考视频）
  if (q.op === 'sub' || q.op === 'div') {
    ctx.strokeStyle = COLOR.INK; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(rightX - opW - numW - 14, centerY + 56);
    ctx.lineTo(rightX + 8, centerY + 56);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 答题位红圈
 * @param {string} input 用户当前输入
 */
export function drawAnswerSlot(ctx, input, q) {
  const cx = 556, cy = 672, r = 62;

  // 红圈
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 8;
  ctx.strokeStyle = COLOR.ERROR;
  ctx.stroke();

  // 空态虚线引导
  if (!input) {
    ctx.beginPath();
    ctx.arc(cx, cy, r - 14, 0, Math.PI * 2);
    ctx.setLineDash([4, 10]);
    ctx.lineWidth = 4;
    ctx.strokeStyle = COLOR.N_300;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  // 输入数字（>4 位自动缩放）
  if (input) {
    const str = String(input);
    let size = FONT.ANSWER;
    const maxW = r * 2 - 24;
    const w = measure(ctx, str, size);
    if (w > maxW) size = FONT.ANSWER * Math.max(0.55, maxW / w);
    text(ctx, str, cx, cy, size, COLOR.ERROR, { align: 'center' });
  }
}

// ======================================================================
// L6 数字键盘（UI_SPEC §2.7）
// ======================================================================

/** 键盘几何（必须与 touch 命中一致，故独立导出） */
export const KEYPAD_GEOM = {
  x: 16, y: 848, w: 640,
  colW: 204, rowH: 84, gapX: 14, gapY: 12,
  rows: 4, cols: 3
};

/**
 * 求某个逻辑键的屏幕矩形
 * @param {number} row 0—3
 * @param {number} col 0—2（span=2 时 col 为起始列）
 * @param {number} span 占列数
 */
export function keyRect(row, col, span = 1) {
  const g = KEYPAD_GEOM;
  const x = g.x + col * (g.colW + g.gapX);
  const w = g.colW * span + g.gapX * (span - 1);
  const y = g.y + row * (g.rowH + g.gapY);
  return { x, y, w, h: g.rowH };
}

/**
 * 键盘绘制
 * @param {object} s {highlightKey, keyPulse, combo, pressedKey}
 */
export function drawKeypad(ctx, s = {}) {
  const LABEL = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['del', '0']
  ];

  for (let row = 0; row < 4; row++) {
    // 处理 span
    const items = [];
    if (row === 3) {
      items.push({ label: 'del', col: 0, span: 1 });
      items.push({ label: '0', col: 1, span: 2 });
    } else {
      for (let c = 0; c < 3; c++) items.push({ label: LABEL[row][c], col: c, span: 1 });
    }

    for (const it of items) {
      const r = keyRect(row, it.col, it.span);
      const isDel = it.label === 'del';
      const pressed = s.pressedKey === it.label;
      const isZero = it.label === '0';

      // 连击升高时数字键变彩色高亮（复刻参考视频）
      let face = COLOR.KEY_BG;
      let edge = COLOR.BRAND_700;
      if (!isDel && s.combo >= 5) {
        const c = comboColor(s.combo);
        face = pressed ? c : mix(c, COLOR.KEY_BG, 0.72);
      }
      if (isDel) face = COLOR.KEY_ALT;

      // 按下位移
      const oy = pressed ? 3 : 0;

      // 硬阴影
      roundRect(ctx, r.x, r.y + 5 - oy, r.w, r.h, 18);
      ctx.fillStyle = COLOR.BRAND_700; ctx.fill();

      // 键面
      roundRect(ctx, r.x, r.y - oy, r.w, r.h, 18);
      ctx.fillStyle = face; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = edge; ctx.stroke();

      // 高光条
      roundRect(ctx, r.x + 20, r.y + 14 - oy, r.w - 40, 8, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
      // 暗部
      roundRect(ctx, r.x + 20, r.y + r.h - 18 - oy, r.w - 40, 10, 5);
      ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fill();

      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2 - oy;

      if (isDel) {
        drawBackspace(ctx, cx, cy, COLOR.INK);
      } else {
        text(ctx, it.label, cx, cy, FONT.KEY, COLOR.INK, { align: 'center' });
      }
    }
  }
}

/** 退格图标 */
function drawBackspace(ctx, cx, cy, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  const w = 44, h = 34;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 + 10, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy + h / 2);
  ctx.lineTo(cx - w / 2 + 10, cy + h / 2);
  ctx.closePath();
  ctx.stroke();
  // 内部叉
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy - 9); ctx.lineTo(cx + 14, cy + 9);
  ctx.moveTo(cx + 14, cy - 9); ctx.lineTo(cx - 4, cy + 9);
  ctx.stroke();
  ctx.restore();
}

/**
 * 单题软倒计时条（UI_SPEC §2.7）
 */
export function drawSoftTimer(ctx, ratio) {
  const x = 16, y = 826, w = 640, h = 10;
  roundRect(ctx, x, y, w, h, 5);
  ctx.fillStyle = COLOR.N_100; ctx.fill();
  const c = ratio > 0.5 ? COLOR.SKY : ratio > 0.2 ? COLOR.WARN : COLOR.ERROR_LIGHT;
  if (ratio > 0) {
    roundRect(ctx, x, y, w * Math.min(1, ratio), h, 5);
    ctx.fillStyle = c; ctx.fill();
  }
}

/**
 * 提示语 Toast
 */
export function drawToast(ctx, msg, alpha) {
  if (!msg || alpha <= 0) return;
  const w = measure(ctx, msg, FONT.BODY) + 48;
  const x = 336 - w / 2, y = 788;
  ctx.save();
  ctx.globalAlpha = alpha;
  roundRect(ctx, x, y, w, 44, 22);
  ctx.fillStyle = 'rgba(30,18,60,0.75)'; ctx.fill();
  text(ctx, msg, 336, y + 22, FONT.BODY, COLOR.ON_DARK, { align: 'center' });
  ctx.restore();
}

/** 颜色混合（把彩色键面与白色混合，高亮但仍可读） */
function mix(c1, c2, t) {
  const p = h => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const a = p(c1), b = p(c2);
  const r = Math.round(a[0] * (1 - t) + b[0] * t);
  const g = Math.round(a[1] * (1 - t) + b[1] * t);
  const bl = Math.round(a[2] * (1 - t) + b[2] * t);
  return `rgb(${r},${g},${bl})`;
}

export { roundRect, text, drawStar };

/**
 * 把图片等比缩放进指定矩形（contain 模式）
 * ------------------------------------------------------------------
 * 【为什么需要】
 * 角色图宽高比差异很大（实测 0.622 ~ 1.139，近 2 倍）：
 *   bunny_sleep 295×469（瘦长）  bear 572×552（偏方）
 * 旧实现只按高度等比缩放，**偏方的图会横向撑出卡片**。
 *
 * 做法：先按宽高比算contain 尺寸，再居中放入容器。
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement|object} img
 * @param {number} bx 容器 x
 * @param {number} by 容器 y
 * @param {number} bw 容器宽
 * @param {number} bh 容器高
 */
export function drawImageContain(ctx, img, bx, by, bw, bh) {
  if (!img || !img.width || !img.height) return;
  const scale = Math.min(bw / img.width, bh / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, bx + (bw - w) / 2, by + (bh - h) / 2, w, h);
}
