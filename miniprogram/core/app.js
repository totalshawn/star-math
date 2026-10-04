/**
 * 应用主入口
 * ------------------------------------------------------------------
 * 串起平台适配、存档、音频、场景管理、主循环。
 * 微信小游戏与浏览器 H5 共用本文件，仅 platform 不同。
 */

import { Platform, Viewport } from './platform.js';
import { GameLoop, SceneManager } from './loop.js';
import { SaveManager, createStorage } from '../store/save.js';
import { createAudioEngine } from '../fx/audio.js';
import { HomeScene } from '../scenes/home-scene.js';
import { GameScene } from '../scenes/game-scene.js';
import { ResultScene } from '../scenes/result-scene.js';
import { DESIGN, DEFAULT_SETTINGS } from '../../shared/config.js';
import { CHALLENGE } from '../../shared/rules.js';

/** 物理键盘 → 游戏按键（桌面端调试用，孩子在小程序上是触屏） */
const KEYMAP = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
  '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '.': '.', ',': '.',
  Backspace: 'del', Delete: 'del'
};

export class App {
  /**
   * @param {object} opts {canvas, platformName}
   */
  constructor(opts) {
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.platform = new Platform(opts.platformName || 'web', opts.assetRoot || '');

    const info = this.platform.getSystemInfoSync();
    this.viewport = new Viewport({
      width: info.windowWidth,
      height: info.windowHeight,
      dpr: info.pixelRatio || 1,
      designW: DESIGN.WIDTH,
      designH: DESIGN.HEIGHT,
      safeTop: 24,
      safeBottom: 24
    });

    // 存档（离线优先）
    this.storage = createStorage(this.platform.isWX ? 'wx' : 'web');
    this.save = new SaveManager(this.storage, () => Date.now());
    this.save.load();

    // 音频（可能为 null，静音降级）
    this.audio = createAudioEngine(this.platform.isWX ? 'wx' : 'web');

    // 场景
    this.scenes = new SceneManager();
    this.scenes.register('home', new HomeScene(this));
    this.scenes.register('game', new GameScene(this));
    this.scenes.register('result', new ResultScene(this));
    this.scenes.switchTo('home');

    // 主循环
    this.loop = new GameLoop(
      dt => this.update(dt),
      () => this.draw(),
      { now: () => Date.now(), raf: cb => this.platform.raf(cb) }
    );

    this.lastSummary = null;
    this.paused = false;
    this.bindInput();
    this.resize();
  }

  // ===== 生命周期 =====

  start() {
    this.loop.start();
  }

  resize() {
    const info = this.platform.getSystemInfoSync();
    const dpr = Math.min(info.pixelRatio || 1, 3);   // 封顶 3，避免高分屏过度绘制
    // CSS 像素尺寸（逻辑坐标系）
    const w = info.windowWidth;
    const h = info.windowHeight;

    // canvas 背板按设备像素分配，CSS 尺寸设为逻辑尺寸
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    if (this.canvas.style) {
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
    }

    // 关键：把「设备像素」映射回「CSS 像素」，之后所有绘制都用 CSS 逻辑坐标。
    // 不做这一步会让 dpr 被重复应用（画面放大 dpr 倍且裁切）。
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.viewport.setSize(w, h, dpr);
  }

  bindInput() {
    this.platform.bindTouch(this.canvas, {
      onDown: (x, y) => {
        this.audio && this.audio.resume();
        this.handleDown(x, y);
      },
      onUp: (x, y) => {
        if (x === null) return;
        this.handleUp(x, y);
      },
      onMove: () => {}
    });

    // 桌面调试：物理键盘
    if (!this.platform.isWX && typeof window !== 'undefined') {
      window.addEventListener('keydown', e => {
        const k = KEYMAP[e.key];
        if (!k) return;
        if (this.scenes.currentName === 'game') {
          e.preventDefault();
          this.scenes.current.onKey(k);
        }
      });
    }

    // 切后台：暂停 + 落盘（避免掉帧与丢档）
    this.platform.onVisibility(hidden => {
      if (hidden) {
        this.paused = true;
        this.loop.resetClock();
        this.save.flush();
        this.audio && this.audio.stopBGM();
      } else {
        this.paused = false;
        this.loop.resetClock();
        // iOS 切回必须 resume，否则音频永久静音
        this.audio && this.audio.resume();
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.resize());
    }
  }

  handleDown(x, y) {
    const p = this.viewport.toDesign(x, y);
    const name = this.scenes.currentName;

    if (name === 'game') {
      const gs = this.scenes.current;
      // 静音键优先（独立于游戏区）
      if (gs.hitMute(p.x, p.y)) {
        this.save.setSetting('sound', !this.save.settings.sound);
        if (this.save.settings.sound) { this.audio && this.audio.startBGM(); }
        else { this.audio && this.audio.stopBGM(); }
        return;
      }
      // 键盘命中
      const key = gs.hitKey(p.x, p.y);
      if (key) gs.onKey(key);
      return;
    }

    if (name === 'home') {
      this.scenes.current.onTap(p.x, p.y);
      return;
    }

    if (name === 'result') {
      this.scenes.current.onTap(p.x, p.y);
    }
  }

  handleUp() { /* 按键按下即响应，无需抬起处理 */ }

  // ===== 场景切换 =====

  startGame(opts = {}) {
    // 挑战赛：进入前消费额度（失败则留在当前页）
    if (opts.isChallenge) {
      if (!this.save.consumeChallengeQuota()) return false;
    }
    this.scenes.switchTo('game', { isChallenge: !!opts.isChallenge, challengeTime: opts.challengeTime });
    return true;
  }

  goHome() {
    this.scenes.switchTo('home');
  }

  onGameOver(state, summary) {
    // 记录「有效通关」：主模式 且 正答率达标
    if (!this.isChallengeRun()) {
      this.save.recordValidClear(Object.assign({ mode: 'main', grade: state.grade }, summary));
    }
    this.lastSummary = summary;
    this.scenes.switchTo('result', {
      summary,
      isChallenge: this.isChallengeRun(),
      wasCleared: state.level > 1
    });
  }

  isChallengeRun() {
    return this.scenes.current && this.scenes.current.isChallenge === true;
  }

  // ===== 挑战赛代理（ResultScene 调用） =====

  checkChallengeUnlock() { return this.save.checkChallengeUnlock(); }
  challengeQuotaLeft() { return this.save.challengeQuotaLeft(); }
  challengeNeedMore() { return this.save.challengeNeedMore(); }
  recordChallengeRun(sum) { return this.save.recordChallengeRun(sum); }

  // ===== 主循环 =====

  update(dt) {
    if (this.paused) return;
    this.scenes.update(dt);
  }

  draw() {
    const ctx = this.ctx;
    const W = this.viewport.winW, H = this.viewport.winH;
    ctx.clearRect(0, 0, W, H);
    this.scenes.draw(ctx, this.viewport);
  }
}

/** 启动（微信小游戏与浏览器共用） */
export function bootstrap(canvas, platformName, assetRoot) {
  const app = new App({ canvas, platformName, assetRoot });
  app.start();
  return app;
}

// ===== 微信小游戏入口 =====
if (typeof wx !== 'undefined' && typeof GameGlobal !== 'undefined' && wx.createCanvas) {
  const canvas = wx.createCanvas();
  GameGlobal.__APP__ = bootstrap(canvas, 'wx');
}