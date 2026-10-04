/**
 * 计分 / 连击 / 难度推进引擎
 * ------------------------------------------------------------------
 * 纯逻辑，可单元测试。「停不下来」的爽感循环就在这里实现。
 *
 * 三层递进：
 *   A. 连击驱动难度（每 GAME.COMBO_STEP 连击 +1 级 DL）
 *   B. 时间压力（答对加时，DL 越高加时越多）
 *   C. 分数驱动（高分保住高 DL，避免掉档挫败）
 *   保底：连续答错 GAME.WRONG_TOLERANCE 次才降 1 级 DL（不劝退）
 */

const { GAME, COMBO_MULTIPLIER } = require('./config.js');
const { getGradeCfg } = require('./difficulty.js');

/** 连击数 -> 倍率（向上取最近档位） */
function comboMultiplier(combo) {
  let m = 1.0;
  for (const t of COMBO_MULTIPLIER) {
    if (combo >= t.combo) m = t.mult;
  }
  return m;
}

/** 距离下一个倍率档还差几个连击；已满级返回 null */
function nextComboTier(combo) {
  for (const t of COMBO_MULTIPLIER) {
    if (combo < t.combo) return t.combo - combo;
  }
  return null;
}

/**
 * 游戏局状态机（纯数据 + 纯函数，便于测试与存档）
 */
class GameState {
  constructor(grade, dlOffset = 0) {
    this.grade = grade;
    this.dlOffset = dlOffset;

    this.score = 0;
    this.combo = 0;          // 当前连击
    this.maxCombo = 0;       // 本局最高连击
    this.correct = 0;        // 本局答对数
    this.wrong = 0;          // 本局答错数
    this.wrongStreak = 0;    // 连续答错（保底降级用）
    this.answered = 0;       // 本关已答题数

    this.level = 1;          // 当前关卡（EX N）
    this.dl = 1;             // 难度等级
    this.timeLeft = GAME.LEVEL_TIME;  // 剩余秒
    this.status = 'ready';   // ready | playing | levelclear | gameover

    this.resetDL();
  }

  /** 按年级基准重置初始难度 */
  resetDL() {
    const cfg = getGradeCfg(this.grade);
    this.dl = clamp(cfg.baseDL + this.dlOffset, 1, GAME.LEVEL_DL_MAX);
  }

  get cfg() {
    return getGradeCfg(this.grade);
  }

  /** 当前单题限时（秒），随DL 缩短，制造压迫感 */
  get questionLimit() {
    /**
     * v3：限时只是「防挂机兜底」，不再是压迫工具。
     * 保底 8s（原 3s），DL 缩短系数 0.35→0.2。
     * 孩子犹豫、算多位数、中途退格修改，都要能容下。
     */
    const cfg = this.cfg;
    const t = (this.dl - cfg.baseDL) / Math.max(1, GAME.LEVEL_DL_MAX - cfg.baseDL);
    return Math.max(8, cfg.perQ * (1 - Math.max(0, t) * 0.2));
  }

  /** 答对奖励时间 */
  get timeBonus() {
    return GAME.TIME_BONUS_BASE + this.dl * GAME.TIME_BONUS_PER_DL;
  }

