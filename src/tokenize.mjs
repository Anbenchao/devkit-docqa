// 轻量分词：英文/数字按词，中文按「单字 + 相邻二字」切。
// 中文用 bigram 是为了让 BM25 这种词袋检索也能覆盖短语，不需要额外词典。

const STOP = new Set([
  "的", "了", "是", "在", "和", "与", "及", "等", "也", "就", "都", "而", "被",
  "the", "a", "an", "of", "to", "in", "is", "are", "and", "or", "for", "on", "with",
]);

const CJK = /[\u4e00-\u9fff]/;

export function tokenize(text) {
  const s = String(text || "").toLowerCase();
  const tokens = [];

  for (const m of s.matchAll(/[a-z0-9][a-z0-9_.\-+/]*/g)) {
    const w = m[0];
    if (!STOP.has(w)) tokens.push(w);
  }

  const cjkRuns = s.match(/[\u4e00-\u9fff]+/g) || [];
  for (const run of cjkRuns) {
    for (let i = 0; i < run.length; i++) {
      const ch = run[i];
      if (!STOP.has(ch)) tokens.push(ch);
      if (i + 1 < run.length) tokens.push(ch + run[i + 1]);
    }
  }
  return tokens;
}

export function isCjk(s) {
  return CJK.test(s);
}