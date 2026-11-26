import fs from "node:fs";
import path from "node:path";

/** 极简 .env 读取（不引第三方依赖）。 */
function loadEnv(root = process.cwd()) {
  const p = path.join(root, ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

loadEnv();

export const CFG = {
  baseUrl: (process.env.OPENAI_BASE_URL || "https://opengw.clouddeveloper.club/v1").replace(/\/$/, ""),
  apiKey: process.env.OPENAI_API_KEY || "",
  model: process.env.MODEL || "deepseek-v4.1-flash-1017",
};

export async function chat(messages, { temperature = 0.2, maxTokens = 700, signal } = {}) {
  if (!CFG.apiKey) throw new Error("缺少 OPENAI_API_KEY（复制 .env.example 为 .env 后填入）");
  const res = await fetch(`${CFG.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CFG.apiKey}`,
    },
    body: JSON.stringify({
      model: CFG.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}