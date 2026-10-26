"""认证与密码相关的全部逻辑：验证码、密码哈希、会话。

密码存储说明
------------
运行环境里没有 argon2-cffi 也没有 pip，所以用标准库的 scrypt
（hashlib.scrypt，属于内存硬型 KDF，抗 GPU 暴力破解）代替 Argon2id。
存储格式：scrypt$N$r$p$salt_b64$hash_b64
算法参数随哈希一起保存，以后换参数也能校验老密码。
"""

import base64
import hashlib
import hmac
import logging
import re
import secrets
import time
from functools import wraps

from flask import g, request

import config
import db
import sms
from responses import ApiError

PHONE_RE = re.compile(r"^1[3-9]\d{9}$")

SCRYPT_N = 16384
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 32


def now():
    return int(time.time())


def valid_phone(value):
    return isinstance(value, str) and bool(PHONE_RE.match(value))


# ---------------------------------------------------------------- 密码哈希

def _b64(raw):
    return base64.b64encode(raw).decode("ascii")


def _unb64(text):
    return base64.b64decode(text.encode("ascii"))


def hash_password(plain):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        plain.encode("utf-8"), salt=salt,
        n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=SCRYPT_DKLEN,
    )
    return "scrypt${}${}${}${}${}".format(
        SCRYPT_N, SCRYPT_R, SCRYPT_P, _b64(salt), _b64(digest))


def verify_password(stored, plain):
    if not stored or not isinstance(plain, str):
        return False
    try:
        scheme, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            plain.encode("utf-8"), salt=_unb64(salt_b64),
            n=int(n), r=int(r), p=int(p), dklen=len(_unb64(hash_b64)),
        )
        return hmac.compare_digest(digest, _unb64(hash_b64))
    except Exception:
        return False


def password_problem(plain):
    """返回不合规原因，合规返回 None。"""
    if not isinstance(plain, str):
        return "密码格式不正确"
    if not (config.Config.PASSWORD_MIN <= len(plain) <= config.Config.PASSWORD_MAX):
        return "密码长度需要 {}–{} 位".format(
            config.Config.PASSWORD_MIN, config.Config.PASSWORD_MAX)
    if not re.search(r"[A-Za-z]", plain) or not re.search(r"\d", plain):
        return "密码必须同时包含字母和数字"
    return None


# ---------------------------------------------------------------- 密码传输

def _sm2_decrypt(cipher_text):
    """用 SM2 私钥解密客户端提交的密码（纯 Python 实现，见 sm2.py）。"""
    private = config.Config.SM2_PRIVATE_KEY
    if not private:
        raise ApiError(1001, "服务端未配置密码解密私钥")
    if not isinstance(cipher_text, str):
        raise ApiError(1001, "密码格式不正确")
    try:
        import sm2 as sm2_lib
        return sm2_lib.decrypt(private, cipher_text)
    except Exception:
        raise ApiError(1001, "密码解密失败，请刷新页面后重试")


def _looks_like_sm2(raw):
    """SM2 密文固定以 04 开头，后面是成对的 hex，长度至少 65+32 字节。"""
    if not isinstance(raw, str):
        return False
    if len(raw) < (65 + 32) * 2 or len(raw) % 2 != 0:
        return False
    return bool(re.fullmatch(r"04[0-9a-fA-F]+", raw))


def decode_password(raw):
    """把客户端提交的 passwd 还原成明文，并说明它原本是不是密文。

    返回 (明文, 是否为密文)。只有密文才需要做重放检查，
    否则明文模式下同一个密码 60 秒内重试会被误判成重放。
    """
    if not isinstance(raw, str) or not raw:
        raise ApiError(1001, "密码格式不正确")

    mode = config.Config.PASSWORD_MODE
    if mode == "plain":
        return raw, False
    if mode == "sm2":
        return _sm2_decrypt(raw), True
    if _looks_like_sm2(raw):
        return _sm2_decrypt(raw), True
    return raw, False


def _digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def check_cipher_replay(phone, cipher_text):
    """SM2 密文 60 秒内不允许重复出现，防止抓包后原样重放。

    明文模式下没有可比对的密文，此检查自动跳过。
    """
    if config.Config.PASSWORD_MODE == "plain":
        return
    digest = _digest(str(cipher_text))
    seen = db.fetchone(
        "SELECT SEEN_AT FROM CIPHER_SEEN WHERE DIGEST = ?", (digest,))
    current = now()
    if seen and current - seen["SEEN_AT"] <= config.Config.CIPHER_REPLAY_WINDOW:
        raise ApiError(1001, "请求已失效，请重新提交")
    db.execute(
        "INSERT OR REPLACE INTO CIPHER_SEEN (DIGEST, PHONE, SEEN_AT) VALUES (?, ?, ?)",
        (digest, phone, current))
    # 顺手清理过期的去重记录
    db.execute("DELETE FROM CIPHER_SEEN WHERE SEEN_AT < ?",
               (current - 3600,))


