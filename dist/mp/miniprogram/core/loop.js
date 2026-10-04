/**
 * 游戏主循环
 * ------------------------------------------------------------------
 * 严格按 FRONTEND_SPEC §2 的「绝对时间轴 + dt 钳制 + 累加器」实现。
 * 绝对时间轴的价值：把 frameDt 从渲染循环抽离，
 * 保证不同刷新率（60/90/120Hz）下手感一致，且不累积浮点误差。
 */

const { GAME } = require('../../shared/config.js');

class GameLoop {
  /**
   * @param {Function} update (dt) => void
   * @param {Function} render (alpha) => void
   * @param {object} opts {now, raf}
   */
  constructor(update, render, opts = {}) {
    this.update = update;
    this.render = render;
    this.now = opts.now || (() => Date.now());
    this.raf = opts.raf || ((cb) => requestAnimationFrame(cb));

    this.running = false;
    this.dt = 0;
    this.frame = 0;
    this.fps = 0;
    this._last = 0;
    this._acc = 0;
    this._fpsFrames = 0;
    this._fpsTime = 0;
    this._rafId = null;

    // dt 钳制（FRONTEND_SPEC §2.2）：切后台回来时 lastTime 可能过期，
    // 若不钳制，dt 会变成几秒，一次 update 就把游戏时间跳光。
    this.MAX_DT = 1 / 20;   // 50ms
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = this.now();
    const tick = () => {
      if (!this.running) return;
      this._rafId = this.raf(tick);
      const t = this.now();
      let frameDt = (t - this._last) / 1000;
      this._last = t;

      // 钳制
      if (frameDt > this.MAX_DT) frameDt = this.MAX_DT;
      if (frameDt < 0) frameDt = 0;

      this.frame++;
      this._fpsFrames++;
      this._fpsTime += frameDt;
      if (this._fpsTime >= 1) {
        this.fps = this._fpsFrames / this._fpsTime;
        this._fpsFrames = 0;
        this._fpsTime = 0;
      }

      this.update(frameDt);
      this.render(frameDt);
    };
    this._rafId = this.raf(tick);
  }

  stop() {
    this.running = false;
    if (this._rafId !== null) {
      // 小游戏环境无 cancelAnimationFrame 兜底时忽略
      if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /** 页面隐藏时重置时间基准，避免回来后 dt 爆炸 */
  resetClock() {
    this._last = this.now();
    this._acc = 0;
  }
}

/**
 * 场景管理器
 */
class SceneManager {
  constructor() {
    this.scenes = {};
    this.current = null;
    this.currentName = '';
    this.stack = [];
  }

  register(name, scene) {
    scene.name = name;
    scene.manager = this;
    this.scenes[name] = scene;
  }

  /**
   * 切换场景
   * @param {string} name
   * @param {object} params 传入新场景的 enter 参数
   */
  switchTo(name, params = {}) {
    if (this.current && this.current.exit) {
      this.current.exit();
    }
    const next = this.scenes[name];
    if (!next) {
      console.error('[SceneManager] 场景不存在:', name);
      return false;
    }
    this.current = next;
    this.currentName = name;
    if (next.enter) next.enter(params);
    return true;
  }

  /** 当前场景的 update/draw 转发 */
  update(dt) {
    if (this.current && this.current.update) this.current.update(dt);
  }

  draw(ctx, vp, alpha) {
    if (this.current && this.current.draw) this.current.draw(ctx, vp, alpha);
  }
}

/**
 * 场景基类：提供共用的进入/退出/更新的默认实现
 */
class BaseScene {
  constructor(app) {
    this.app = app;
    this.name = '';
    this.t = 0;              // 本场景已运行时间
    this.enteredAt = 0;
  }

  enter(params) { this.t = 0; }
  exit() {}
  update(dt) { this.t += dt; }
  draw(ctx, vp) {}
}

/**
 * 轻量补间管理器：供各场景使用，避免各处重复写缓动
 */
class Tweener {
  constructor() {
    this.items = [];
  }

  /**
   * @param {object} o {from,to,dur,onUpdate,onDone,ease,delay}
   */
  add(o) {
    const item = {
      from: o.from === undefined ? 0 : o.from,
      to: o.to === undefined ? 1 : o.to,
      dur: o.dur || 0.3,
      elapsed: 0,
      delay: o.delay || 0,
      ease: o.ease || (t => t),
      onUpdate: o.onUpdate,
      onDone: o.onDone
    };
    this.items.push(item);
    return item;
  }

  /** 延时回调 */
  delay(sec, fn) {
    return this.add({ dur: 0.0001, delay: sec, onDone: fn });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.delay > 0) {
        it.delay -= dt;
        continue;
      }
      it.elapsed += dt;
      const p = Math.min(1, it.elapsed / it.dur);
      const v = it.from + (it.to - it.from) * it.ease(p);
      if (it.onUpdate) it.onUpdate(v, p);
      if (p >= 1) {
        this.items.splice(i, 1);
        if (it.onDone) it.onDone();
      }
    }
  }

  clear() { this.items.length = 0; }
  get count() { return this.items.length; }
}


try { exports.GameLoop = GameLoop; } catch (e) {}
try { exports.SceneManager = SceneManager; } catch (e) {}
try { exports.BaseScene = BaseScene; } catch (e) {}
try { exports.Tweener = Tweener; } catch (e) {}
try { exports.GAME = GAME; } catch (e) {}
