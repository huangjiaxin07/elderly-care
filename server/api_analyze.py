"""AI 反诈分析接口：SSE 流式输出。

协议细节见 server.md 第 6 节；前端对接见 FRONTEND-API.md。
"""

import json

from flask import Blueprint, Response, g, request, stream_with_context

import analyzer
import config
import ratelimit
from responses import ApiError, json_body

bp = Blueprint("analyze", __name__, url_prefix="/api")

# 图片 base64 上限：2MB 原图约 2.7MB base64，留一点余量
MAX_IMAGE_CHARS = int(2.7 * 1024 * 1024)


def _sse(event):
    return "data: " + json.dumps(event, ensure_ascii=False) + "\n\n"


def _client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


@bp.post("/analyze")
def analyze():
    if not config.Config.AI_ENABLED:
        raise ApiError(1017, "AI 分析服务未配置，请使用本地规则判断")

    data = json_body()
    text = data.get("text")
    image = data.get("image")

    if text is not None and image is not None:
        raise ApiError(1001, "text 与 image 只能提供一个")
    if text is None and image is None:
        raise ApiError(1001, "请提供 text 或 image")

    if text is not None:
        if not isinstance(text, str):
            raise ApiError(1001, "text 需要是字符串")
        text = text.strip()
        if len(text) < 6:
            raise ApiError(1001, "请至少输入 6 个字，这样判断会更准确")
        if len(text) > config.Config.ANALYZE_MAX_TEXT:
            raise ApiError(1001, "内容过长，请控制在 {} 字以内".format(
                config.Config.ANALYZE_MAX_TEXT))
    else:
        if not isinstance(image, str) or not image:
            raise ApiError(1001, "image 需要是 base64 字符串")
        if len(image) > MAX_IMAGE_CHARS:
            raise ApiError(1001, "图片过大，请压缩到 2MB 以内")

    ok, retry = ratelimit.hit(
        "analyze:" + _client_ip(), config.Config.ANALYZE_PER_IP_PER_MIN)
    if not ok:
        raise ApiError(1016, "请求太频繁，请 {} 秒后再试".format(retry))

    trace = g.trace_id
    if text is not None:
        events = analyzer.analyze_text(text, trace)
    else:
        events = analyzer.analyze_image(image, trace)

    @stream_with_context
    def generate():
        try:
            for event in events:
                yield _sse(event)
        except GeneratorExit:
            # 前端断开，正常结束
            raise
        except Exception as error:  # 兜底，保证连接不会挂死
            yield _sse({"type": "fallback", "reason": "internal",
                        "detail": str(error)[:200]})
            yield _sse({"type": "done", "elapsed_ms": 0})

    response = Response(generate(), mimetype="text/event-stream")
    response.headers["Cache-Control"] = "no-cache"
    response.headers["X-Accel-Buffering"] = "no"   # 关键：告诉 nginx 别缓存
    response.headers["Connection"] = "keep-alive"
    return response