# ---------------------------------------------------------------- 会话

def issue_session(user_id):
    token = secrets.token_urlsafe(32)
    current = now()
    db.execute("DELETE FROM SESSION WHERE EXPIRE_AT < ?", (current,))
    db.execute(
        "INSERT INTO SESSION (TOKEN, USER_ID, IP, CREATE_AT, EXPIRE_AT) "
        "VALUES (?, ?, ?, ?, ?)",
        (token, user_id, request.remote_addr, current,
         current + config.Config.SESSION_TTL))
    return token


def current_user():
    token = request.cookies.get(config.Config.SESSION_COOKIE)
    if not token:
        return None
    row = db.fetchone(
        "SELECT U.* FROM SESSION S JOIN USERS U ON U.ID = S.USER_ID "
        "WHERE S.TOKEN = ? AND S.EXPIRE_AT > ? AND U.DELETE_AT IS NULL",
        (token, now()))
    return row


def require_user():
    user = current_user()
    if user is None:
        raise ApiError(1007, "未登录或会话已过期")
    return user


def login_required(view):
    """把当前用户放到 flask.g.user，未登录直接 1007。"""

    @wraps(view)
    def wrapper(*args, **kwargs):
        g.user = require_user()
        return view(*args, **kwargs)

    return wrapper


def mask_phone(phone):
    if not isinstance(phone, str) or len(phone) < 7:
        return phone
    return phone[:3] + "****" + phone[-4:]


# ---------------------------------------------------------------- 验证码

def _day_start(timestamp):
    return timestamp - (timestamp + 8 * 3600) % 86400  # 按东八区算自然日


def send_code(phone, scene, shell=None):
    current = now()

    last = db.fetchone(
        "SELECT SEND_AT FROM VERIFY_CODE WHERE PHONE = ? AND SCENE = ? "
        "ORDER BY ID DESC LIMIT 1", (phone, scene))
    if last and current - last["SEND_AT"] < config.Config.CODE_RESEND_INTERVAL:
        wait = config.Config.CODE_RESEND_INTERVAL - (current - last["SEND_AT"])
        raise ApiError(1003, "验证码发送过于频繁，请 {} 秒后再试".format(wait))

    sent_today = db.fetchone(
        "SELECT COUNT(*) AS C FROM VERIFY_CODE WHERE PHONE = ? AND SEND_AT >= ?",
        (phone, _day_start(current)))["C"]
    if sent_today >= config.Config.CODE_DAILY_LIMIT:
        raise ApiError(1003, "今日获取验证码次数已达上限")

    code = "{:06d}".format(secrets.randbelow(1000000))
    cursor = db.execute(
        "INSERT INTO VERIFY_CODE (PHONE, SCENE, CODE, SHELL, TRACE_ID, SEND_AT, EXPIRE_AT) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (phone, scene, code, shell, None, current,
         current + config.Config.CODE_TTL))

    # 真正发送。发不出去就把这条验证码删掉，不能留下「用户收不到但库里有效」的记录。
    try:
        sms.deliver(phone, code)
    except sms.SmsError as error:
        db.execute("DELETE FROM VERIFY_CODE WHERE ID = ?", (cursor.lastrowid,))
        logging.getLogger("sms").error("发送失败：%s", error)
        raise ApiError(1099, "验证码发送失败，请稍后再试")

    return code


def check_code(phone, scene, code):
    """校验并消费验证码；任何不通过都抛 ApiError。"""
    row = db.fetchone(
        "SELECT * FROM VERIFY_CODE WHERE PHONE = ? AND SCENE = ? AND USED_AT IS NULL "
        "ORDER BY ID DESC LIMIT 1", (phone, scene))
    if row is None:
        raise ApiError(1002, "验证码错误或已过期")

    if row["EXPIRE_AT"] < now():
        raise ApiError(1002, "验证码已过期，请重新获取")

    if row["ATTEMPTS"] >= config.Config.CODE_MAX_ATTEMPTS:
        raise ApiError(1010, "验证码错误次数过多，请重新获取")

    submitted = "" if code is None else str(code).strip()
    if not submitted or not hmac.compare_digest(row["CODE"], submitted):
        attempts = row["ATTEMPTS"] + 1
        db.execute("UPDATE VERIFY_CODE SET ATTEMPTS = ? WHERE ID = ?",
                   (attempts, row["ID"]))
        if attempts >= config.Config.CODE_MAX_ATTEMPTS:
            raise ApiError(1010, "验证码错误次数过多，请重新获取")
        raise ApiError(1002, "验证码错误或已过期")

    db.execute("UPDATE VERIFY_CODE SET USED_AT = ? WHERE ID = ?", (now(), row["ID"]))
