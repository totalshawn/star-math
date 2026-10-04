/**
 * 游戏场景：核心玩法
 * ------------------------------------------------------------------
 * 串联题目生成、输入判定、角色状态、特效、计分、音频。
 * 严格遵循 R11 红线：所有关卡流转由用户点击触发，倒计时归零只结算本局。
 */

import { BaseScene, Tweener } from '../core/loop.js';
import { AnswerBuffer, QuestionTimer } from '../core/answer-buffer.js';
import { GameState, comboMultiplier } from '../../shared/scoring.js';
import { generateQuestion, numToStr, getSeed, createTraceRecorder } from '../../shared/difficulty.js';
import { toFixedInt } from '../../shared/fixed.js';
import { CharacterActor } from '../../shared/characters.js';
import { getGradeTheme, PRAISE, ENCOURAGE, GAME, DESIGN, CHARACTER_LIST, CHARACTERS, COLOR } from '../../shared/config.js';
import * as UI from '../ui/ui.js';
import { FXManager } from '../fx/fx.js';

// 局内子状态
const ST = {
  INTRO:'intro',       // 关卡横幅入场
  QUESTION: 'question', // 出题/等待输入
  FEEDBACK: 'feedback',  // 判定反馈
  CLEAR: 'clear',       // 本关完成
  TRANSITION: 'transition', // 反馈→下一步的中间态（防重复执行）
  OVER: 'over'          // 本局结束
};

export class GameScene extends BaseScene {
  constructor(app) {
    super(app);
    this.phase = ST.INTRO;
    this.fx = new FXManager();
    this.tw = new Tweener();
    this.actor = null;
    this.pressedKey = '';
    this.toastMsg = '';
    this.toastAlpha = 0;
    this.bannerPhase = 'in';
    this.correctFlash = 0;
    this.wrongFlash = 0;
    this.scoreDisplay = 0;

    /**
     * 预输入缓冲（解决「答完一题后立刻想输下一题」的丢键问题）
     * ---------------------------------------------------------------
     * 场景：答对后有 0.5s 反馈动画，期间孩子已经在算下一题并开始按键。
     * 旧实现：反馈期onKey 直接 return false → 这些按键被丢弃，
     *        孩子以为自己输了1、下一题又少按，于是「明明会却答错」。
     * 新实现：反馈期的按键存进 preBuffer，
     *        新题生成时自动把能匹配的部分填进去。
     * 若孩子按的键与新题答案不匹配（如上一题是 11、下一题需要 9），
     * 丢弃整组并清空，不做部分填充（避免出现错误前缀）。
     */
    this.preBuffer = '';
  }

  // ===== 生命周期 =====

