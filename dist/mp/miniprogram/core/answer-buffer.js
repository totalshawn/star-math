const { checkAnswer, numToStr } = require('../../shared/difficulty.js');

/**
 * 答案输入缓冲（v3 判定模型）
 * ------------------------------------------------------------------
 * 【v3 模型：输入过程永不自动判错】
 *   1. 输入过程中 **永不判错** —— 哪怕位数已满、数值已超，
 *      都只是「不再接受新数字」，孩子随时可以退格修改。
 *   2. 判错只有一个来源：**单题限时到期仍未答对**（不输入/没答对都算错）。
 *   3. 判对的唯一条件：当前输入恰好等于答案。
 *
 * 【为什么改成这样】（用户三轮实测反馈）
 *   旧模型「位数满数值错 → 1.5s 后判错」存在致命体验问题：
 *   孩子如果算出的答案位数与正确答案不同（例如算成三位数），
 *   会在**输入中途**被判错——他连自己想输的答案都没输完。
 *   对小学生，「犹豫一下」是常态，任何输入期的时间压力都是惩罚。
 *
 * 【位数满的处理】
 *   full = true：不再接受数字键（按了无效），退格仍可用。
 *   UI 会轻提示「位数已满」。孩子退格一位即可继续输入。
 *   判错交给单题限时。
 */

const GRACE_MS = 0;   // v3 已无宽限概念（保留导出以兼容旧引用）
const MAX_INPUT = 9;

class AnswerBuffer {
  constructor(question) {
    this.q = question;
    this.buf = '';
    this.phase = 'typing';      // typing | locked（v3 移除 grace）
    this.full = false;          // 位数已满（不再接受数字）
    this.result = null;
  }

  get answerStr() {
    return this.q.answerText || numToStr(this.q.answer);
  }

  get answerDigits() {
    return this.answerStr.replace(/[.\-/]/g, '').length;
  }

  get isLocked() { return this.phase === 'locked'; }

  /**
   * 追加一个字符
   * v3：位数已满时**拒绝数字**（不判错），退格键不受限。
   */
  push(ch) {
    if (this.phase === 'locked') return { changed: false };
    if (ch !== '.' && this.full) return { changed: false, rejected: true };

    if (ch === '.') {
      if (this.buf.includes('.')) return { changed: false };
      if (this.buf.length === 0) return { changed: false };
      this.buf += ch;
      this._evaluate();
      return { changed: true };
    }

    this.buf += ch;
    this._evaluate();
    return { changed: true };
  }

  /** 退格：解锁 full，回到可输入 */
  pop() {
    if (this.phase === 'locked') return false;
    if (!this.buf.length) return false;
    this.buf = this.buf.slice(0, -1);
    this.full = false;
    return true;
  }

  clear() {
    this.buf = '';
    this.phase = 'typing';
    this.full = false;
    this.result = null;
  }

  lock(result) {
    this.phase = 'locked';
    this.result = result;
  }

  /**
   * 评估：判对立即锁定；位数满置 full；其余保持 typing。
   * v3：**没有任何自动判错路径**。
   */
  _evaluate() {
    if (!this.buf) return;

    // 恰好等于答案 → 判对
    if (checkAnswer(this.q, this.buf)) {
      this.lock(true);
      return;
    }

    // 分数题：位数逻辑不适用（可输 3 或 3/8），交给单题限时
    if (this.q.isFraction) return;

    // 位数满 → 锁输入（不判错）
    const bufDigits = this.buf.replace(/[.\-]/g, '').length;
    if (bufDigits >= this.answerDigits) {
      this.full = true;
    }
  }

  /** v3 无宽限计时，保留空实现兼容旧调用 */
  update() { return false; }
}

/**
 * 单题软倒计时
 * v3：到期 = 判错进下一题（「不输入就算错」的唯一来源）
 */
class QuestionTimer {
  constructor(limitSec) {
    this.limit = limitSec;
    this.elapsed = 0;
    this.done = false;
  }

  update(dt) {
    if (this.done) return false;
    this.elapsed += dt;
    if (this.elapsed >= this.limit) {
      this.elapsed = this.limit;
      this.done = true;
      return true;
    }
    return false;
  }

  get ratio() {
    return Math.max(0, 1 - this.elapsed / this.limit);
  }

  get isWarning() {
    return this.ratio < 0.25;
  }

  reset(limit) {
    if (limit) this.limit = limit;
    this.elapsed = 0;
    this.done = false;
  }
}

try { exports.GRACE_MS = GRACE_MS; } catch (e) {}
try { exports.MAX_INPUT = MAX_INPUT; } catch (e) {}
try { exports.AnswerBuffer = AnswerBuffer; } catch (e) {}
try { exports.QuestionTimer = QuestionTimer; } catch (e) {}
