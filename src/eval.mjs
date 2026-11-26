import fs from "node:fs";
import path from "node:path";
import { retrieve } from "./ask.mjs";
import { chat } from "./llm.mjs";

const ROOT = process.cwd();
const QUESTIONS = path.join(ROOT, "data", "eval", "questions.json");

const useRerank = process.argv.includes("--rerank");
const withAnswers = process.argv.includes("--answers");

const cases = JSON.parse(fs.readFileSync(QUESTIONS, "utf8"));
let hit = 0;
let total = 0;
let answerHit = 0;
const rows = [];

for (const c of cases) {
  const hits = await retrieve(c.q, { k: 5, useRerank });
  const blob = hits.map((h) => `${h.heading}\n${h.text}`.toLowerCase()).join("\n");
  const ok = c.expect.some((kw) => blob.includes(kw.toLowerCase()));
  if (ok) hit++;
  total++;

  let ansOk = null;
  if (withAnswers) {
    const context = hits.map((h, i) => `【片段 ${i + 1}】${h.heading}\n${h.text}`).join("\n\n");
    const ans = await chat(
      [
        { role: "system", content: "只能依据片段回答，结尾用 [编号] 标注依据。" },
        { role: "user", content: `问题：${c.q}\n\n片段：\n${context}` },
      ],
      { temperature: 0, maxTokens: 500 },
    );
    ansOk = c.expect.some((kw) => ans.toLowerCase().includes(kw.toLowerCase()));
    if (ansOk) answerHit++;
  }

  rows.push({ q: c.q, hit: ok, ans: ansOk, top: hits[0] });
}

console.log(`模式：BM25${useRerank ? " + LLM rerank" : ""}${withAnswers ? " + 生成回答" : ""}`);
console.log("");
for (const r of rows) {
  const flag = r.hit ? "✓" : "✗";
  const ans = r.ans === null ? "" : r.ans ? " 答✓" : " 答✗";
  console.log(`${flag}${ans}  ${r.q}`);
  if (!r.hit) console.log(`      top1: ${r.top.file} · ${r.top.heading}`);
}
console.log("");
console.log(`检索命中@5：${hit}/${total} = ${((hit / total) * 100).toFixed(1)}%`);
if (withAnswers) {
  console.log(`回答命中：${answerHit}/${total} = ${((answerHit / total) * 100).toFixed(1)}%`);
}