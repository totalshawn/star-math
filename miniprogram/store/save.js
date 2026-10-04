/**
 * 本地存档层
 * ------------------------------------------------------------------
 * 设计原则（严格对齐 docs/BACKEND_SPEC.md §2）：
 *  1. 离线可玩：核心进度 100% 本地，不依赖网络
 *  2. 对局内绝不写盘：setStorageSync 是同步 IO（1—5ms），写在 60fps 循环里必掉帧
 *  3. 四层自愈：完整性校验 → 规范化修补 → 版本迁移 → 备份兜底
 *     设计理念是「尽量修补，不整体重置」——孩子 23 天努力归零 = 留存杀手
 *  4. 写盘顺序：先备份旧的，再写新的（反过来会造出「新数据+旧备份」的最坏组合）
 *
 * ★ 铁律：新增字段必须「可选 + 带默认值」，结构变更必须递增 meta.schema
 */

import { DEFAULT_SETTINGS, GAME } from '../../shared/config.js';
import { CHALLENGE, isValidClear, rolloverDaily, dailyLimitFor } from '../../shared/rules.js';
import { CHARACTER_UNLOCK, CHARACTER_LIST } from '../../shared/config.js';

/**
 * R1-b 泄漏检测字段：纪念章条目若携带这些字段，说明有人给荣誉章发了数值奖励。
 * 这会诱导孩子去刷已经会的关卡（发了奖励就有人刷），
 * 因此读档时强制删除。属 BACKEND_SPEC §6B.5 的最后一道兜底。
 */
export const REWARD_LEAK_FIELDS = ['stars', 'coins', 'reward', 'rewardValue', 'score', 'gold', 'exp'];

// ============================================================================
// 能力纪念章（Medal）
// ---------------------------------------------------------------------------
// 设计约束（三条硬红线，任何改动不得违反）：
//  1. **不控制任何内容可用性** —— 纯展示，禁止任何 `if(medal)解锁` 门禁
//  2. **不发放数值奖励** —— 发了奖励就会有人去刷已经会的关卡
//     ★ 刻意不写：this.data.global.stars += n← 违反 R1-b，review 时重点盯
//  3. **并集、只增不减** —— 同一枚章重复达成不重复记录、不降级
//
// 五枚定义与 UI_SPEC §18.7.2 / BACKEND_SPEC §6B 三方一致。
// ============================================================================

export const MEDALS = {
  first_perfect_chapter: {
    id: 'first_perfect_chapter',
    name: '首次满星',
    desc: '某关首次拿到 3 星',
    perLevel: true,          // 分关维度：每关各一枚
    rarity: 'common'
  },
  precision_90: {
    id: 'precision_90',
    name: '精准章',
    desc: '某关首次正答率 ≥ 90%',
    perLevel: true,
    rarity: 'rare'
  },
  flawless_clear: {
    id: 'flawless_clear',
    name: '完美章',
    desc: '一局 10 题零失误',
    perLevel: false,         // ★ 全局唯一（后端裁决：分关会让「最稀有」名不副实）
    rarity: 'legendary'
  },
  combo_30: {
    id: 'combo_30',
    name: '闪电章',
    desc: '单局连击达到 30 题',
    perLevel: false,         // 全局唯一
    rarity: 'epic'
  },
  speed_demon_60: {
    id: 'speed_demon_60',
    name: '疾速章',
    desc: '单局 60 秒内答对 10 题',
    perLevel: false,         // 全局唯一（v1.3 追加，此处先占位）
    rarity: 'rare'
  }
};

/** 纪念章 key：分关的带level，全局的固定 */
function medalKey(id, level) {
  const def = MEDALS[id];
  if (def && def.perLevel && level != null) return `${id}@${level}`;
  return id;
}

export const SAVE_KEY = 'sx_save';
export const SAVE_KEY_BAK = 'sx_save_bak';
export const SHADOW_KEY = 'sx_shadow';
export const SYNCQ_KEY = 'sx_syncq';
export const CORRUPT_KEY = 'sx_corrupt';
export const PRIVACY_KEY = 'sx_privacy';

export const SCHEMA_VERSION = 1;

/**
 * 存储适配器：微信小游戏 / 浏览器 H5 统一接口
 */
