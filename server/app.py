"""银龄无诈 · 后端入口。

运行：server\\.winv\\Scripts\\python.exe server\\app.py
默认监听 0.0.0.0:14087，接口前缀 /api。

原 app.py 的问题（已修）：
- CREATE TABLE 里 AUTOINCREASE 拼写错误，USERS 表从未建成；
- request.get() 不是 Flask 的方法，验证码接口必然抛异常；
- 全局 sqlite 连接被多线程共用，存在事务互相覆盖的风险；
- 写死了 Linux 的证书路径，在 Windows 上启动即失败。
"""

import os
import logging
import sys
import traceback
import uuid

from flask import Flask, g, request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import api_auth
import api_elders
import api_health
import api_sos
import config
import db
from responses import ApiError, record_error_trace, respond


def create_app():
    app = Flask(__name__)
    app.json.ensure_ascii = False
    app.json.sort_keys = False

    # Flask 默认日志级别是 WARNING，会把验证码日志吞掉；
    # 开发阶段需要看到验证码，所以显式调低到 INFO。
    if config.Config.CODE_LOG:
        app.logger.setLevel(logging.INFO)

    db.init_database()
    app.teardown_appcontext(db.close_db)

    app.register_blueprint(api_auth.bp)
    app.register_blueprint(api_elders.bp)
    app.register_blueprint(api_health.bp)
    app.register_blueprint(api_sos.bp)

    # ------------------------------------------------------------ 请求钩子

    @app.before_request
    def prepare_request():
        g.trace_id = str(uuid.uuid4())
        # 跨端口联调会有预检请求，交给 CORS 头处理，不要落到路由上
        if request.method == "OPTIONS":
            return ("", 204)

    @app.after_request
    def finalize(response):
        origin = request.headers.get("Origin")
        if origin and origin in config.Config.CORS_ORIGINS:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers.add("Vary", "Origin")
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = (
            "GET, POST, PATCH, DELETE, OPTIONS")

        record_error_trace(response)
        return response

    # ------------------------------------------------------------ 异常映射

    @app.errorhandler(ApiError)
    def handle_api_error(error):
        return respond(error.status, error.msg, **error.extra)

    @app.errorhandler(404)
    def handle_not_found(error):
        return respond(1014, "接口不存在")

    @app.errorhandler(405)
    def handle_method_not_allowed(error):
        return respond(1015, "请求方法不允许")

    @app.errorhandler(Exception)
    def handle_unexpected(error):
        if isinstance(error, ApiError):
            return respond(error.status, error.msg, **error.extra)
        app.logger.error("unhandled: %s", traceback.format_exc())
        return respond(1099, "服务器内部错误")

    # ------------------------------------------------------------ 兜底路由
    # 后端只提供接口，不托管前端页面（前端由 node server.js 提供）。
    @app.route("/")
    @app.route("/<path:path>")
    def deny(path=""):
        if path == "api" or path.startswith("api/"):
            return respond(1014, "接口不存在")
        return respond(1008, "禁止访问")

    return app


app = create_app()


if __name__ == "__main__":
    ssl_context = config.Config.ssl_context()
    print("银龄无诈 · 后端：http{}://{}:{}".format(
        "s" if ssl_context else "",
        "127.0.0.1" if config.Config.HOST == "0.0.0.0" else config.Config.HOST,
        config.Config.PORT))
    app.run(
        config.Config.HOST,
        config.Config.PORT,
        debug=config.Config.DEBUG,
        ssl_context=ssl_context,
    )
