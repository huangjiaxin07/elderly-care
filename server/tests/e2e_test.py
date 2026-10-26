"""端到端冒烟测试：按 server.md 的顺序把主要链路跑一遍。

用法（先启动后端）：
    server\\.winv\\Scripts\\python.exe server\\app.py
    server\\.winv\\Scripts\\python.exe server\\tests\\e2e_test.py

可用环境变量 BASE / DB_PATH 指向别的实例。
"""

import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from http.cookiejar import CookieJar

BASE = os.getenv("BASE", "http://127.0.0.1:14087")
HERE = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.abspath(os.path.join(HERE, ".."))
DB_PATH = os.getenv("DB_PATH", os.path.join(SERVER_DIR, "elder.db"))

# 让测试脚本能直接引用后端的 sm2 模块，用来生成 SM2 密文
sys.path.insert(0, SERVER_DIR)

PASS, FAIL = [], []


def load_private_key():
    key = os.getenv("SM2_PRIVATE_KEY")
    if key:
        return key.strip()
    env_path = os.path.join(SERVER_DIR, ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if line.startswith("SM2_PRIVATE_KEY="):
                    return line.split("=", 1)[1].strip()
    return ""


def public_key_hex(private_hex):
    import sm2
    point = sm2.point_mul(sm2.G, int(private_hex, 16))
    return "04{:064x}{:064x}".format(point[0], point[1])


def check(name, condition, detail=""):
    if condition:
        PASS.append(name)
        print("PASS  " + name)
    else:
        FAIL.append(name)
        print("FAIL  " + name + ("  -> " + str(detail) if detail else ""))


class Client:
    """一个用户一个 Client，Cookie 互不干扰。"""

    def __init__(self):
        self.jar = CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar))

    def call(self, method, path, payload=None):
        data = None
        headers = {"Content-Type": "application/json"}
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(BASE + path, data=data,
                                         headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=10) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            raw = error.read().decode("utf-8")
            try:
                return error.code, json.loads(raw)
            except json.JSONDecodeError:
                return error.code, {"raw": raw}


def latest_code(phone, scene):
    conn = sqlite3.connect(DB_PATH)
    try:
        row = conn.execute(
            "SELECT CODE FROM VERIFY_CODE WHERE PHONE = ? AND SCENE = ? "
            "ORDER BY ID DESC LIMIT 1", (phone, scene)).fetchone()
        return row[0] if row else None
    finally:
        conn.close()