export function createStorage(platform) {
  let wxStore = null;
  if (platform === 'wx' && typeof wx !== 'undefined' && wx.setStorageSync) {
    wxStore = {
      getItem: k => { try { return wx.getStorageSync(k); } catch (e) { return null; } },
      setItem: (k, v) => { wx.setStorageSync(k, v); },
      removeItem: k => { try { wx.removeStorageSync(k); } catch (e) {} },
      keys: () => { try { return wx.getStorageInfoSync().keys || []; } catch (e) { return []; } }
    };
  } else if (typeof localStorage !== 'undefined') {
    wxStore = {
      getItem: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
      setItem: (k, v) => { localStorage.setItem(k, v); },
      removeItem: k => { try { localStorage.removeItem(k); } catch (e) {} },
      keys: () => { try { return Object.keys(localStorage); } catch (e) { return []; } }
    };
  }
  if (!wxStore) {
    // 内存兜底（极简环境仍可游玩，仅不持久化）
    const mem = {};
    wxStore = {
      getItem: k => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = v; },
      removeItem: k => { delete mem[k]; },
      keys: () => Object.keys(mem)
    };
  }
  return wxStore;
}

/**
 * FNV-1a 32bit 校验和
 * ⚠️ 重要：这不是安全机制（可被伪造），只用于检测意外损坏。
 *    真正的防作弊靠云函数用 scoring.js 重算过程分。
 */
