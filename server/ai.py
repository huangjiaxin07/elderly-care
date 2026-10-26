"""SiliconFlow 客户端。

只用标准库 urllib，不引第三方依赖——部署环境没有 pip，
和 sms.py、sm2.py 保持同一套约束。

接口行为已实测（server/tests/siliconflow_probe*.py）：
- /chat/completions 支持 stream 与 response_format=json_object，可同时开启；
- 流式返回标准的 chat.completion.chunk，delta.content 里是增量文本；
- 视觉模型接受 data URI 形式的 base64 图片；
- 只接受 text 和 image_url，**不接受音频**；
- /embeddings 返回 1024 维；/rerank 返回 results[].index 与 relevance_score；
- /audio/speech 返回 audio/mpeg。
"""

import json
import time
import urllib.error
import urllib.request

import config


class AiError(Exception):
    """调用失败。调用方要么降级，要么把错误透给前端。"""


def _key():
    return config.Config.SILICONFLOW_API_KEY


def available():
    return bool(_key())


def _request(path, payload, timeout=None, raw=False):
    if not available():
        raise AiError("服务端未配置 SILICONFLOW_API_KEY")

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        config.Config.SILICONFLOW_BASE + path,
        data=body,
        method="POST",
        headers={
            "Authorization": "Bearer " + _key(),
            "Content-Type": "application/json",
        },
    )
    timeout = timeout or config.Config.AI_TIMEOUT
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            content = response.read()
            if raw:
                return content, dict(response.headers)
            return json.loads(content.decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        raise AiError("SiliconFlow HTTP {}: {}".format(error.code, detail))
    except urllib.error.URLError as error:
        raise AiError("SiliconFlow 连接失败：{}".format(getattr(error, "reason", error)))
    except TimeoutError:
        raise AiError("SiliconFlow 请求超时")


# ---------------------------------------------------------------- 对话

def chat(messages, model=None, max_tokens=None, temperature=0, json_mode=False,
         timeout=None):
    """非流式对话，返回纯文本。"""
    payload = {
        "model": model or config.Config.AI_MODEL,
        "messages": messages,
        "max_tokens": max_tokens or config.Config.AI_MAX_TOKENS,
        "temperature": temperature,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    data = _request("/chat/completions", payload, timeout=timeout)
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise AiError("SiliconFlow 返回结构异常：" + json.dumps(data, ensure_ascii=False)[:200])


def chat_stream(messages, model=None, max_tokens=None, temperature=0,
                json_mode=True, timeout=None):
    """流式对话，逐段 yield 文本增量。"""
    if not available():
        raise AiError("服务端未配置 SILICONFLOW_API_KEY")

    payload = {
        "model": model or config.Config.AI_MODEL,
        "messages": messages,
        "max_tokens": max_tokens or config.Config.AI_MAX_TOKENS,
        "temperature": temperature,
        "stream": True,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        config.Config.SILICONFLOW_BASE + "/chat/completions",
        data=body,
        method="POST",
        headers={
            "Authorization": "Bearer " + _key(),
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        },
    )

    timeout = timeout or config.Config.AI_TIMEOUT
    try:
        response = urllib.request.urlopen(request, timeout=timeout)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        raise AiError("SiliconFlow HTTP {}: {}".format(error.code, detail))
    except Exception as error:
        raise AiError("SiliconFlow 连接失败：{}".format(error))

    with response:
        for line in response:
            line = line.decode("utf-8", "replace").strip()
            if not line or not line.startswith("data:"):
                continue
            payload_text = line[5:].strip()
            if payload_text == "[DONE]":
                break
            try:
                chunk = json.loads(payload_text)
                delta = chunk["choices"][0].get("delta") or {}
            except (json.JSONDecodeError, KeyError, IndexError, TypeError):
                continue
            piece = delta.get("content")
            if piece:
                yield piece


# ---------------------------------------------------------------- 视觉

def vision(image_base64, prompt, model=None, max_tokens=None, json_mode=False,
           timeout=None):
    """图片理解。image_base64 不带 data: 前缀，mime 默认按 jpeg 处理。"""
    if image_base64.startswith("data:"):
        image_base64 = image_base64.split(",", 1)[-1]
    data_uri = "data:image/jpeg;base64," + image_base64

    payload = {
        "model": model or config.Config.AI_VL_MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": data_uri}},
            ],
        }],
        "max_tokens": max_tokens or config.Config.AI_MAX_TOKENS,
        "temperature": 0,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    data = _request("/chat/completions", payload, timeout=timeout)
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise AiError("视觉模型返回结构异常")


# ---------------------------------------------------------------- 向量

def embed(texts):
    """把文本转成向量，返回 list[list[float]]。"""
    if isinstance(texts, str):
        texts = [texts]
    data = _request("/embeddings", {
        "model": config.Config.AI_EMBED_MODEL,
        "input": texts,
    })
    items = data.get("data") or []
    if len(items) != len(texts):
        raise AiError("embedding 返回条数不一致")
    return [item["embedding"] for item in items]


def rerank(query, documents, top_n=4):
    """重排。返回 [(原下标, 相关性分数), ...]，按分数降序。"""
    if not documents:
        return []
    data = _request("/rerank", {
        "model": config.Config.AI_RERANK_MODEL,
        "query": query,
        "documents": documents,
        "top_n": min(top_n, len(documents)),
        "return_documents": False,
    })
    results = data.get("results") or []
    pairs = []
    for item in results:
        index = item.get("index")
        score = item.get("relevance_score")
        if isinstance(index, int) and isinstance(score, (int, float)):
            pairs.append((index, float(score)))
    pairs.sort(key=lambda pair: pair[1], reverse=True)
    return pairs


# ---------------------------------------------------------------- 语音合成

def tts(text, voice=None, speed=None):
    """返回 mp3 字节流。voice 形如 FunAudioLLM/CosyVoice2-0.5B:alex。"""
    payload = {
        "model": config.Config.AI_TTS_MODEL,
        "input": text,
        "voice": voice or config.Config.AI_TTS_VOICE,
        "response_format": "mp3",
    }
    if speed:
        payload["speed"] = speed
    content, _ = _request("/audio/speech", payload, raw=True,
                          timeout=config.Config.AI_TIMEOUT)
    return content


# ---------------------------------------------------------------- 计时

class Timer:
    def __init__(self):
        self.started = time.time()

    def ms(self):
        return int((time.time() - self.started) * 1000)
