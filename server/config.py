"""运行配置。

所有可调项都从环境变量读取，默认值面向本地开发；
部署到服务器时只需要设置环境变量，不用改代码。
"""

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _load_dotenv(path):
    """极简 .env 读取：KEY=VALUE 一行一个，# 开头是注释。

    不引入 python-dotenv，因为环境里没有 pip；
    已存在的环境变量优先，不会被文件覆盖。
    """
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)


_load_dotenv(os.path.join(BASE_DIR, ".env"))


def _bool(name, default=False):
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _int(name, default):
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _list(name, default):
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return list(default)
    return [item.strip() for item in raw.split(",") if item.strip()]


class Config:
    # ---- 服务 ----
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = _int("PORT", 14087)
    DEBUG = _bool("DEBUG", False)

    # ---- 数据库 ----
    DB_PATH = os.getenv("DB_PATH") or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "elder.db"
    )

    # ---- 会话 ----
    SESSION_COOKIE = "session"
    SESSION_TTL = 7200                      # 秒，与接口文档一致
    SESSION_COOKIE_SECURE = _bool("SESSION_COOKIE_SECURE", False)
    # 允许携带 Cookie 的前端来源；跨端口不跨站，但 CORS 必须回具体源。
    CORS_ORIGINS = _list(
        "CORS_ORIGINS",
        [
            "http://127.0.0.1:4173",
            "http://localhost:4173",
            "http://127.0.0.1:5173",
            "http://localhost:5173",
            "http://127.0.0.1:14087",
            "http://localhost:14087",
        ],
    )

    # ---- 验证码 ----
    CODE_TTL = 600                          # 10 分钟
    CODE_RESEND_INTERVAL = 60               # 同一手机号 60 秒一次
    CODE_DAILY_LIMIT = 10                   # 每号每天 10 条
    CODE_MAX_ATTEMPTS = 5                   # 错 5 次作废
    CODE_LOG = _bool("CODE_LOG", True)      # 是否把验证码打到控制台（开发用）
    # 演示用：没有短信通道时，把验证码放进接口返回的 debug_code 字段。
    # 生产环境必须为 false，否则任何人都能拿到验证码。
    CODE_REVEAL = _bool("CODE_REVEAL", False)

    # ---- 密码 ----
    # plain: 前端直接传明文（靠 HTTPS 保护）
    # auto:  密文能认出是 SM2 就解密，否则按明文处理（默认，两种都能登录）
    # sm2:   只接受 SM2 密文，拒绝明文
    PASSWORD_MODE = os.getenv("PASSWORD_MODE", "auto").strip().lower()
    SM2_PRIVATE_KEY = os.getenv("SM2_PRIVATE_KEY", "")
    PASSWORD_MIN = 8
    PASSWORD_MAX = 32
    MAX_FAIL = 5                            # 连续密码错误次数
    LOCK_SECONDS = 900                      # 锁定时长 15 分钟
    CIPHER_REPLAY_WINDOW = 60               # SM2 密文 60 秒内去重

    # ---- 短信 ----
    # log: 不真正发送，验证码只打到控制台（默认）
    # aliyun: 调用阿里云短信服务真正发送
    SMS_PROVIDER = os.getenv("SMS_PROVIDER", "log").strip().lower()
    SMS_TIMEOUT = _int("SMS_TIMEOUT", 5)
    ALIYUN_ACCESS_KEY_ID = os.getenv("ALIYUN_ACCESS_KEY_ID", "")
    ALIYUN_ACCESS_KEY_SECRET = os.getenv("ALIYUN_ACCESS_KEY_SECRET", "")
    ALIYUN_SMS_SIGN_NAME = os.getenv("ALIYUN_SMS_SIGN_NAME", "")
    ALIYUN_SMS_TEMPLATE_CODE = os.getenv("ALIYUN_SMS_TEMPLATE_CODE", "")
    ALIYUN_SMS_TEMPLATE_PARAM = os.getenv("ALIYUN_SMS_TEMPLATE_PARAM", "code")
    ALIYUN_SMS_REGION = os.getenv("ALIYUN_SMS_REGION", "cn-hangzhou")

    # ---- AI（SiliconFlow）----
    SILICONFLOW_BASE = os.getenv("SILICONFLOW_BASE", "https://api.siliconflow.cn/v1")
    SILICONFLOW_API_KEY = os.getenv("SILICONFLOW_API_KEY", "").strip()
    AI_ENABLED = bool(SILICONFLOW_API_KEY)

    # 实测结论：DeepSeek-V3.2 在这个任务上比 Qwen3.5 系列快 2-3 倍，
    # 输出也更短（150 tok vs 1300+ tok），所以做主力分析模型。
    AI_MODEL = os.getenv("AI_MODEL", "deepseek-ai/DeepSeek-V3.2")
    AI_VL_MODEL = os.getenv("AI_VL_MODEL", "Qwen/Qwen3-VL-8B-Instruct")
    AI_EMBED_MODEL = os.getenv("AI_EMBED_MODEL", "Pro/BAAI/bge-m3")
    AI_RERANK_MODEL = os.getenv("AI_RERANK_MODEL", "Pro/BAAI/bge-reranker-v2-m3")
    AI_TTS_MODEL = os.getenv("AI_TTS_MODEL", "FunAudioLLM/CosyVoice2-0.5B")
    AI_TTS_VOICE = os.getenv("AI_TTS_VOICE", "FunAudioLLM/CosyVoice2-0.5B:alex")
    AI_TIMEOUT = _int("AI_TIMEOUT", 60)
    AI_MAX_TOKENS = _int("AI_MAX_TOKENS", 260)

    # ---- RAG ----
    RAG_ENABLED = _bool("RAG_ENABLED", True)
    RAG_TOP_K = _int("RAG_TOP_K", 4)

    # ---- 分析接口限制 ----
    ANALYZE_PER_IP_PER_MIN = _int("ANALYZE_PER_IP_PER_MIN", 6)
    ANALYZE_MAX_TEXT = _int("ANALYZE_MAX_TEXT", 2000)

    # ---- 语音合成 ----
    TTS_MAX_TEXT = _int("TTS_MAX_TEXT", 500)
    TTS_PER_IP_PER_MIN = _int("TTS_PER_IP_PER_MIN", 10)
    TTS_CACHE_SIZE = _int("TTS_CACHE_SIZE", 64)

    # ---- HTTPS（仅当证书存在时启用）----
    SSL_CERT = os.getenv("SSL_CERT", "")
    SSL_KEY = os.getenv("SSL_KEY", "")

    @classmethod
    def ssl_context(cls):
        if cls.SSL_CERT and cls.SSL_KEY and os.path.exists(cls.SSL_CERT) and os.path.exists(cls.SSL_KEY):
            return (cls.SSL_CERT, cls.SSL_KEY)
        return None
