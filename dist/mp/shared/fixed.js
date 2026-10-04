/**
 * 定点数运算（scale = 100，即「分」为单位）
 * ------------------------------------------------------------------
 * 【为什么必须有这个模块】
 * 小学速算游戏里答案必须**精确**，浮点误差会直接导致孩子输对被判错：
 *     76.3 × 6.8 = 518.8399999999999   （真实值 518.84）
 *     1.005 × 2.5 = 2.5124999999999997（真实值 2.5125）
 * 误差 6.1e-5 已远超 1e-6 容差判定阈值。
 *
 * 【三种错误做法，都不行】
 *  1. Math.round(n * 100) / 100 —— 只在最终出口兜一次，
 *     但中间计算已污染，且 BigInt(518.8399999999999*100) 会直接抛错。
 *  2. toFixed(2) 后 parseFloat —— 同上，且引入字符串往返二次误差。
 *  3. 拿 epsilon 一层层兜 —— 阈值难以确定，跨引擎行为仍不一致。
 *
 * 【正确做法】
 * 全程用整数运算，任何环节都不出现浮点：
 *   解析：读十进制字符串 → 整数分值（不经由 Number 参与小数部分）
 *   运算：整数加减乘除 → 整数分值
 *   输出：整数分值 → 定点字符串（精确十进制，可往返）
 *
 * 本模块同时被 shared/difficulty.js（客户端出题）
 * 与云函数 verifyAnswer（服务端重算）复用，保证两端位级一致。
 */

/** 标度：两位小数 = 100 */
const SCALE = 100;
/** 结果除以标度后的缩放因子（如两位小数相乘 → 除以 SCALE²） */
const SCALE_SQ = SCALE * SCALE;

/**
 * 规范化十进制字符串 → 定点整数（单位：分）
 * 彻底避开浮点：按字符串分段解析，不经Number 计算小数部分。
 *
 * @param {string|number} v
 * @returns {number} 定点整数
 */
function toFixedInt(v) {
  const s = String(v).trim();
  if (!s) return 0;

  let sign = 1;
  let body = s;
  if (body[0] === '-') { sign = -1; body = body.slice(1); }
  else if (body[0] === '+') { body = body.slice(1); }

  const dot = body.indexOf('.');
  let intPart, fracPart;
  if (dot < 0) {
    intPart = body;
    fracPart = '';
  } else {
    intPart = body.slice(0, dot) || '0';
    fracPart = body.slice(dot + 1);
    /**
     * 严格校验：只允许一个小数点。
     * 旧实现会静默截断 '1.2.3' → 1.23、'1..2' → 1.2，
     * 这在防篡改场景是危险的——畸形输入算出了一个「看似合理」的答案，
     * 攻击者可用它构造能通过校验的伪造数据。见 DECISIONS D18。
     */
    if (fracPart.indexOf('.') >= 0) return NaN;
  }

  // 非数字字符直接归零（防御性：只应收到已构造好的题面）
  if (!/^\d*$/.test(intPart)) return NaN;
  if (!/^\d*$/.test(fracPart)) return NaN;

  // 四舍五入到两位：第三位及以上决定进位
  let frac2 = (fracPart + '00').slice(0, 2);
  const third = fracPart.charCodeAt(2);
  if (!Number.isNaN(third) && third >= 53 /* '5' */) {
    frac2 = String(Number(frac2) + 1);
    if (frac2 === '100') { frac2 = '00'; intPart = String(Number(intPart) + 1); }
  }

  const intVal = Number(intPart || '0');
  const fracVal = Number(frac2 || '0');
  return sign * (intVal * SCALE + fracVal);
}

/**
 * 定点整数 → 精确十进制字符串（可往返）
 * @param {number} fixed 定点整数
 * @returns {string} 如 "518.84" / "14.5" / "7"
 */
function fromFixedInt(fixed) {
  const neg = fixed < 0;
  const v = Math.abs(fixed);
  const intPart = Math.floor(v / SCALE);
  const fracPart = v % SCALE;

  let out = String(intPart);
  if (fracPart !== 0) {
    const f = String(fracPart).padStart(2, '0').replace(/0+$/, '');
    out += '.' + f;
  }
  return neg ? '-' + out : out;
}

/** 定点加 */
function addFixed(a, b) { return a + b; }

/** 定点减（保证不返回负数由调用方保证） */
function subFixed(a, b) { return a - b; }

/**
 * 定点乘：a×b 的分值= (a分 × b分) / SCALE
 * @returns {number} 定点整数（已按四舍五入规整）
 */
function mulFixed(a, b) {
  const raw = a * b;
  return roundHalfUp(raw / SCALE);
}

/**
 * 定点除：结果 = (a分 × SCALE) / b分
 * 仅在整除时返回整数分值，否则按四舍五入
 */
function divFixed(a, b) {
  if (b === 0) return 0;
  const raw = (a * SCALE) / b;
  return roundHalfUp(raw);
}

/** 四舍五入到整数（对正负都做「远离零」处理，避免 -2.5 → -2） */
function roundHalfUp(n) {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

/**
 * 判定用户输入是否等于答案（位级精确，无容差）
 * @param {string} userInput 用户输入的原始字符串
 * @param {number} answerFixed 答案的定点整数
 * @returns {boolean}
 */
function fixedEquals(userInput, answerFixed) {
  if (userInput === null || userInput === undefined || userInput === '') return false;
  return toFixedInt(userInput) === answerFixed;
}

/**
 * 分数题判定：支持 "3/8" 或直接 "3"
 */
function fractionEquals(userInput, numFixed, denFixed) {
  if (!userInput) return false;
  const s = String(userInput).trim();
  if (s.indexOf('/') >= 0) {
    const [n, d] = s.split('/');
    const nf = toFixedInt(n), df = toFixedInt(d);
    if (df === 0) return false;
    // 交叉相乘比较，避免浮点：nf/df === numFixed/denFixed
    // nf * denFixed === numFixed * df
    return nf * denFixed === numFixed * df;
  }
  // 只答分子
  return toFixedInt(s) === numFixed;
}

/**
 * 答案长度（用于输入位数判断与键盘上限校验）
 * 统一按定点字符串计算，含小数点。
 */
function answerLength(answerFixed) {
  return fromFixedInt(answerFixed).length;
}

/**
 * 规范化用户输入用于展示：去前导零、去多余小数
 */
function normalizeInput(s) {
  if (!s) return '';
  let out = String(s);
  if (out === '0') return '0';
  out = out.replace(/^0+(?=\d)/, '');
  if (out.indexOf('.') >= 0) out = out.replace(/0+$/, '').replace(/\.$/, '');
  return out || '0';
}
try { exports.SCALE = SCALE; } catch (e) {}
try { exports.SCALE_SQ = SCALE_SQ; } catch (e) {}
try { exports.toFixedInt = toFixedInt; } catch (e) {}
try { exports.fromFixedInt = fromFixedInt; } catch (e) {}
try { exports.addFixed = addFixed; } catch (e) {}
try { exports.subFixed = subFixed; } catch (e) {}
try { exports.mulFixed = mulFixed; } catch (e) {}
try { exports.divFixed = divFixed; } catch (e) {}
try { exports.roundHalfUp = roundHalfUp; } catch (e) {}
try { exports.fixedEquals = fixedEquals; } catch (e) {}
try { exports.fractionEquals = fractionEquals; } catch (e) {}
try { exports.answerLength = answerLength; } catch (e) {}
try { exports.normalizeInput = normalizeInput; } catch (e) {}
