# AI 模块设计说明

给两个读者看：一是接管前端的同学（了解接口为什么这么设计），
二是写技术文档和答辩的人（选型理由、降级策略、评分点对应）。

---

## 一、整体链路

```
用户粘贴短信 / 上传截图
        │
        ▼
POST /api/analyze  ──►  RAG 检索（bge-m3 向量 → reranker 精排）
        │                        │
        │                        └─► 命中的骗术条目拼进 Prompt
        ▼
SiliconFlow /chat/completions（stream=true, response_format=json_object）
        │
        ▼
逐 chunk 解析 ──► 抽出 hint 字段 ──► SSE 推给前端（逐字显示）
        │
        └─► 生成结束 ──► 解析完整 JSON ──► SSE 推 result（渲染卡片）
```

关键点：**一个请求同时做到「流式体验」和「结构化输出」**，没有用双请求。

## 二、选型：为什么是这几个模型

用 `server/tests/siliconflow_probe*.py` 实测过，数据如下。

### 文本分析模型

同一个反诈判断任务、同样 `max_tokens=250`：

| 模型 | 耗时 | 输出 token | 结论 |
| --- | --- | --- | --- |
| **DeepSeek-V3.2** | **10.1s** | **148** | 采用 |
| Qwen3.5-35B-A3B | 21.9–29.9s | 1354 | 慢 2–3 倍，输出失控 |
| Qwen3.5-9B | 22.6–34.2s | 1493 | 同上，且更慢 |
| Qwen3.5-27B | 90s 超时 | — | 不可用 |

Qwen 系列有个必须知道的现象：`max_tokens` 设 250，实际输出 1300+ token，**参数没生效**，
估计是默认开了思考链。这既拖慢速度也增加成本，所以不作为主分析模型。

### 其他模型

| 用途 | 模型 | 实测 |
| --- | --- | --- |
| 截图理解 | `Qwen/Qwen3-VL-8B-Instruct` | 真实聊天截图 OCR 准确，2.8s |
| 向量化 | `Pro/BAAI/bge-m3` | 1024 维，0.3s |
| 重排 | `Pro/BAAI/bge-reranker-v2-m3` | 返回 `index` + `relevance_score`，0.3s |
| 语音合成 | `FunAudioLLM/CosyVoice2-0.5B` | 返回 `audio/mpeg`，2.3s |

### 一个被排除的方向

`Qwen3-Omni` 支持音频输入，但 SiliconFlow 的接口明确返回
`Only text and image_url are supported`。**所以后端做不了语音识别**，
语音只能留在浏览器的 Web Speech API。这条已经实测确认，不要再试。

## 三、Prompt 设计

三个约束是刻意加的：

1. **只输出 JSON、不开代码块**——配合 `response_format=json_object`，实测返回即合法 JSON，
   服务端仍保留一层「剥 ``` 、截取首尾大括号」的容错。
2. **字段顺序必须是 `hint → level → score → reasons → advice`**。这是全篇最关键的一条：
   模型按顺序生成 token，`hint` 放第一个，前端才能在这句话还没写完时就开始显示。
   如果不约束顺序，模型可能先写 `reasons`，流式就失去意义。
3. **判断原则写死三条阈值**（涉及转账/验证码/屏幕共享 ≥ medium；出现「安全账户」「保密」直接 high），
   让输出稳定、可解释，而不是每次靠模型自由发挥。

## 四、RAG

### 知识库

`server/knowledge.py`，27 条，两个来源：

- 前端 `js/fraud-engine.js` 里 19 类骗术的判定逻辑与解释；
- 页面里已有的官方渠道与热线（96110、110、12381、12333、12393、12315）。

每条都按「名称 + 典型话术 + 识别要点 + 正确做法」写，不是关键词表——
这样向量检索命中的是语义，比如「让我转钱到安全账户」能命中 `safe-account`。

### 检索

1. `bge-m3` 把 27 条全部向量化，存进 SQLite 的 `KNOWLEDGE` 表（1024 维，JSON 存）；
2. 查询时向量化用户输入，余弦相似度取 Top 8；
3. `bge-reranker-v2-m3` 精排到 Top 4，拼进 Prompt。

**为什么用 reranker 而不直接取 Top 4**：向量检索对「短查询 vs 长文档」不敏感，
反诈话术又高度相似（很多都提到「转账」），粗排容易把「高收益投资」排到「冒充公检法」前面。
重排只多花 0.3 秒，准确性提升明显。

### 降级

三层，任何一层失败都不影响主流程：

| 失败点 | 行为 |
| --- | --- |
| embedding 挂了 | 退化成字符重合度匹配 |
| reranker 挂了 | 用向量粗排结果顶上 |
| 整个 RAG 挂了 | 不带参考资料，模型按常识判断 |

## 五、流式协议

`POST /api/analyze` 返回 `text/event-stream`，事件序列：

```
start → context → hint × N → result → done
```

前端**不能用 `EventSource`**，原因有两个：它只支持 GET（发不了请求体），
也没法带自定义请求头。必须用 `fetch` + `ReadableStream` 手动切帧，代码见 `FRONTEND-API.md`。

### 一个必须处理的坑：nginx 缓冲

即使服务端加了 `X-Accel-Buffering: no`，nginx 侧的 `/api/` location 仍然要写
`proxy_buffering off;`，否则前端会在最后一次性收到全部内容——流式白做。

## 六、降级与可控性（对应「AI 安全与可控性」评分项）

四层兜底，从外到内：

1. **没有配 API Key** → `/api/analyze` 直接返回 1017，前端用本地规则引擎；
2. **上游超时或报错** → 服务端发 `fallback` 事件，前端同样回退本地规则；
3. **模型返回的不是 JSON** → 服务端尝试剥离代码块、截取大括号；仍失败则 `fallback`；
4. **JSON 字段非法**（level 不在枚举里、score 越界）→ 服务端按 score 推导 level、把分数裁到 0–100，
   不让脏数据流到前端。

另外两条产品层面的约束：

- Prompt 里明确写「不能替代警方判断、不要制造恐慌」，输出语气会平和很多；
- 前端原有的 19 条正则规则引擎**完整保留**，作为断网和降级时的唯一判断依据——
  这不是历史包袱，而是「可控性」的证据。

## 七、成本

单次文本分析约 1000 输入 + 150 输出 token，按 SiliconFlow 的按量计费，成本可以忽略。
真正需要控的是**调用次数**：接口按 IP 限流每分钟 6 次，防止被当成免费代理刷。

RAG 建库只在第一次调用时做一次（27 条一次 embedding 请求），之后走本地 SQLite。

## 八、还没做的

| 项 | 状态 | 说明 |
| --- | --- | --- |
| Agent 多步工具调用 | 未做 | 目前是单轮「检索 + 判断」，没有「分析→查证→通知家属」的多步规划 |
| MCP 工具集成 | 未做 | 没有接任何 MCP server |
| 语音识别 | 做不了 | SiliconFlow 不接受音频，已实测确认 |
| 语音合成 | 接口已提供 | `POST /api/tts`，带缓存与降级；前端仍用浏览器 `speechSynthesis`，尚未切换 |

前三项是评分表里「Agent/工作流 8%」「MCP 4%」的分，也是下一步最值得补的部分。
