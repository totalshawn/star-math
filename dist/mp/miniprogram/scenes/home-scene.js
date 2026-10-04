/**
 * 主页场景：选角色 + 选年级 + 开始
 * ------------------------------------------------------------------
 * 面向 1—6 年级：界面大字、明快配色、无文字负担。
 */

const { BaseScene, Tweener } = require('../core/loop.js');
const { CHARACTERS, CHARACTER_LIST, GRADE_TABLE, COLOR, FONT, FONT_STACK, DESIGN, getGradeTheme } = require('../../shared/config.js');
const { CharacterActor } = require('../../shared/characters.js');
const * as UI = require('../ui/ui.js');

// 设计稿尺寸（模块级常量，供各绘制方法使用）
const W = DESIGN.WIDTH;
const H = DESIGN.HEIGHT;
const { roundRect, text, measure } = require('../ui/ui.js');

class HomeScene extends BaseScene {
  constructor(app) {
    super(app);
    this.tw = new Tweener();
    this.tab = 'grade';       // grade | character
    this.actor = null;
    this.pressedBtn = '';
    this.floatItems = [];
    /** 同伴角色（陪伴主角的小动物，让画面有生气） */
    this.crew = [];
    /** 主角舞台：切页时会做动作 */
    this.heroStage = 'idle';
    this.heroTimer = 0;
  }

  enter() {
    super.enter();
    const save = this.app.save;

    // 主角预览
    const id = save.profile.character;
    if (!this.actor) {
      this.actor = new CharacterActor(id, p => this.app.platform.loadImage(p));
    } else {
      this.actor.setCharacter(id);
    }
    this.actor.load();
    this.actor.setState('idle');

    /**
     * 同伴角色：主角之外的 2 只小动物在角落晃悠。
     * 目的：让主页「有人气」，而不是只有主角一个静态框。
     */
    this.crew = [];
    const others = CHARACTER_LIST.filter(x => x !== id).slice(0, 2);
    // 放在下半区空档，避开标题(228—290)与年级卡(408起)
    const spots = [{ x: 548, y: 800, dir: 1 }, { x: 116, y: 856, dir: -1 }];
    others.forEach((cid, i) => {
      const cfg = CHARACTERS[cid];
      const img = this.app.platform.loadImage(cfg.image);
      this.crew.push({
        img,
        x: spots[i].x, y: spots[i].y,
        homeX: spots[i].x,
        baseY: spots[i].y,
        size: 76 + i * 10,
        phase: Math.random() * Math.PI * 2,
        speed: 0.9 + Math.random() * 0.5,
        img2: this.app.platform.loadImage(cfg.states && cfg.states.combo || cfg.image)
      });
    });

    // 主角舞台初始动作
    this.heroStage = 'idle';
    this.heroTimer = 0;

    /**
     * 浮动装饰：星星 + 小气泡，营造「空气感」。
     * 数量从 10 提到 18，并加入缓慢左右摆动（原来只有上下飘）。
     */
    this.floatItems = [];
    for (let i = 0; i < 26; i++) {
      this.floatItems.push({
        x: Math.random() * DESIGN.WIDTH,
        y: Math.random() * DESIGN.HEIGHT,
        vy: -(0.12 + Math.random() * 0.26),
        sway: 0.3 + Math.random() * 0.5,     // 左右摆动幅度
        swaySpd: 0.6 + Math.random() * 0.8,
        size: 5 + Math.random() * 9,
        rot: Math.random() * Math.PI * 2,
        rotSpd: (Math.random() - 0.5) * 1.2,
        alpha: 0.22 + Math.random() * 0.26,
        baseX: Math.random() * DESIGN.WIDTH,
        color: [COLOR.GOLD, COLOR.MINT, COLOR.SKY, COLOR.PEACH][i % 4],
        // 每4 颗星配 1 个数学符号，避免符号太多显得乱
        glyph: (i % 3 === 2) ? ['+', '−', '×', '÷', '=', '√'][Math.floor(i / 3) % 6] : null
      });
    }
    // 入场动画
    this.enterT = 0;
  }

