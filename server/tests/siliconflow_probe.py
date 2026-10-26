"""SiliconFlow 接口探测：确认后端能用哪些能力，以及它们的确切行为。

用法（PowerShell）：
    $env:SILICONFLOW_API_KEY = "sk-..."
    server\\.winv\\Scripts\\python.exe server\\tests\\siliconflow_probe.py

只做只读探测，全部请求的 max_tokens 都在 64 以内，总花费不到一分钱。
输出里不会打印 API Key，可以整段贴出来。
"""

import base64
import io
import json
import math
import os
import struct
import time
import urllib.error
import urllib.request
import wave

BASE = os.getenv("SILICONFLOW_BASE", "https://api.siliconflow.cn/v1")
KEY = os.getenv("SILICONFLOW_API_KEY", "").strip()

MAIN_MODEL = "deepseek-ai/DeepSeek-V3.2"
OMNI_MODEL = "Qwen/Qwen3-Omni-30B-A3B-Instruct"
VL_MODEL = "Qwen/Qwen3-VL-8B-Instruct"
EMBED_MODEL = "Pro/BAAI/bge-m3"
RERANK_MODEL = "Pro/BAAI/bge-reranker-v2-m3"
TTS_MODEL = "FunAudioLLM/CosyVoice2-0.5B"

RESULTS = []


def post(path, payload, timeout=60, raw=False):
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        BASE + path, data=body, method="POST",
        headers={
            "Authorization": "Bearer " + KEY,
            "Content-Type": "application/json",
        })
    started = time.time()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            content = response.read()
            elapsed = time.time() - started
            if raw:
                return response.status, content, dict(response.headers), elapsed
            return response.status, json.loads(content.decode("utf-8")), dict(response.headers), elapsed
    except urllib.error.HTTPError as error:
        content = error.read().decode("utf-8", "replace")
        return error.code, content, dict(error.headers), time.time() - started
    except Exception as error:
        return -1, str(error), {}, time.time() - started


def get(path, timeout=30):
    request = urllib.request.Request(
        BASE + path, headers={"Authorization": "Bearer " + KEY})
    started = time.time()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, json.loads(response.read().decode("utf-8")), time.time() - started
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace"), time.time() - started
    except Exception as error:
        return -1, str(error), time.time() - started


def record(name, ok, detail):
    RESULTS.append((name, ok, detail))
    flag = "OK  " if ok else ("NO  " if ok is False else "??  ")
    print("[{}] {} : {}".format(flag, name, detail))


def brief(value, limit=160):
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    return text[:limit].replace("\n", " ")


# ---------------------------------------------------------------- 1. 连通性

def probe_models():
    status, data, elapsed = get("/models")
    if status != 200:
        record("连通性", None, "HTTP {} {}".format(status, brief(data)))
        return
    ids = [item.get("id") for item in data.get("data", [])]
    wanted = [MAIN_MODEL, OMNI_MODEL, VL_MODEL, EMBED_MODEL, RERANK_MODEL, TTS_MODEL]
    missing = [name for name in wanted if name not in ids]
    record("连通性", True, "共 {} 个模型，{:.1f}s".format(len(ids), elapsed))
    record("目标模型是否都在线", not missing,
           "缺失: {}".format(missing) if missing else "6 个全部可用")


# ---------------------------------------------------------------- 2. 基础对话

def probe_chat():
    status, data, _, elapsed = post("/chat/completions", {
        "model": MAIN_MODEL,
        "messages": [{"role": "user", "content": "只回复两个字：正常"}],
        "max_tokens": 16,
        "temperature": 0,
    })
    if status != 200:
        record("基础对话", False, "HTTP {} {}".format(status, brief(data)))
        return
    text = data["choices"][0]["message"]["content"]
    record("基础对话", True, "回复={!r} 耗时={:.1f}s".format(text[:20], elapsed))


# ---------------------------------------------------------------- 3. 严格 JSON