  enter(params = {}) {
    super.enter();
    const { save, character, platform, audio, isChallenge, challengeTime } = this.app;

    // 建立本局状态
    const grade = save.settings.grade;
    this.gs = new GameState(grade, save.settings.dlOffset);
    this.isChallenge = !!isChallenge;
    this.challengeTime = challengeTime || 90;

    /**
     * 无论哪种模式都必须进入 playing。
     * GameState 初始 status='ready'，而 tick() 只在 'playing' 时扣时间——
     * 漏设会导致倒计时永不减少、游戏永不结束（实测踩过）。
     */
    this.gs.status = 'playing';

    if (this.isChallenge) {
      // 挑战赛：固定时长、独立计分、DL 上限锁死
      this.gs.timeLeft = this.challengeTime;
      this.gs.dl = Math.min(this.gs.dl, GAME.LEVEL_DL_MAX);
    }
    this.dlCap = GAME.LEVEL_DL_MAX;

    /**
     * ★ 氛围系统：小动物进进出出（参考视频的核心观感）
     * ---------------------------------------------------------------
     *  · watchers：背景观众，每 5—9 秒一只从屏幕一侧走到另一侧（半透明，不干扰）
     *  · cheerers：前景欢呼，答对/连击时从屏幕边缘探头挥手 1.6s
     */
    this.watchers = [];
    this.watcherTimer = 2;
    this.cheerers = [];
    /** 连击庆典：分级热闹（2-4 一只探头 / 5-8 半场 / ≥9 全场+常驻公仔） */
    this.comboParty = 0;          // >0 全场庆典剩余时间
    this.starBurst = 0;           // 满天星星剩余时间
    this.residents = [];          // 大 combo 后常驻的小公仔
    const sides = [0, 0, 1, 1];   // 0=左 1=右
    for (let i = 0; i < 4; i++) {
      this.cheerers.push({
        side: sides[i],
        y: 560 + (i % 2) * 130,          // 两侧中部
        size: 92,
        popT: 0,                          // >0 表示正在探头
        phase: Math.random() * Math.PI * 2
      });
    }

    // 过程记录（云端重算分数的依据，BACKEND_SPEC §3.5 L1 层）
    this.trace = createTraceRecorder(grade, getSeed());
    this.seenQuestions = new Set();

    this.correctThisLevel = 0;
    this.platform = platform;
    this.save = save;

    // 角色
    const charId = save.profile.character;
    if (!this.actor) {
      this.actor = new CharacterActor(charId, p => platform.loadImage(p));
    } else {
      this.actor.setCharacter(charId);
    }
    this.actor.load();
    this.actor.setState('idle');

    // 音频
    this.audio = audio;
    if (audio && save.settings.sound) {
      audio.init();
      audio.resume();
      audio.startBGM();
      audio.setIntensity(0);
    }
    // 震动开关：仅在家长开启时映射到系统触觉
    this.vibrateEnabled = save.settings.vibration;

    // 特效
    this.fx.shake.enabled = save.settings.vibration;
    this.fx.ambient.enabled = getGradeTheme(grade).deco;
    this.fx.ambient.init(DESIGN.WIDTH, DESIGN.HEIGHT, grade <= 2 ? 16 : 9);
    this.scoreDisplay = 0;

    // 开场横幅
    this.enterIntro();
  }

  exit() {
    this.tw.clear();
    if (this.audio) this.audio.stopBGM();
    this.fx.clearAll();
  }

  /** 关卡横幅入场 */
  enterIntro() {
    this.phase = ST.INTRO;
    this.bannerPhase = 'in';
    this.tw.add({ dur: 0.28, ease: t => 1 - Math.pow(1 - t, 3), onUpdate: () => {}, onDone: () => {
      this.bannerPhase = 'stay';
    }});
    this.tw.delay(0.28 + 0.9, () => {
      this.bannerPhase = 'out';
      this.tw.delay(0.24, () => {
        this.newQuestion();
        this.bannerPhase = 'none';
      });
    });
  }

  /** 出下一题 */
  newQuestion() {
    const q = generateQuestion(this.gs.grade, this.gs.dl);
    q.grade = this.gs.grade;
    this.question = q;
    this.buffer = new AnswerBuffer(q);
    this.qTimer = new QuestionTimer(this.gs.questionLimit);
    this._fullToastShown = false;
    this.qStart = true;
    // 同一局内重复出现的题只算第一次（区分「蒙对」与「真会」）
    const qkey = q.op + ':' + q.expr;
    this.isRepeatQuestion = this.seenQuestions.has(qkey);
    this.seenQuestions.add(qkey);
    this.phase = ST.QUESTION;

    // 应用预输入缓冲：孩子提前按的键能接上
    if (this.preBuffer) {
      const pre = this.preBuffer;
      this.preBuffer = '';
      // 只有当预输入是新答案的前缀时才采纳，否则整组丢弃
      const ansStr = q.answerText || String(q.answer);
      if (ansStr.indexOf(pre) === 0) {
        for (const ch of pre) this.buffer.push(ch);
        // ★ 审题保护：自动填入的数字孩子没按过，
        //   给 2s 看清题目；期间不会因「位数满数值错」被判错
        this.buffer.autoGrace = true;
      }
    }

    this.actor.onEvent('questionStart');
    this.audio && this.audio.resume();
  }

  // ===== 更新 =====

