# 后端服务（Flask + SQLite）

按 [`server.md`](server.md) 实现的接口服务。前端仍是纯静态页，由 `node server.js` 提供，
两边通过 CORS + Cookie 会话联调。

## 运行

```powershell
# 项目根目录
server\.winv\Scripts\python.exe server\app.py
# 默认 http://0.0.0.0:14087，接口前缀 /api
```

依赖只有 Flask（虚拟环境里已装好）。SM2 / SM3 都是自己实现的，不需要 `gmssl`，也不需要 pip。

## 目录

| 文件 | 作用 |
| --- | --- |
| `app.py` | 入口：建表、注册蓝图、CORS、异常映射、兜底路由 |
| `config.py` | 配置：自动读取 `.env`，再读环境变量（环境变量优先） |
| `db.py` | 连接管理、建表、旧库迁移 |
| `responses.py` | 统一响应外壳 `status/msg/trace_id`、业务码→HTTP 码、失败请求追踪 |
| `security.py` | 验证码、密码哈希、会话、登录装饰器 |
| `sm2.py` | 纯 Python 的 SM3 + SM2（加解密），带 `keygen` / `selftest` 命令行 |
| `sms.py` | 短信通道：`log`（只提示）/ `aliyun`（真发） |
| `store.py` | 所有数据读写与取值范围校验，权限判断只此一处 |
| `api_auth.py` | `/api/verify`、`/api/register`、`/api/login` |
| `api_elders.py` | `/api/elders` 增删改查 |
| `api_health.py` | `/api/elders/{id}/health-records` |
| `api_sos.py` | `/api/elders/{id}/sos`、`/api/sos/{id}` |
| `tests/e2e_test.py` | 端到端冒烟测试，55 条断言（含 SM2 登录与重放） |
| `.env` | 本地配置（演示密钥、短信开关） |
| `ALIYUN-SMS.md` | 阿里云短信开通与接入步骤 |
| `FRONTEND-API.md` | **给前端的对接文档**：复制即用的 fetch 封装 + 每个接口的调用示例 |

## 配置

配置写在 [`server/.env`](.env)，`config.py` 启动时自动读取；同名的系统环境变量优先。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` / `PORT` | `0.0.0.0` / `14087` | 监听地址 |
| `DEBUG` | `false` | 打开后有自动重载和详细异常页，仅本地用 |
| `DB_PATH` | `server/elder.db` | SQLite 文件路径 |
| `CORS_ORIGINS` | 本地 4173 / 5173 / 14087 | 逗号分隔，必须是具体来源，不能用 `*` |
| `SESSION_COOKIE_SECURE` | `false` | 上 HTTPS 后改成 `true` |
| `SMS_PROVIDER` | `log` | `log` 只提示；`aliyun` 真发短信 |
| `CODE_LOG` | `true` | `log` 模式下把验证码打到控制台 |
| `PASSWORD_MODE` | `auto` | `auto` / `plain` / `sm2` |
| `SM2_PRIVATE_KEY` | 演示密钥 | 与 `js/crypto.js` 的公钥配对 |
| `ALIYUN_*` | 空 | 见 [`ALIYUN-SMS.md`](ALIYUN-SMS.md) |
| `SSL_CERT` / `SSL_KEY` | 空 | 两个都存在才启用 HTTPS |

## 前端怎么加密

**[`js/crypto.js`](../js/crypto.js) 是零依赖的，直接引入即可**：

```html
<script src="js/crypto.js"></script>
<script>
  async function login(phone, password) {
    const response = await fetch("http://127.0.0.1:14087/api/login", {
      method: "POST",
      credentials: "include",              // 必须带，否则收不到 Cookie
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: phone,
        passwd: YinLingCrypto.encryptPassword(password),   // 每次都会重新加密
      }),
    });
    const data = await response.json();
    if (data.status !== 0) throw new Error(data.msg);
  }
