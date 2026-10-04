/**
 * 平台适配层
 * ------------------------------------------------------------------
 * 微信小游戏与浏览器 H5 的唯一差异点收拢在此文件，
 * 上层业务代码不出现任何 wx.* 或 window.* 判断。
 */

/**
 * 视口与坐标映射
 * ------------------------------------------------------------------
 * 存在两套坐标系：
 *  - 设计坐标系：672 × 1280（UI_SPEC 基准，所有布局常量都在这里）
 *  - 物理坐标系：设备实际像素
 *
 * iPhone 全面屏（如 390×844pt）物理比例 ≠ 设计比例，且存在刘海/底部小黑条。
 * 若直接按设备宽高等比缩放，HUD 会被刘海盖住、键盘会被Home Indicator遮住。
 *
 * 正确做法：canvas 逻辑尺寸 = 物理像素 / dpr（CSS 像素），
 * 再用 cover 策略求scale 并居中偏移，保证设计稿完整可见。
 */

class Viewport {
  /**
   * @param {object} opts {designW, designH, safeTop, safeBottom, systemInfo}
   */
  constructor(opts = {}) {
    this.dW = opts.designW || 672;
    this.dH = opts.designH || 1280;
    this.safeTop = opts.safeTop || 24;
    this.safeBottom = opts.safeBottom || 24;

    this.winW = opts.width || 375;
    this.winH = opts.height || 667;
    this.dpr = opts.dpr || 1;

    this.scale = 1;
    this.offX = 0;
    this.offY = 0;
    this.compute();
  }

  /** 依据当前窗口尺寸重算缩放与居中偏移 */
  compute() {
    const dw = this.winW - this.safeLeft() - this.safeRight();
    const dh = this.winH - this.safeTop - this.safeBottom;
    /**
     * 用 contain（取较小者）而非 cover（取较大者）。
     * 理由：cover 会把设计稿放大到「填满屏幕」，超出部分被裁掉——
     * 实测在 420×860 窗口下scale 算成 0.666，设计稿显示为 447×852，
     * 宽度超出 27px，导致第三列卡片被右侧裁切。
     * contain 保证设计稿**完整可见**，两侧留黑边（letterbox），
     * 与 UI_SPEC §0.2 的适配要求一致。
     */
    this.scale = Math.min(dw / this.dW, dh / this.dH);
    // 居中
    this.offX = (dw - this.dW * this.scale) / 2 + this.safeLeft();
    this.offY = (dh - this.dH * this.scale) / 2 + this.safeTop;
  }

  safeLeft() { return this._safeL || 0; }
  safeRight() { return this._safeR || 0; }
  /** 微信胶囊按钮避让：右上角区域不可放可点元素 */
  avoidCapsule() {
    // 微信胶囊约 87×32 CSS px，距顶 8px，距右 7px
    return { x: this.winW - 95, y: 8, w: 87, h: 32 };
  }

  /** 物理/CSS 坐标 → 设计坐标（命中检测必须用这个） */
  toDesign(clientX, clientY) {
    return {
      x: (clientX - this.offX) / this.scale,
      y: (clientY - this.offY) / this.scale
    };
  }

  /** 设计坐标 → 物理坐标 */
  toPhys(dx, dy) {
    return {
      x: dx * this.scale + this.offX,
      y: dy * this.scale + this.offY
    };
  }

  setSize(width, height, dpr) {
    this.winW = width;
    this.winH = height;
    this.dpr = dpr || this.dpr;
    this.compute();
  }
}

/**
 * 平台能力统一封装
 */
class Platform {
  /**
   * @param {string} name 'wx' | 'web'
   * @param {string} assetRoot 资源根路径。
   *   微信小游戏：''（资源在包内相对根，config 里的 'assets/...' 即可）
   *   H5：需注入实际路径（如 '../miniprogram/'），因为页面在 /web/ 下
   *这是跨端资源加载的关键差异，收敛在此处，上层无需关心。
   */
  constructor(name, assetRoot) {
    this.name = name;              // 'wx' | 'web'
    this.assetRoot = assetRoot || '';
    this._touchStart = null;
  }

  /**
   * 拼接资源的实际可加载路径
   * @param {string} p config 里的相对路径，如 'assets/characters/cat.png'
   */
  assetPath(p) {
    if (!p) return '';
    // 已是绝对路径或data URI，直接返回
    if (/^(https?:|data:|blob:)/.test(p)) return p;
    return this.assetRoot + p;
  }

