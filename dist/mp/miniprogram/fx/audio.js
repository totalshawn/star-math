/**
 * WebAudio 合成音频引擎
 * ------------------------------------------------------------------
 * 零音频文件依赖 —— BGM 与全部音效均实时合成，包体零增长。
 * 微信小游戏用 wx.createWebAudioContext()，浏览器用 new AudioContext()，
 * 通过工厂注入实现跨端（见 AUDIO_FACTORY）。
 */

class AudioEngine {
  /**
   * @param {object} ctx AudioContext-like 对象
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.master = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.enabled = true;
    this.bgmTimer = null;
    this.bgmStep = 0;
    this.ready = false;
  }

  init() {
    if (this.ready) return;
    const ctx = this.ctx;
    try {
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(ctx.destination);

      this.bgmGain = ctx.createGain();
      this.bgmGain.gain.value = 0.30;   // BGM 不抢音效
      this.bgmGain.connect(this.master);

      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = 0.65;
      this.sfxGain.connect(this.master);

      this.ready = true;
    } catch (e) {
      this.enabled = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended' && this.ctx.resume) {
      this.ctx.resume();
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) {
      this.master.gain.value = on ? 0.9 : 0;
    }
    if (!on) this.stopBGM();
  }

  /** 单个音符 */
  _note(freq, start, dur, opts = {}) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(freq, start);