def main():
    phone_a = "13800000001"
    phone_b = "13800000002"
    a, b = Client(), Client()

    # ---------- 未登录 ----------
    status, body = a.call("GET", "/api/elders")
    check("未登录访问老人列表 -> 1007", body.get("status") == 1007, body)
    check("1007 对应 HTTP 401", status == 401, status)

    # ---------- 验证码 ----------
    _, body = a.call("POST", "/api/verify", {"phone": phone_a, "scene": "register"})
    check("注册验证码发送 -> 0", body.get("status") == 0, body)
    code_a = latest_code(phone_a, "register")
    check("验证码已落库且为 6 位", bool(code_a) and len(code_a) == 6, code_a)

    _, body = a.call("POST", "/api/verify", {"phone": phone_a, "scene": "register"})
    check("60 秒内重复取码 -> 1003", body.get("status") == 1003, body)

    _, body = a.call("POST", "/api/verify", {"phone": "12345", "scene": "register"})
    check("手机号格式错误 -> 1001", body.get("status") == 1001, body)

    _, body = a.call("POST", "/api/verify", {"phone": phone_a, "scene": "login"})
    check("未注册手机号取登录码 -> 1011", body.get("status") == 1011, body)

    # ---------- 注册 ----------
    _, body = a.call("POST", "/api/register", {
        "user": phone_a, "uname": "张阿姨",
        "passwd": "elder2026", "verify": "000000"})
    check("验证码错误 -> 1002", body.get("status") == 1002, body)

    _, body = a.call("POST", "/api/register", {
        "user": phone_a, "uname": "张阿姨",
        "passwd": "elder2026", "verify": code_a})
    check("注册成功 -> 0", body.get("status") == 0, body)
    check("注册返回 uid", isinstance(body.get("uid"), int), body)
    check("注册返回脱敏手机号", body.get("phone") == "138****0001", body.get("phone"))
    uid_a = body.get("uid")

    _, body = a.call("POST", "/api/register", {
        "user": phone_a, "uname": "重复", "passwd": "elder2026", "verify": code_a})
    check("重复注册 -> 1005", body.get("status") == 1005, body)

    # ---------- 登录 ----------
    _, body = a.call("POST", "/api/login", {"user": phone_a, "passwd": "wrong1234"})
    check("密码错误 -> 1004", body.get("status") == 1004, body)

    _, body = a.call("POST", "/api/login",
                     {"user": phone_a, "passwd": "elder2026", "verify": "123456"})
    check("密码与验证码同时传 -> 1001", body.get("status") == 1001, body)

    _, body = a.call("POST", "/api/login", {"user": phone_a, "passwd": "elder2026"})
    check("密码登录成功 -> 0", body.get("status") == 0, body)

    # ---------- SM2 加密登录 ----------
    private = load_private_key()
    if private:
        import sm2
        public = public_key_hex(private)
        cipher = sm2.encrypt(public, "elder2026")
        _, body = a.call("POST", "/api/login", {"user": phone_a, "passwd": cipher})
        check("SM2 密文登录成功 -> 0", body.get("status") == 0, body)

        _, body = a.call("POST", "/api/login", {"user": phone_a, "passwd": cipher})
        check("同一密文重放 -> 1001", body.get("status") == 1001, body)
    else:
        check("SM2 测试跳过（找不到私钥）", False, "SM2_PRIVATE_KEY 未配置")

    a.call("POST", "/api/verify", {"phone": phone_a, "scene": "login"})
    code_login = latest_code(phone_a, "login")
    _, body = a.call("POST", "/api/login", {"user": phone_a, "verify": code_login})
    check("验证码登录成功 -> 0", body.get("status") == 0, body)

    _, body = a.call("POST", "/api/login", {"user": phone_a, "verify": code_login})
    check("验证码只能用一次 -> 1002", body.get("status") == 1002, body)

    # ---------- 老人档案 ----------
    _, body = a.call("POST", "/api/elders", {
        "name": "张阿姨", "phone": phone_a, "emergency_phone": "13900000009"})
    check("新建档案 -> 0", body.get("status") == 0, body)
    elder_id = body.get("id")
    check("owner_id 取自会话", body.get("owner_id") == uid_a, body)

    _, body = a.call("POST", "/api/elders", {"name": "缺字段"})
    check("缺手机号 -> 1001", body.get("status") == 1001, body)

    _, body = a.call("GET", "/api/elders")
    check("列表返回 1 条", body.get("total") == 1 and len(body.get("items", [])) == 1, body)

    _, body = a.call("PATCH", "/api/elders/%d" % elder_id, {"name": "张奶奶"})
    check("改名成功", body.get("status") == 0 and body.get("name") == "张奶奶", body)

    _, body = a.call("PATCH", "/api/elders/%d" % elder_id, {})
    check("空 PATCH -> 1001", body.get("status") == 1001, body)

    # ---------- 健康记录 ----------
    now = int(time.time())
    _, body = a.call("POST", "/api/elders/%d/health-records" % elder_id, {
        "type": "blood_pressure", "value": 135, "value2": 85,
        "measured_at": now, "note": "早饭后"})
    check("提交血压 -> 0", body.get("status") == 0, body)
    check("单位由服务端回填", body.get("unit") == "mmHg", body.get("unit"))
    record_id = body.get("id")

    _, body = a.call("POST", "/api/elders/%d/health-records" % elder_id, {
        "type": "weight", "value": 62, "value2": 80, "measured_at": now})
    check("体重带了舒张压 -> 1001", body.get("status") == 1001, body)

    _, body = a.call("POST", "/api/elders/%d/health-records" % elder_id, {
        "type": "blood_pressure", "value": 60, "value2": 90, "measured_at": now})
    check("舒张压大于收缩压 -> 1001", body.get("status") == 1001, body)

    _, body = a.call("POST", "/api/elders/%d/health-records" % elder_id, {
        "type": "weight", "value": 999, "measured_at": now})
    check("体重越界 -> 1001", body.get("status") == 1001, body)

    _, body = a.call("POST", "/api/elders/%d/health-records" % elder_id, {
        "type": "blood_glucose", "value": 5.6, "unit": "kg", "measured_at": now})
    check("忽略客户端传的 unit", body.get("unit") == "mmol/L", body.get("unit"))

    _, body = a.call("GET", "/api/elders/%d/health-records" % elder_id)
    check("查询健康记录返回 2 条", body.get("total") == 2, body.get("total"))

    _, body = a.call("GET", "/api/elders/%d/health-records?type=blood_pressure" % elder_id)
    check("按类型过滤返回 1 条", body.get("total") == 1, body.get("total"))

    # ---------- 一键求助 ----------
    _, body = a.call("POST", "/api/elders/%d/sos" % elder_id,
                     {"reason": "头晕", "location": "30.123456,120.123456"})
    check("发起求助 -> 0", body.get("status") == 0, body)
    check("求助状态为 pending", body.get("state") == "pending", body)
    check("通知号码取自紧急联系人",
          body.get("notify_phones") == ["13900000009"], body.get("notify_phones"))
    sos_id = body.get("id")

    _, body = a.call("POST", "/api/elders/%d/sos" % elder_id, {"reason": "再按一次"})
    check("60 秒内连按不新建", body.get("id") == sos_id, body)
    check("连按提示语正确", body.get("msg") == "已发送过求助，请等待处理", body.get("msg"))

    _, body = a.call("POST", "/api/elders/%d/sos" % elder_id, {"location": "30.1,120.1"})
    check("定位格式错误 -> 1001", body.get("status") == 1001, body)

    _, body = a.call("PATCH", "/api/sos/%d" % sos_id, {"state": "acknowledged"})
    check("标记已处理 -> 0", body.get("status") == 0 and body.get("state") == "acknowledged", body)

    _, body = a.call("PATCH", "/api/sos/%d" % sos_id, {"state": "pending"})
    check("已处理改回 pending -> 1001", body.get("status") == 1001, body)

    # ---------- 第二个账号：越权 ----------
    _, _ = b.call("POST", "/api/verify", {"phone": phone_b, "scene": "register"})
    code_b = latest_code(phone_b, "register")
    _, body = b.call("POST", "/api/register", {
        "user": phone_b, "uname": "李叔叔", "passwd": "elder2026", "verify": code_b})
    check("第二个账号注册成功", body.get("status") == 0, body)
    uid_b = body.get("uid")

    _, body = b.call("GET", "/api/elders")
    check("别人看不到我的档案", body.get("total") == 0, body)

    _, body = b.call("GET", "/api/elders/%d" % elder_id)
    check("越权读取 -> 1009（不暴露存在性）", body.get("status") == 1009, body)

    # 加为只读账号
    _, body = a.call("PATCH", "/api/elders/%d" % elder_id, {"viewer_ids": [uid_b]})
    check("加 viewer 成功", body.get("status") == 0 and body.get("viewer_ids") == [uid_b], body)

    _, body = b.call("GET", "/api/elders/%d" % elder_id)
    check("viewer 可见", body.get("status") == 0, body)

    _, body = b.call("PATCH", "/api/elders/%d" % elder_id, {"name": "改一下"})
    check("viewer 改档案 -> 1008", body.get("status") == 1008, body)

    _, body = b.call("POST", "/api/elders/%d/health-records" % elder_id,
                     {"type": "heart_rate", "value": 72, "measured_at": now})
    check("viewer 可以提交健康记录", body.get("status") == 0, body)

    _, body = b.call("DELETE", "/api/elders/%d/health-records/%d" % (elder_id, record_id))
    check("viewer 可以删除健康记录", body.get("status") == 0, body)

    _, body = a.call("GET", "/api/elders/%d/health-records" % elder_id)
    check("软删后不再出现", body.get("total") == 2, body.get("total"))

    # ---------- 删除档案 ----------
    _, body = b.call("DELETE", "/api/elders/%d" % elder_id)
    check("viewer 删档案 -> 1008", body.get("status") == 1008, body)

    _, body = a.call("DELETE", "/api/elders/%d" % elder_id)
    check("owner 删除档案 -> 0", body.get("status") == 0, body)

    _, body = a.call("GET", "/api/elders/%d" % elder_id)
    check("删除后读取 -> 1009", body.get("status") == 1009, body)

    # ---------- 兜底 ----------
    _, body = a.call("GET", "/api/elfers")
    check("未知接口 -> 1014", body.get("status") == 1014, body)

    _, body = a.call("GET", "/not-api")
    check("非接口路径 -> 1008", body.get("status") == 1008, body)

    print("\n%d passed, %d failed" % (len(PASS), len(FAIL)))
    if FAIL:
        print("失败项：" + ", ".join(FAIL))
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