  /**
   * 提交一次答题结果
   * @param {boolean} isCorrect
   * @param {number} elapsed 本题用时（秒）
   * @returns {{gained:number, comboUp:boolean, dlUp:boolean, dlDown:boolean, timeAdded:number}}
   */
  submit(isCorrect, elapsed) {
    const before = { dl: this.dl, combo: this.combo, mult: comboMultiplier(this.combo) };
    let gained = 0, timeAdded = 0;
    let dlUp = false, dlDown = false, comboUp = false;

    this.answered++;

    if (isCorrect) {
      this.correct++;
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;

      // 基础分 × 连击倍率；限时内答完额外奖励
      const speedBonus = elapsed <= this.questionLimit ? GAME.PERFECT_BONUS : 0;
      gained = Math.round((GAME.BASE_SCORE + speedBonus) * comboMultiplier(this.combo));
      this.score += gained;

      // 加时（封顶：避免全对时时间无限膨胀，紧张感必须持续存在）
      timeAdded = this.timeBonus;
      const cap = GAME.LEVEL_TIME + GAME.TIME_CAP_BONUS;
      this.timeLeft = Math.min(cap, this.timeLeft + timeAdded);

      // 难度推进：连击每跨一个台阶升1 级
      const tier = Math.floor(this.combo / GAME.COMBO_STEP);
      if (tier > Math.floor(before.combo / GAME.COMBO_STEP)) {
        if (this.dl < GAME.LEVEL_DL_MAX) {
          this.dl = Math.min(GAME.LEVEL_DL_MAX, this.dl + 1);
          dlUp = true;
        }
      }
      comboUp = this.combo % GAME.COMBO_STEP === 0;
      this.wrongStreak = 0;
    } else {
      this.wrong++;
      this.combo = 0;
      this.wrongStreak++;
      // 保底降级：连续答错多次才降，且只降 1 级
      if (this.wrongStreak >= GAME.WRONG_TOLERANCE && this.dl > 1) {
        this.dl -= GAME.WRONG_DL_DROP;
        dlDown = true;
      }
      // 极低难度（DL=1）不再降，保住「我也会」的感觉
      if (this.dl <= 1) this.dl = 1;
    }

    return {
      gained,
      comboUp,
      dlUp,
      dlDown,
      timeAdded,
      multBefore: before.mult,
      multAfter: comboMultiplier(this.combo)
    };
  }

  /** 是否本关题目已完成（对应参考视频「正解 N/10」） */
  get levelFinished() {
    return this.answered >= GAME.QUESTIONS_PER_LEVEL;
  }

  /** 进入下一关：重置本关计数与倒计时，保留总分与连击 */
  nextLevel() {
    this.level++;
    this.answered = 0;
    // 高难度给更多初始时间，但同样受封顶约束
    this.timeLeft = Math.min(
      GAME.LEVEL_TIME + GAME.TIME_CAP_BONUS,
      GAME.LEVEL_TIME + Math.min(10, (this.dl - 1) * 1.5)
    );
    this.status = 'playing';
  }

  /** 扣减倒计时；返回是否时间耗尽 */
  tick(dt) {
    if (this.status !== 'playing') return false;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.status = 'gameover';
      return true;
    }
    return false;
  }

  /**
   * 结算评级（1—5 星）
   * 公式以「正确率」为主、连击与分数为辅，
   * 并做保底处理：全对至少 3 星，避免超常发挥仍被打低分挫伤信心。
   */
  get stars() {
    const total = this.correct + this.wrong;
    const acc = total ? this.correct / total : 0;      // 正确率
    const comboScore = Math.min(1, this.maxCombo / 30); // 连击贡献
    const scoreScore = Math.min(1, this.score / 4000); // 分数贡献
    const raw = acc * 0.6 + comboScore * 0.2 + scoreScore * 0.2;

    let stars = 1;
    if (raw >= 0.90) stars = 5;
    else if (raw >= 0.78) stars = 4;
    else if (raw >= 0.62) stars = 3;
    else if (raw >= 0.42) stars = 2;

    // 保底：全对且连击≥10 至少 4 星；全对至少 3 星
    if (acc >= 0.999) {
      stars = Math.max(stars, this.maxCombo >= 10 ? 4 : 3);
    }
    return stars;
  }

  /** 结算评语（小学生友好、正向激励） */
  get comment() {
    const s = this.stars;
    const map = {
      5: ['计算小达人！', '太厉害啦，下次挑战更高年级！'],
      4: ['算得又快又准！', '再快一点点就是满分啦！'],
      3: ['不错哦，继续加油！', '多练几轮会更快！'],
      2: ['有进步空间哦', '把连击保持住就更棒啦！'],
      1: ['别灰心，多练习就会啦！', '慢慢来，你一定可以的！']
    };
    return map[s] || map[3];
  }

  /** 导出为存档摘要 */
  toSummary() {
    return {
      score: this.score,
      level: this.level,
      maxCombo: this.maxCombo,
      correct: this.correct,
      wrong: this.wrong,
      dl: Math.round(this.dl * 10) / 10,
      stars: this.stars
    };
  }
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
try { exports.comboMultiplier = comboMultiplier; } catch (e) {}
try { exports.nextComboTier = nextComboTier; } catch (e) {}
try { exports.GameState = GameState; } catch (e) {}