  exit() { this.tw.clear(); }

  update(dt) {
    super.update(dt);
    this.tw.update(dt);
    this.actor.update(dt);
    this.enterT += dt;

    // 同伴角色：轻微上下起伏 + 缓慢左右移动
    for (const c of this.crew) {
      c.phase += dt * c.speed;
      c.y = c.baseY + Math.sin(c.phase) * 5;
      c.x = c.homeX + Math.sin(c.phase * 0.6) * 9;
    }

    // 主角每 3.5—6 秒自动换一个动作（举星/ 跳跃 / 待机）
    this.heroTimer += dt;
    if (this.heroTimer > 3.5 + Math.random() * 2.5) {
      this.heroTimer = 0;
      this.heroStage = this.heroStage === 'idle' ? 'combo' : 'idle';
      this.actor.setState(this.heroStage === 'combo' ? 'combo' : 'idle');
    }

    for (const f of this.floatItems) {
      f.y += f.vy * dt * 60;
      f.rot += dt * f.rotSpd;
      // 左右摆动
      f.x = f.baseX + Math.sin(this.t * f.swaySpd) * f.sway * 14;
      if (f.y < -20) {
        f.y = DESIGN.HEIGHT + 20;
        f.baseX = Math.random() * DESIGN.WIDTH;
        f.x = f.baseX;
      }
    }
  }

  onTap(dx, dy) {
    const s = this.app.save;

    // —— 开始按钮
    if (dx >= 136 && dx <= 536 && dy >= 1000 && dy <= 1140) {
      this.app.audio && this.app.audio.tap();
      this.app.startGame();
      return true;
    }

    // —— Tab 切换
    if (dy >= 316 && dy <= 386) {
      if (dx >= 36 && dx <= 330) { this.tab = 'grade'; this.app.audio && this.app.audio.tap(); return true; }
      if (dx >= 342 && dx <= 636) { this.tab = 'character'; this.app.audio && this.app.audio.tap(); return true; }
    }

    // —— 年级网格（3 列 × 2 行）
    if (this.tab === 'grade') {
      for (let i = 0; i < 6; i++) {
        const col = i % 3, row = Math.floor(i / 3);
        const x = 36 + col * 204, y = 408 + row * 148;
        if (dx >= x && dx <= x + 184 && dy >= y && dy <= y + 130) {
          s.settings.grade = i + 1;
          s.save(true);
          this.app.audio && this.app.audio.tap();
          return true;
        }
      }
    }

    // —— 角色选择（横向滑动列表）
    if (this.tab === 'character') {
      const ids = CHARACTER_LIST;
      const cw = 108, cgap = 12;
      const ctotal = ids.length * cw + (ids.length - 1) * cgap;
      const cstart = (W - ctotal) / 2;
      for (let i = 0; i < ids.length; i++) {
        const x = cstart + i * (cw + cgap);
        if (dx >= x && dx <= x + cw && dy >= 420 && dy <= 588) {
          if (s.collection.unlocked.includes(ids[i])) {
            s.setCharacter(ids[i]);
            this.actor.setCharacter(ids[i]);
            this.actor.load();
            this.actor.setState('idle');
            this.app.audio && this.app.audio.tap();
          }
          return true;
        }
      }
      // 已选角色下方确认
      if (dy >= 630 && dy <= 720) {
        this.tab = 'grade';
        this.app.audio && this.app.audio.tap();
        return true;
      }
    }
    return false;
  }

