/**
 * 结算场景
 * ------------------------------------------------------------------
 * 严格遵守 R11 红线（GROWTH_SPEC §2.5）：
 *  - 禁止无操作自动开始新局 / 自动进入挑战赛
 *  - 倒计时归零后只结算本局，绝不自动流转
 *  - 所有流转必须由用户点击 CTA 触发
 *  - 呼吸动效仅缩放，禁止其他动效，禁止自动播放音视频
 */

const { BaseScene, Tweener } = require('../core/loop.js');
const { COLOR, FONT, DESIGN, getGradeTheme } = require('../../shared/config.js');
const { CharacterActor } = require('../../shared/characters.js');
const * as UI = require('../ui/ui.js');
const { roundRect, text, measure } = require('../ui/ui.js');
const { drawStar } = require('../fx/fx.js');
const { CHALLENGE } = require('../../shared/rules.js');

class ResultScene extends BaseScene {
  constructor(app) {
    super(app);
    this.tw = new Tweener();
    this.pressedBtn = '';
    this.actor = null;
  }

  enter(params = {}) {
    super.enter();
    this.summary = params.summary || { score: 0, maxCombo: 0, correct: 0, wrong: 0, dl: 1, level: 1, stars: 3, comment: ['不错哦', '继续加油！'] };
    this.isChallenge = !!params.isChallenge;
    this.wasCleared = !!params.wasCleared;

    // 结算页落盘（挑战赛分数与主档物理隔离）
    const save = this.app.save;
    if (this.isChallenge) {
      this.app.recordChallengeRun(this.summary);
    } else {
      save.submitRun(this.summary);
      /**
       * 纪念章判定（仅主模式，挑战赛不授予）。
       * ⚠️ 必须在 submitRun 之后调用——它依赖本局已落盘的 correct/wrong。
       * R1-b：授予不发任何资源，纯荣誉。
       */
      this.newMedals = save.evaluateMedals(this.summary) || [];
    }

    // 角色：庆祝姿态
    const id = save.profile.character;
    if (!this.actor) this.actor = new CharacterActor(id, p => this.app.platform.loadImage(p));
    else { this.actor.setCharacter(id); this.actor.load(); }
    this.actor.load();
    this.actor.setState(this.summary.stars >= 4 ? 'combo' : 'correct');

    // 挑战赛解锁判定（防刷三件套 + 存储层物理隔离）
    this.challengeUnlocked = this.app.checkChallengeUnlock();
    this.challengeLeft = this.app.challengeQuotaLeft();

    this.enterT = 0;
  }

  exit() { this.tw.clear(); }

  update(dt) {
    super.update(dt);
    this.tw.update(dt);
    this.actor.update(dt);
    this.enterT += dt;
  }

  onTap(dx, dy) {
    // 主 CTA：再来 90 秒
    if (dy >= 900 && dy <= 1020) {
      if (this.challengeUnlocked && this.challengeLeft > 0) {
        this.app.audio && this.app.audio.tap();
        this.app.startGame({ isChallenge: true, challengeTime: CHALLENGE.TIME });
      } else {
        this.app.audio && this.app.audio.wrong();
        this.showHint(this.challengeUnlocked ? '今天的挑战次数用完啦' : `再通关 ${this.app.challengeNeedMore()} 关就解锁！`);
      }
      return true;
    }
    // 次 CTA：返回主页
    if (dy >= 1040 && dy <= 1140) {
      this.app.audio && this.app.audio.tap();
      this.app.goHome();
      return true;
    }
    return false;
  }

  showHint(msg) {
    this.hintMsg = msg;
    this.hintAlpha = 1.8;
  }

