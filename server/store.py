"""数据访问与业务校验。

路由层只做「取参数 → 调这里 → 返回」，所有判断集中在本文件，
这样权限和取值范围只有一套实现，不会在两处写出不同结果。
"""

import json
import re
import time

import db
from responses import ApiError
from security import valid_phone

LOCATION_RE = re.compile(r"^(-?\d{1,3}\.\d{6}),(-?\d{1,3}\.\d{6})$")
DAY2000 = 946684800

# 健康记录类型：取值范围与单位由服务端决定，不接受客户端传入的单位
HEALTH_TYPES = {
    "blood_pressure": {"unit": "mmHg", "low": 60.0, "high": 260.0,
                       "low2": 30.0, "high2": 180.0},
    "blood_glucose": {"unit": "mmol/L", "low": 1.0, "high": 35.0},
    "heart_rate": {"unit": "次/分", "low": 30.0, "high": 220.0},
    "weight": {"unit": "kg", "low": 20.0, "high": 200.0},
    "temperature": {"unit": "°C", "low": 33.0, "high": 43.0},
}

SOS_STATES = ("pending", "acknowledged", "closed")


def now():
    return int(time.time())


# ---------------------------------------------------------------- 基础校验

def as_text(value, field, min_len=0, max_len=200):
    if not isinstance(value, str):
        raise ApiError(1001, "{}格式不正确".format(field))
    text = value.strip()
    if len(text) < min_len or len(text) > max_len:
        raise ApiError(1001, "{}长度需要在 {}–{} 字之间".format(field, min_len, max_len))
    return text


def as_int(value, field):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ApiError(1001, "{}需要是整数".format(field))
    return value


def as_number(value, field):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ApiError(1001, "{}需要是数字".format(field))
    return float(value)


def as_phone(value, field="手机号"):
    if not isinstance(value, str) or not valid_phone(value.strip()):
        raise ApiError(1001, "{}格式不正确".format(field))
    return value.strip()


def as_optional_text(value, field, max_len=200):
    if value is None:
        return None
    if not isinstance(value, str):
        raise ApiError(1001, "{}格式不正确".format(field))
    text = value.strip()
    if len(text) > max_len:
        raise ApiError(1001, "{}不能超过 {} 字".format(field, max_len))
    return text or None


def parse_paging(args):
    def _int(name, default):
        try:
            value = int(args.get(name, default))
        except (TypeError, ValueError):
            return default
        return value

    page = max(1, _int("page", 1))
    size = _int("size", 20)
    size = 20 if size < 1 else min(size, 100)
    return page, size


def _number_out(value):
    """整数就按整数返回，避免 JSON 里出现 135.0。"""
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


# ---------------------------------------------------------------- 用户

def public_user(row):
    from security import mask_phone
    return {"uid": row["ID"], "uname": row["UNAME"], "phone": mask_phone(row["PHONE"])}


def get_user(uid):
    return db.fetchone("SELECT * FROM USERS WHERE ID = ? AND DELETE_AT IS NULL", (uid,))


def get_user_by_phone(phone):
    return db.fetchone("SELECT * FROM USERS WHERE PHONE = ? AND DELETE_AT IS NULL", (phone,))


def create_user(phone, uname, pwd_hash):
    current = now()
    cur = db.execute(
        "INSERT INTO USERS (PHONE, UNAME, PWD_HASH, CREATE_AT, UPDATE_AT) "
        "VALUES (?, ?, ?, ?, ?)", (phone, uname, pwd_hash, current, current))
    return get_user(cur.lastrowid)


def mask(user_row):
    from security import mask_phone
    return mask_phone(user_row["PHONE"])


# ---------------------------------------------------------------- 老人档案

def viewer_ids(row):
    try:
        data = json.loads(row["VIEWER_IDS"] or "[]")
        return [int(item) for item in data if isinstance(item, int)]
    except Exception:
        return []