  draw(ctx, vp) {
    const s = this.app.save;
    const theme = getGradeTheme(s.settings.grade);

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

    /**
     * 浮动装饰：星星 + 数学符号
     * 数学符号（+ − × ÷ =）直接呼应算术主题，
     * 避免画面只有文字、显得单调。
     */
    /**
     * ★★★ 变换必须逐个 save/restore ★★★
     * 之前的写法（循环外save一次、循环内translate不恢复）导致
     * 26 个装饰物的坐标**逐个累积偏移**，后续所有绘制全部错位——
     * 用户截图里的「嵌套白框」就是这个原因。
     */
    for (const f of this.floatItems) {
      ctx.save();
      ctx.globalAlpha = f.alpha;
      ctx.translate(f.x, f.y);
      if (f.glyph) {
        ctx.rotate(f.rot * 0.35);
        ctx.font = '700 ' + Math.round(f.size * 1.6) + 'px ' + FONT_STACK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = f.color;
        ctx.strokeText(f.glyph, 0, 0);
      } else {
        ctx.rotate(f.rot);
        ctx.fillStyle = f.color;
        UI.drawStar(ctx, 0, 0, f.size, f.size * 0.45, 5);
      }
      ctx.restore();
    }

    // —— 标题
    // 标题置于角色框下方（框底 128），避免水平方向压到角色
    // 纵向节奏：角色框(28—128) → 标题(150—216) → 副标题(232—262) → Tab(292—362)
    // 标题下移到主角舞台之下（舞台底212）
    const titleY = 256 - Math.max(0, 30 - this.enterT * 60);
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.enterT * 3);
    text(ctx, '星算速算家', W / 2, titleY, 66, COLOR.INK, {
      align: 'center', stroke: COLOR.ON_DARK, strokeWidth: 10
    });
    text(ctx, '算得越快，星星越多！', W / 2, titleY + 52, FONT.BODY, COLOR.INK_AUX, { align: 'center' });
    ctx.restore();

    // —— Tab
    this.drawTab(ctx);

    // —— 内容区
    if (this.tab === 'grade') this.drawGradeGrid(ctx, s);
    else this.drawCharacterList(ctx, s);

    // —— 底部同伴横幅（填补空白 + 气氛）
    this.drawBanner(ctx);

    // —— 主角舞台（含同伴）
    this.drawPreview(ctx);

    // —— 开始按钮
    this.drawStartBtn(ctx, s);

