import fs from "node:fs";
import path from "node:path";
import { loadDocs } from "./chunk.mjs";

const ROOT = process.cwd();
const DOCS = path.join(ROOT, "docs");
const OUT = path.join(ROOT, "data", "chunks.json");

const { files, chunks } = loadDocs(DOCS);
if (!chunks.length) {
  console.error("docs/ 下没有可用的 .md 文件");
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({ builtAt: new Date().toISOString(), files, chunks }, null, 2),
  "utf8",
);

const chars = chunks.reduce((s, c) => s + c.text.length, 0);
console.log(`docs: ${files.length} 个文件`);
console.log(`chunks: ${chunks.length} 个，共 ${chars} 字`);
console.log(`平均每块 ${Math.round(chars / chunks.length)} 字`);
console.log(`写入 ${path.relative(ROOT, OUT)}`);