def serialize_elder(row):
    return {
        "id": row["ID"],
        "owner_id": row["OWNER_ID"],
        "viewer_ids": viewer_ids(row),
        "name": row["NAME"],
        "phone": row["PHONE"],
        "emergency_phone": row["EMERGENCY_PHONE"],
        "created_at": row["CREATE_AT"],
        "updated_at": row["UPDATE_AT"],
        "deleted_at": row["DELETE_AT"],
    }


def _elder_row(elder_id):
    return db.fetchone("SELECT * FROM ELDERS WHERE ID = ?", (elder_id,))


def resolve_elder(elder_id, uid):
    """读权限：owner 或 viewer 都算「看得见」。

    看不见与不存在一律返回 1009，不让调用方靠响应差异探测档案是否存在。
    """
    row = _elder_row(elder_id)
    if row is None or row["DELETE_AT"] is not None:
        raise ApiError(1009, "老人信息不存在")
    if row["OWNER_ID"] != uid and uid not in viewer_ids(row):
        raise ApiError(1009, "老人信息不存在")
    return row


def resolve_elder_owner(elder_id, uid):
    """写权限：只有 owner 能改档案本身。"""
    row = resolve_elder(elder_id, uid)
    if row["OWNER_ID"] != uid:
        raise ApiError(1008, "无权修改该老人信息")
    return row


def can_access_elder(elder_id, uid):
    """不抛异常的可见性判断，供求助等需要区分 1008 与 1009 的场景使用。"""
    row = _elder_row(elder_id)
    if row is None or row["DELETE_AT"] is not None:
        return False
    return row["OWNER_ID"] == uid or uid in viewer_ids(row)


def list_elders(uid, page, size):
    """当前账号可见的档案（未删除），权限过滤与分页都在 SQL 里完成。

    viewer_ids 以 JSON 数组存库，用 SQLite 的 json_each 展开后比对，
    避免「先全查出来再在 Python 里判断」导致的分页错位与越权遗漏。
    """
    condition = (
        "E.DELETE_AT IS NULL AND (E.OWNER_ID = ? OR EXISTS ("
        "SELECT 1 FROM json_each(E.VIEWER_IDS) WHERE json_each.value = ?))"
    )
    total = db.fetchone(
        "SELECT COUNT(*) AS C FROM ELDERS E WHERE " + condition,
        (uid, uid))["C"]
    rows = db.fetchall(
        "SELECT E.* FROM ELDERS E WHERE {} ORDER BY E.ID DESC LIMIT ? OFFSET ?".format(
            condition),
        (uid, uid, size, (page - 1) * size))
    return rows, total


def normalize_viewer_ids(value, owner_id):
    if value is None:
        return []
    if not isinstance(value, list):
        raise ApiError(1001, "绑定账号需要是数组")
    if len(value) > 20:
        raise ApiError(1001, "绑定账号不能超过 20 个")
    result = []
    for item in value:
        if isinstance(item, bool) or not isinstance(item, int):
            raise ApiError(1001, "绑定账号需要是账号 id 数组")
        if item == owner_id or item in result:
            continue
        if get_user(item) is None:
            raise ApiError(1001, "绑定的账号不存在")
        result.append(item)
    return result