  update(dt) {
    super.update(dt);
    this.tw.update(dt);
    this.fx.update(dt);
    this.actor.update(dt);
    this.correctFlash = Math.max(0, this.correctFlash - dt * 2.5);
    this.wrongFlash = Math.max(0, this.wrongFlash - dt * 2);
    this.toastAlpha = Math.max(0, this.toastAlpha - dt * 1.2);

    // 分数滚动（跳动到目标值）
    if (this.scoreDisplay !== this.gs.score) {
      const diff = this.gs.score - this.scoreDisplay;
      const step = Math.max(1, Math.abs(diff) * dt * 8);
      this.scoreDisplay += Math.sign(diff) * Math.min(Math.abs(diff), step);
      if (Math.abs(this.gs.score - this.scoreDisplay) < 1) this.scoreDisplay = this.gs.score;
    }

    if (this.phase === ST.QUESTION) {
      this.updateQuestion(dt);
    } else if (this.phase === ST.FEEDBACK) {
      this.updateFeedback(dt);
    } else if (this.phase === ST.CLEAR) {
      this.updateClear(dt);
    }

    // 主倒计时（R11：归零只结算本局，绝不自动开始新局）
    if (this.phase !== ST.CLEAR && this.phase !== ST.OVER) {
      if (this.gs.tick(dt)) {
        this.gameOver();
      }
    }
  }

  updateAmbience(dt) {
    // —— 背景观众：随机一只从一侧走到另一侧
    this.watcherTimer -= dt;
    if (this.watcherTimer <= 0) {
      this.watcherTimer = 5 + Math.random() * 4;
      const fromLeft = Math.random() < 0.5;
      const others = CHARACTER_LIST.filter(x => x !== (this.actor && this.actor.cfg && this.actor.cfg.id));
      const id = others[Math.floor(Math.random() * others.length)] || CHARACTER_LIST[1];
      this.watchers.push({
        img: this.watcherImg(id),
        x: fromLeft ? -90 : DESIGN.WIDTH + 90,
        dir: fromLeft ? 1 : -1,
        y: 470 + Math.random() * 60,
        size: 58 + Math.random() * 16,
        spd: 60 + Math.random() * 40
      });
    }
    for (let i = this.watchers.length - 1; i >= 0; i--) {
      const w = this.watchers[i];
      w.x += w.dir * w.spd * dt;
      w.hop = Math.abs(Math.sin(w.x * 0.05)) * 5;   // 走路弹跳
      if (w.x < -120 || w.x > DESIGN.WIDTH + 120) this.watchers.splice(i, 1);
    }
    // —— 前景欢呼计时
    for (const ch of this.cheerers) {
      if (ch.popT > 0) ch.popT -= dt;
    }
    // —— 庆典计时
    if (this.comboParty > 0) this.comboParty -= dt;
    if (this.starBurst > 0) this.starBurst -= dt;
    // 常驻公仔：combo 归零（断连）时离场
    if (this.residents.length && this.gs.combo === 0) {
      this.residents = [];
    }
    for (const r of this.residents) {
      r.phase += dt * 2.2;
    }
  }

  /** 观众/欢呼用角色图（缓存，按角色 id） */
  watcherImg(id) {
    if (!this._watcherImgs) this._watcherImgs = {};
    if (!this._watcherImgs[id]) this._watcherImgs[id] = this.platform.loadImage(CHARACTERS[id].image);
    return this._watcherImgs[id];
  }

  updateQuestion(dt) {
    this.updateAmbience(dt);
    /**
     * ★ v3 判定模型：单题限时到期 = 判错（唯一自动判错来源）
     * 「不输入/没答对就算错」——正是产品要求的语义。
     * 限时内孩子随便输入、退格、思考，永不判错。
     */
    if (this.qTimer.update(dt)) {
      // 限时到仍未答对 → 判错。若孩子已有输入，标记为「超时」便于统计
      this.timeoutFlag = (this.buffer && this.buffer.buf.length > 0);
      this.submitResult(false);
      return;
    }
    // 位数满提示（一次性，不重复刷）
    if (this.buffer && this.buffer.full && !this._fullToastShown) {
      this._fullToastShown = true;
      this.showToast('位数满啦，按 ⌫ 修改');
    }
    if (this.buffer && !this.buffer.full) this._fullToastShown = false;
  }

  updateFeedback(dt) {
    // 反馈停留后进入下一步
    this.feedLeft -= dt;
    if (this.feedLeft > 0) return;

    /**
     * 必须立刻改phase，否则本方法会在之后的每一帧重复执行。
     * 实测踩过：不改则 levelClear() 每帧调一次 nextLevel()，
     * 关卡数在几秒内飙到 2572。
     */
    this.phase = ST.TRANSITION;

    // 记录错题
    if (!this.lastCorrect && this.question) {
      this.save.recordMistake(Object.assign({ grade: this.gs.grade }, this.question));
    }
    if (this.gs.status === 'gameover') {
      this.gameOver();
      return;
    }
    if (this.gs.levelFinished) {
      this.levelClear();
    } else {
      this.newQuestion();
    }
  }

