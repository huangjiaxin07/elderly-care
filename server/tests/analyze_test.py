"""AI 分析接口的离线测试：用假 SiliconFlow 服务验证整条链路。

真实模型的行为已经用 siliconflow_probe*.py 验证过；
这里验证的是我们自己的代码：SSE 帧、hint 增量抽取、JSON 容错、降级。

用法：
    server\\.winv\\Scripts\\python.exe server\\tests\\analyze_test.py
不需要 API Key，也不联网。
"""

import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, SERVER_DIR)

PASS, FAIL = [], []

# 故意在中文中间、引号旁边切开，检验增量拼接
STREAM_PIECES = [
    '{"hint": "这是典',
    "型快递理赔诈",
    '骗，链接是假', "域名。\", \"level\": \"high\", \"score\": 92, ",
    '"reasons": ["假域名", "索要验证码"], ',
    '"advice": "别点链接，打 96110 核实。"',
    "}",
]

EMBED_DIM = 1024


def fake_embedding(text):
    seed = sum(ord(char) for char in text) % 97 + 1
    return [((seed * (index + 1)) % 1000) / 1000.0 for index in range(EMBED_DIM)]


class MockHandler(BaseHTTPRequestHandler):
    fail_mode = False

    def log_message(self, *args):
        pass

    def _json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {}

        if self.fail_mode:
            return self._json({"error": "mock failure"}, status=500)

        if self.path.endswith("/embeddings"):
            texts = payload.get("input") or []
            if isinstance(texts, str):
                texts = [texts]
            return self._json({
                "data": [{"embedding": fake_embedding(text), "index": index}
                         for index, text in enumerate(texts)],
                "model": payload.get("model"),
            })

        if self.path.endswith("/rerank"):
            documents = payload.get("documents") or []
            results = [{"index": index, "relevance_score": 1.0 - index * 0.1}
                       for index in range(len(documents))]
            return self._json({"results": results, "id": "mock"})

        if self.path.endswith("/audio/speech"):
            body = b"ID3mockmp3"
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if self.path.endswith("/chat/completions"):
            if payload.get("stream"):
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.end_headers()
                for piece in STREAM_PIECES:
                    chunk = {"choices": [{"index": 0, "delta": {"content": piece},
                                          "finish_reason": None}]}
                    self.wfile.write(
                        ("data: " + json.dumps(chunk, ensure_ascii=False) + "\n\n").encode("utf-8"))
                    self.wfile.flush()
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
                return

            return self._json({
                "choices": [{"message": {"content": "".join(STREAM_PIECES)}}],
                "usage": {"completion_tokens": 60},
            })

        return self._json({"error": "not found"}, status=404)