def create_elder(owner_id, name, phone, emergency_phone, viewers):
    current = now()
    cur = db.execute(
        "INSERT INTO ELDERS (OWNER_ID, VIEWER_IDS, NAME, PHONE, EMERGENCY_PHONE, "
        "CREATE_AT, UPDATE_AT) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (owner_id, json.dumps(viewers), name, phone, emergency_phone, current, current))
    return serialize_elder(_elder_row(cur.lastrowid))


def update_elder(elder_id, fields):
    if not fields:
        raise ApiError(1001, "没有需要修改的字段")
    assignments = ", ".join("{} = ?".format(key) for key in fields)
    values = list(fields.values()) + [now(), elder_id]
    db.execute(
        "UPDATE ELDERS SET {}, UPDATE_AT = ? WHERE ID = ?".format(assignments), values)
    return serialize_elder(_elder_row(elder_id))


def soft_delete_elder(elder_id):
    db.execute("UPDATE ELDERS SET DELETE_AT = ? WHERE ID = ?", (now(), elder_id))


# ---------------------------------------------------------------- 健康记录

def serialize_health(row):
    return {
        "id": row["ID"],
        "elder_id": row["ELDER_ID"],
        "type": row["TYPE"],
        "value": _number_out(row["VALUE"]),
        "value2": _number_out(row["VALUE2"]),
        "unit": row["UNIT"],
        "measured_at": row["MEASURED_AT"],
        "note": row["NOTE"],
        "created_by": row["CREATED_BY"],
        "created_at": row["CREATE_AT"],
        "deleted_at": row["DELETE_AT"],
    }


def validate_health(payload):
    meta = payload.get("type")
    if meta not in HEALTH_TYPES:
        raise ApiError(1001, "健康记录类型不合法")
    spec = HEALTH_TYPES[meta]

    value = as_number(payload.get("value"), "测量值")
    if not (spec["low"] <= value <= spec["high"]):
        raise ApiError(1001, "测量值超出允许范围（{}–{}）".format(
            _number_out(spec["low"]), _number_out(spec["high"])))

    value2 = payload.get("value2")
    if meta == "blood_pressure":
        if value2 is None:
            raise ApiError(1001, "血压需要同时提供舒张压")
        value2 = as_number(value2, "舒张压")
        if not (spec["low2"] <= value2 <= spec["high2"]):
            raise ApiError(1001, "舒张压超出允许范围（{}–{}）".format(
                _number_out(spec["low2"]), _number_out(spec["high2"])))
        if value2 >= value:
            raise ApiError(1001, "舒张压必须小于收缩压")
    else:
        if value2 is not None:
            raise ApiError(1001, "该类型不需要舒张压")
        value2 = None

    measured_at = payload.get("measured_at")
    if measured_at is None:
        raise ApiError(1001, "缺少测量时间")
    measured_at = as_int(measured_at, "测量时间")
    current = now()
    if measured_at < DAY2000:
        raise ApiError(1001, "测量时间不合法")
    if measured_at > current + 300:
        raise ApiError(1001, "测量时间不能晚于当前时间")

    note = as_optional_text(payload.get("note"), "备注", 200)

    return {
        "type": meta,
        "value": value,
        "value2": value2,
        "unit": spec["unit"],
        "measured_at": measured_at,
        "note": note,
    }


def create_health(elder_id, uid, data):
    current = now()
    cur = db.execute(
        "INSERT INTO HEALTH_RECORD (ELDER_ID, TYPE, VALUE, VALUE2, UNIT, MEASURED_AT, "
        "NOTE, CREATED_BY, CREATE_AT) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (elder_id, data["type"], data["value"], data["value2"], data["unit"],
         data["measured_at"], data["note"], uid, current))
    return serialize_health(db.fetchone(
        "SELECT * FROM HEALTH_RECORD WHERE ID = ?", (cur.lastrowid,)))


def get_health(record_id):
    return db.fetchone("SELECT * FROM HEALTH_RECORD WHERE ID = ?", (record_id,))


def query_health(elder_id, args):
    page, size = parse_paging(args)
    where = ["ELDER_ID = ?", "DELETE_AT IS NULL"]
    params = [elder_id]

    record_type = args.get("type")
    if record_type:
        if record_type not in HEALTH_TYPES:
            raise ApiError(1001, "健康记录类型不合法")
        where.append("TYPE = ?")
        params.append(record_type)

    for key, op in (("from", ">="), ("to", "<=")):
        raw = args.get(key)
        if raw in (None, ""):
            continue
        try:
            params.append(int(raw))
        except (TypeError, ValueError):
            raise ApiError(1001, "时间范围需要是整数时间戳")
        where.append("MEASURED_AT {} ?".format(op))

    clause = " AND ".join(where)
    total = db.fetchone(
        "SELECT COUNT(*) AS C FROM HEALTH_RECORD WHERE " + clause, params)["C"]
    rows = db.fetchall(
        "SELECT * FROM HEALTH_RECORD WHERE {} ORDER BY MEASURED_AT DESC, ID DESC "
        "LIMIT ? OFFSET ?".format(clause), params + [size, (page - 1) * size])
    return [serialize_health(row) for row in rows], total, page, size


