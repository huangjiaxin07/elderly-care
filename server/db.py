"""SQLite 访问层：建表、旧库迁移、请求级连接。

线程模型：Flask 默认多线程处理请求，一个全局连接被多线程共用会出现
「事务互相覆盖」和「游标串数据」。所以连接放在 flask.g 上，请求结束即关闭。
"""

import sqlite3

from flask import g

import config


# ---------------------------------------------------------------- 建表语句

SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS USERS (
        ID            INTEGER PRIMARY KEY AUTOINCREMENT,
        PHONE         TEXT    NOT NULL UNIQUE,
        UNAME         TEXT    NOT NULL,
        PWD_HASH      TEXT,
        STATUS        INTEGER NOT NULL DEFAULT 0,
        FAIL_COUNT    INTEGER NOT NULL DEFAULT 0,
        LOCKED_UNTIL  INTEGER,
        CREATE_AT     INTEGER NOT NULL,
        UPDATE_AT     INTEGER NOT NULL,
        DELETE_AT     INTEGER
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS VERIFY_CODE (
        ID        INTEGER PRIMARY KEY AUTOINCREMENT,
        PHONE     TEXT    NOT NULL,
        SCENE     TEXT    NOT NULL,
        CODE      TEXT    NOT NULL,
        SHELL     TEXT,
        TRACE_ID  TEXT,
        SEND_AT   INTEGER NOT NULL,
        EXPIRE_AT INTEGER NOT NULL,
        ATTEMPTS  INTEGER NOT NULL DEFAULT 0,
        USED_AT   INTEGER
    )
    """,
    "CREATE INDEX IF NOT EXISTS IDX_VERIFY_PHONE_SCENE ON VERIFY_CODE(PHONE, SCENE, ID)",
    """
    CREATE TABLE IF NOT EXISTS SESSION (
        TOKEN     TEXT    PRIMARY KEY,
        USER_ID   INTEGER NOT NULL,
        IP        TEXT,
        CREATE_AT INTEGER NOT NULL,
        EXPIRE_AT INTEGER NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS ELDERS (
        ID              INTEGER PRIMARY KEY AUTOINCREMENT,
        OWNER_ID        INTEGER NOT NULL,
        VIEWER_IDS      TEXT    NOT NULL DEFAULT '[]',
        NAME            TEXT    NOT NULL,
        PHONE           TEXT    NOT NULL,
        EMERGENCY_PHONE TEXT    NOT NULL,
        CREATE_AT       INTEGER NOT NULL,
        UPDATE_AT       INTEGER NOT NULL,
        DELETE_AT       INTEGER
    )
    """,
    "CREATE INDEX IF NOT EXISTS IDX_ELDERS_OWNER ON ELDERS(OWNER_ID)",
    """
    CREATE TABLE IF NOT EXISTS HEALTH_RECORD (
        ID          INTEGER PRIMARY KEY AUTOINCREMENT,
        ELDER_ID    INTEGER NOT NULL,
        TYPE        TEXT    NOT NULL,
        VALUE       REAL    NOT NULL,
        VALUE2      REAL,
        UNIT        TEXT    NOT NULL,
        MEASURED_AT INTEGER NOT NULL,
        NOTE        TEXT,
        CREATED_BY  INTEGER NOT NULL,
        CREATE_AT   INTEGER NOT NULL,
        DELETE_AT   INTEGER
    )
    """,
    "CREATE INDEX IF NOT EXISTS IDX_HEALTH_ELDER ON HEALTH_RECORD(ELDER_ID, MEASURED_AT)",
    """
    CREATE TABLE IF NOT EXISTS SOS (
        ID             INTEGER PRIMARY KEY AUTOINCREMENT,
        ELDER_ID       INTEGER NOT NULL,
        USER_ID        INTEGER NOT NULL,
        REASON         TEXT,
        LOCATION       TEXT,
        STATE          TEXT    NOT NULL DEFAULT 'pending',
        NOTIFY_PHONES  TEXT    NOT NULL DEFAULT '[]',
        ACK_BY         INTEGER,
        ACK_AT         INTEGER,
        CREATE_AT      INTEGER NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS IDX_SOS_ELDER ON SOS(ELDER_ID, CREATE_AT)",
    """
    CREATE TABLE IF NOT EXISTS CIPHER_SEEN (
        DIGEST  TEXT    PRIMARY KEY,
        PHONE   TEXT,
        SEEN_AT INTEGER NOT NULL
    )
    """,
]

# 失败请求的追踪表。沿用 app.py 原来的表名与列，只做追加，不破坏已有数据。
LEGACY_ERR_TRACE = """
    CREATE TABLE IF NOT EXISTS ERR_TRACE (
        PHONE        TEXT,
        SCENE        TEXT,
        SHELL        TEXT,
        RET_CONTENT  TEXT,
        TRACE_ID     TEXT UNIQUE
    )
"""
ERR_TRACE_EXTRA_COLUMNS = [
    ("PATH", "TEXT"),
    ("METHOD", "TEXT"),
    ("IP", "TEXT"),
    ("STATUS", "INTEGER"),
    ("CREATED_AT", "INTEGER"),
]


# ---------------------------------------------------------------- 连接管理

def connect():
    conn = sqlite3.connect(config.Config.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def get_db():
    if "db" not in g:
        g.db = connect()
    return g.db


def close_db(exc=None):
    conn = g.pop("db", None)
    if conn is not None:
        try:
            conn.close()
        except Exception:
            pass


# ---------------------------------------------------------------- 便捷查询

def fetchall(sql, args=()):
    return get_db().execute(sql, args).fetchall()


def fetchone(sql, args=()):
    return get_db().execute(sql, args).fetchone()


def execute(sql, args=()):
    conn = get_db()
    cur = conn.execute(sql, args)
    conn.commit()
    return cur


# ---------------------------------------------------------------- 初始化

def _columns(conn, table):
    return {row[1] for row in conn.execute("PRAGMA table_info(%s)" % table)}


def _migrate(conn):
    """把旧库调整到当前结构。

    旧版 app.py 的 VERIFY_CODE 只有 (PHONE, SCENE, SHELL, TRACE_ID)，
    缺少验证码本体，无法使用；该表在旧库里始终为空，直接重建。
    """
    tables = {row[0] for row in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}

    if "VERIFY_CODE" in tables and "CODE" not in _columns(conn, "VERIFY_CODE"):
        conn.execute("DROP TABLE VERIFY_CODE")

    if "USERS" in tables and "FAIL_COUNT" not in _columns(conn, "USERS"):
        # 理论上不会出现：旧版本因 AUTOINCREASE 拼写错误从未建成 USERS。
        conn.execute("DROP TABLE USERS")

    conn.execute(LEGACY_ERR_TRACE)
    existing = _columns(conn, "ERR_TRACE")
    for name, decl in ERR_TRACE_EXTRA_COLUMNS:
        if name not in existing:
            conn.execute("ALTER TABLE ERR_TRACE ADD COLUMN %s %s" % (name, decl))


def init_database():
    conn = connect()
    try:
        _migrate(conn)
        for statement in SCHEMA:
            conn.execute(statement)
        conn.commit()
    finally:
        conn.close()