</script>
```

- `PASSWORD_MODE=auto` 时明文也能登录，所以前端没接加密之前 `curl` 照样能测；
- 每次调用 `encryptPassword` 都会生成新的随机数，密文都不一样，服务端对 60 秒内的相同密文做重放拦截；
- 公钥在 `js/crypto.js` 顶部，私钥在 `.env`，**换密钥必须两边同时改**：

```powershell
server\.winv\Scripts\python.exe server\sm2.py keygen
# 输出 SM2_PRIVATE_KEY / SM2_PUBLIC_KEY，分别填到 .env 和 js/crypto.js
```

## 短信

默认不发短信，验证码打在控制台：

```
[2026-10-26 16:43:57] INFO in api_auth: [SMS] phone=13800000001 scene=register code=481921
```

要真的发短信，按 [`ALIYUN-SMS.md`](ALIYUN-SMS.md) 开通后把 `.env` 改成 `SMS_PROVIDER=aliyun`。
发送失败会返回 1099，并把那条验证码删掉，不会出现「库里有效、用户收不到」。

## 联调步骤

```bash
# 1. 取注册验证码（看服务端控制台拿 code）
curl -X POST http://127.0.0.1:14087/api/verify \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800000001","scene":"register"}'

# 2. 注册（密码 8–32 位，必须含字母和数字）
curl -c cookie.txt -X POST http://127.0.0.1:14087/api/register \
  -H 'Content-Type: application/json' \
  -d '{"user":"13800000001","uname":"张阿姨","passwd":"elder2026","verify":"481921"}'

# 3. 带 Cookie 调业务接口
curl -b cookie.txt http://127.0.0.1:14087/api/elders
```

前端必须以 `credentials: 'include'` 发请求，且前后端主机名保持一致
（统一 `127.0.0.1` 或统一 `localhost`，混用会导致 Cookie 静默丢失）。

## 测试

```powershell
# 建议用单独的库跑，避免污染开发数据
$env:DB_PATH = "$PWD\server\test.db"
$env:PORT = "14187"
server\.winv\Scripts\python.exe server\app.py   # 另开一个终端

$env:BASE = "http://127.0.0.1:14187"
$env:DB_PATH = "$PWD\server\test.db"
server\.winv\Scripts\python.exe server\tests\e2e_test.py
```

覆盖：验证码限流与场景隔离、注册/登录（密码、验证码、SM2 密文三条路）、
SM2 密文重放拦截、错 5 次锁定、老人档案 CRUD 与越权、健康记录取值校验与软删除、
求助防连按与状态机。

## 与文档的差异（必须知道）

1. **密码哈希用 scrypt，不是 Argon2id**：同样是内存硬型 KDF、同样不可逆；
   装了 `argon2-cffi` 可以换，接口层不用动。
2. **默认 `SMS_PROVIDER=log`**，验证码只打控制台，不真正发送。
3. **求助只落库**，不发送短信/外呼/推送；`notify_phones` 是「应当通知谁」的快照。
4. **没有登出接口、没有 `GET /api/me`**（文档待定事项第 4 条），刷新页面后前端按未登录处理。
5. 密码错误 5 次锁定 15 分钟，阈值写在 `config.py`（文档只给了 1006，没给次数）。
6. `.env` 里的 SM2 私钥是**演示密钥**，与 `js/crypto.js` 的公钥配对，提交在仓库里。
   正式使用必须重新生成，并且把 `.env` 加进 `.gitignore`。

## 数据库

`elder.db` 里 9 张表：`USERS`、`VERIFY_CODE`、`SESSION`、`ELDERS`、`HEALTH_RECORD`、
`SOS`、`CIPHER_SEEN`、`ERR_TRACE`。

- 旧版 `app.py` 的 `VERIFY_CODE` 缺验证码字段，首次启动会自动重建（该表原本为空）；
- `ERR_TRACE` 保留了原有记录，只追加了 `PATH` / `METHOD` / `IP` / `STATUS` / `CREATED_AT` 列；
- 所有删除都是软删除（`DELETE_AT`），没有物理删除语句。