def soft_delete_health(record_id):
    db.execute("UPDATE HEALTH_RECORD SET DELETE_AT = ? WHERE ID = ?", (now(), record_id))


# ---------------------------------------------------------------- 一键求助

def serialize_sos(row):
    try:
        phones = json.loads(row["NOTIFY_PHONES"] or "[]")
    except Exception:
        phones = []
    return {
        "id": row["ID"],
        "elder_id": row["ELDER_ID"],
        "user_id": row["USER_ID"],
        "reason": row["REASON"],
        "location": row["LOCATION"],
        "state": row["STATE"],
        "notify_phones": phones,
        "acknowledged_by": row["ACK_BY"],
        "acknowledged_at": row["ACK_AT"],
        "created_at": row["CREATE_AT"],
    }


def validate_location(value):
    if value in (None, ""):
        return None
    if not isinstance(value, str) or not LOCATION_RE.match(value.strip()):
        raise ApiError(1001, "定位格式需要是「纬度,经度」，各 6 位小数")
    lat, lng = value.strip().split(",")
    if not (-90 <= float(lat) <= 90 and -180 <= float(lng) <= 180):
        raise ApiError(1001, "定位超出合法范围")
    return value.strip()


def create_sos(elder, uid, reason, location):
    current = now()
    phones = [elder["EMERGENCY_PHONE"]] if elder["EMERGENCY_PHONE"] else []
    cur = db.execute(
        "INSERT INTO SOS (ELDER_ID, USER_ID, REASON, LOCATION, STATE, NOTIFY_PHONES, CREATE_AT) "
        "VALUES (?, ?, ?, ?, 'pending', ?, ?)",
        (elder["ID"], uid, reason, location, json.dumps(phones), current))
    return db.fetchone("SELECT * FROM SOS WHERE ID = ?", (cur.lastrowid,))


def recent_sos(elder_id, uid, window):
    return db.fetchone(
        "SELECT * FROM SOS WHERE ELDER_ID = ? AND USER_ID = ? AND CREATE_AT >= ? "
        "ORDER BY ID DESC LIMIT 1", (elder_id, uid, now() - window))


def get_sos(sos_id):
    return db.fetchone("SELECT * FROM SOS WHERE ID = ?", (sos_id,))


def query_sos(elder_id, args):
    page, size = parse_paging(args)
    where = ["ELDER_ID = ?"]
    params = [elder_id]
    state = args.get("state")
    if state:
        if state not in SOS_STATES:
            raise ApiError(1001, "求助状态不合法")
        where.append("STATE = ?")
        params.append(state)
    clause = " AND ".join(where)
    total = db.fetchone("SELECT COUNT(*) AS C FROM SOS WHERE " + clause, params)["C"]
    rows = db.fetchall(
        "SELECT * FROM SOS WHERE {} ORDER BY CREATE_AT DESC, ID DESC LIMIT ? OFFSET ?".format(clause),
        params + [size, (page - 1) * size])
    return [serialize_sos(row) for row in rows], total, page, size


def ack_sos(row, uid, target):
    if target not in ("acknowledged", "closed"):
        raise ApiError(1001, "状态只能改为 acknowledged 或 closed")
    current_state = row["STATE"]
    if current_state == "closed":
        raise ApiError(1001, "已结束的求助不能再修改")
    if current_state == "acknowledged" and target != "closed":
        raise ApiError(1001, "已处理的求助只能结束")
    db.execute("UPDATE SOS SET STATE = ?, ACK_BY = ?, ACK_AT = ? WHERE ID = ?",
               (target, uid, now(), row["ID"]))
    return get_sos(row["ID"])