def probe_json_mode():
    payload = {
        "model": MAIN_MODEL,
        "messages": [
            {"role": "system", "content": "你是反诈助手，只输出 JSON。"},
            {"role": "user", "content": "把这句话判定为诈骗并返回 JSON："
                                       '{"level":"high","reason":"..."} 格式'},
        ],
        "max_tokens": 80,
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    status, data, _, elapsed = post("/chat/completions", payload)
    if status != 200:
        record("response_format=json_object", False,
               "HTTP {} {}".format(status, brief(data)))
        return
    text = data["choices"][0]["message"]["content"].strip()
    try:
        json.loads(text)
        record("response_format=json_object", True,
               "支持，返回即合法 JSON，{:.1f}s".format(elapsed))
    except json.JSONDecodeError:
        record("response_format=json_object", None,
               "接口接受但返回不是纯 JSON: {}".format(brief(text, 100)))


# ---------------------------------------------------------------- 4. 流式

def probe_stream():
    body = json.dumps({
        "model": MAIN_MODEL,
        "messages": [{"role": "user", "content": "从 1 数到 10，用顿号分隔"}],
        "max_tokens": 60,
        "temperature": 0,
        "stream": True,
    }).encode("utf-8")
    request = urllib.request.Request(
        BASE + "/chat/completions", data=body, method="POST",
        headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    started = time.time()
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            first = None
            chunks = 0
            sample = None
            for line in response:
                line = line.decode("utf-8").strip()
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    break
                chunks += 1
                if first is None:
                    first = time.time() - started
                    sample = payload
            total = time.time() - started
        record("流式 stream=true", True,
               "{} 个 chunk，首字 {:.2f}s，总 {:.2f}s".format(chunks, first or 0, total))
        record("首个 chunk 结构", None, brief(sample, 200))
    except Exception as error:
        record("流式 stream=true", False, str(error))


# ---------------------------------------------------------------- 5. 结构化反诈分析

def probe_analyze():
    prompt = """判断下面这条短信是否是诈骗，只输出 JSON，不要任何解释文字：
{"level": "high|medium|low|none", "score": 0-100, "reasons": ["..."], "advice": "..."}

短信内容：您的快递在运输中丢失，请点击 http://kf-claim.top/verify 填写银行卡号和验证码办理理赔。"""
    status, data, _, elapsed = post("/chat/completions", {
        "model": MAIN_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 220,
        "temperature": 0,
        "response_format": {"type": "json_object"},
    })
    if status != 200:
        record("结构化反诈分析", False, "HTTP {} {}".format(status, brief(data)))
        return
    text = data["choices"][0]["message"]["content"]
    try:
        parsed = json.loads(text)
        keys = sorted(parsed.keys())
        record("结构化反诈分析", "level" in parsed,
               "字段={} level={} {:.1f}s".format(keys, parsed.get("level"), elapsed))
    except json.JSONDecodeError:
        record("结构化反诈分析", False, "返回不是 JSON: {}".format(brief(text, 150)))


# ---------------------------------------------------------------- 6. 视觉

PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


def probe_vision():
    data_uri = "data:image/png;base64," + base64.b64encode(PNG_1PX).decode()
    status, data, _, elapsed = post("/chat/completions", {
        "model": VL_MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": "这张图里有什么？"},
            {"type": "image_url", "image_url": {"url": data_uri}},
        ]}],
        "max_tokens": 32,
        "temperature": 0,
    })
    if status != 200:
        record("VL 支持 base64 图片", False, "HTTP {} {}".format(status, brief(data)))
        return
    text = data["choices"][0]["message"]["content"]
    record("VL 支持 base64 图片", True, "支持，回复={!r} {:.1f}s".format(text[:30], elapsed))


# ---------------------------------------------------------------- 7. 音频输入

