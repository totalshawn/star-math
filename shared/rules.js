/**
 * 玩法规则常量（防刷设计固化）
 * ------------------------------------------------------------------
 * 严格对齐 GROWTH_SPEC §2.2 + BACKEND_SPEC §3.1。
 * 这些值是「防刷」的单一事实源，改这里即可，不要散落到各处。
 *
 * 【为什么要防刷】
 * 结算页的「再来 90 秒」是最高优先级的增长入口，
 * 但它天然是一个「无成本重复得分」通道。若不做隔离：
 *   挑战分会虚高正式最高分 → 排行榜失真 → 云端奖励被刷 → 数据全废。
 */

/** 挑战赛规则 */
export const CHALLENGE = {
  /** 挑战时长（秒）—— 复刻参考视频结算页的「90秒」 */
  TIME: 90,

  /**
   * 解锁所需：累计「有效通关」次数
   * ⚠️ 必须是累计值，不能用「任一关通关过」——
   * 否则玩家会故意不通关、只刷挑战（主关卡是 10 题/关，
   * 刷挑战的边际收益远高于硬啃主关）。
   */
  UNLOCK_REQUIRED: 3,

  /**
   * 「有效通关」的定义（增之翼 fix1 补充，防「乱猜通关」绕过）
   * 必须同时满足：主模式 + 本关首次正答率达标
   */
  VALID_CLEAR_MIN_ACCURACY: 0.6,

  /** 每日挑战次数上限（默认年级） */
  DAILY_LIMIT: 3,

  /**
   * 低年级封顶：1—2 年级每天只给 1 次（GROWTH_SPEC A5）
   * 理由：低年级孩子自控力弱，90 秒挑战的连续作答会诱发疲劳与挫败，
   * 且他们更需要「明天再来」的短期待。
   * 未列出的年级用 DAILY_LIMIT。
   */
  GRADE_DAILY_LIMIT: { 1: 1, 2: 1 },

  /**
   * 挑战赛内的难度等级上限锁死
   * 防止在 DL 高位反复收割分数（DL 越高单题分越高）
   * 取年级基准，不允许通过打上去
   */
  LOCK_DL_AT_BASE: true,

  /** 挑战赛独立计分——不写入主档任何字段 */
  ISOLATED: true
};

/**
 * 有效通关判定
 * @param {object} run 本局摘要
 * @returns {boolean}
 */
export function isValidClear(run) {
  if (!run || run.mode !== 'main') return false;      // 挑战赛不算
  const total = (run.correct || 0) + (run.wrong || 0);
  if (total <= 0) return false;
  const acc = run.correct / total;
  return acc >= CHALLENGE.VALID_CLEAR_MIN_ACCURACY;
}

/**
 * 取某年级的每日挑战额度上限
 * 1—2 年级每天 1 次（CHALLENGE.GRADE_DAILY_LIMIT），其余用统一 DAILY_LIMIT
 * @param {number} grade
 * @returns {number}
 */
export function dailyLimitFor(grade) {
  const byGrade = CHALLENGE.GRADE_DAILY_LIMIT[grade];
  return typeof byGrade === 'number' ? byGrade : CHALLENGE.DAILY_LIMIT;
}

/**
 * 跨天判定：返回本地日期字符串 YYYY-MM-DD
 * 用传入的 now（避免本文件直接依赖平台 API）
 */
export function todayStr(now = Date.now()) {
  const d = new Date(now);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 跨天则重置每日计数
 * @returns {boolean} 是否发生了重置
 */
export function rolloverDaily(challenge, now = Date.now()) {
  const today = todayStr(now);
  if (challenge.date !== today) {
    challenge.date = today;
    challenge.usedCount = 0;      // 每日额度归零
    return true;
  }
  return false;
}