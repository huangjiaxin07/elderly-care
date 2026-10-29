"""验证码、注册、登录。"""

from flask import Blueprint, current_app, request

import config
import db
import security
import store
from responses import ApiError, json_body, respond

bp = Blueprint("auth", __name__, url_prefix="/api")


def _set_session(response, user_id):
    token = security.issue_session(user_id)
    response.set_cookie(
        config.Config.SESSION_COOKIE,
        token,
        max_age=config.Config.SESSION_TTL,
        httponly=True,
        samesite="Lax",
        secure=config.Config.SESSION_COOKIE_SECURE,
        path="/",
    )
    return response


@bp.route("/verify", methods=["GET", "POST"])
def verify_code():
    """获取验证码。

    文档里写的是 POST + JSON；这里同时兼容 GET 查询参数，
    方便浏览器地址栏或 curl 直接联调。
    """
    params = request.args.to_dict() if request.method == "GET" else json_body()
    phone = params.get("phone")
    scene = params.get("scene")

    if not security.valid_phone(phone):
        raise ApiError(1001, "手机号格式不正确")
    if scene not in ("register", "login"):
        raise ApiError(1001, "scene 只能是 register 或 login")

    exists = store.get_user_by_phone(phone) is not None
    if scene == "register" and exists:
        raise ApiError(1005, "手机号已注册")
    if scene == "login" and not exists:
        raise ApiError(1011, "手机号未注册")

    code = security.send_code(phone, scene, params.get("shell"))
    # 只有「不真正发送」的 log 模式才把验证码打到控制台；
    # 走阿里云时绝不打印，否则日志里就有可用验证码。
    if config.Config.CODE_LOG and config.Config.SMS_PROVIDER == "log":
        current_app.logger.info("[SMS] phone=%s scene=%s code=%s", phone, scene, code)

    # 没有短信通道时的演示兜底：把验证码直接返回，前端/curl 都能直接拿到
    extra = {}
    if config.Config.CODE_REVEAL:
        extra["debug_code"] = code

    return respond(0, "验证码已发送，请在 10 分钟内输入", **extra)


@bp.post("/register")
def register():
    data = json_body()
    phone = store.as_phone(data.get("user"), "手机号")
    uname = store.as_text(data.get("uname"), "昵称", 1, 20)

    raw = data.get("passwd")
    if raw in (None, ""):
        raise ApiError(1001, "缺少密码")
    plain, _ = security.decode_password(raw)
    problem = security.password_problem(plain)
    if problem:
        raise ApiError(1001, problem)

    if store.get_user_by_phone(phone) is not None:
        raise ApiError(1005, "手机号已注册")

    security.check_code(phone, "register", data.get("verify"))

    user = store.create_user(phone, uname, security.hash_password(plain))
    response = respond(0, "注册成功", **store.public_user(user))
    return _set_session(response, user["ID"])


@bp.post("/login")
def login():
    data = json_body()
    phone = store.as_phone(data.get("user"), "手机号")

    passwd = data.get("passwd")
    verify = data.get("verify")
    has_password = passwd not in (None, "")
    has_code = verify not in (None, "")

    # 恰好一个，两个都传或都不传都是参数错误
    if has_password == has_code:
        raise ApiError(1001, "密码与验证码必须恰好提供一个")

    user = store.get_user_by_phone(phone)
    if user is None:
        # 与密码错误返回同一个码，避免被用来探测手机号是否注册
        raise ApiError(1004, "手机号或密码不正确")

    locked_until = user["LOCKED_UNTIL"]
    if locked_until and locked_until > security.now():
        raise ApiError(1006, "账号已锁定，请稍后再试")

    if has_password:
        plain, is_cipher = security.decode_password(passwd)
        if is_cipher:
            security.check_cipher_replay(phone, passwd)
        if not security.verify_password(user["PWD_HASH"], plain):
            fails = user["FAIL_COUNT"] + 1
            if fails >= config.Config.MAX_FAIL:
                db.execute(
                    "UPDATE USERS SET FAIL_COUNT = 0, LOCKED_UNTIL = ? WHERE ID = ?",
                    (security.now() + config.Config.LOCK_SECONDS, user["ID"]))
                raise ApiError(1006, "账号已锁定，请 15 分钟后再试")
            db.execute("UPDATE USERS SET FAIL_COUNT = ? WHERE ID = ?",
                       (fails, user["ID"]))
            raise ApiError(1004, "手机号或密码不正确")
    else:
        security.check_code(phone, "login", verify)

    db.execute(
        "UPDATE USERS SET FAIL_COUNT = 0, LOCKED_UNTIL = NULL, UPDATE_AT = ? WHERE ID = ?",
        (security.now(), user["ID"]))

    response = respond(0, "登录成功", **store.public_user(user))
    return _set_session(response, user["ID"])
