"""第二轮探测：解决第一轮留下的三个问题。

1. VL 到底是「不支持 base64」还是「图太小」—— 第一轮报的是尺寸限制，换个真图复测；
2. 结构化分析用了 10.5s，太慢。横向比几个模型的速度，挑主分析模型；
3. 流式和 JSON 模式能不能同时开。

用法：
    $env:SILICONFLOW_API_KEY = "sk-..."
    server\\.winv\\Scripts\\python.exe server\\tests\\siliconflow_probe2.py
    # 有真实短信截图时，顺手验证 OCR 能力：
    server\\.winv\\Scripts\\python.exe server\\tests\\siliconflow_probe2.py --image 截图.png
"""

import base64
import binascii
import io
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
import zlib

BASE = os.getenv("SILICONFLOW_BASE", "https://api.siliconflow.cn/v1")
KEY = os.getenv("SILICONFLOW_API_KEY", "").strip()

VL_MODEL = "Qwen/Qwen3-VL-8B-Instruct"
TTS_MODEL = "FunAudioLLM/CosyVoice2-0.5B"

MODELS = [
    "deepseek-ai/DeepSeek-V3.2",
    "Qwen/Qwen3.5-35B-A3B",
    "Qwen/Qwen3.5-27B",
    "Qwen/Qwen3.5-9B",
]

ANALYZE_PROMPT = """判断下面这条短信是否是诈骗，只输出 JSON：
{"level":"high|medium|low|none","score":0-100,"reasons":["..."],"advice":"..."}

短信：您的快递在运输中丢失，请点击 http://kf-claim.top/verify 填写银行卡号和验证码办理理赔。"""

RESULTS = []


def post(path, payload, timeout=90, raw=False):
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        BASE + path, data=body, method="POST",
        headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    started = time.time()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            content = response.read()
            elapsed = time.time() - started
            if raw:
                return response.status, content, dict(response.headers), elapsed
            return response.status, json.loads(content.decode("utf-8")), {}, elapsed
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace"), {}, time.time() - started
    except Exception as error:
        return -1, str(error), {}, time.time() - started


def record(name, ok, detail):
    RESULTS.append((name, ok, detail))
    flag = "OK  " if ok else ("NO  " if ok is False else "??  ")
    print("[{}] {} : {}".format(flag, name, detail))


def brief(value, limit=150):
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    return text[:limit].replace("\n", " ")


# ---------------------------------------------------------------- 假图生成

def make_png(width, height, rgb=(200, 200, 200)):
    """不依赖 Pillow，手写一个合法的 8 位 RGB PNG。"""
    raw = b"".join(b"\x00" + bytes(rgb) * width for _ in range(height))

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", binascii.crc32(tag + data) & 0xFFFFFFFF))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) +
            chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def probe_vision(image_bytes, label):
    data_uri = "data:image/png;base64," + base64.b64encode(image_bytes).decode()
    status, data, _, elapsed = post("/chat/completions", {
        "model": VL_MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": "用一句话描述这张图片。"},
            {"type": "image_url", "image_url": {"url": data_uri}},
        ]}],
        "max_tokens": 60,
        "temperature": 0,
    })
    if status != 200:
        record("VL " + label, False, "HTTP {} {}".format(status, brief(data, 180)))
        return
    text = data["choices"][0]["message"]["content"]
    record("VL " + label, True, "支持，回复={!r} {:.1f}s".format(text[:40], elapsed))


# ---------------------------------------------------------------- 1. 视觉复测

def probe_vision_retry(image_path=None):
    probe_vision(make_png(64, 64), "64x64 纯色图")
    probe_vision(make_png(300, 600, (250, 250, 245)), "300x600 竖图")

    if image_path and os.path.exists(image_path):
        with open(image_path, "rb") as handle:
            probe_vision(handle.read(), "真实截图 " + os.path.basename(image_path))
    elif image_path:
        record("VL 真实截图", False, "文件不存在：" + image_path)


# ---------------------------------------------------------------- 2. 模型速度

def probe_speed():
    print("\n---- 同一任务，四个模型比速度（max_tokens=250）----")
    for model in MODELS:
        status, data, _, elapsed = post("/chat/completions", {
            "model": model,
            "messages": [{"role": "user", "content": ANALYZE_PROMPT}],
            "max_tokens": 250,
            "temperature": 0,
            "response_format": {"type": "json_object"},
        })
        if status != 200:
            record(model + " 速度", False, "HTTP {} {}".format(status, brief(data, 120)))
            continue
        text = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        try:
            json.loads(text)
            valid = "JSON合法"
        except json.JSONDecodeError:
            valid = "JSON非法"
        record(model + " 速度", True,
               "{:.1f}s {} 输出{}tok 首字-".format(
                   elapsed, valid, usage.get("completion_tokens", "?")))


# ---------------------------------------------------------------- 3. 流式 + JSON

def probe_stream_json():
    body = json.dumps({
        "model": "deepseek-ai/DeepSeek-V3.2",
        "messages": [{"role": "user", "content": ANALYZE_PROMPT}],
        "max_tokens": 250,
        "temperature": 0,
        "stream": True,
        "response_format": {"type": "json_object"},
    }).encode("utf-8")
    request = urllib.request.Request(
        BASE + "/chat/completions", data=body, method="POST",
        headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    started = time.time()
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            first = None
            chunks = 0
            text = ""
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
                try:
                    delta = json.loads(payload)["choices"][0]["delta"]
                    text += delta.get("content") or ""
                except Exception:
                    pass
        total = time.time() - started
        try:
            json.loads(text)
            valid = "拼接后是合法 JSON"
        except json.JSONDecodeError:
            valid = "拼接后不是 JSON"
        record("流式 + json_object 组合", True,
               "{} chunk 首字{:.2f}s 总{:.2f}s {}".format(chunks, first or 0, total, valid))
    except Exception as error:
        record("流式 + json_object 组合", False, str(error))


# ---------------------------------------------------------------- 4. TTS 长文本

def probe_tts_file():
    text = ("您的快递在运输途中丢失，可以办理理赔。"
            "请点击短信里的链接，填写银行卡号和验证码。"
            "如果不确定，请先打 96110 核实，不要向陌生账户转账。")
    status, content, headers, elapsed = post("/audio/speech", {
        "model": TTS_MODEL,
        "input": text,
        "voice": "FunAudioLLM/CosyVoice2-0.5B:alex",
        "response_format": "mp3",
        "speed": 0.9,
    }, timeout=90, raw=True)
    if status != 200:
        record("TTS 长文本", False, "HTTP {} {}".format(
            status, brief(content.decode("utf-8", "replace"), 180)))
        return
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tts_sample.mp3")
    with open(out, "wb") as handle:
        handle.write(content)
    record("TTS 长文本", True,
           "{} 字 -> {} 字节，已存 {}（请手动播放确认完整）".format(
               len(text), len(content), os.path.basename(out)))


def main():
    if not KEY:
        print('缺少 SILICONFLOW_API_KEY，先执行 $env:SILICONFLOW_API_KEY = "sk-..."')
        return 1

    image_path = None
    if "--image" in sys.argv:
        index = sys.argv.index("--image")
        if index + 1 < len(sys.argv):
            image_path = sys.argv[index + 1]

    print("第二轮探测\n")
    probe_vision_retry(image_path)
    print()
    probe_speed()
    print()
    probe_stream_json()

    print()
    print("=" * 60)
    for name, ok, detail in RESULTS:
        flag = "OK" if ok is True else ("NO" if ok is False else "??")
        print("{:<3} {:<32} {}".format(flag, name, brief(detail, 130)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