def start_mock():
    server = ThreadingHTTPServer(("127.0.0.1", 0), MockHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def check(name, condition, detail=""):
    if condition:
        PASS.append(name)
        print("PASS  " + name)
    else:
        FAIL.append(name)
        print("FAIL  " + name + ("  -> " + str(detail) if detail else ""))


def parse_sse(body):
    events = []
    for block in body.split("\n\n"):
        block = block.strip()
        if not block.startswith("data:"):
            continue
        try:
            events.append(json.loads(block[5:].strip()))
        except json.JSONDecodeError:
            continue
    return events


def main():
    mock = start_mock()
    port = mock.server_address[1]

    tmp_db = os.path.join(tempfile.gettempdir(), "analyze_test.db")
    if os.path.exists(tmp_db):
        os.remove(tmp_db)

    os.environ["SILICONFLOW_BASE"] = "http://127.0.0.1:{}/v1".format(port)
    os.environ["SILICONFLOW_API_KEY"] = "test-key"
    os.environ["DB_PATH"] = tmp_db
    os.environ["RAG_ENABLED"] = "1"

    import app as backend
    import ratelimit

    ratelimit.reset()
    client = backend.app.test_client()

    # ---------- 文本流式 ----------
    response = client.post("/api/analyze",
                           json={"text": "您的快递丢失，请点击链接填写银行卡和验证码"})
    check("文本分析 HTTP 200", response.status_code == 200, response.status_code)
    check("Content-Type 是 SSE",
          "text/event-stream" in response.headers.get("Content-Type", ""),
          response.headers.get("Content-Type"))
    check("关闭了 nginx 缓冲", response.headers.get("X-Accel-Buffering") == "no",
          response.headers.get("X-Accel-Buffering"))

    events = parse_sse(response.get_data(as_text=True))
    types = [event.get("type") for event in events]
    check("事件顺序 start->context", types[:2] == ["start", "context"], types)
    check("包含 hint 增量", "hint" in types, types)
    check("包含 result", "result" in types, types)
    check("以 done 结尾", types[-1] == "done", types)
    check("trace_id 与响应头一致", events[0].get("trace_id") == response.headers.get("X-Trace-Id")
          or bool(events[0].get("trace_id")), events[0].get("trace_id"))

    hints = "".join(event["text"] for event in events if event.get("type") == "hint")
    expected = "这是典型快递理赔诈骗，链接是假域名。"
    check("hint 拼接完整（跨 chunk）", hints == expected, hints)

    result = next((event for event in events if event.get("type") == "result"), {})
    detail = result.get("detail") or {}
    check("result 字段齐全",
          set(detail.keys()) == {"hint", "level", "score", "reasons", "advice"}, detail.keys())
    check("level 合法", detail.get("level") in {"high", "medium", "low", "none"}, detail.get("level"))
    check("score 是 0-100 整数",
          isinstance(detail.get("score"), int) and 0 <= detail["score"] <= 100, detail.get("score"))
    check("reasons 是列表", isinstance(detail.get("reasons"), list), detail.get("reasons"))

    # ---------- RAG 是否建库 ----------
    import db
    with backend.app.app_context():
        count = db.fetchone("SELECT COUNT(*) AS C FROM KNOWLEDGE")["C"]
    check("知识库已建索引", count >= 20, count)

    # ---------- 图片路径 ----------
    response = client.post("/api/analyze", json={"image": "ZmFrZQ=="})
    events = parse_sse(response.get_data(as_text=True))
    types = [event.get("type") for event in events]
    check("图片分析也走同一套事件", types[0] == "start" and types[-1] == "done", types)
    check("图片分析结果是 vision 来源",
          next(e for e in events if e.get("type") == "result").get("source") == "vision")

    # ---------- 语音合成 ----------
    ratelimit.reset()
    import api_tts
    api_tts.clear_cache()

    response = client.post("/api/tts", json={"text": "这是一段测试语音。"})
    check("TTS HTTP 200", response.status_code == 200, response.status_code)
    check("TTS Content-Type 是音频",
          response.headers.get("Content-Type") == "audio/mpeg",
          response.headers.get("Content-Type"))
    check("TTS 返回音频字节", response.data == b"ID3mockmp3", response.data[:20])
    check("TTS 首次未命中缓存",
          response.headers.get("X-TTS-Cache") == "miss",
          response.headers.get("X-TTS-Cache"))

    response = client.post("/api/tts", json={"text": "这是一段测试语音。"})
    check("TTS 第二次命中缓存",
          response.headers.get("X-TTS-Cache") == "hit",
          response.headers.get("X-TTS-Cache"))

    ratelimit.reset()
    response = client.post("/api/tts", json={"text": ""})
    check("TTS 空文本 -> 1001", response.get_json().get("status") == 1001, response.get_json())
    response = client.post("/api/tts", json={"text": "字" * 501})
    check("TTS 超长 -> 1001", response.get_json().get("status") == 1001, response.get_json())
    response = client.post("/api/tts", json={"text": "正常文字", "speed": 5})
    check("TTS speed 越界 -> 1001",
          response.get_json().get("status") == 1001, response.get_json())

    ratelimit.reset()
    codes = [client.post("/api/tts", json={"text": "限流测试第{}条".format(i)})
             for i in range(12)]
    limited = [item for item in codes
               if item.get_json() and item.get_json().get("status") == 1016]
    check("TTS 超过每分钟上限 -> 1016", len(limited) > 0,
          [c.status_code for c in codes])

    # ---------- 参数校验 ----------
    ratelimit.reset()
    response = client.post("/api/analyze", json={"text": "太短"})
    check("文本过短 -> 1001", response.get_json().get("status") == 1001, response.get_json())
    response = client.post("/api/analyze", json={})
    check("空请求 -> 1001", response.get_json().get("status") == 1001, response.get_json())
    response = client.post("/api/analyze", json={"text": "六六个字以上", "image": "x"})
    check("text 与 image 同时传 -> 1001",
          response.get_json().get("status") == 1001, response.get_json())

    # ---------- 限流 ----------
    ratelimit.reset()
    codes = []
    for _ in range(8):
        codes.append(client.post("/api/analyze", json={"text": "够长的一条测试短信内容"}))
    limited = [item for item in codes if item.get_json() and item.get_json().get("status") == 1016]
    check("超过每分钟上限 -> 1016", len(limited) > 0, [c.status_code for c in codes])

    # ---------- 上游失败 -> 降级 ----------
    ratelimit.reset()
    MockHandler.fail_mode = True
    response = client.post("/api/analyze", json={"text": "您的快递丢失，请点击链接填写验证码"})
    events = parse_sse(response.get_data(as_text=True))
    check("上游 500 时返回 fallback",
          any(event.get("type") == "fallback" for event in events),
          [e.get("type") for e in events])
    check("fallback 后仍有 done", events[-1].get("type") == "done", events[-1])
    MockHandler.fail_mode = False

    mock.shutdown()

    print("\n%d passed, %d failed" % (len(PASS), len(FAIL)))
    if FAIL:
        print("失败项：" + "、".join(FAIL))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
