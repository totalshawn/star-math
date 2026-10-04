/**
 * 特效系统：粒子、震动、彩带、高光、冲击波、分数跳动
 * ------------------------------------------------------------------
 * 全部为对象池实现，避免每帧 new对象 —— 保障低端机 60fps。
 * 参数对齐 docs/UI_SPEC.md §6。
 */

import { COLOR } from '../../shared/config.js';
import { Ease } from '../../shared/characters.js';

export const SHAKE_LEVELS = {
  0: 0,
  1: 4,
  2: 7,
  3: 11,
  4: 16,
  5: 22
};

/**
 * 粒子池
 */
export class ParticlePool {
  constructor(max = 220) {
    this.max = max;
    this.pool = [];
    this.alive = [];
    for (let i = 0; i < max; i++) {
      this.pool.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 4, color: '#fff', gravity: 0, shape: 'star', rot: 0, vrot: 0 });
    }
  }

  _get() {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) return p;
    }
    return null; // 池满则丢弃，保证性能
  }

  /** 迸发：UI_SPEC §6.4 */
  burst(x, y, opts = {}) {
    const n = opts.count || 12;
    const colors = opts.colors || [COLOR.GOLD, COLOR.PEACH, COLOR.LEMON, COLOR.MINT];
    for (let i = 0; i < n; i++) {
      const p = this._get();
      if (!p) break;
      const ang = (Math.PI * 2 * i) / n + (opts.spread || 0) * Math.random();
      const spd = (opts.speed || 6) * (0.6 + Math.random() * 0.7);
      p.active = true;
      p.x = x; p.y = y;
      p.vx = Math.cos(ang) * spd;
      p.vy = Math.sin(ang) * spd - (opts.up || 2);
      p.maxLife = (opts.life || 0.7) * (0.7 + Math.random() * 0.6);
      p.life = p.maxLife;
      p.size = (opts.size || 7) * (0.6 + Math.random() * 0.8);
      p.color = colors[(Math.random() * colors.length) | 0];
      p.gravity = opts.gravity === undefined ? 0.28 : opts.gravity;
      p.shape = opts.shape || 'star';
      p.rot = Math.random() * Math.PI * 2;
      p.vrot = (Math.random() - 0.5) * 0.4;
      this.alive.push(p);
    }
  }

  update(dt) {
    for (let i = this.alive.length - 1; i >= 0; i--) {
      const p = this.alive[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.alive.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vy += p.gravity * dt * 60;
      p.rot += p.vrot * dt * 60;
    }
  }

  draw(ctx) {
    for (const p of this.alive) {
      const t = p.life / p.maxLife;
      const alpha = t > 0.7 ? 1 : t / 0.7;
      const scale = p.shape === 'star'
        ? Ease.outBack(Math.min(1, (1 - t) * 3))   // 星形先弹出再缩小
        : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      const s = p.size * scale;
      if (p.shape === 'star') {
        drawStar(ctx, 0, 0, s, s * 0.46, 5);
      } else if (p.shape === 'square') {
        ctx.fillRect(-s / 2, -s / 2, s, s);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  clear() {
    for (const p of this.alive) p.active = false;
    this.alive.length = 0;
  }
}

/** 绘制五角星 */
export function drawStar(ctx, cx, cy, outer, inner, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const ang = (Math.PI * 2 * i) / (points * 2) - Math.PI / 2;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * 关卡切屏彩带（UI_SPEC §6.6）：预生成参数，逐帧画
 */
export class Confetti {
  constructor(count = 40) {
    this.items = [];
    for (let i = 0; i < count; i++) {
      this.items.push({ x: 0, y: 0, vy: 0, vx: 0, rot: 0, vrot: 0, w: 0, h: 0, color: '#fff', life: 0, maxLife: 1 });
    }
    this.active = [];
    this.running = false;
  }

  /** 触发一次彩带雨 */
  fire(w, h, colors = [COLOR.PEACH, COLOR.GOLD, COLOR.MINT, COLOR.LEMON, COLOR.SKY]) {
    this.active.length = 0;
    for (let i = 0; i < this.items.length; i++) {
      const c = this.items[i];
      c.x = Math.random() * w;
      c.y = -Math.random() * h * 0.6;
      c.vy = 3 + Math.random() * 5;
      c.vx = (Math.random() - 0.5) * 3;
      c.rot = Math.random() * Math.PI;
      c.vrot = (Math.random() - 0.5) * 0.3;
      c.w = 8 + Math.random() * 12;
      c.h = 5 + Math.random() * 8;
      c.color = colors[(Math.random() * colors.length) | 0];
      c.maxLife = 1.4 + Math.random() * 0.6;
      c.life = c.maxLife;
      this.active.push(c);
    }
    this.running = true;
  }

  update(dt) {
    if (!this.running) return;
    let allDead = true;
    for (const c of this.active) {
      c.life -= dt;
      if (c.life > 0) allDead = false;
      c.x += c.vx * dt * 60;
      c.y += c.vy * dt * 60;
      c.rot += c.vrot * dt * 60;
    }
    if (allDead) { this.running = false; this.active.length = 0; }
  }

  draw(ctx) {
    for (const c of this.active) {
      if (c.life <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, c.life / c.maxLife * 1.6);
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
  }

  clear() { this.running = false; this.active.length = 0; }
}

/**
 * 屏幕震动（UI_SPEC §6.2）：用 Canvas translate 实现，不用 wx.vibrateShort
 */
export class ScreenShake {
  constructor() {
    this.level = 0;      // 0—5
    this.time = 0;
    this.duration = 0;
    this.enabled = true;
  }

  /** @param {number} level 0—5 强度档 */
  trigger(level, duration = 0.32) {
    if (!this.enabled) return;
    this.level = Math.max(this.level, Math.min(5, level));
    this.duration = duration;
    this.time = 0;
  }

  update(dt) {
    if (this.level <= 0) return;
    this.time += dt;
    if (this.time >= this.duration) {
      this.level = 0;
      this.time = 0;
    }
  }

  /** 返回当前偏移，绘制前调用 apply */
  offset() {
    if (this.level <= 0) return { x: 0, y: 0 };
    const amp = SHAKE_LEVELS[this.level];
    const t = this.time / this.duration;
    const decay = 1 - t;                       // 线性衰减
    const phase = this.time * 60;
    return {
      x: Math.sin(phase * 1.7) * amp * decay,
      y: Math.cos(phase * 2.3) * amp * decay
    };
  }

  apply(ctx) {
    const o = this.offset();
    ctx.translate(o.x, o.y);
  }
}

/**
 * 连击冲击波（UI_SPEC §6.1）：环形扩散
 */
export class Shockwave {
  constructor() { this.items = []; }

  fire(x, y, opts = {}) {
    this.items.push({
      x, y,
      r: opts.r0 || 10,
      maxR: opts.maxR || 180,
      life: opts.life || 0.5,
      maxLife: opts.life || 0.5,
      width: opts.width || 6,
      color: opts.color || COLOR.GOLD
    });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const s = this.items[i];
      s.life -= dt;
      if (s.life <= 0) { this.items.splice(i, 1); continue; }
      const t = 1 - s.life / s.maxLife;
      s.r = s.r + (s.maxR - s.r) * (dt * 8);
    }
  }

  draw(ctx) {
    for (const s of this.items) {
      const t = s.life / s.maxLife;
      ctx.save();
      ctx.globalAlpha = t * 0.85;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width * t;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  clear() { this.items.length = 0; }
}

/**
 * 高光扫过（UI_SPEC §6.3）：一道斜向光带掠过指定区域
 */
export class SheenSweep {
  constructor() { this.items = []; }

  fire(x, y, w, h, opts = {}) {
    this.items.push({ x, y, w, h, t: 0, dur: opts.dur || 0.7, color: opts.color || COLOR.LEMON });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const s = this.items[i];
      s.t += dt;
      if (s.t >= s.dur) this.items.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const s of this.items) {
      const t = s.t / s.dur;
      if (t >= 1) continue;
      const span = s.w + s.h;
      const px = s.x - s.h + span * Ease.inQuad(t) * 1.4;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createLinearGradient(px, s.y, px + s.h * 0.8, s.y + s.h);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, s.color);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = Math.sin(t * Math.PI) * 0.55;
      ctx.fillStyle = grad;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.restore();
    }
  }

  clear() { this.items.length = 0; }
}

/**
 * 分数跳动（UI_SPEC §6.5）：数字缩放弹跳 + 上升淡出
 */
export class ScoreJump {
  constructor() { this.items = []; }

  fire(x, y, text, opts = {}) {
    this.items.push({
      x, y, text,
      t: 0, dur: opts.dur || 0.9,
      color: opts.color || COLOR.GOLD_DEEP,
      size: opts.size || 42,
      vy: -2.4
    });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const s = this.items[i];
      s.t += dt;
      if (s.t >= s.dur) { this.items.splice(i, 1); continue; }
      s.y += s.vy * dt * 60;
    }
  }

  draw(ctx, fontFamily) {
    for (const s of this.items) {
      const t = s.t / s.dur;
      const scale = t < 0.25 ? Ease.outBack(t / 0.25) * 1.2 : 1.2 - (t - 0.25) * 0.25;
      ctx.save();
      ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
      ctx.translate(s.x, s.y);
      ctx.scale(scale, scale);
      ctx.font = `bold ${s.size}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineJoin = 'round';
      ctx.strokeText(s.text, 0, 0);
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, 0, 0);
      ctx.restore();
    }
  }

  clear() { this.items.length = 0; }
}

/**
 * 金币飞行收集（UI_SPEC §6.7）：贝塞尔曲线飞向 HUD 分数位
 */
export class CoinFly {
  constructor() { this.items = []; }

  fire(x0, y0, x1, y1, opts = {}) {
    this.items.push({
      x0, y0, x1, y1,
      cx: (x0 + x1) / 2 + (Math.random() - 0.5) * 160,
      cy: Math.min(y0, y1) - 80 - Math.random() * 80,
      t: 0, dur: opts.dur || 0.65,
      size: opts.size || 14,
      value: opts.value || 1
    });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const s = this.items[i];
      s.t += dt;
      if (s.t >= s.dur) this.items.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const s of this.items) {
      const t = s.t / s.dur;
      const mt = 1 - t;
      const x = mt * mt * s.x0 + 2 * mt * t * s.cx + t * t * s.x1;
      const y = mt * mt * s.y0 + 2 * mt * t * s.cy + t * t * s.y1;
      const scale = Math.sin(t * Math.PI) * 0.4 + 0.6;
      ctx.save();
      ctx.globalAlpha = 1 - t * 0.25;
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      // 星星造型金币（与素材风格统一）
      ctx.fillStyle = COLOR.GOLD;
      ctx.strokeStyle = COLOR.GOLD_DEEP;
      ctx.lineWidth = 2;
      drawStar(ctx, 0, 0, s.size, s.size * 0.46, 5);
      ctx.stroke();
      ctx.restore();
    }
  }

  clear() { this.items.length = 0; }
}

/**
 * 背景浮动装饰（低年级专用，UI_SPEC §7）
 */
export class AmbientDeco {
  constructor() {
    this.items = [];
    this.enabled = true;
  }

  init(w, h, count = 14) {
    this.items.length = 0;
    const shapes = ['star', 'circle', 'square'];
    const colors = [COLOR.BRAND_300, COLOR.PEACH, COLOR.MINT, COLOR.LEMON, COLOR.SKY];
    for (let i = 0; i < count; i++) {
      this.items.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: 5 + Math.random() * 9,
        vy: -(0.12 + Math.random() * 0.3),
        vx: (Math.random() - 0.5) * 0.2,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.02,
        alpha: 0.18 + Math.random() * 0.22,
        shape: shapes[(Math.random() * shapes.length) | 0],
        color: colors[(Math.random() * colors.length) | 0]
      });
    }
  }

  update(dt, h) {
    for (const d of this.items) {
      d.y += d.vy * dt * 60;
      d.x += d.vx * dt * 60;
      d.rot += d.vrot * dt * 60;
      if (d.y < -20) { d.y = h + 20; d.x = Math.random() * 700; }
    }
  }

  draw(ctx) {
    if (!this.enabled) return;
    ctx.save();
    for (const d of this.items) {
      ctx.globalAlpha = d.alpha;
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.fillStyle = d.color;
      if (d.shape === 'star') {
        drawStar(ctx, 0, 0, d.size, d.size * 0.45, 5);
      } else if (d.shape === 'circle') {
        ctx.beginPath(); ctx.arc(0, 0, d.size / 2, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
      }
    }
    ctx.restore();
  }
}

/**
 * 特效总管理器：统一更新与绘制顺序（UI_SPEC §0.3 z-index）
 */
export class FXManager {
  constructor() {
    this.particles = new ParticlePool(220);
    this.confetti = new Confetti(40);
    this.shockwave = new Shockwave();
    this.sheen = new SheenSweep();
    this.scoreJump = new ScoreJump();
    this.coin = new CoinFly();
    this.shake = new ScreenShake();
    this.ambient = new AmbientDeco();
  }

  update(dt) {
    this.particles.update(dt);
    this.confetti.update(dt);
    this.shockwave.update(dt);
    this.sheen.update(dt);
    this.scoreJump.update(dt);
    this.coin.update(dt);
    this.shake.update(dt);
    this.ambient.update(dt, 1280);
  }

  drawBackground(ctx) {
    this.ambient.draw(ctx);
  }

  /** 角色层之上、UI 之下 */
  drawMid(ctx, fontFamily) {
    this.shockwave.draw(ctx);
    this.particles.draw(ctx);
    this.coin.draw(ctx);
    this.scoreJump.draw(ctx, fontFamily);
  }

  /** 最上层（彩带覆盖全屏） */
  drawTop(ctx) {
    this.sheen.draw(ctx);
    this.confetti.draw(ctx);
  }

  clearAll() {
    this.particles.clear();
    this.confetti.clear();
    this.shockwave.clear();
    this.sheen.clear();
    this.scoreJump.clear();
    this.coin.clear();
    this.shake.level = 0;
  }

  /** 答对全套反馈 */
  onCorrect(cx, cy, combo) {
    this.particles.burst(cx, cy, {
      count: 14 + Math.min(20, combo),
      colors: combo >= 10 ? [COLOR.GOLD, COLOR.MINT, COLOR.LEMON, COLOR.PEACH] : [COLOR.GOLD, COLOR.LEMON, COLOR.PEACH],
      speed: 7, size: 9, life: 0.75, shape: 'star'
    });
    this.shockwave.fire(cx, cy, { maxR: 130 + combo * 4, life: 0.45, width: 6, color: combo >= 10 ? COLOR.MINT : COLOR.GOLD });
    // 震动强度随连击递增
    const lv = combo >= 20 ? 5 : combo >= 10 ? 4 : combo >= 5 ? 3 : 2;
    this.shake.trigger(lv, 0.3);
  }

  /** 答错反馈：轻量，不打击信心 */
  onWrong(cx, cy) {
    this.particles.burst(cx, cy, { count: 8, colors: [COLOR.ERROR_LIGHT, '#FFD6DE'], speed: 4, size: 7, life: 0.5, gravity: 0.35 });
    this.shake.trigger(1, 0.2);
  }

  /** 连击升级：强反馈 */
  onComboUp(cx, cy) {
    this.particles.burst(cx, cy, { count: 26, colors: [COLOR.GOLD, COLOR.MINT, COLOR.LEMON, COLOR.PEACH, COLOR.SKY], speed: 9, size: 12, life: 0.9, shape: 'star' });
    this.shockwave.fire(cx, cy, { maxR: 260, life: 0.6, width: 9, color: COLOR.MINT });
    this.shake.trigger(5, 0.4);
  }

  /** 关卡切换 */
  onLevelClear(w) {
    this.confetti.fire(w, 1280);
    this.sheen.fire(0, 0, w, 1280, { dur: 0.8 });
    this.shake.trigger(3, 0.3);
  }
}