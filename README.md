# DevKit DocQA · 华为云 DevKit 文档问答

面向华为云 DevKit 官方文档的检索问答服务：Markdown 切片 → BM25 检索 → 查询扩展 →（可选）LLM rerank → 带引用回答 → 20 条评测集回归。

用来回答这类问题：*「把 Vue 项目部署到 OBS 静态网站要几步？」「VPC 网络不通先查什么？」*

> **语料来源与许可**：`docs/` 下 14 篇 Markdown 抓取自
> [huaweicloud/huaweicloud-devkit](https://github.com/huaweicloud/huaweicloud-devkit)（Apache-2.0），
> 版权归原仓库作者所有，此处仅用于检索示例，未做修改。本仓库代码部分可自由使用。

## 为什么不用向量检索

我用的 API 网关**没有 embedding 接口**（`/v1/embeddings` 返回 Model not found）。所以默认用 BM25 做召回：

- 中文用「单字 + 相邻二字（bigram）」切词，不需要词典或分词器
- BM25（k1=1.5, b=0.75）对专有名词（OBS、KooCLI、VPC）召回很稳
- 召回 top20 后再用 LLM rerank 取 top5，补上「语义相近但词不同」的短板

`src/bm25.mjs` 是唯一和检索器耦合的地方，换成向量库只需实现 `retrieve(query, k)`。

## 快速开始

```bash
# 1) 配置 key（二选一）
#    a. 环境变量（PowerShell）
$env:OPENAI_API_KEY="sk-..."; $env:OPENAI_BASE_URL="https://opengw.clouddeveloper.club/v1"
#    b. 或复制 .env.example 为 .env 自己填（仓库不提交 .env）

# 2) 建库
npm run ingest            # docs/ → data/chunks.json
npm run ask "如何把 Vue 项目部署到 OBS 静态网站？"
npm run ask "OBS 报 Please set ak, sk and endpoint 怎么办" --rerank
npm run eval              # 20 条评测集，只看检索命中
npm run eval -- --rerank  # 对比 rerank 后
npm run eval -- --answers # 额外跑生成，测答案命中
```

## 结构

```
docs/            14 篇华为云 DevKit 官方文档（Markdown）
src/chunk.mjs    按标题切段 + 700 字打包 + 80 字重叠
src/tokenize.mjs 中英混合分词（中文 bigram）
src/bm25.mjs     BM25 索引与检索
src/llm.mjs      网关 chat/completions 封装（读 .env）
src/ingest.mjs   建库：docs/ → data/chunks.json
src/ask.mjs      检索 + rerank + 生成 + 引用来源
src/eval.mjs     20 条评测集：检索命中@5 / 答案命中
data/eval/questions.json  评测集（问题 + 期望关键词）
```

## 指标（自己跑出来的，别信简历上的拍脑袋数字）

20 条评测集，检索命中@5 实测：

| 配置 | 命中@5 | 说明 |
|---|---|---|
| BM25 原始 | 16/20 = **80%** | 中文提问 vs 英文标题的文档，词对不上就召回不到 |
| + 查询同义词扩展 | 19/20 = **95%** | 安全组→security group、错误码→error code 等 20 条小词表 |
| + LLM rerank | 19/20 = **95%** | 剩下的那条是**召回缺失**，rerank 只能重排、救不回来 |

**唯一的 bad case**：「常见错误码有哪些？」——中文口语化提问，而对应章节标题是 `Common Error Codes`，
该片段没进 top20，rerank 也补不上。这说明瓶颈在**召回**（查询扩展/向量检索），不在**排序**。

以后改 prompt 或换检索器，先跑 `npm run eval` 看这两个数再说。

## 已知短板 / 下一步

- **没有 embedding**：语义召回靠 rerank 兜底；换成向量库（pgvector / Chroma）后可以做混合检索
- **切片是规则化的**：表格和代码块会被切成普通文本，长表格容易断;可加表格感知切片
- **评测集只有 20 条**：样本小，指标波动大；扩充到 100 条再谈稳定性
- **没有做缓存与并发**：每次问答都重新建索引（几十个块，可接受）；生产化要预建 + 缓存

## 扩展点

1. `src/bm25.mjs` → 换向量检索（加 `embed.mjs`，索引里存向量）
2. `src/ask.mjs` 的 prompt → 加「不确定就拒答」的兜底策略
3. `src/eval.mjs` → 加 MRR、上下文精确率，做成 CI 门禁（改 prompt 就跑评测）