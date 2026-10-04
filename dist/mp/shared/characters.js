/**
 * 角色状态机 + 素材映射
 * ------------------------------------------------------------------
 * ★★★ 角色素材替换位置 ★★★
 * 换角色改 config.js 里的 CHARACTERS 即可，本文件不用动。
 * 新增角色：把PNG 放进 assets/characters/ 并在 config.js 加一条配置。
 *
 * 状态逻辑严格复刻参考视频的公仔行为：
 *   待机呼吸 → 答题专注 → 答对跳跃庆祝 → 连击升级兴奋 → 答错沮丧
 */

const { CHARACTERS } = require('./config.js');

/** 合法状态集合 */
const CHAR_STATES = ['idle', 'answer', 'correct', 'combo', 'wrong'];

/** 各状态的动画参数表 */
const STATE_ANIM = {
  idle: {
    // 呼吸：轻微上下浮动
    bobAmp: 4, bobSpeed: 2.0, scale: 1.0, rotAmp: 0.012,
    dur: 0, loop: true, note: '待机：缓慢呼吸'
  },
  answer: {
    // 专注：停止浮动，前倾一点（像在思考）
    bobAmp: 2, bobSpeed: 3.0, scale: 1.02, rotAmp: 0.006,
    dur: 0, loop: true, note: '答题：轻微前倾，专注'
  },
  correct: {
    // 答对：向上弹跳 + 放大
    bobAmp: 26, bobSpeed: 6.0, scale: 1.14, rotAmp: 0.05,
    dur: 0.7, loop: false, note: '答对：欢快跳跃'
  },
  combo: {
    // 连击升级：大幅跳跃 + 旋转
    bobAmp: 38, bobSpeed: 7.5, scale: 1.22, rotAmp: 0.12,
    dur: 0.9, loop: false, note: '连击：兴奋大跳+旋转'
  },
  wrong: {
    // 答错：下垂 + 左右摇晃（沮丧但不打击信心）
    bobAmp: 6, bobSpeed: 5.0, scale: 0.94, rotAmp: 0.09,
    dur: 0.8, loop: false, note: '答错：轻微沮丧摇晃'
  }
};

/** 缓动函数集 */
const Ease = {
  linear: t => t,
  outQuad: t => 1 - (1 - t) * (1 - t),
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inQuad: t => t * t,
  outBack: t => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: t => {
    if (t === 0 || t === 1) return t;
    const p = 0.35;
    return Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
  },
  outBounce: t => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }
};

/**
 * 单个角色实例：管理状态切换与动画计时
 */
class CharacterActor {
  /**
   * @param {string} id 角色 id（对应 config.CHARACTERS 的key）
   * @param {Function} loadImage 图片加载函数 (path) => image
   */
  constructor(id, loadImage) {
    this.setCharacter(id);
    this.loadImage = loadImage;
    this.state = 'idle';
    this.stateTime = 0;
    this.images = {};       // state -> image
    this.loaded = false;
  }

  setCharacter(id) {
    this.id = id;
    this.cfg = CHARACTERS[id] || CHARACTERS.bunny;
  }

  /** 加载该角色所有状态所需图片（带去重，多个状态可共用一张） */
  load() {
    if (this.loaded) return;
    const paths = new Set();
    for (const st of CHAR_STATES) {
      const p = (this.cfg.states && this.cfg.states[st]) || this.cfg.image;
      paths.add(p);
    }
    for (const p of paths) {
      this.images[p] = this.loadImage(p);
    }
    this.loaded = true;
  }

  /** 取当前状态对应的图片对象 */
  getImage() {
    const p = (this.cfg.states && this.cfg.states[this.state]) || this.cfg.image;
    return this.images[p];
  }

  /** 切换状态 */
  setState(state) {
    if (!CHAR_STATES.includes(state)) return;
    if (this.state === state && this.stateTime < 0.35) return; // 避免重复触发
    this.state = state;
    this.stateTime = 0;
  }

  /** 更新动画 */
  update(dt) {
    this.stateTime += dt;
    const a = STATE_ANIM[this.state];
    if (a && !a.loop && this.stateTime >= a.dur) {
      // 一次性动画结束后回到待机
      this.state = 'idle';
      this.stateTime = 0;
    }
  }

  /**
   * 计算当前绘制变换
   * @returns {{scale:number, dy:number, rot:number}} dy 为相对锚点Y 的偏移
   */
  transform() {
    const a = STATE_ANIM[this.state];
    if (!a) return { scale: 1, dy: 0, rot: 0 };

    let scale = a.scale;
    let dy = 0;
    let rot = 0;

    if (a.loop) {
      // 循环动画：正弦浮动
      dy = Math.sin(this.stateTime * a.bobSpeed) * a.bobAmp;
      rot = Math.sin(this.stateTime * a.bobSpeed * 0.7) * a.rotAmp;
      // 待机时用 ease 让呼吸更柔和
      if (this.state === 'idle') {
        const k = (Math.sin(this.stateTime * a.bobSpeed) + 1) / 2;
        scale = a.scale * (0.99 + k * 0.02);
      }
    } else {
      // 一次性动画：0→1 进度
      const t = Math.min(1, this.stateTime / a.dur);
      // 跳跃：前 70% 上升，靠弹性回落
      if (this.state === 'correct' || this.state === 'combo') {
        const up = t < 0.7 ? Ease.outQuad(t / 0.7) : 1 - Ease.outQuad((t - 0.7) / 0.3);
        dy = -up * a.bobAmp;
        scale = a.scale * (0.94 + up * 0.1);
        rot = Math.sin(t * Math.PI * 2) * a.rotAmp;
      } else if (this.state === 'wrong') {
        // 答错：下沉 + 左右摇
        dy = Ease.outQuad(t) * a.bobAmp;
        rot = Math.sin(t * Math.PI * 4) * a.rotAmp * (1 - t * 0.6);
        scale = a.scale * (1 - Ease.outQuad(t) * 0.04);
      } else {
        const e = Ease.outBack(t);
        scale = a.scale * e;
      }
    }

    return { scale, dy, rot };
  }

  /**
   * 依据游戏事件自动驱动状态
   * @param {string} event 'correct' | 'wrong' | 'comboUp' | 'dlUp' | 'questionStart'
   */
  onEvent(event) {
    switch (event) {
      case 'correct':   this.setState('correct'); break;
      case 'wrong':     this.setState('wrong'); break;
      case 'comboUp':
      case 'dlUp':      this.setState('combo'); break;
      case 'questionStart':
      default:          if (this.state === 'idle') this.setState('answer'); break;
    }
  }
}

/**
 * 根据连击数推荐角色情绪强度（可用于额外的舞台特效）
 */
function moodForCombo(combo) {
  if (combo >= 30) return 'blazing';
  if (combo >= 20) return 'hot';
  if (combo >= 10) return 'warm';
  if (combo >= 5)  return 'mild';
  return 'calm';
}
try { exports.CHAR_STATES = CHAR_STATES; } catch (e) {}
try { exports.STATE_ANIM = STATE_ANIM; } catch (e) {}
try { exports.Ease = Ease; } catch (e) {}
try { exports.CharacterActor = CharacterActor; } catch (e) {}
try { exports.moodForCombo = moodForCombo; } catch (e) {}