    // 滑音（用于上行/下行音阶的滑动感）
    if (opts.glide) {
      o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.glide), start + dur);
    }

    const vol = (opts.vol === undefined ? 0.3 : opts.vol);
    const atk = opts.atk === undefined ? 0.012 : opts.atk;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), start + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    let node = o;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.filter;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(opts.bus || this.sfxGain);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  /** 噪声（打击/沙沙声） */
  _noise(start, dur, opts = {}) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = opts.vol === undefined ? 0.2 : opts.vol;
    const f = ctx.createBiquadFilter();
    f.type = opts.filter || 'highpass';
    f.frequency.value = opts.freq || 1200;
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start(start);
  }

  // ===== 音效 =====

  /** 按键 tick */
  key() {
    const t = this.ctx.currentTime;
    this._noise(t, 0.045, { vol: 0.13, filter: 'bandpass', freq: 2100 });
    this._note(660, t, 0.05, { type: 'triangle', vol: 0.10 });
  }

  /**
   * 答对：上行音阶，音高随连击升高（越连越高，形成「爽感」）
   * @param {number} combo 当前连击
   */
  correct(combo = 0) {
    const t = this.ctx.currentTime;
    // 连击越高，整体移调越高（最多升 8 度）
    const shift = Math.min(8, Math.floor(combo / 5)) ;
    const base = 523.25 * Math.pow(2, shift / 12);
    const notes = [1, 1.25, 1.5, 2];  // do-mi-sol-do
    notes.forEach((m, i) => {
      this._note(base * m, t + i * 0.045, 0.16, {
        type: 'triangle', vol: 0.22, bus: this.sfxGain
      });
    });
    this._noise(t, 0.12, { vol: 0.06, filter: 'highpass', freq: 4000 });
  }

  /** 答错：柔和下行双音（不刺耳、不打击信心） */
  wrong() {
    const t = this.ctx.currentTime;
    this._note(392, t, 0.16, { type: 'sine', vol: 0.16 });
    this._note(311, t + 0.11, 0.22, { type: 'sine', vol: 0.14 });
  }

  /** 连击升级：明亮上行 + 闪白音 */
  comboUp() {
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      this._note(f, t + i * 0.05, 0.2, { type: 'triangle', vol: 0.2 });
    });
    this._noise(t + 0.1, 0.3, { vol: 0.05, filter: 'highpass', freq: 6000 });
  }

  /** 关卡过关：小号角式 fanfare */
  levelClear() {
    const t = this.ctx.currentTime;
    const seq = [523.25, 659.25, 783.99, 1046.5];
    seq.forEach((f, i) => {
      this._note(f, t + i * 0.1, 0.34, { type: 'square', vol: 0.13, filter: 2400 });
    });
    this._note(1318.5, t + 0.42, 0.5, { type: 'square', vol: 0.12, filter: 2600 });
  }

  /** 游戏结束：温和下行 */
  gameOver() {
    const t = this.ctx.currentTime;
    const seq = [659.25, 523.25, 440, 349.23];
    seq.forEach((f, i) => {
      this._note(f, t + i * 0.14, 0.36, { type: 'triangle', vol: 0.16 });
    });
  }

  /** 金币收集：清脆双音 */
  coin() {
    const t = this.ctx.currentTime;
    this._note(1318.5, t, 0.07, { type: 'square', vol: 0.1 });
    this._note(1760, t + 0.06, 0.12, { type: 'square', vol: 0.09 });
  }

  /** UI 点击 */
  tap() {
    const t = this.ctx.currentTime;
    this._note(880, t, 0.07, { type: 'sine', vol: 0.12 });
    this._note(1174, t + 0.03, 0.08, { type: 'sine', vol: 0.09 });
  }

  /** 时间警告（最后 10 秒，每秒一次） */
  warning() {
    const t = this.ctx.currentTime;
    this._note(880, t, 0.1, { type: 'sine', vol: 0.13 });
  }

  // ===== BGM =====
  /**
   * 节奏感循环 BGM（代码合成）
   * 4/4 拍，每拍推进一步；连击越高节奏越密集（由外部调 setIntensity）
   */
  startBGM() {
    if (!this.ready || !this.enabled || this.bgmTimer) return;
    const bpm = 124;
    const stepDur = 60 / bpm / 2;   // 八分音符
    this.bgmStep = 0;

    const playStep = () => {
      if (!this.enabled) return;
      const t = this.ctx.currentTime;
      const s = this.bgmStep;
      const scale = [0, 3, 5, 7, 10];      // 小调五声（明快不吵）
      const root = 261.63;                  // C4

      // 低音：每小节第一拍
      if (s % 8 === 0) {
        this._note(root / 2, t, stepDur * 1.6, { type: 'sine', vol: 0.22, bus: this.bgmGain });
      }
      // 和弦垫：每两拍
      if (s % 4 === 0) {
        const deg = scale[(s / 4) % scale.length];
        this._note(root * Math.pow(2, deg / 12), t, stepDur * 2.4, {
          type: 'triangle', vol: 0.10, bus: this.bgmGain, filter: 1800
        });
      }
      // 琶音：每拍走一个音
      if (this.intensity > 0 || s % 2 === 0) {
        const idx = s % 8;
        const deg = scale[[0, 2, 4, 2, 3, 4, 2, 0][idx]];
        this._note(root * 2 * Math.pow(2, deg / 12), t, stepDur * 0.9, {
          type: 'triangle', vol: 0.075, bus: this.bgmGain
        });
      }
      // 打击：强拍重音
      if (s % 4 === 0) this._noise(t, 0.09, { vol: 0.10, filter: 'lowpass', freq: 380 });
      if (s % 4 === 2) this._noise(t, 0.06, { vol: 0.055, filter: 'highpass', freq: 5000 });
      // 高连击时的十六分音符碎拍
      if (this.intensity > 0 && s % 2 === 1) {
        this._noise(t + stepDur / 2, 0.03, { vol: 0.035, filter: 'highpass', freq: 7000 });
      }

      this.bgmStep = (s + 1) % 32;
    };

    playStep();
    this.bgmTimer = setInterval(playStep, stepDur * 1000);
  }

  stopBGM() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  /** 0=平静，1=激烈（随连击提升） */
  setIntensity(v) {
    this.intensity = v;
  }

  dispose() {
    this.stopBGM();
    this.ready = false;
  }
}

/**
 * 跨端工厂：创建 AudioContext
 * @param {'wx'|'web'} platform
 */
function createAudioEngine(platform) {
  let ctx = null;
  try {
    if (platform === 'wx' && typeof wx !== 'undefined' && wx.createWebAudioContext) {
      ctx = wx.createWebAudioContext();
    } else if (typeof AudioContext !== 'undefined') {
      ctx = new AudioContext();
    } else if (typeof webkitAudioContext !== 'undefined') {
      ctx = new webkitAudioContext();
    }
  } catch (e) {
    ctx = null;
  }
  if (!ctx) return null;
  const eng = new AudioEngine(ctx);
  eng.intensity = 0;
  return eng;
}
try { exports.AudioEngine = AudioEngine; } catch (e) {}
try { exports.createAudioEngine = createAudioEngine; } catch (e) {}