    ctx.restore();
  }

  drawTab(ctx) {
    const tabs = [
      { label: '选年级', active: this.tab === 'grade', x: 36, w: 294 },
      { label: '选角色', active: this.tab === 'character', x: 342, w: 294 }
    ];
    for (const t of tabs) {
      roundRect(ctx, t.x, 316, t.w, 70, 35);
      if (t.active) {
        roundRect(ctx, t.x, 321, t.w, 70, 35);
        ctx.fillStyle = COLOR.BRAND_700; ctx.fill();
        roundRect(ctx, t.x, 316, t.w, 70, 35);
        ctx.fillStyle = COLOR.GOLD; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = COLOR.GOLD_DEEP; ctx.stroke();
        text(ctx, t.label, t.x + t.w / 2, 351, FONT.QINDEX, COLOR.INK, { align: 'center' });
      } else {
        roundRect(ctx, t.x, 316, t.w, 70, 35);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = COLOR.BRAND_300; ctx.stroke();
        text(ctx, t.label, t.x + t.w / 2, 351, FONT.QINDEX, COLOR.INK_SUB, { align: 'center' });
      }
    }
  }

  drawGradeGrid(ctx, s) {
    for (let i = 0; i < 6; i++) {
      const g = GRADE_TABLE[i];
      const gp = s.data.gradeProgress[g.grade];
      const col = i % 3, row = Math.floor(i / 3);
      const x = 36 + col * 204, y = 408 + row * 148;
      const w = 184, h = 130;
      const active = s.settings.grade === g.grade;

      roundRect(ctx, x, y + 5, w, h, 22);
      ctx.fillStyle = COLOR.BRAND_700; ctx.fill();
      roundRect(ctx, x, y, w, h, 22);
      ctx.fillStyle = active ? COLOR.GOLD : COLOR.CARD_BG; ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = active ? COLOR.GOLD_DEEP : COLOR.BRAND_300; ctx.stroke();

      text(ctx, g.label, x + w / 2, y + 32, FONT.QINDEX, active ? COLOR.INK : COLOR.INK_SUB, { align: 'center' });

      // 描述：按卡内可用宽度自动分两行 + 缩放，避免长文案溢出卡片
      const desc = g.desc;
      const maxW = w - 20;
      let size = FONT.CAPTION;
      // 预估宽度：中文按1字宽，英文数字按 0.55 字宽
      const est = str => {
        let wsum = 0;
        for (const ch of str) wsum += /[\x00-\xff]/.test(ch) ? 0.55 : 1;
        return wsum * size;
      };
      // 缩到能放下
      let guard = 0;
      while (est(desc) > maxW && size > 13 && guard++ < 20) size -= 0.5;
      ctx.save();
      ctx.font = `bold ${size}px ${FONT_STACK}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = active ? COLOR.INK_SUB : COLOR.INK_AUX;
      // 超过 7 字则折成两行
      if (desc.length > 7) {
        const cut = Math.ceil(desc.length / 2);
        ctx.fillText(desc.slice(0, cut), x + w / 2, y + 58);
        ctx.fillText(desc.slice(cut), x + w / 2, y + 58 + size + 4);
      } else {
        ctx.fillText(desc, x + w / 2, y + 60);
      }
      ctx.restore();
      // 最高分
      if (gp.bestScore > 0) {
        text(ctx, `最高 ${gp.bestScore}`, x + w / 2, y + 90, FONT.CAPTION, COLOR.SUCCESS, { align: 'center' });
      }
    }
    // 当前年级说明
    const cur = GRADE_TABLE.find(g => g.grade === s.settings.grade);
    // 说明文字放在第二行卡片下方（卡片底 594+148=628，此处取 700）
    text(ctx, `${cur.label}：${cur.desc}`, W / 2, 722, FONT.BODY, COLOR.INK_SUB, { align: 'center' });
  }

  /**
   * 角色列表缩略图：带缓存
   * ⚠️ 不能每帧 new Image() —— 那样永远读不到width，只会显示占位框，
   *    且每帧新建对象是明显的性能浪费。
   */
  thumbOf(cfg) {
    if (!this._thumbs) this._thumbs = {};
    const key = cfg.id;
    if (!this._thumbs[key]) {
      this._thumbs[key] = this.app.platform.loadImage(cfg.image);
    }
    return this._thumbs[key];
  }

  drawCharacterList(ctx, s) {
    const ids = CHARACTER_LIST;
    for (let i = 0; i < ids.length; i++) {
      const cfg = CHARACTERS[ids[i]];
      // 5 只角色均分可用宽度（设计稿 672，左右边距 36，间距 12）
      const w = 108, gap = 12;
      const totalW = CHARACTER_LIST.length * w + (CHARACTER_LIST.length - 1) * gap;
      const startX = (W - totalW) / 2;
      const x = startX + i * (w + gap), y = 420, h = 168;
      const unlocked = s.collection.unlocked.includes(ids[i]);
      const active = s.profile.character === ids[i];

      roundRect(ctx, x, y + 5, w, h, 20);
      ctx.fillStyle = COLOR.BRAND_700; ctx.fill();
      roundRect(ctx, x, y, w, h, 20);
      ctx.fillStyle = active ? COLOR.GOLD : COLOR.CARD_BG; ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = active ? COLOR.GOLD_DEEP : COLOR.BRAND_300; ctx.stroke();

      // 角色预览（缓存图片）
      const img = this.thumbOf(cfg);
      if (img && img.width) {
        ctx.save();
        ctx.globalAlpha = unlocked ? 1 : 0.28;
        // contain 适配：容器 x+10..x+w-10, y+14..y+112
        UI.drawImageContain(ctx, img, x + 10, y + 14, w - 20, 98);
        ctx.restore();
      }
      text(ctx, cfg.name, x + w / 2, y + 132, FONT.CAPTION, active ? COLOR.INK : COLOR.INK_SUB, { align: 'center' });

      if (!unlocked) {
        roundRect(ctx, x + w / 2 - 16, y + 130, 32, 20, 10);
        ctx.fillStyle = COLOR.INK_AUX; ctx.fill();
        text(ctx, '锁', x + w / 2, y + 140, FONT.CAPTION, COLOR.ON_DARK, { align: 'center' });
      }
    }
    const cfg = CHARACTERS[s.profile.character];
    // 描述：放在角色卡下方（卡底 400+168=568），并按宽度自适应字号
    const descSize = measure(ctx, cfg.desc, FONT.BODY) > W - 80 ? FONT.CAPTION : FONT.BODY;
    text(ctx, cfg.desc, W / 2, 648, descSize, COLOR.INK_SUB, { align: 'center' });
  }

  /**
   * 主角舞台（大尺寸主角 + 同伴）
   * ---------------------------------------------------------------
   * 原来是左上角一个 100×100 的小框，静态、无生气。
   * 现在改成「舞台」：主角居中偏左、底座投影、2 只同伴在旁边晃悠，
   * 主角每 3.5—6 秒自动换动作（举星→跳跃→待机）。
   */
  drawPreview(ctx) {
    // 同伴（在主角后方画，避免遮挡）
    for (const c of this.crew) {
      const im = c.img;
      if (!im || !im.width) continue;
      ctx.save();
      ctx.globalAlpha = 0.9;
      // 轻微上下浮动造成的压扁感，增加体积感
      const bob = Math.sin(c.phase) * 0.02;
      ctx.translate(c.x, c.y);
      ctx.scale(1 + bob, 1 - bob);
      UI.drawImageContain(ctx, im, -c.size / 2, -c.size / 2, c.size, c.size);
      ctx.restore();
    }

    // 主角舞台：底座椭圆 + 主角
    const cx = 168, cy = 122, boxW = 200, boxH = 190;

    // 舞台底座
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = COLOR.BRAND_300;
    ctx.beginPath();
    ctx.ellipse(cx, cy + boxH / 2 - 4, boxW * 0.36, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /**
     * 主角：用 actor.getImage()取当前状态的图片对象。
     * ⚠️ 不能直接读 cfg.states —— 那是**路径字符串**，不是图片对象，
     *    传给 drawImage 会抛异常。actor 内部已按 state 缓存好图片。
     */
    const tr = this.actor.transform();
    const cur = this.actor.getImage();

    ctx.save();
    ctx.translate(cx, cy + boxH / 2 - 8 + tr.dy);
    ctx.rotate(tr.rot * 0.5);
    ctx.scale(tr.scale, tr.scale);
    // 图片未就绪时不画（不能用假对象，drawImage 会抛异常）
    if (cur && cur.width) {
      UI.drawImageContain(ctx, cur, -boxW / 2 + 8, -boxH + 8, boxW - 16, boxH - 20);
    }
    ctx.restore();
  }

  /**
   * 底部「同伴横幅」
   * ---------------------------------------------------------------
   * 原来 560—980 是一大片空白，画面重心偏上、显得空。
   * 这里画一条弧形草地，3 只同伴在上面站/走，
   * 既填补空白又强化「大家一起玩」的气氛。
   */
  drawBanner(ctx) {
    const gy = 862;                    // 草地基准线（须避开开始按钮 y=1000）
    // 弧形草地（用贝塞尔画一条起伏的绿丘）
    ctx.save();
    const g = ctx.createLinearGradient(0, gy - 40, 0, gy + 90);
    g.addColorStop(0, COLOR.BRAND_300);
    g.addColorStop(1, COLOR.BRAND_100);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-20, gy + 118);
    ctx.lineTo(-20, gy + 10);
    ctx.quadraticCurveTo(W * 0.28, gy - 46, W * 0.55, gy + 2);
    ctx.quadraticCurveTo(W * 0.82, gy + 44, W + 20, gy - 8);
    ctx.lineTo(W + 20, gy + 118);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 草地上的小花（点缀）
    const flowers = [
      { x: 96, y: gy + 24, c: COLOR.GOLD }, { x: 250, y: gy + 6, c: COLOR.PEACH },
      { x: 402, y: gy + 22, c: COLOR.SKY },{ x: 566, y: gy + 12, c: COLOR.GOLD },
      { x: 604, y: gy + 42, c: COLOR.PEACH }
    ];
    for (const f of flowers) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.translate(f.x, f.y);
      for (let i = 0; i < 5; i++) {
        ctx.rotate((i / 5) * Math.PI * 2);
        ctx.fillStyle = f.c;
        ctx.beginPath();
        ctx.ellipse(0, -5, 3.4, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = COLOR.GOLD_DEEP;
      ctx.beginPath();
      ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 草地线上的 3 只同伴（每只是不同的角色，避免「三只兔子」的重复感）
    const walkers = [
      { x: 120, size: 78, spd: 0.30, range: 34, img: this.crewImg(0) },
      { x: 336, size: 88, spd: 0.22, range: 28, img: this.crewImg(1) },
      { x: 552, size: 74, spd: 0.36, range: 36, img: this.crewImg(2) }
    ];
    for (const w of walkers) {
      if (!w.img || !w.img.width) continue;
      // 走位：以 base x 为中心往返
      const px = w.x + Math.sin(this.t * w.spd) * w.range;
      const hop = Math.abs(Math.sin(this.t * w.spd * 2.2)) * 4;   // 走动时的轻微弹跳
      ctx.save();
      ctx.translate(px, gy - 4 - hop);
      // 走动时轻微侧倾，幅度随速度
      ctx.rotate(Math.cos(this.t * w.spd) * 0.05);
      UI.drawImageContain(ctx, w.img, -w.size / 2, -w.size, w.size, w.size);
      // 地面投影
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = COLOR.BRAND_700;
      ctx.beginPath();
      ctx.ellipse(0, 4, w.size * 0.3, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * 取同伴图片：取「与主角不同」的角色，前3 只互不相同。
   * 否则会出现「三只一模一样的兔子」，视觉上很假。
   */
  crewImg(i) {
    if (!this._crewImgs) this._crewImgs = {};
    if (this._crewImgs[i]) return this._crewImgs[i];
    // ★ 主角 id 要做兜底：actor.cfg 未就绪时过滤会失效，全取第一只→ 三只都一样
    const heroId = (this.actor && this.actor.cfg && this.actor.cfg.id) || this.app.save.profile.character;
    const others = CHARACTER_LIST.filter(x => x !== heroId);
    const id = others.length ? others[i % others.length] : CHARACTER_LIST[i % CHARACTER_LIST.length];
    this._crewImgs[i] = this.app.platform.loadImage(CHARACTERS[id].image);
    return this._crewImgs[i];
  }

  /** 同伴角色（供角色页复用） */
  drawCrew(ctx) {
    for (const c of this.crew) {
      const im = c.img;
      if (!im || !im.width) continue;
      ctx.save();
      const bob = Math.sin(c.phase) * 0.02;
      ctx.translate(c.x, c.y);
      ctx.scale(1 + bob, 1 - bob);
      UI.drawImageContain(ctx, im, -c.size / 2, -c.size / 2, c.size, c.size);
      ctx.restore();
    }
  }

  drawStartBtn(ctx, s) {
    const x = 136, y = 1000, w = 400, h = 120;
    const pressed = this.pressedBtn === 'start';
    const oy = pressed ? 5 : 0;

    roundRect(ctx, x, y + 6 - oy, w, h, 60);
    ctx.fillStyle = COLOR.BRAND_700; ctx.fill();
    roundRect(ctx, x, y - oy, w, h, 60);
    ctx.fillStyle = COLOR.SUCCESS_LIGHT; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = COLOR.SUCCESS; ctx.stroke();

    text(ctx, '开始游戏', x + w / 2, y + h / 2 - oy, 44, COLOR.ON_DARK, {
      align: 'center', stroke: COLOR.SUCCESS, strokeWidth: 6
    });
  }
}
try { exports.HomeScene = HomeScene; } catch (e) {}
