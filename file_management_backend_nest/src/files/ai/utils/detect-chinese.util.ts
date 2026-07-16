/** 粗判文本是否「主要是中文」（用于翻译默认译向） */
const HAN_CHAR = /[\u4e00-\u9fff]/
const LATIN_CHAR = /[A-Za-z]/

const DEFAULT_HAN_RATIO = 0.3;

/**
 * 在汉字与拉丁字母中，汉字占比 ≥ 阈值则视为主要中文。
 * 忽略数字、标点、空白；无字母也无汉字时返回 false。
 */
export function isMostlyChinese(
  text: string,
  threshold = DEFAULT_HAN_RATIO,
): boolean {
  let han = 0;
  let latin = 0;
  for (const ch of text) {
    if (HAN_CHAR.test(ch)) han += 1;
    else if (LATIN_CHAR.test(ch)) latin += 1;
  }
  const total = han + latin;
  if (total === 0) return false;
  return han / total >= threshold;
}