  draw(ctx, vp) {
    const W = DESIGN.WIDTH, H = DESIGN.HEIGHT;
    const s = this.app.save;
    const theme = getGradeTheme(s.settings.grade);
    const sum = this.summary;

    ctx.save();
    ctx.translate(vp.offX, vp.offY);
    ctx.scale(vp.scale, vp.scale);

    // 背景
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, theme.bgTop);
    g.addColorStop(0.5, theme.bgMid);
    g.addColorStop(1, theme.bgBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 白卡入场
    const cardIn = Math.min(1, this.enterT * 2.2);
    ctx.save();
    ctx.globalAlpha = cardIn;
    ctx.translate(0, (1 - cardIn) * 60);

    // —— 结算白卡
    const cx = 20, cy = 96, cw = 632, ch = 790;
    roundRect(ctx, cx, cy + 8, cw, ch, 30);
    ctx.fillStyle = COLOR.BRAND_700; ctx.fill();
    roundRect(ctx, cx, cy, cw, ch, 30);
    ctx.fillStyle = COLOR.CARD_BG; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = COLOR.INK; ctx.stroke();

    // 角色（站在卡片顶部）
    const tr = this.actor.transform();
    const img = this.actor.getImage();
    if (img && img.width) {
      const bh = 138, bw = img.width * (bh / img.height);
      ctx.save();
      ctx.translate(336, 206 + tr.dy);
      ctx.rotate(tr.rot);
      ctx.scale(tr.scale, tr.scale);
      ctx.drawImage(img, -bw / 2, -bh, bw, bh);
      ctx.restore();
    }

    // 「计算完成」标签
    roundRect(ctx, 258, 236, 156, 46, 23);
    ctx.fillStyle = COLOR.BRAND_600; ctx.fill();
    text(ctx, this.isChallenge ? '挑战完成' : '计算完成', 336, 259, FONT.TAG, COLOR.ON_DARK, { align: 'center' });

    // —— 总分（最大视觉焦点）
    const scorePop = this.enterT > 0.3 ? Math.min(1, (this.enterT - 0.3) * 3) : 0;
    const sc = 0.6 + scorePop * 0.4;
    ctx.save();
    ctx.translate(336, 356);
    ctx.scale(sc, sc);
    text(ctx, '总分', 0, -62, FONT.BODY, COLOR.INK_AUX, { align: 'center' });
    text(ctx, String(sum.score), 0, 10, 96, this.isChallenge ? COLOR.GOLD_DEEP : COLOR.INK, {
      align: 'center', stroke: COLOR.GOLD, strokeWidth: 8
    });
    ctx.restore();
    text(ctx, '分', 336 + 100, 366, FONT.SCORE, COLOR.INK_SUB);

    // —— 星级
    const starY = 428;
    for (let i = 0; i < 5; i++) {
      const filled = i < sum.stars;
      const sx = 336 - (4 * 46) / 2 + i * 46;
      ctx.save();
      ctx.translate(sx, starY);
      if (filled) {
        // 逐颗弹出动画
        const pop = Math.min(1, Math.max(0, (this.enterT - 0.5 - i * 0.12) * 4));
        const k = pop < 1 ? pop : 1;
        ctx.scale(0.4 + k * 0.6, 0.4 + k * 0.6);
        ctx.globalAlpha = k;
      }
      drawStar(ctx, 0, 0, 20, 9, 5);
      ctx.fillStyle = filled ? COLOR.GOLD : COLOR.N_300; ctx.fill();
      ctx.strokeStyle = filled ? COLOR.GOLD_DEEP : COLOR.N_300; ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // —— 评语（加长版，增之翼定稿文案）
    text(ctx, sum.comment ? sum.comment[0] : '不错哦，继续加油！', 336, 482, FONT.BODY, COLOR.INK_SUB, { align: 'center' });
    if (sum.comment && sum.comment[1]) {
      text(ctx, sum.comment[1], 336, 514, FONT.CAPTION, COLOR.INK_AUX, { align: 'center', weight: 'normal' });
    }

    // —— 数据四宫格（复刻参考视频结算页）
    const cells = [
      { l: '答对', v: `${sum.correct} 题`, c: COLOR.SUCCESS },
      { l: '失误', v: `${sum.wrong} 次`, c: COLOR.WARN },
      { l: '最高连击', v: `${sum.maxCombo} 连`, c: COLOR.BRAND_600 },
      { l: '难度等级', v: `DL ${sum.dl}`, c: COLOR.MINT }
    ];
    cells.forEach((cell, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = 56 + col * 292, y = 560 + row * 116;
      roundRect(ctx, x, y, 268, 96, 20);
      ctx.fillStyle = COLOR.N_50; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = COLOR.BRAND_100; ctx.stroke();
      text(ctx, cell.l, x + 134, y + 30, FONT.CAPTION, COLOR.INK_AUX, { align: 'center' });
      text(ctx, cell.v, x + 134, y + 64, FONT.QINDEX, cell.c, { align: 'center' });
    });

    // 挑战赛标识（隔离显示，不与主档混淆）
    if (this.isChallenge) {
      roundRect(ctx, 56, 792, 560, 40, 20);
      ctx.fillStyle = COLOR.GOLD; ctx.fill();
      text(ctx, '挑战赛成绩（不计入闯关记录）', 336, 812, FONT.CAPTION, COLOR.INK, { align: 'center' });
    } else if (this.newMedals && this.newMedals.length) {
      // 新获纪念章提示（纯荣誉展示，不发放资源 —— R1-b）
      const n = Math.min(3, this.newMedals.length);
      const pop = Math.min(1, Math.max(0, (this.enterT - 0.8) * 3));
      ctx.save();
      ctx.globalAlpha = pop;
      const names = this.newMedals.map(id => {
        const m = { first_perfect_chapter: '首次满星', precision_90: '精准章', flawless_clear: '完美章', combo_30: '闪电章', speed_demon_60: '疾速章' };
        return m[id] || id;
      });
      const label = `获得纪念章：${names.slice(0, 3).join('、')}${names.length > 3 ? ' 等' + names.length + '枚' : ''}`;
      const tw = Math.min(560, measure(ctx, label, FONT.CAPTION) + 44);
      roundRect(ctx, 336 - tw / 2, 786, tw, 44, 22);
      ctx.fillStyle = COLOR.BRAND_600; ctx.fill();
      text(ctx, label, 336, 808, FONT.CAPTION, COLOR.ON_DARK, { align: 'center' });
      // 星形点缀
      for (let i = 0; i < n; i++) {
        const sx = 336 - (n - 1) * 18 + i * 36;
        drawStar(ctx, sx, 858, 13, 6, 5);
        ctx.fillStyle = COLOR.GOLD; ctx.fill();
        ctx.strokeStyle = COLOR.GOLD_DEEP; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();   // 卡片入场动画结束

    // —— 主 CTA：再来 90 秒（R11：必须用户点击才启动）
    const canChallenge = this.challengeUnlocked && this.challengeLeft > 0;
    const by = 900;
    const bp = this.pressedBtn === 'challenge' ? 5 : 0;

    if (canChallenge) {
      // 呼吸动效（仅缩放，禁止其他动效）
      const breath = 1 + Math.sin(this.enterT * 2) * 0.015;
      ctx.save();
      ctx.translate(336, by + 60);
      ctx.scale(breath, breath);
      ctx.translate(-336, -(by + 60));
      roundRect(ctx, 136, by + 6 - bp, 400, 120, 60);
      ctx.fillStyle = COLOR.BRAND_700; ctx.fill();
      roundRect(ctx, 136, by - bp, 400, 120, 60);
      ctx.fillStyle = COLOR.GOLD; ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = COLOR.GOLD_DEEP; ctx.stroke();
      text(ctx, '再来 90 秒！', 336, by + 52 - bp, 40, COLOR.INK, { align: 'center' });
      text(ctx, `今日还剩 ${this.challengeLeft} 次`, 336, by + 88 - bp, FONT.CAPTION, COLOR.INK_SUB, { align: 'center' });
      ctx.restore();
    } else {
      // 未解锁：灰化+ 引导文案（不是不可用的死按钮，而是告诉用户怎么解锁）
      roundRect(ctx, 136, by + 6, 400, 120, 60);
      ctx.fillStyle = COLOR.BRAND_300; ctx.fill();
      roundRect(ctx, 136, by, 400, 120, 60);
      ctx.fillStyle = COLOR.N_100; ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = COLOR.N_300; ctx.stroke();
      text(ctx, this.challengeUnlocked ? '今日次数已用完' : '挑战赛未解锁', 336, by + 42, 32, COLOR.N_500, { align: 'center' });
      const hint = this.challengeUnlocked
        ? '明天再来挑战吧'
        : `再有效通关 ${this.app.challengeNeedMore()} 关即可解锁`;
      text(ctx, hint, 336, by + 82, FONT.CAPTION, COLOR.N_500, { align: 'center' });
    }

    // —— 次 CTA：返回主页
    const hy = 1040;
    const hp = this.pressedBtn === 'home' ? 4 : 0;
    roundRect(ctx, 136, hy + 5 - hp, 400, 100, 50);
    ctx.fillStyle = COLOR.BRAND_700; ctx.fill();
    roundRect(ctx, 136, hy - hp, 400, 100, 50);
    ctx.fillStyle = COLOR.CARD_BG; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = COLOR.BRAND_700; ctx.stroke();
    text(ctx, '返回主页', 336, hy + 50 - hp, 32, COLOR.INK, { align: 'center' });

    // 提示 Toast
    if (this.hintAlpha > 0) {
      this.hintAlpha = Math.max(0, this.hintAlpha - 0.02);
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.hintAlpha);
      const tw2 = 320;
      roundRect(ctx, 336 - tw2 / 2, 1180, tw2, 48, 24);
      ctx.fillStyle = 'rgba(30,18,60,0.82)'; ctx.fill();
      text(ctx, this.hintMsg || '', 336, 1204, FONT.CAPTION, COLOR.ON_DARK, { align: 'center' });
      ctx.restore();
    }

    ctx.restore();
  }
}
try { exports.ResultScene = ResultScene; } catch (e) {}
