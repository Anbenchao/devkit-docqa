import fs from "node:fs";
import path from "node:path";

const MAX_CHARS = 700;
const MIN_CHARS = 120;
const OVERLAP = 80;

/** 按 Markdown 标题切段，再把过长的段按句子打包成 <= MAX_CHARS 的块。 */
export function chunkMarkdown(text, file) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections = [];
  let heading = "";
  let buf = [];

  const flush = () => {
    const body = buf.join("\n").trim();
    if (body) sections.push({ heading, body });
    buf = [];
  };

  for (const line of lines) {
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      heading = h[2].trim();
      continue;
    }
    buf.push(line);
  }
  flush();

  const chunks = [];
  let idx = 0;
  for (const sec of sections) {
    const paragraphs = sec.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    let current = "";
    for (const p of paragraphs) {
      if (current && current.length + p.length + 2 > MAX_CHARS) {
        chunks.push({ heading: sec.heading, text: current });
        current = current.slice(-OVERLAP) + "\n" + p;
      } else {
        current = current ? current + "\n\n" + p : p;
      }
    }
    if (current) chunks.push({ heading: sec.heading, text: current });
  }

  return chunks
    .filter((c) => c.text.replace(/\s/g, "").length >= MIN_CHARS)
    .map((c, i) => ({
      id: `${file}#${i}`,
      file,
      heading: c.heading,
      text: c.text,
    }));
}

export function loadDocs(docsDir) {
  const files = fs
    .readdirSync(docsDir)
    .filter((f) => f.endsWith(".md") || f.endsWith(".mdx"));
  const chunks = [];
  for (const f of files) {
    const raw = fs.readFileSync(path.join(docsDir, f), "utf8");
    chunks.push(...chunkMarkdown(raw, f));
  }
  return { files, chunks };
}