  get isWX() { return this.name === 'wx'; }

  /**
   * 绑定触摸事件，统一回调签名
   * @param {HTMLCanvasElement|object} canvas
   * @param {object} handlers {onDown, onMove, onUp}
   */
  bindTouch(canvas, handlers) {
    if (this.isWX && typeof wx !== 'undefined' && wx.onTouchStart) {
      wx.onTouchStart(e => {
        const t = e.touches && e.touches[0];
        if (t) handlers.onDown && handlers.onDown(t.clientX, t.clientY);
      });
      wx.onTouchMove(e => {
        const t = e.touches && e.touches[0];
        if (t) handlers.onMove && handlers.onMove(t.clientX, t.clientY);
      });
      wx.onTouchEnd(e => {
        const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
        if (t) handlers.onUp && handlers.onUp(t.clientX, t.clientY);
      });
      wx.onTouchCancel(() => handlers.onUp && handlers.onUp(null, null));
      return;
    }

    // 浏览器：同时支持鼠标与触摸，方便开发调试
    // 注意：App.resize 已用 setTransform(dpr) 把绘制映射到 CSS 像素，
    // 因此这里只需减去 canvas 的 CSS 位置偏移，**不能再乘 devicePixelRatio**
    // （否则命中坐标会偏移 dpr 倍，在全面屏上完全点不中）。
    const getXY = ev => {
      const rect = canvas.getBoundingClientRect();
      const src = (ev.touches && ev.touches[0]) ? ev.touches[0] : ev;
      return {
        x: src.clientX - rect.left,
        y: src.clientY - rect.top
      };
    };

    const down = ev => {
      ev.preventDefault();
      const p = getXY(ev);
      this._touchStart = p;
      handlers.onDown && handlers.onDown(p.x, p.y);
    };
    const move = ev => {
      const p = getXY(ev);
      handlers.onMove && handlers.onMove(p.x, p.y);
    };
    const up = ev => {
      const p = getXY(ev);
      handlers.onUp && handlers.onUp(p.x, p.y);
    };

    canvas.addEventListener('touchstart', down, { passive: false });
    canvas.addEventListener('touchmove', ev => { ev.preventDefault(); move(ev); }, { passive: false });
    canvas.addEventListener('touchend', up);
    canvas.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  /** 读取系统信息 */
  getSystemInfoSync() {
    if (this.isWX && typeof wx !== 'undefined' && wx.getSystemInfoSync) {
      try { return wx.getSystemInfoSync(); } catch (e) {}
    }
    if (typeof window !== 'undefined') {
      return {
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        pixelRatio: window.devicePixelRatio || 1,
        safeArea: { top: 0, bottom: window.innerHeight },
        platform: 'devtools'
      };
    }
    return { windowWidth: 375, windowHeight: 667, pixelRatio: 2 };
  }

  /** 触觉反馈（仅在家长开关开启时调用） */
  vibrate(kind = 'short') {
    if (!this.isWX || typeof wx === 'undefined') return false;
    try {
      if (kind === 'short' && wx.vibrateShort) {
        wx.vibrateShort({ type: 'light' });
      } else if (kind === 'heavy' && wx.vibrateShort) {
        wx.vibrateShort({ type: 'heavy' });
      } else if (wx.vibrateLong) {
        wx.vibrateLong();
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 加载图片（自动补全资源根路径） */
  loadImage(path) {
    const src = this.assetPath(path);
    if (this.isWX && typeof wx !== 'undefined' && wx.createImage) {
      const img = wx.createImage();
      img.src = src;
      return img;
    }
    if (typeof Image !== 'undefined') {
      const img = new Image();
      img.src = src;
      return img;
    }
    return null;
  }

  /** 页面隐藏/显示（用于暂停与音频恢复） */
  onVisibility(cb) {
    if (this.isWX && typeof wx !== 'undefined' && wx.onHide) {
      wx.onHide(cb);
      wx.onShow(() => cb(false));
      return;
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        cb(document.hidden);
      });
      window.addEventListener('blur', () => cb(true));
      window.addEventListener('focus', () => cb(false));
    }
  }

  /** 帧循环 */
  raf(cb) {
    const fn = this.isWX && typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame
      : (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : setTimeout);
    return fn(cb);
  }
}
try { exports.Viewport = Viewport; } catch (e) {}
try { exports.Platform = Platform; } catch (e) {}