  updateClear(dt) {
    this.clearLeft -= dt;
    if (this.clearLeft > 0) return;
    // 同updateFeedback：必须改 phase，否则每帧重复进关
    this.phase = ST.TRANSITION;
    this.gs.nextLevel();
    this.correctThisLevel = 0;
    this.enterIntro();
  }

  // ===== 交互 =====

  /**
   * 处理按键（由键盘点击或物理键盘触发）
   * @param {string} key '0'-'9' | '.' | 'del' | 'submit'
   */
  onKey(key) {
    /**
     * 非答题期：一律存入预输入缓冲，绝不丢弃。
     * ---------------------------------------------------------------
     * 覆盖所有非 QUESTION 阶段——特别是：
     *   · FEEDBACK（0.32/0.6s）答后反馈
     *   · TRANSITION（切题中转）
     *   · INTRO（**关卡横幅约 1.4s**，连续答题时最容易在这里丢键）
     *   · CLEAR（过关演出）
     * 之前只处理 FEEDBACK/CLEAR，用户实测「连续输入还是会来不及」
     * 的主要原因就是 INTRO 期的 1.4 秒横幅。
     */
    if (this.phase !== ST.QUESTION) {
      if (key === 'del') { this.preBuffer = this.preBuffer.slice(0, -1); }
      else if (key === '.' && !this.preBuffer.includes('.')) this.preBuffer += key;
      else if (key !== '.' && this.preBuffer.length < 6) this.preBuffer += key;
      return false;
    }
    if (key === 'del') {
      const ok = this.buffer.pop();
      if (ok && this.audio) this.audio.key();
      return ok;
    }
    const before = this.buffer.buf;
    this.buffer.push(key);
    if (this.buffer.buf !== before) {
      if (this.audio) this.audio.key();
      if (this.vibrateEnabled) this.platform.vibrate('short');
      this.pressedKey = key;
      this.tw.delay(0.12, () => { if (this.pressedKey === key) this.pressedKey = ''; });
      // 已判定（正确即时锁定，或早判锁错）
      if (this.buffer.isLocked) {
        this.tw.delay(0.05, () => this.submitResult(this.buffer.result));
      }
      return true;
    }
    return false;
  }

