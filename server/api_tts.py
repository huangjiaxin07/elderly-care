"""语音合成：把文字转成 mp3。

前端原来用浏览器自带的 speechSynthesis，问题是在老人手机上经常只有机械音，
部分安卓机干脆没有中文语音。这里改用 CosyVoice2，音色自然得多。

同一段文字会被反复朗读（比如固定的建议语），所以做了进程内缓存，
命中缓存不产生任何 API 调用。
"""

import threading
from collections import OrderedDict

from flask import Blueprint, Response, request

import ai
import config
import ratelimit
from responses import ApiError, json_body

bp = Blueprint("tts", __name__, url_prefix="/api")

_cache = OrderedDict()
_lock = threading.Lock()


def _cache_key(text, voice, speed):
    return "\x00".join((voice, str(speed), text))


def _cache_get(key):
    with _lock:
        if key not in _cache:
            return None
        _cache.move_to_end(key)
        return _cache[key]


def _cache_put(key, audio):
    limit = config.Config.TTS_CACHE_SIZE
    if limit <= 0:
        return
    with _lock:
        _cache[key] = audio
        _cache.move_to_end(key)
        while len(_cache) > limit:
            _cache.popitem(last=False)


def clear_cache():
    with _lock:
        _cache.clear()


@bp.post("/tts")
def synthesize():
    if not config.Config.AI_ENABLED:
        raise ApiError(1017, "语音合成服务未配置")

    data = json_body()

    text = data.get("text")
    if not isinstance(text, str):
        raise ApiError(1001, "text 需要是字符串")
    text = text.strip()
    if not text:
        raise ApiError(1001, "请提供需要朗读的文字")
    if len(text) > config.Config.TTS_MAX_TEXT:
        raise ApiError(1001, "文字过长，请控制在 {} 字以内".format(
            config.Config.TTS_MAX_TEXT))

    voice = data.get("voice") or config.Config.AI_TTS_VOICE
    if not isinstance(voice, str) or len(voice) > 120:
        raise ApiError(1001, "voice 格式不正确")

    speed = data.get("speed")
    if speed is not None:
        if isinstance(speed, bool) or not isinstance(speed, (int, float)):
            raise ApiError(1001, "speed 需要是数字")
        speed = float(speed)
        if not 0.5 <= speed <= 2.0:
            raise ApiError(1001, "speed 需要在 0.5 到 2.0 之间")

    forwarded = request.headers.get("X-Forwarded-For", "")
    client = forwarded.split(",")[0].strip() if forwarded else (request.remote_addr or "unknown")
    ok, retry = ratelimit.hit(
        "tts:" + client, config.Config.TTS_PER_IP_PER_MIN)
    if not ok:
        raise ApiError(1016, "请求太频繁，请 {} 秒后再试".format(retry))

    key = _cache_key(text, voice, speed)
    audio = _cache_get(key)
    cached = audio is not None

    if not cached:
        try:
            audio = ai.tts(text, voice=voice, speed=speed)
        except ai.AiError as error:
            raise ApiError(1099, "语音合成失败，请稍后再试：{}".format(str(error)[:80]))
        if not audio:
            raise ApiError(1099, "语音合成没有返回音频")
        _cache_put(key, audio)

    response = Response(audio, mimetype="audio/mpeg")
    response.headers["Content-Length"] = str(len(audio))
    # 同一段文字的结果是稳定的，可以放心让浏览器缓存
    response.headers["Cache-Control"] = "public, max-age=86400"
    response.headers["X-TTS-Cache"] = "hit" if cached else "miss"
    return response