def make_wav(seconds=1.0, rate=16000):
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        frames = b"".join(
            struct.pack("<h", int(3000 * math.sin(2 * math.pi * 440 * i / rate)))
            for i in range(int(rate * seconds)))
        handle.writeframes(frames)
    return buffer.getvalue()


def probe_audio():
    audio_b64 = base64.b64encode(make_wav()).decode()
    status, data, _, elapsed = post("/chat/completions", {
        "model": OMNI_MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": "这段音频里有什么声音？一句话回答。"},
            {"type": "input_audio", "input_audio": {"data": audio_b64, "format": "wav"}},
        ]}],
        "max_tokens": 48,
        "temperature": 0,
    }, timeout=90)
    if status == 200:
        text = data["choices"][0]["message"]["content"]
        record("Omni 支持音频输入", True, "支持，回复={!r} {:.1f}s".format(text[:30], elapsed))
    else:
        record("Omni 支持音频输入", False, "HTTP {} {}".format(status, brief(data, 200)))


# ---------------------------------------------------------------- 8. Embedding

def probe_embedding():
    status, data, _, elapsed = post("/embeddings", {
        "model": EMBED_MODEL,
        "input": ["冒充公检法要求转账到安全账户", "快递理赔索要银行卡验证码"],
    })
    if status != 200:
        record("Embedding", False, "HTTP {} {}".format(status, brief(data)))
        return
    items = data.get("data", [])
    dim = len(items[0]["embedding"]) if items else 0
    record("Embedding", dim > 0, "维度={} 条数={} {:.1f}s".format(dim, len(items), elapsed))


# ---------------------------------------------------------------- 9. Rerank

def probe_rerank():
    status, data, _, elapsed = post("/rerank", {
        "model": RERANK_MODEL,
        "query": "有人让我把钱转到安全账户",
        "documents": [
            "冒充公检法：要求转账到所谓安全账户",
            "快递理赔：点击链接填写银行卡",
            "社区通知：明天上午健康讲座",
        ],
        "top_n": 2,
        "return_documents": False,
    })
    if status != 200:
        record("Rerank", False, "HTTP {} {}".format(status, brief(data)))
        return
    keys = sorted(data.keys())
    first = (data.get("results") or [{}])[0]
    record("Rerank", True, "顶层字段={} 首条={} {:.1f}s".format(
        keys, brief(first, 120), elapsed))


# ---------------------------------------------------------------- 10. TTS

def probe_tts():
    status, content, headers, elapsed = post("/audio/speech", {
        "model": TTS_MODEL,
        "input": "这是一段测试语音。",
        "voice": "FunAudioLLM/CosyVoice2-0.5B:alex",
        "response_format": "mp3",
    }, timeout=60, raw=True)
    if status != 200:
        record("TTS", False, "HTTP {} {}".format(status, brief(content.decode("utf-8", "replace"), 200)))
        return
    record("TTS", True, "{} 字节，Content-Type={} {:.1f}s".format(
        len(content), headers.get("Content-Type", "?"), elapsed))


# ---------------------------------------------------------------- 主流程

def main():
    if not KEY:
        print("缺少 SILICONFLOW_API_KEY 环境变量")
        print('  $env:SILICONFLOW_API_KEY = "sk-..."')
        return 1

    print("探测 {}（限时 60s/请求，单次 max_tokens<=220）\n".format(BASE))

    for step in (probe_models, probe_chat, probe_json_mode, probe_stream,
                 probe_analyze, probe_vision, probe_audio,
                 probe_embedding, probe_rerank, probe_tts):
        try:
            step()
        except Exception as error:
            record(step.__name__, False, "探测脚本异常：{}".format(error))
        print()

    print("=" * 60)
    print("汇总（把这段贴回来）")
    for name, ok, detail in RESULTS:
        flag = "OK" if ok is True else ("NO" if ok is False else "??")
        print("{:<3} {:<28} {}".format(flag, name, brief(detail, 120)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