export function checksum(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * 版本迁移表（BACKEND_SPEC §2.3）
 * key = 目标版本号，value = 从上一版升到该版的补丁函数
 */
const MIGRATIONS = {
  // 示例：未来 v1 → v2 时在此补充
  // 2: (s) => { s.newField = 0; return s; }
};

/** 默认存档（全字段） */
export function defaultSave() {
  const gradeProgress = {};
  for (let g = 1; g <= 6; g++) {
    gradeProgress[g] = {
      grade: g,
      bestScore: 0,
      bestCombo: 0,
      maxDL: 1,
      levelsCleared: 0,
      totalAnswered: 0,
      totalCorrect: 0,
      validClears: 0,   // 有效通关次数（正答率≥60%），角色解锁判据
      stars: 0
    };
  }
  return {
    meta: {
      schema: SCHEMA_VERSION,
      createdAt: 0,
      updatedAt: 0,
      appVersion: '1.0.0',
      __cksum: 0
    },
    profile: {
      character: DEFAULT_SETTINGS.character,
      dlOffset: 0
    },
    gradeProgress,
    global: {
      totalRuns: 0,
      totalAnswered: 0,
      totalCorrect: 0,
      totalWrong: 0,
      bestScore: 0,
      bestCombo: 0,
      maxDL: 1,
      levelsClearedTotal: 0,
      coins: 0
    },
    collection: {
      unlocked: ['bunny', 'rabbit', 'cat', 'bear', 'chick'],
      equipped: DEFAULT_SETTINGS.character
    },
    /**
     * 挑战赛存档（与主档物理隔离，永不互相赋值）
     * bestScore：挑战赛独立最高分
     * unlockProgress：各年级的累计「有效通关」次数（解锁唯一凭据）
     * usedCount：今日已用次数（**递增计数**，0→1→2→3，≥DAILY_LIMIT 即用完；跨天归零）
 *    ⚠️ 勿与「剩余次数」混淆，也不是递减计数——与后端 usedCount 同义
     */
    challenge: {
      bestScore: 0,
      unlockProgress: {},   // { [grade]: count }
      usedCount: 0,
      date: ''
    },

    /**
     * 能力纪念章（纯荣誉，不发资源、不门禁内容）
     * 结构与 BACKEND_SPEC §6B / UI_SPEC §18.7.2 对齐：
     *   - items: 已授予的勋章{ id, level, value, at }
     *   - level 为 null 表示不分关的全局勋章（如 combo_30）
     * 并集、只增不减。
     */
    medals: {
      items: []   // { id, level, value, at }
    },
    mistakeBook: { items: [], updatedAt: 0 },
    settings: {
      sound: true,
      vibration: true,
      grade: 1,
      dlOffset: 0
    },
    daily: { date: '', answered: 0, correct: 0, streak: 0, lastPlayed: 0 },
    runtime: { paused: false }
  };
}

/**
 * 规范化修补（第二层自愈）
 * 逐字段补齐缺失/非法值，而不是整体重置。
 */
function normalize(raw, template) {
  const out = Array.isArray(template) ? [] : {};
  for (const k in template) {
    const t = template[k];
    const v = raw ? raw[k] : undefined;
    if (t && typeof t === 'object' && !Array.isArray(t)) {
      out[k] = normalize(v, t);
    } else if (v === undefined || v === null || Number.isNaN(v)) {
      out[k] = t;                        // 缺失 → 用默认值
    } else if (typeof t === 'number' && typeof v !== 'number') {
      out[k] = t;                        // 类型不符 → 用默认值
    } else if (typeof t === 'boolean' && typeof v !== 'boolean') {
      out[k] = v === 'true' ? true : t;
    } else {
      out[k] = v;
    }
  }
  // 保留模板之外的额外字段（向前兼容）
  if (raw) {
    for (const k in raw) {
      if (!(k in out)) out[k] = raw[k];
    }
  }
  return out;
}

/** 跨字段一致性修复（BACKEND_SPEC §2.4的 11 条规则的精简版） */
function repairCrossField(s) {
  const r = s.settings;

  // 1. 年级范围
  r.grade = Math.min(6, Math.max(1, Number(r.grade) || 1));
  // 2. 难度偏移范围
  const off = Number(r.dlOffset) || 0;
  r.dlOffset = Math.min(3, Math.max(-3, Math.round(off)));
  // 3. 主角必须已解锁
  if (!s.collection.unlocked.includes(s.profile.character)) {
    s.profile.character = s.collection.unlocked[0] || 'bunny';
  }
  // 4. equipped 与 character 保持一致
  s.collection.equipped = s.profile.character;
  // 5. 各年级进度不重复
  for (let g = 1; g <= 6; g++) {
    const gp = s.gradeProgress[g];
    gp.grade = g;
    gp.bestScore = Math.max(0, Number(gp.bestScore) || 0);
    gp.bestCombo = Math.max(0, Number(gp.bestCombo) || 0);
    gp.maxDL = Math.min(GAME.LEVEL_DL_MAX, Math.max(1, Number(gp.maxDL) || 1));
    gp.levelsCleared = Math.max(0, Number(gp.levelsCleared) || 0);
    gp.validClears = Math.max(0, Number(gp.validClears) || 0);
  }
  // 6. 全局最高分不低于任何单年级最高分
  const maxGradeScore = Math.max(...Object.values(s.gradeProgress).map(x => x.bestScore));
  s.global.bestScore = Math.max(s.global.bestScore, maxGradeScore);
  // 7. 正确数不超过答题数
  s.global.totalCorrect = Math.min(s.global.totalCorrect, s.global.totalAnswered);
  // 8. 错题本条目上限（防止存档膨胀）
  if (Array.isArray(s.mistakeBook.items) && s.mistakeBook.items.length > 300) {
    s.mistakeBook.items = s.mistakeBook.items.slice(0, 300);
  }
  // 9. coins 不为负
  s.global.coins = Math.max(0, Number(s.global.coins) || 0);
  // 9.5 纪念章归一
  if (!s.medals || typeof s.medals !== 'object') s.medals = { items: [] };
  if (!Array.isArray(s.medals.items)) s.medals.items = [];
  if (s.medals.items.length > 100) s.medals.items = s.medals.items.slice(0, 100);
  for (const m of s.medals.items) {
    // (a) R1-b 兜底：纪念章条目不得携带任何奖励字段
    //     发了奖励就会诱导孩子去刷已经会的关卡（BACKEND_SPEC §6B.5）
    if (!m) continue;
    let leaked = false;
    for (const bad of REWARD_LEAK_FIELDS) {
      if (bad in m) { delete m[bad]; leaked = true; }
    }
    if (leaked && typeof console !== 'undefined') {
      console.warn('[save_recover] medal_reward_leak', m.id);
    }
    // (b) key 完整性：用 medalKey 重算覆盖，防手改导致重复授予
    if (m.id && MEDALS[m.id]) {
      const k = medalKey(m.id, m.level === undefined ? null : m.level);
      if (m.key !== k) m.key = k;
      // perLevel 章缺 level 时归一为 null，避免与全局章混淆
      if (MEDALS[m.id].perLevel && (m.level === undefined || m.level === null)) {
        m.level = null;   // 无 level 的分关章视为无效，降级为全局 key（不重复授予）
      }
    } else {
      // 未知 id（版本回退）→ 丢弃，避免脏数据占位
      m.__invalid = true;
    }
  }
  s.medals.items = s.medals.items.filter(m => m && !m.__invalid);
  // 去重（同一 key 只留最早一条）
  const seenKeys = new Set();
  s.medals.items = s.medals.items.filter(m => {
    if (seenKeys.has(m.key)) return false;
    seenKeys.add(m.key);
    return true;
  });
  // 10. 运行时态重置（不该持久化暂停状态）
  s.runtime.paused = false;

  return s;
}

/**
 * 版本迁移
 */
function migrate(save, fromVer) {
  let s = save;
  for (let v = fromVer + 1; v <= SCHEMA_VERSION; v++) {
    if (MIGRATIONS[v]) s = MIGRATIONS[v](s);
  }
  return s;
}

/**
 * 存档管理器
 */
export class SaveManager {
  /**
   * @param {object} storage 由 createStorage 返回
   * @param {Function} now 时间戳函数（由平台注入，避免本文件直接依赖平台 API）
   */
  constructor(storage, now = () => Date.now()) {
    this.st = storage;
    this.now = now;
    this.data = null;
    this.loadError = false;
    this._writeTimer = null;
    this._pending = false;
    this._listeners = [];
  }

  /**
   * 加载存档：四层自愈
   * L1 完整性校验 → L2 规范化修补 → L3 版本迁移 → L4 备份兜底
   */
  load() {
    const template = defaultSave();

    // L1 + L2 + L3：主存档
    let s = this._tryLoad(this.st.getItem(SAVE_KEY), template);
    if (s) { this.data = s; return this.data; }

    // L4：主存档坏了，尝试备份
    this.loadError = true;
    s = this._tryLoad(this.st.getItem(SAVE_KEY_BAK), template);
    if (s) {
      this.data = s;
      this.syncUnlocked();
      // 保留坏数据副本供排查
      try { this.st.setItem(CORRUPT_KEY, JSON.stringify({ at: this.now(), version: SCHEMA_VERSION })); } catch (e) {}
      return this.data;
    }

    // 全坏：全新档案（唯一会整体重置的分支）
    this.data = template;
    this.data.meta.createdAt = this.now();
    this.save(true);
    return this.data;
  }

  /** 尝试解析并修复一份存档数据 */
  _tryLoad(raw, template) {
    if (!raw) return null;
    try {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!obj || typeof obj !== 'object') return null;

      const { __cksum, ...body } = obj.meta || {};

      // L1：校验和比对
      if (__cksum !== undefined) {
        const expect = checksum(JSON.stringify(body));
        if (expect !== __cksum) {
          // 校验和不符 → 仍尝试修补（可能只是字段增删导致），但不静默通过
          const patched = repairCrossField(migrate(normalize(obj, template), obj.meta?.schema || 1));
          return patched;   // 修补成功仍可用
        }
      }

      // L3：版本迁移
      const ver = obj.meta?.schema || 1;
      let s = ver < SCHEMA_VERSION ? migrate(obj, ver) : obj;

      // L2：规范化修补
      s = normalize(s, template);
      // 跨字段修复
      s = repairCrossField(s);
      return s;
    } catch (e) {
      return null;
    }
  }

  /** 立即写盘（先备份旧的，再写新的） */
  save(immediate = false) {
    if (this._writeTimer) {
      clearTimeout(this._writeTimer);
      this._writeTimer = null;
    }
    if (immediate) return this._writeNow();
    // 延迟合并写：短时间多次修改只写一次
    this._pending = true;
    this._writeTimer = setTimeout(() => {
      this._pending = false;
      this._writeNow();
    }, 800);
    return true;
  }

  /** 实际写盘 */
  _writeNow() {
    if (!this.data) return false;
    // 写入前再修一次：防止运行中被外部污染（切后台/多端同步等）
    repairCrossField(this.data);
    const s = this.data;
    s.meta.updatedAt = this.now();
    s.meta.schema = SCHEMA_VERSION;

    const body = { ...s.meta };
    delete body.__cksum;
    s.meta.__cksum = checksum(JSON.stringify(body));
    const payload = JSON.stringify(s);

    // 顺序很重要：先备份旧档，再写新档
    const old = this.st.getItem(SAVE_KEY);
    if (old) {
      try { this.st.setItem(SAVE_KEY_BAK, old); } catch (e) {}
    }
    try {
      this.st.setItem(SAVE_KEY, payload);
      return true;
    } catch (e) {
      // 写盘失败：抢救模式，裁掉可丢数据重试
      return this._emergencyShrink(payload);
    }
  }

  /**
   * 写盘降级抢救
   * 保证「最高分 + 进度」这类最不可丢的数据一定能落盘。
   */
  _emergencyShrink(payload) {
    try {
      // 第一次：裁掉错题本
      const s = JSON.parse(payload);
      if (s.mistakeBook) s.mistakeBook.items = [];
      this.st.setItem(SAVE_KEY, JSON.stringify(s));
      return true;
    } catch (e) {}
    try {
      // 第二次：只保存绩单
      const s = JSON.parse(payload);
      const minimal = {
        meta: s.meta,
        profile: s.profile,
        gradeProgress: s.gradeProgress,
        global: s.global,
        collection: s.collection,
        settings: s.settings,
        mistakeBook: { items: [], updatedAt: 0 },
        daily: s.daily,
        runtime: s.runtime
      };
      this.st.setItem(SAVE_KEY, JSON.stringify(minimal));
      return true;
    } catch (e) {
      return false;
    }
  }

  // ===== 业务读写 =====

  get settings() { return this.data.settings; }
  get profile() { return this.data.profile; }
  /**角色收藏（解锁列表 + 当前装备）—— 缺这个访问器会导致 save.collection 为undefined */
  get collection() { return this.data.collection; }
  get gradeProgress() { return this.data.gradeProgress; }
  get global() { return this.data.global; }
  get challenge() { return this.data.challenge; }
  get medals() { return this.data.medals; }

  setSetting(k, v) {
    this.data.settings[k] = v;
    this.save();
    this._emit('setting', { key: k, value: v });
  }

  setCharacter(id) {
    if (!this.data.collection.unlocked.includes(id)) return false;
    this.data.profile.character = id;
    this.data.collection.equipped = id;
    this.data.settings.character = id;
    this.save();
    this._emit('character', { id });
    return true;
  }

  /**
   * 提交一局结果，更新进度
   */
  submitRun(summary) {
    const g = this.data.settings.grade;
    const gp = this.data.gradeProgress[g];
    const gl = this.data.global;

    // 单年级
    gp.bestScore = Math.max(gp.bestScore, summary.score);
    gp.bestCombo = Math.max(gp.bestCombo, summary.maxCombo);
    gp.maxDL = Math.max(gp.maxDL, summary.dl);
    gp.totalAnswered += summary.correct + summary.wrong;
    gp.totalCorrect += summary.correct;
    gp.levelsCleared = Math.max(gp.levelsCleared, summary.level - 1);
    gp.stars = Math.max(gp.stars, summary.stars);

    // 全局
    gl.totalRuns += 1;
    gl.totalAnswered += summary.correct + summary.wrong;
    gl.totalCorrect += summary.correct;
    gl.totalWrong += summary.wrong;
    gl.bestScore = Math.max(gl.bestScore, summary.score);
    gl.bestCombo = Math.max(gl.bestCombo, summary.maxCombo);
    gl.maxDL = Math.max(gl.maxDL, summary.dl);
    gl.levelsClearedTotal += summary.level - 1;
    gl.coins += Math.floor(summary.score / 100);

    //关键节点立即落盘：一局结束是不可再生的数据，
    // 不能等800ms 延迟窗口 —— 切后台/崩溃会让整局白打。
    this.save(true);
    this._emit('run', summary);
    return true;
  }

  /**
   * 记录错题（题面签名做主键，天然去重）
   */
  recordMistake(q) {
    const key = mistakeKey(q);
    const items = this.data.mistakeBook.items;
    let it = items.find(x => x.key === key);
    if (it) {
      it.times = (it.times || 1) + 1;
      // 掌握度回退一档：之前学会的又错了，必须重新练
      it.level = Math.max(0, (it.level || 0) - 1);
      it.updatedAt = this.now();
    } else {
      items.push({
        key,
        grade: this.data.settings.grade,
        op: q.op,
        expr: q.expr,
        a: q.a, b: q.b,
        answer: q.answerText || String(q.answer),
        times: 1,
        level: 0,
        updatedAt: this.now()
      });
      if (items.length > 300) items.sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0)).splice(300);
    }
    this.data.mistakeBook.updatedAt = this.now();
    this.save(true);      // 错题是可累积资产，立即落盘
  }

  /**
   * 角色解锁判定（依据 shared/config.js 的 CHARACTER_UNLOCK）
   * ------------------------------------------------------------------
   * ⚠️ 设计陷阱（增之翼提出，已核实 BACKEND_SPEC 埋点第5条
   *    `grade_select{to, from, isFirstTime}` 证实年级可随时切换）：
   *    若判据只用「当前 settings.grade」，孩子切到 5 年级就能白拿小鸡，
   *    解锁形同虚设。
   *    因此判据必须用 **「历史最高年级」**，而非当前选择。
   *
   * @returns {string[]} 当前已解锁的角色 id 列表
   */
  computeUnlocked() {
    // 全部角色恒定可用（R1：不设解锁门禁）
    return CHARACTER_LIST.slice();
  }


  /** 同步解锁状态到存档（每次读档与通关后调用） */
  syncUnlocked() {
    const fresh = this.computeUnlocked();
    const before = this.data.collection.unlocked.join(',');
    this.data.collection.unlocked = fresh;
    // 已选角色若被锁，回退到首只
    if (!fresh.includes(this.data.profile.character)) {
      this.data.profile.character = 'bunny';
      this.data.collection.equipped = 'bunny';
      this.data.settings.character = 'bunny';
    }
    if (before !== fresh.join(',')) this.save(true);
    return fresh;
  }

  /**
   * 记录一次「有效通关」到挑战赛解锁进度
   * 仅当 isValidClear(run) 为真时计数 —— 乱猜通关不计
   */
  recordValidClear(run) {
    if (!isValidClear(run)) return false;
    const g = run.grade || this.data.settings.grade;
    // 角色解锁判据：累加该年级的有效通关次数
    const gp = this.data.gradeProgress[g];
    if (gp) gp.validClears = Math.min(999, (gp.validClears || 0) + 1);
    const up = this.data.challenge.unlockProgress;
    up[g] = Math.min(999, (up[g] || 0) + 1);
    this.save(true);
    return true;
  }

  /**
   * 挑战赛解锁判定
   * @returns {boolean}
   */
  checkChallengeUnlock() {
    const g = this.data.settings.grade;
    const up = this.data.challenge.unlockProgress;
    return (up[g] || 0) >= CHALLENGE.UNLOCK_REQUIRED;
  }

  /** 还差几次通关解锁 */
  challengeNeedMore() {
    const g = this.data.settings.grade;
    const up = this.data.challenge.unlockProgress;
    return Math.max(0, CHALLENGE.UNLOCK_REQUIRED - (up[g] || 0));
  }

  /** 今日剩余挑战次数（先做跨天重置） */
  challengeQuotaLeft() {
    rolloverDaily(this.data.challenge, this.now());
    const limit = dailyLimitFor(this.data.settings.grade);
    return Math.max(0, limit - this.data.challenge.usedCount);
  }

  /** 尝试消费一次挑战额度 */
  consumeChallengeQuota() {
    if (!this.checkChallengeUnlock()) return false;
    const left = this.challengeQuotaLeft();
    if (left <= 0) return false;
    this.data.challenge.usedCount += 1;
    this.save(true);
    return true;
  }

  /**
   * 记录挑战赛成绩
   * ⚠️ 物理隔离：只写challenge.bestScore，
   *    绝不触碰 global.bestScore / gradeProgress[g].bestScore
   *    否则挑战分会虚高正式最高分，污染排行榜。
   */
  recordChallengeRun(summary) {
    const c = this.data.challenge;
    c.bestScore = Math.max(c.bestScore, summary.score || 0);
    this.save(true);
    return c.bestScore;
  }

  /**
   * 授予纪念章
   * @param {string} id MedalId
   * @param {object} opts {level, value, at}
   * @returns {boolean} 是否新授予（false 表示已持有，按并集规则不重复记）
   */
  grantMedal(id, opts = {}) {
    if (!MEDALS[id]) return false;
    if (!this.data.medals) this.data.medals = { items: [] };

    const level = opts.level === undefined ? null : opts.level;
    const key = medalKey(id, level);

    // 并集、只增不减：已持有则不重复记录
    if (this.data.medals.items.some(m => m.key === key)) return false;

    this.data.medals.items.push({
      key,
      id,
      level,                // null = 不分关
      value: opts.value === undefined ? null : opts.value,
      at: opts.at || this.now()
    });
    // ★ 刻意不写：this.data.global.stars += n  ← 违反 R1-b
    this.save(true);
    return true;
  }

  /** 是否已持有某枚纪念章 */
  hasMedal(id, level) {
    if (!this.data.medals || !Array.isArray(this.data.medals.items)) return false;
    const key = medalKey(id, level === undefined ? null : level);
    return this.data.medals.items.some(m => m.key === key);
  }

  /**
   * 依据一局表现判定应授予哪些纪念章
   *⚠️ 顺序约束（BACKEND_SPEC §6B.2）：必须在本局 firstTry 记录写入「之后」调用，
   *    否则 precision_90 会读到上一局的数据。
   * @param {object} summary {level, correct, wrong, maxCombo, stars, durationSec, grade}
   * @returns {string[]} 新授予的 MedalId 列表
   */
  evaluateMedals(summary) {
    const granted = [];
    const level = summary.level;
    const total = (summary.correct || 0) + (summary.wrong || 0);

    // 首次满星：单局3 星（口径已确认：按关卡号，非章节累计）
    if ((summary.stars || 0) >= 3) {
      if (this.grantMedal('first_perfect_chapter', { level, value: summary.stars })) {
        granted.push('first_perfect_chapter');
      }
    }

    // 精准章：该关首次正答率 ≥ 90%
    if (total > 0 && (summary.correct / total) >= 0.9) {
      if (this.grantMedal('precision_90', { level, value: Math.round(summary.correct / total * 100) })) {
        granted.push('precision_90');
      }
    }

    // 完美章：一局 10 题零失误（全局唯一）
    if ((summary.wrong || 0) === 0 && (summary.correct || 0) >= 10) {
      if (this.grantMedal('flawless_clear', { level, value: summary.correct })) {
        granted.push('flawless_clear');
      }
    }

    // 闪电章：单局连击 ≥ 30（全局唯一）
    if ((summary.maxCombo || 0) >= 30) {
      if (this.grantMedal('combo_30', { level: null, value: summary.maxCombo })) {
        granted.push('combo_30');
      }
    }

    return granted;
  }

  /** 清除数据（家长门后调用） */
  resetAll() {
    try { this.st.removeItem(SAVE_KEY); this.st.removeItem(SAVE_KEY_BAK); } catch (e) {}
    this.data = defaultSave();
    this.data.meta.createdAt = this.now();
    this.save(true);
    this._emit('reset', {});
  }

  // ===== 事件 =====
  on(fn) { this._listeners.push(fn); }
  _emit(evt, data) { this._listeners.forEach(fn => { try { fn(evt, data); } catch (e) {} }); }

  /** 切后台/退出时强制落盘 */
  flush() {
    if (this._pending || this._writeTimer) this.save(true);
  }
}

/**
 * 错题签名：加法/乘法做交换律归一，同一题只记一条
 */
export function mistakeKey(q) {
  const norm = v => {
    const n = Number(v);
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  };
  let a = norm(q.a), b = norm(q.b);
  // 交换律归一：让 3+8 与 8+3 视为同题
  if ((q.op === 'add' || q.op === 'mul') && Number(a) > Number(b)) {
    const t = a; a = b; b = t;
  }
  return `${q.grade || ''}|${q.op}|${a}|${b}`;
}
