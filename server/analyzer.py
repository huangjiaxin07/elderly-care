"""AI 反诈分析的业务逻辑：Prompt、流式增量解析、结果校验、降级。

不依赖 Flask，方便单独测试；路由层只负责参数校验和 SSE 封装。
"""

import json
import re

import ai
import config
import rag

LEVELS = {"high", "medium", "low", "none"}

SYSTEM_PROMPT = """你是面向中国老年人的反诈助理。你只做风险提示，不能替代警方判断，也不要制造恐慌。

输出要求（必须严格遵守）：
1. 只输出一个 JSON 对象；不要输出任何解释文字、前后缀或 ``` 代码块标记；
2. 字段顺序必须是：hint、level、score、reasons、advice；
3. hint：一句话结论，40 字以内，语气平和，直接说这条内容像什么；
4. level：只能是 high、medium、low、none 之一；
5. score：0 到 100 的整数，越高越危险；
6. reasons：2 到 4 条，每条 30 字以内，写明判断依据；
7. advice：1 到 2 句话，60 字以内，告诉老人现在该做什么。

判断原则：
- 涉及转账、验证码、屏幕共享、陌生链接、下载陌生 App，至少按 medium 处理；
- 出现「安全账户」「资金清查」「保密不要告诉家人」「不要挂电话」，直接按 high 处理；
- 没有明显特征时给 none 或 low，并提醒通过官方渠道核实。"""

VISION_HINT = """
另外：输入是一张图片，可能是短信或聊天截图。请先识别图中的文字，再按上面的格式判断；
如果图中没有文字，就根据画面内容判断。"""


# ---------------------------------------------------------------- 增量解析

_HINT_PATTERN = re.compile(r'^\s*\{\s*"hint"\s*:\s*"((?:[^"\\]|\\.)*)')


def _decode_partial(raw):
    """把「还没闭合的 JSON 字符串片段」尽量还原成文本。"""
    for cut in range(0, 7):
        candidate = raw[:len(raw) - cut] if cut else raw
        try:
            return json.loads('"' + candidate + '"')
        except Exception:
            continue
    return None


class HintExtractor:
    """从流式 JSON 里一点点抠出 hint 字段，供前端逐字显示。

    依赖「hint 是第一个字段」这一 Prompt 约束；
    如果前 400 个字符还没出现 hint，就放弃增量，等完整结果。
    """

    LIMIT = 400

    def __init__(self):
        self.buffer = ""
        self.emitted = ""

    def feed(self, piece):
        self.buffer += piece
        match = _HINT_PATTERN.match(self.buffer)
        if not match:
            if len(self.buffer) > self.LIMIT:
                self.buffer = ""
            return ""
        text = _decode_partial(match.group(1))
        if not text:
            return ""
        delta = text[len(self.emitted):]
        if delta:
            self.emitted = text
        return delta


# ---------------------------------------------------------------- 结果校验

def normalize(data):
    """把模型输出收敛成固定结构，非法值一律修正或丢弃。"""
    if not isinstance(data, dict):
        raise ValueError("模型返回的不是 JSON 对象")

    score = data.get("score", 0)
    try:
        score = int(round(float(score)))
    except (TypeError, ValueError):
        score = 0
    score = max(0, min(100, score))

    level = str(data.get("level", "")).strip().lower()
    if level not in LEVELS:
        level = "high" if score >= 70 else "medium" if score >= 40 else "low" if score > 0 else "none"

    def clean(value, limit):
        if not isinstance(value, str):
            return ""
        return value.strip()[:limit]

    reasons = []
    raw_reasons = data.get("reasons")
    if isinstance(raw_reasons, list):
        for item in raw_reasons:
            text = clean(item, 60)
            if text:
                reasons.append(text)
    if not reasons:
        reasons = ["模型没有给出具体依据，请自行核实。"]

    return {
        "hint": clean(data.get("hint"), 80) or "这条内容需要留意。",
        "level": level,
        "score": score,
        "reasons": reasons[:4],
        "advice": clean(data.get("advice"), 120) or "拿不准时先问家人，或拨打 96110 核实。",
    }


def parse_json(text):
    """模型偶尔会裹一层 ```json，或者前后带解释，这里做一次容错。"""
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return json.loads(text[start:end + 1])
    raise ValueError("模型没有返回可解析的 JSON")


# ---------------------------------------------------------------- 主流程

def _ensure_rag():
    try:
        rag.ensure_index()
        return True
    except Exception:
        return False


def analyze_text(text, trace_id):
    """生成 SSE 事件序列。永远不抛异常，失败时产出 fallback 事件。"""
    timer = ai.Timer()

    yield {"type": "start", "trace_id": trace_id,
           "model": config.Config.AI_MODEL, "input": len(text)}

    docs = []
    if config.Config.RAG_ENABLED and _ensure_rag():
        try:
            docs = rag.retrieve(text)
        except Exception:
            docs = []
    yield {"type": "context", "rag": [doc[0] for doc in docs],
           "elapsed_ms": timer.ms()}

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": "{}\n\n待判断的内容：\n<<<\n{}\n>>>".format(
            rag.context_block(docs), text)},
    ]

    extractor = HintExtractor()
    buffer = []

    try:
        for piece in ai.chat_stream(messages):
            buffer.append(piece)
            delta = extractor.feed(piece)
            if delta:
                yield {"type": "hint", "text": delta}

        raw = "".join(buffer)
        result = normalize(parse_json(raw))
        yield {"type": "result", "source": "llm", "rag": [doc[0] for doc in docs],
               "detail": result, "elapsed_ms": timer.ms()}
        yield {"type": "done", "elapsed_ms": timer.ms()}

    except ai.AiError as error:
        yield {"type": "fallback", "reason": "ai_error",
               "detail": str(error), "elapsed_ms": timer.ms()}
        yield {"type": "done", "elapsed_ms": timer.ms()}
    except ValueError as error:
        yield {"type": "fallback", "reason": "bad_json",
               "detail": str(error), "elapsed_ms": timer.ms()}
        yield {"type": "done", "elapsed_ms": timer.ms()}


def analyze_image(image_base64, trace_id):
    """图片分析：视觉模型一次返回完整 JSON，没有增量。"""
    timer = ai.Timer()
    yield {"type": "start", "trace_id": trace_id,
           "model": config.Config.AI_VL_MODEL, "input": "image"}
    yield {"type": "context", "rag": [], "elapsed_ms": timer.ms()}

    try:
        raw = ai.vision(image_base64, SYSTEM_PROMPT + VISION_HINT, json_mode=True)
        result = normalize(parse_json(raw))
        yield {"type": "hint", "text": result["hint"]}
        yield {"type": "result", "source": "vision", "rag": [],
               "detail": result, "elapsed_ms": timer.ms()}
        yield {"type": "done", "elapsed_ms": timer.ms()}
    except ai.AiError as error:
        yield {"type": "fallback", "reason": "ai_error",
               "detail": str(error), "elapsed_ms": timer.ms()}
        yield {"type": "done", "elapsed_ms": timer.ms()}
    except ValueError as error:
        yield {"type": "fallback", "reason": "bad_json",
               "detail": str(error), "elapsed_ms": timer.ms()}
        yield {"type": "done", "elapsed_ms": timer.ms()}