  /** 提交本题结果 */
  submitResult(correct) {
    this.lastCorrect = correct;
    const q = this.question;
    const elapsed = this.qTimer.elapsed;

    /**
     * 记录本题过程（云端重算的依据）。
     * 服务端会用同一份 scoring 口径重算，客户端自报分数不作数。
     * 挑战赛同样记录，但服务端会按 mode 分流，不写入主榜。
     */
    if (this.trace && q) {
      this.trace.record({
        dl: this.gs.dl,
        op: q.op,
        expr: q.expr,
        answerFixed: q.answerFixed !== undefined ? q.answerFixed : toFixedInt(q.answer),
        firstTryCorrect: correct,
        //孩子实际输入（L1b 独立判定的依据，缺了就无法防「改布尔值」）
        userInput: this.buffer ? this.buffer.buf : '',
        elapsedMs: elapsed * 1000,
        isFirstOccurrence: !this.isRepeatQuestion
      });
    }
    const res = this.gs.submit(correct, elapsed);
    this.gs.status = 'playing';

    if (correct) {
      this.correctThisLevel++;
      this.correctFlash = 1;
      /**
       * ★ 连击庆典分级（用户需求：连击越高越热闹，9 连击全场大庆祝）
       *   2—3 连击：1 只探头
       *   4—5 连击：2 只探头 + 星星迸射
       *   6—8 连击：全部探头 + 星星 + 屏幕轻闪
       *   ≥9 连击：全员常驻出场 + 满天星星 + 彩带，且留下 2 只常驻公仔
       */
      const cb = this.gs.combo;
      if (cb >= 2) {
        const wantPop = cb >= 6 ? this.cheerers.length
                      : cb >= 4 ? 2
                      : 1;
        const idle = this.cheerers.filter(ch => ch.popT <= 0);
        for (let i = 0; i < Math.min(wantPop, idle.length); i++) {
          idle[i].popT = cb >= 6 ? 2.2 : 1.6;
        }
        if (cb >= 4) this.fx.onCorrect(556, 672, cb);
        if (cb >= 6) {
          this.correctFlash = Math.max(this.correctFlash, 0.7);
          this.fx.sheen.fire(20, 480, 632, 350, { dur: 0.6 });
        }
        if (cb >= 9) {
          // 全场大庆典
          this.comboParty = 2.5;
          this.starBurst = 2.5;
          this.fx.onLevelClear(DESIGN.WIDTH);           // 彩带
          if (this.audio) this.audio.levelClear();
          if (this.vibrateEnabled) this.platform.vibrate('heavy');
          // 常驻公仔：9 连击达成后留下 2 只陪玩（combo 断了才走）
          if (this.residents.length === 0) {
            const ids = CHARACTER_LIST.filter(x => x !== this.actor.cfg.id);
            this.residents = ids.slice(0, 2).map((cid, i) => ({
              img: this.watcherImg(cid),
              // 主角台两侧（footY=436 的地面上），像小伙伴陪主角答题
              x: i === 0 ? 116 : 556,
              baseY: 436,
              size: 88,
              phase: Math.random() * Math.PI * 2
            }));
          }
        }
      }
      this.actor.onEvent('correct');
      this.fx.onCorrect(556, 672, this.gs.combo);
      if (this.audio) {
        this.audio.correct(this.gs.combo);
        this.audio.setIntensity(Math.min(1, Math.floor(this.gs.combo / 15)));
      }
      if (this.vibrateEnabled) this.platform.vibrate('short');

      // 分数跳动
      this.fx.scoreJump.fire(556, 700, `+${res.gained}`, { color: '#E09A00' });
      // 金币飞行
      if (res.gained > 0) {
        this.fx.coin.fire(556, 700, 443, 68, { value: Math.floor(res.gained / 100) });
      }
      // 提示语
      this.showToast(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
      // 升级特效
      if (res.comboUp) {
        this.tw.delay(0.15, () => {
          this.actor.onEvent('comboUp');
          this.fx.onComboUp(556, 672);
          if (this.audio) this.audio.comboUp();
          this.showToast('连击 ' + this.gs.combo + '！');
        });
      }
      if (res.dlUp) {
        this.tw.delay(0.2, () => {
          this.fx.sheen.fire(20, 480, 632, 350, { dur: 0.7 });
          this.showToast('难度提升！');
        });
      }
    } else {
      this.wrongFlash = 1;
      this.actor.onEvent('wrong');
      this.fx.onWrong(556, 672);
      if (this.audio) this.audio.wrong();
      // 橙色柔光而非红色闪烁（避免负面情绪联结）
      this.showToast(ENCOURAGE[Math.floor(Math.random() * ENCOURAGE.length)]);
    }

    /**
     * 反馈停留时长。配合 preBuffer 后可大幅缩短——
     * 孩子不需要「等动画走完」才能继续作答。
     */
    this.feedLeft = correct ? 0.32 : 0.6;
    this.phase = ST.FEEDBACK;
  }

  showToast(msg) {
    this.toastMsg = msg;
    this.toastAlpha = 1.6;
  }

  /** 本关完成 */
  levelClear() {
    this.phase = ST.CLEAR;
    this.clearLeft = 1.6;
    this.fx.onLevelClear(DESIGN.WIDTH);
    if (this.audio) this.audio.levelClear();
    if (this.vibrateEnabled) this.platform.vibrate('heavy');
    this.save.data.global.levelsClearedTotal += 1;
    // 解锁挑战赛进度（每关独立计数）
    this.save.data.challenge = this.save.data.challenge || { unlockProgress: {}, bestScore: 0, endedToday: 0, date: '' };
    const gp = this.save.data.challenge.unlockProgress;
    gp[this.gs.grade] = (gp[this.gs.grade] || 0) + 1;
    this.save.save(true);
  }

  /** 本局结束 */
  gameOver() {
    this.phase = ST.OVER;
    if (this.audio) {
      this.audio.gameOver();
      this.audio.stopBGM();
    }
    this.app.onGameOver(this.gs, this.lastSummary());
  }

  lastSummary() {
    return {
      score: this.gs.score,
      maxCombo: this.gs.maxCombo,
      correct: this.gs.correct,
      wrong: this.gs.wrong,
      dl: Math.round(this.gs.dl * 10) / 10,
      level: this.gs.level,
      stars: this.gs.stars,
      comment: this.gs.comment
    };
  }

  // ===== 绘制 =====

  draw(ctx, vp) {
    const W = DESIGN.WIDTH, H = DESIGN.HEIGHT;
    const theme = getGradeTheme(this.gs ? this.gs.grade : 1);

    ctx.save();
    // 坐标映射：cover 缩放 + 居中偏移
    ctx.translate(vp.offX, vp.offY);
    ctx.scale(vp.scale, vp.scale);

    // 背景
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, theme.bgTop);
    g.addColorStop(0.5, theme.bgMid);
    g.addColorStop(1, theme.bgBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 背景装饰（低年级）
    this.fx.drawBackground(ctx);

    // 震动
    this.fx.shake.apply(ctx);

    // HUD
    UI.drawHUD(ctx, {
      level: this.gs.level,
      levelsCleared: this.gs.level - 1,
      timeLeft: Math.max(0, this.gs.timeLeft),
      timeRatio: Math.max(0, Math.min(1, this.gs.timeLeft / GAME.LEVEL_TIME)),
      score: Math.floor(this.scoreDisplay),
      muted: !(this.save && this.save.settings.sound)
    }, this.t);

    // 数据条
    UI.drawStatBar(ctx, {
      correctThisLevel: this.correctThisLevel,
      perLevel: GAME.QUESTIONS_PER_LEVEL,
      wrong: this.gs.wrong,
      combo: this.gs.combo,
      multiplier: comboMultiplier(this.gs.combo)
    }, this.t);

    // 关卡横幅
    if (this.bannerPhase !== 'none') {
      UI.drawLevelBanner(ctx, this.gs.level, this.bannerPhase, this.t, W);
    }

    // 角色台
    UI.drawStage(ctx, this.gs.combo, this.t);

    // 角色（contain 适配，杜绝横向溢出）
    UI.drawCharacter(ctx, this.actor, 168, this.gs.combo);

    // 题目白卡
    if (this.question) {
      UI.drawQuestionCard(ctx, this.question, this.buffer ? this.buffer.buf : '', {
        qIndex: this.gs.answered + 1
      });
    }

    // 判定闪光
    if (this.correctFlash > 0) {
      ctx.save();
      ctx.globalAlpha = this.correctFlash * 0.25;
      ctx.fillStyle = '#D6F5E4';
      ctx.fillRect(20, 480, 632, 350);
      ctx.restore();
    }
    if (this.wrongFlash > 0) {
      // 橙色柔光（非红色闪烁）
      ctx.save();
      ctx.globalAlpha = this.wrongFlash * 0.18;
      ctx.fillStyle = '#FFE0C2';
      ctx.fillRect(20, 480, 632, 350);
      ctx.restore();
    }

    // 软倒计时条
    if (this.phase === ST.QUESTION && this.qTimer) {
      UI.drawSoftTimer(ctx, this.qTimer.ratio);
    }

    // 键盘
    UI.drawKeypad(ctx, {
      combo: this.gs.combo,
      pressedKey: this.pressedKey
    });

    /**
     * 大 combo 庆典：满天星星
     * comboParty 期间屏幕各处随机炸出小星星，营造「满天喝彩」
     */
    if (this.starBurst > 0) {
      const intensity = Math.min(1, this.starBurst / 2.5);
      for (let i = 0; i < 6; i++) {
        // x/y 随机后避开白卡中央算式区（x 120—552, y 500—820）
        let sx = 40 + Math.random() * (DESIGN.WIDTH - 80);
        let sy = 160 + Math.random() * 700;
        if (sx > 120 && sx < 552 && sy > 500 && sy < 820) {
          sx = sx < 336 ? 40 + Math.random() * 70 : 560 + Math.random() * 70;
        }
        const ss = 7 + Math.random() * 10;
        ctx.save();
        ctx.globalAlpha = (0.25 + Math.random() * 0.35) * intensity;
        ctx.translate(sx, sy);
        ctx.rotate(Math.random() * Math.PI);
        UI.drawStar(ctx, 0, 0, ss, ss * 0.45, 5);
        ctx.fillStyle = [COLOR.GOLD, COLOR.LEMON, COLOR.PEACH][i % 3];
        ctx.fill();
        ctx.restore();
      }
    }

    /**
     * 常驻公仔：9 连击达成后留在屏幕两下角蹦跳陪玩
     * （combo 断了会自动离场——见 update）
     */
    for (const r of this.residents) {
      if (!r.img || !r.img.width) continue;
      const bounce = Math.abs(Math.sin(r.phase)) * 7;
      ctx.save();
      ctx.translate(r.x, r.baseY - bounce);
      // 投影
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = COLOR.BRAND_700;
      ctx.beginPath();
      ctx.ellipse(0, r.size * 0.52, r.size * 0.28, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      UI.drawImageContain(ctx, r.img, -r.size / 2, -r.size / 2, r.size, r.size);
      // 头顶感叹气泡（激励感）
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = COLOR.GOLD;
      ctx.beginPath();
      ctx.arc(0, -r.size * 0.62 + Math.sin(r.phase * 1.7) * 3, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLOR.INK;
      UI.text(ctx, '!', 0, -r.size * 0.62 + Math.sin(r.phase * 1.7) * 3, 13, COLOR.INK, { align: 'center' });
      ctx.restore();
    }

    // 前景欢呼者：从屏幕边缘探头（easeOutBack 弹出）
    for (const ch of this.cheerers) {
      if (ch.popT <= 0) continue;
      const im = this.watcherImg(CHARACTER_LIST[(ch.side * 2 + (ch.y % 2)) % CHARACTER_LIST.length]);
      if (!im || !im.width) continue;
      // 弹出进度：0—0.35s 弹入，0.35—1.2s 停留挥动，1.2—1.6s 缩回
      let p;
      if (ch.popT > 1.25) p = 1 - (ch.popT - 1.25) / 0.35;
      else if (ch.popT > 0.35) p = 1;
      else p = ch.popT / 0.35;
      p = Math.max(0, Math.min(1, p));
      const ease = 1 - Math.pow(1 - p, 3);   // easeOutCubic
      const popW = 96;
      const visible = popW * ease;
      const edgeX = ch.side === 0 ? -popW + visible : DESIGN.WIDTH - visible;
      const wave = Math.sin(this.t * 9 + ch.phase) * 6 * ease;   // 挥手摆动
      ctx.save();
      ctx.translate(edgeX + popW / 2, ch.y + wave);
      ctx.rotate(ch.side === 0 ? -ease * 0.08 : ease * 0.08);
      UI.drawImageContain(ctx, im, -popW / 2, -popW / 2, popW, popW);
      ctx.restore();
    }

    // Toast
    UI.drawToast(ctx, this.toastMsg, Math.min(1, this.toastAlpha));

    // 中层特效（粒子/冲击波/分数）
    this.fx.drawMid(ctx, 'sans-serif');

    // 顶层特效（彩带/高光）
    this.fx.drawTop(ctx);

    ctx.restore();
  }

  /**
   * 命中检测：把触摸坐标转成按键
   * @returns {string|null} 按键标签
   */
  hitKey(dx, dy) {
    const g = UI.KEYPAD_GEOM;
    // 键盘整体范围快筛
    if (dy < g.y - 10 || dy > g.y + g.rows * (g.rowH + g.gapY)) return null;

    const LABEL = [
      ['7', '8', '9'],
      ['4', '5', '6'],
      ['1', '2', '3'],
      ['del', '0']
    ];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        // 最后一行的 0 跨两列，需特殊处理避免误判
        const label = row === 3
          ? (col === 0 ? 'del' : (col === 1 ? '0' : null))
          : LABEL[row][col];
        if (!label) continue;
        const span = (row === 3 && label === '0') ? 2 : 1;
        const r = UI.keyRect(row, col, span);
        if (dx >= r.x && dx <= r.x + r.w && dy >= r.y && dy <= r.y + r.h) {
          return label;
        }
      }
    }
    return null;
  }

  /** 命中静音按钮 */
  hitMute(dx, dy) {
    return dx >= 510 && dx <= 566 && dy >= 32 && dy <= 88;
  }
}

export { ST };