"""统一的响应外壳与业务码。

接口约定（见 server.md 通用约定）：
- 所有响应固定包含 status / msg / trace_id 三个字段；
- status 是业务码，与 HTTP 状态码相互独立，HTTP 码由业务码映射得到；
- 失败请求额外写入 ERR_TRACE，便于按 trace_id 复盘。
"""

import uuid

from flask import g, jsonify, request

import db

# 业务码 -> HTTP 状态码
HTTP_STATUS = {
    0: 200,
    1001: 400,
    1002: 400,
    1003: 429,
    1004: 401,
    1005: 409,
    1006: 403,
    1007: 401,
    1008: 403,
    1009: 404,
    1010: 400,
    1011: 404,
    1012: 404,
    1013: 404,
    1014: 404,
    1015: 405,
    1016: 429,
    1017: 503,
    1099: 500,
}


class ApiError(Exception):
    """带业务码的异常，由 app.py 的 errorhandler 统一转成响应。"""

    def __init__(self, status, msg, **extra):
        super().__init__(msg)
        self.status = status
        self.msg = msg
        self.extra = extra


def trace_id():
    if not getattr(g, "trace_id", None):
        g.trace_id = str(uuid.uuid4())
    return g.trace_id


def json_body():
    """取 JSON 请求体；格式不对时给空字典，由各字段校验统一报错。"""
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def respond(status, msg, **extra):
    """构造统一响应。"""
    payload = {"status": status, "msg": msg, "trace_id": trace_id()}
    payload.update(extra)
    g.biz_status = status
    response = jsonify(payload)
    response.status_code = HTTP_STATUS.get(status, 400)
    return response


def record_error_trace(response):
    """把失败请求写入 ERR_TRACE。任何异常都不允许影响正常响应。"""
    status = getattr(g, "biz_status", None)
    if status in (None, 0):
        return
    try:
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            body = {}
        phone = body.get("phone") or body.get("user") or request.args.get("phone")
        scene = body.get("scene") or request.args.get("scene") or request.path
        shell = body.get("shell") or request.args.get("shell")
        ip = request.headers.get("X-Forwarded-For", request.remote_addr)
        db.execute(
            "INSERT OR REPLACE INTO ERR_TRACE "
            "(PHONE, SCENE, SHELL, RET_CONTENT, TRACE_ID, PATH, METHOD, IP, STATUS, CREATED_AT) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))",
            (phone, scene, shell, response.get_data(as_text=True),
             trace_id(), request.path, request.method, ip, status),
        )
    except Exception:  # 追踪失败不影响主流程
        pass
