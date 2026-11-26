import { tokenize } from "./tokenize.mjs";

const K1 = 1.5;
const B = 0.75;

// 语料里中英混排（文档标题多为英文，正文有中文），用一张小同义词表兜住
// 「中文提问 → 英文术语」的召回缺口。只做查询侧扩展，不改索引。
const ALIASES = {
  安全组: ["security", "group"],
  网络: ["network", "vpc"],
  子网: ["subnet"],
  桶: ["bucket"],
  对象存储: ["obs", "bucket"],
  实例: ["instance"],
  凭证: ["credential", "credentials", "ak", "sk"],
  可用区: ["az", "availability", "zone"],
  规格: ["flavor", "spec"],
  错误码: ["error", "code"],
  最小权限: ["least", "privilege"],
  排查: ["troubleshoot", "troubleshooting"],
  审批: ["approval", "approve"],
  遥测: ["telemetry"],
  架构: ["architecture", "layer", "layers"],
  安装: ["install", "installation"],
  前置条件: ["prerequisite", "prerequisites"],
  静态网站: ["static", "website"],
  权限: ["permission", "policy"],
  策略: ["policy"],
};

export function expandQuery(query) {
  const extra = [];
  for (const [zh, en] of Object.entries(ALIASES)) {
    if (query.includes(zh)) extra.push(...en);
  }
  return extra;
}

/** 构建 BM25 索引（纯内存，几十~几百个块足够快）。 */
export function buildIndex(chunks) {
  const docs = chunks.map((c) => {
    const tokens = tokenize(`${c.heading}\n${c.text}`);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    return { chunk: c, tf, len: tokens.length };
  });

  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const avgdl = docs.reduce((s, d) => s + d.len, 0) / Math.max(docs.length, 1);

  return { docs, df, avgdl, N: docs.length };
}

export function search(index, query, k = 5) {
  const qTokens = [...new Set([...tokenize(query), ...expandQuery(query).flatMap((t) => tokenize(t))])];
  const scored = index.docs.map((d) => {
    let score = 0;
    for (const q of qTokens) {
      const f = d.tf.get(q);
      if (!f) continue;
      const n = index.df.get(q) || 0;
      const idf = Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
      const denom = f + K1 * (1 - B + (B * d.len) / index.avgdl);
      score += idf * ((f * (K1 + 1)) / denom);
    }
    return { ...d.chunk, score };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}