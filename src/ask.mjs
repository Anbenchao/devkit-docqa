import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildIndex, search } from "./bm25.mjs";
import { chat } from "./llm.mjs";

const ROOT = process.cwd();
const DATA = path.join(ROOT, "data", "chunks.json");

function loadChunks() {
  if (!fs.existsSync(DATA)) {
    console.error("还没建索引，先跑：npm run ingest");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(DATA, "utf8")).chunks;
}

/** LLM rerank：把 topN 候选按相关度重排，返回 topK。 */
export async function rerank(query, candidates, topK = 5) {
  const list = candidates
    .map((c, i) => `[${i}] 标题: ${c.heading}\n摘要: ${c.text.replace(/\s+/g, " ").slice(0, 220)}`)
    .join("\n\n");
  const prompt = `用户在问：${query}\n\n下面是候选文档片段，请按"能否回答该问题"从高到低排序。\n只输出 JSON 数组，元素是下标数字，例如 [3,0,7,1,5]。\n\n${list}`;
  const raw = await chat(
    [
      { role: "system", content: "你是检索重排器，只输出 JSON 数组，不要解释。" },
      { role: "user", content: prompt },
    ],
    { temperature: 0, maxTokens: 120 },
  );
  const m = raw.match(/\[[\d,\s]+\]/);
  if (!m) return candidates.slice(0, topK);
  let order = [];
  try {
    order = JSON.parse(m[0]).filter((i) => Number.isInteger(i) && i >= 0 && i < candidates.length);
  } catch {
    return candidates.slice(0, topK);
  }
  const seen = new Set();
  const out = [];
  for (const i of order) {
    if (seen.has(i)) continue;
    seen.add(i);
    out.push(candidates[i]);
    if (out.length === topK) break;
  }
  for (let i = 0; i < candidates.length && out.length < topK; i++) {
    if (!seen.has(i)) out.push(candidates[i]);
  }
  return out;
}

export async function retrieve(query, { k = 5, useRerank = false, pool = 20 } = {}) {
  const chunks = loadChunks();
  const index = buildIndex(chunks);
  const candidates = search(index, query, useRerank ? Math.max(pool, k) : k);
  if (!useRerank) return candidates;
  return rerank(query, candidates, k);
}

function formatSources(hits) {
  return hits
    .map((h, i) => `[${i + 1}] ${h.file} · ${h.heading || "(无标题)"} · score=${h.score.toFixed(2)}`)
    .join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const q = args.filter((a) => !a.startsWith("--")).join(" ");
  const useRerank = args.includes("--rerank");
  if (!q) {
    console.log('用法: node src/ask.mjs "如何把 Vue 项目部署到 OBS 静态网站？" [--rerank]');
    process.exit(0);
  }

  const hits = await retrieve(q, { k: 5, useRerank });
  const context = hits
    .map((h, i) => `【片段 ${i + 1}】来源：${h.file} · ${h.heading}\n${h.text}`)
    .join("\n\n");

  const answer = await chat(
    [
      {
        role: "system",
        content:
          "你是华为云 DevKit 文档助手。只能依据给定片段回答；片段里没有的信息就说“文档中没有提到”，不要编造。回答末尾用 [编号] 标注依据。",
      },
      { role: "user", content: `问题：${q}\n\n可用片段：\n${context}` },
    ],
    { temperature: 0.2, maxTokens: 800 },
  );

  console.log(answer.trim());
  console.log("\n--- 检索来源 ---");
  console.log(formatSources(hits));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("出错:", e.message);
    process.exit(1);
  });
}