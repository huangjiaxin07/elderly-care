# 后端

> 后端使用 Python（Flask + SQLite）。
> 本文只定义接口契约，不含实现细节。
> 「必填 = 是」指客户端必须上传；标注「服务端生成」的字段客户端不得上传，即使传了也必须忽略。

> **预留能力说明**：第 0–2 节（验证码 / 登录 / 注册）与第 3 节（老人档案）已经实现并可用，
> 但**前端主流程刻意没有启用**——页面上明确写着「无需登录、无需注册账号」。
> 这是产品取舍，不是未完成项；原因与代价见 [README.md](README.md) 的「为什么不做登录入口」。

## 通用约定（先读）

### 类型写法

| 写法 | 含义 |
| --- | --- |
| Text | 字符串，UTF-8。DB 用 VARCHAR / TEXT |
| Int | 整数。DB 用 INT / BIGINT |
| Text(encrypted) | 经 SM2 公钥加密并 Base64 编码后的字符串 |
| List[Int] | JSON 数字数组。DB 以 TEXT 存 JSON |
| Timestamp | 10 位秒级 Unix 时间戳（也可以是毫秒，看你前端） |

### 响应格式

所有接口（成功与失败）都返回 JSON 对象，固定包含以下三个字段，不允许改名、不允许省略：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| status | Int | 业务码。0 成功，非 0 失败。**与 HTTP 状态码是两个独立的东西** |
| msg | Text | 可直接展示给用户的中文提示，不得拼接任何用户输入的原文 |
| trace_id | Text | 服务端为本次请求生成的 UUIDv4（36 位，带连字符），用于日志排查。客户端上传的 `shell` 不影响该值 |

HTTP 状态码单独使用：成功 200，参数错误 400，未登录 401，无权限 403，不存在 404，冲突 409，频率超限 429。

**判断请求成败只看 body 的 `status`，不看 HTTP 状态码。** HTTP 状态码只用于监控和网关。

成功响应示例：

```json
{
  "status": 0,
  "msg": "登录成功",
  "trace_id": "a0a06523-5f4b-4c1e-9d7a-65907a9e8ea6",
  "uid": 1,
  "uname": "张三",
  "phone": "188****8888"
}
```

### 业务码表

| status | 对应 HTTP | 含义 |
| --- | --- | --- |
| 0 | 200 | 成功 |
| 1001 | 400 | 参数错误（缺字段、格式不符、互斥字段同时出现） |
| 1002 | 400 | 验证码错误或已过期 |
| 1003 | 429 | 验证码发送过于频繁 |
| 1004 | 401 | 手机号或密码不正确（手机号不存在与密码错误两种情况统一使用此码与此文案，不得区分） |
| 1005 | 409 | 手机号已注册 |
| 1006 | 403 | 账号已锁定 |
| 1007 | 401 | 未登录或会话已过期 |
| 1008 | 403 | 无权访问该老人信息 |
| 1009 | 404 | 老人信息不存在 |
| 1010 | 400 | 验证码错误次数过多，请重新获取 |
| 1011 | 404 | 手机号未注册 |
| 1012 | 404 | 健康记录不存在 |
| 1013 | 404 | 求助记录不存在 |
| 1014 | 404 | 接口不存在（路径写错或已废弃） |
| 1015 | 405 | 请求方法不允许（如用 GET 调 PATCH 接口） |
| 1016 | 429 | 请求过于频繁（AI 分析接口按 IP 限流） |
| 1017 | 503 | AI 分析服务未配置或不可用（前端应回退本地规则引擎） |
| 1099 | 500 | 服务器内部错误（未预期的异常，详情只进日志） |

### 会话

- 登录与注册成功后，服务端通过 `Set-Cookie` 下发会话，body 中**不返回 token**：
  `session=<32 字节随机数 Base64URL>; HttpOnly; SameSite=Lax; Path=/; Max-Age=7200`
- 前端所有请求必须带 `credentials: "include"`，否则会话不会生效。
- 会话有效期 2 小时，过期一律返回 1007。
- 前端与后端必须使用同一主机名：统一 `127.0.0.1` 或统一 `localhost`，两者混用会导致 Cookie 静默丢失。
- 前后端端口可以不同，但 CORS 必须回具体的 `Access-Control-Allow-Origin` 并允许携带凭据，不能使用 `*`。

### 手机号与验证码

- 手机号：11 位大陆手机号，正则 `^1[3-9]\d{9}$`，整条链路按字符串处理，禁止转数字。
- 验证码：6 位数字，字符串，10 分钟有效，一次性使用，验证失败 5 次后作废。
- 同一手机号 60 秒内只能请求一次，每天最多 10 次。
- 验证码按用途（`scene`）隔离：注册用途的验证码不能用于登录，反之亦然。校验时必须比对 `scene`，不能只比对号码和值。

### 密码

- **禁止前端做哈希（MD5 / SM3 / 二次转换都不行）**：哈希值本身会变成凭据，抓包后原样重放即可登录，强度再高也没用。
- 传输有三种模式，由服务端环境变量 `PASSWORD_MODE` 决定：

| PASSWORD_MODE | 前端提交什么 | 服务端怎么处理 |
| --- | --- | --- |
| `auto`（默认） | 明文或 SM2 密文都接受 | 认出是 SM2 密文就解密，否则按明文处理 |
| `plain` | 明文 | 直接哈希，只靠 HTTPS 保护 |
| `sm2` | 必须是密文 | 只接受密文；提交明文返回 1001 |

`auto` 是为了让 curl 联调和前端加密能同时工作；正式环境建议改成 `sm2`。

- **前端加密函数已经提供**：`js/crypto.js`，零依赖，直接 `<script src="js/crypto.js"></script>`，然后
  `YinLingCrypto.encryptPassword("elder2026")` 得到密文，填到 `passwd` 字段即可。
- **后端解密不依赖任何第三方库**：`server/sm2.py` 是纯 Python 的 SM3 + SM2 实现（曲线参数取自 GB/T 32918），
  所以不需要 `gmssl`，也不需要 pip。
- 密文格式：`04 || C1x || C1y || C3 || C2` 的小写 hex 字符串（即 C1C3C2），长度 = 97 字节 + 明文字节数。
- 密钥对：私钥在 `server/.env` 的 `SM2_PRIVATE_KEY`，公钥是 `js/crypto.js` 顶部的 `PUBLIC_KEY`，**两边必须配对**。
  当前是提交在仓库里的演示密钥；上线前执行 `python sm2.py keygen` 重新生成，两处同时替换，新私钥不要再提交。
- 存储一律用不可逆哈希，数据库内不保存任何可逆密文。当前实现是 **scrypt**（`n=16384, r=8, p=1`，参数与盐随哈希一起保存）；若部署环境安装了 `argon2-cffi`，可换成 Argon2id，两者都满足「泄露后无法还原密码」。
- 密文模式下，前端每次提交必须重新加密；服务端对密文做 SHA-256 去重，60 秒内出现相同密文返回 1001。明文没有密文可比，此检查自动跳过。
- 密码明文长度 8–32 位，必须同时包含字母和数字。

## 0. 获取验证码

**接口：`POST /api/verify`**（同时兼容 `GET /api/verify?phone=&scene=`，方便 curl 联调；两者参数相同、响应相同）

**验证码是否真的发短信，由服务端环境变量 `SMS_PROVIDER` 决定**：

| SMS_PROVIDER | 行为 |
| --- | --- |
| `log`（默认） | 不真正发送，验证码只打印到服务端控制台，接口照常返回成功 |
| `aliyun` | 调用阿里云短信服务真正发送，配置步骤见 `ALIYUN-SMS.md` |

发送失败时返回 1099，并且**该条验证码立即作废**（不会留下「库里有效、用户收不到」的记录）。

| 字段 | 类型 | 示例 | 描述 | 必填 |
| --- | --- | --- | --- | --- |
| phone | Text | 18888888888 | 接收验证码的手机号 | 是 |
| scene | Text | register | 用途，只能取 `register` 或 `login` | 是 |
| shell | Text | 3f2a9c1e | 浏览器特征值（客户端生成），仅写入服务端日志用于风控，取值可为空 | 否 |

成功响应：

```json
{ "status": 0, "msg": "验证码已发送，请在 10 分钟内输入", "trace_id": "..." }
```

失败：

| status | 触发条件 |
| --- | --- |
| 1003 | 该手机号 60 秒内重复请求，或当日超过 10 次 |
| 1001 | 手机号格式不符，或 `scene` 不是 `register` / `login` |
| 1005 | `scene = register` 但该手机号已注册 |
| 1011 | `scene = login` 但该手机号未注册 |
| 1099 | `SMS_PROVIDER=aliyun` 但发送失败（配置缺失、签名/模板未审核、额度不足等），详见服务端日志 |

## 1. 登录接口

**接口：`POST /api/login`**

| 字段 | 类型 | 示例 | 描述 | 必填 |
| --- | --- | --- | --- | --- |
| user | Text | 18888888888 | 登录手机号 | 是 |
| passwd | Text(encrypted) | ZmFrZUMxQzNDMi... | SM2 公钥加密后的密码，与 `verify` 恰好二选一 | 条件 |
| verify | Text | 123456 | 短信验证码，与 `passwd` 恰好二选一 | 条件 |

实现规则（必须逐条落实）：

1. `passwd` 与 `verify` 必须**恰好有一个**非空。两个都传、或两个都不传，一律返回 1001。
2. `passwd` 必须每次重新加密；服务端对密文做 60 秒去重，重复出现返回 1001。
3. `verify` 必须按 `scene = login` 匹配，注册用途的验证码无效。
4. 手机号不存在、密码错误、验证码错误三种情况统一返回 1004 与「手机号或密码不正确」，不得泄露账号是否存在。

成功响应（在三个固定字段外追加）：

| 字段 | 类型 | 示例 | 描述 |
| --- | --- | --- | --- |
| uid | Int | 1 | 用户主键 |
| uname | Text | 张三 | 用户昵称 |
| phone | Text | 188****8888 | 脱敏手机号，固定格式：前 3 位 + `****` + 后 4 位 |

```json
{
  "status": 0,
  "msg": "登录成功",
  "trace_id": "...",
  "uid": 1,
  "uname": "张三",
  "phone": "188****8888"
}
```

失败：

| status | 触发条件 |
| --- | --- |
| 1001 | 互斥字段同时出现 / 密文重复 / 密文无法解密 |
| 1002 | 验证码错误或已过期 |
| 1004 | 手机号不存在、密码错误 |
| 1006 | 账号已锁定 |
| 1010 | 验证码错误次数已达 5 次 |

## 2. 注册接口

**接口：`POST /api/register`**

| 字段 | 类型 | 示例 | 描述 | 必填 |
| --- | --- | --- | --- | --- |
| user | Text | 18888888888 | 手机号，必须未注册 | 是 |
| uname | Text | 张三 | 昵称，1–20 字，仅用于显示，不要求唯一 | 是 |
| passwd | Text(encrypted) | ZmFrZUMxQzNDMi... | SM2 加密后的密码；明文 8–32 位，必须同时包含字母和数字 | 是 |
| verify | Text | 123456 | 验证码，`scene` 必须是 `register` | 是 |

注意：`user` 与 `uname` 是两个不同字段，前者是登录手机号，后者是显示昵称，禁止混用。

成功：与登录完全一致——注册成功即视为登录，同样下发 Cookie，同样返回 `uid` / `uname` / `phone`，`msg` 为「注册成功」。

失败：

| status | 触发条件 |
| --- | --- |
| 1005 | 手机号已注册 |
| 1002 | 验证码错误或已过期 |
| 1010 | 验证码错误次数已达 5 次 |
| 1001 | 昵称长度不符、密码强度不足、密文无法解密 |

## 3. 老人信息增删改查

### 3.1 字段

对外 JSON 统一使用下列英文键名；「中文列」仅用于文档对照，不出现在接口里。

| 中文列 | JSON 键 | 类型 | 示例 | 描述 | 必填 |
| --- | --- | --- | --- | --- | --- |
| 编号 | id | Int | 1 | 主键 | 服务端生成 |
| — | owner_id | Int | 1 | 唯一可编辑该档案的账号 id，取自会话，请求中的该字段一律忽略 | 服务端生成 |
| 绑定账号 | viewer_ids | List[Int] | [3, 5] | 只读账号 id 列表，可为空数组；只能由 owner 修改 | 否 |
| 名字 | name | Text | 张三 | 老人真实姓名，1–50 字 | 是 |
| 手机号 | phone | Text | 18888888888 | 老人本人手机号，11 位 | 是 |
| 紧急联系人 | emergency_phone | Text | 18888888888 | 紧急联系人手机号，11 位 | 是 |
| 创建时间 | created_at | Timestamp | 1760000000 | 一经创建只读 | 服务端生成 |
| 更新时间 | updated_at | Timestamp | 1760000000 | 每次成功修改由服务端刷新 | 服务端生成 |
| 删除时间 | deleted_at | Timestamp \| null | null | 有值表示已删除，此后全行只读 | 服务端生成 |

### 3.2 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/elders | 列表。仅返回当前账号是 `owner_id`、或当前账号 id 在 `viewer_ids` 中的记录 |
| POST | /api/elders | 新建 |
| GET | /api/elders/{id} | 详情 |
| PATCH | /api/elders/{id} | 部分更新 |
| DELETE | /api/elders/{id} | 软删除 |

### 3.3 各接口约定

**列表 `GET /api/elders`**

- Query：`page` 默认 1，`size` 默认 20、最大 100。
- 已软删（`deleted_at` 非 null）的记录不出现在列表中。
- 返回在三个固定字段外追加：

```json
{
  "status": 0,
  "msg": "ok",
  "trace_id": "...",
  "items": [ { "id": 1, "owner_id": 1, "viewer_ids": [3], "name": "张三", "phone": "18888888888", "emergency_phone": "18888888888", "created_at": 1760000000, "updated_at": 1760000000, "deleted_at": null } ],
  "total": 1,
  "page": 1,
  "size": 20
}
```

**新建 `POST /api/elders`**

- 只接受 `name`、`phone`、`emergency_phone`、`viewer_ids`（可选）。
- `id`、`owner_id`、三个时间戳由服务端生成，客户端传入的对应值必须忽略。
- 成功返回完整对象（结构与列表中的单条一致），放在固定字段之外，`status = 0`，`msg = "已保存"`。

**详情 `GET /api/elders/{id}`**

- 结构同上。
- 不存在、已软删、无权访问，**三种情况一律返回 1009**，响应体完全一致，调用方无法据此判断档案是否存在。1008 只用于「看得见、但只读还想写」的情况。

**更新 `PATCH /api/elders/{id}`**

- body 只传需要修改的字段，允许修改：`name`、`phone`、`emergency_phone`、`viewer_ids`。
- 未出现的字段保持原值；空 body 返回 1001。
- 只有 owner 可以修改；viewer 调用返回 1008。
- 成功返回更新后的完整对象。

**删除 `DELETE /api/elders/{id}`**

- 仅将 `deleted_at` 置为当前时间，不物理删除，`status = 0`，`msg = "已删除"`。
- 已软删的记录再次访问任意接口，一律返回 1009。

### 3.4 权限规则

| 身份 | 权限 |
| --- | --- |
| 当前账号 id == `owner_id` | 可读、可改、可删、可维护 `viewer_ids` |
| 当前账号 id 在 `viewer_ids` 中 | 只读；调用 PATCH / DELETE 返回 1008 |
| 其他 | 1009，与「档案不存在」的响应完全一致，不暴露存在性 |

- `viewer_ids` 只能由 owner 修改；owner 不能通过 PATCH 清空或替换 `owner_id`。
- 校验一律写成 `WHERE id = ? AND (owner_id = ? OR viewer_ids 含 ?)`，禁止先查出再判断。
- 例外：§4 健康记录的提交与删除、§5 求助的发起与确认，owner 与 viewer 都有权操作，不受上表「viewer 只读」的限制。查询类接口两边权限相同。

## 4. 健康记录

### 4.1 字段

| 中文列 | JSON 键 | 类型 | 示例 | 描述 | 必填 |
| --- | --- | --- | --- | --- | --- |
| 编号 | id | Int | 1 | 主键 | 服务端生成 |
| 所属老人 | elder_id | Int | 1 | 取自路径参数，body 中的同名字段一律忽略 | 服务端生成 |
| 记录类型 | type | Text | blood_pressure | 只能是 4.2 表中的枚举值之一 | 是 |
| 主值 | value | Float | 135 | 含义随 `type` 变化，见 4.2 | 是 |
| 副值 | value2 | Float \| null | 85 | 仅 `blood_pressure` 使用（舒张压）；其他类型必须为 `null` | 条件 |
| 单位 | unit | Text | mmHg | 由服务端按 `type` 自动填写，客户端传值一律忽略 | 服务端生成 |
| 测量时间 | measured_at | Timestamp | 1760000000 | 实际测量时间，不得晚于当前时间 5 分钟，不得早于 946684800（2000-01-01） | 是 |
| 备注 | note | Text | 早饭后测的 | 0–200 字 | 否 |
| 提交人 | created_by | Int | 1 | 提交人账号 id，取自会话 | 服务端生成 |
| 创建时间 | created_at | Timestamp | 1760000000 | 提交时间 | 服务端生成 |
| 删除时间 | deleted_at | Timestamp \| null | null | 有值表示已删除，此后只读 | 服务端生成 |

### 4.2 类型、单位与取值范围

`type` 只允许下列五个值，超出范围一律返回 1001。**服务端必须按此表校验并回填 `unit`，不得信任客户端传来的单位。**

| type | 中文 | value 含义 | value 范围 | value2 | unit |
| --- | --- | --- | --- | --- | --- |
| blood_pressure | 血压 | 收缩压 | 60–260 | 舒张压 30–180，且必须小于 value | mmHg |
| blood_glucose | 血糖 | 血糖值 | 1.0–35.0 | 必须为 null | mmol/L |
| heart_rate | 心率 | 每分钟心跳 | 30–220 | 必须为 null | 次/分 |
| weight | 体重 | 体重 | 20–200 | 必须为 null | kg |
| temperature | 体温 | 体温 | 33.0–43.0 | 必须为 null | °C |

本模块只做记录与展示，不做任何疾病判断或用药建议，接口不返回「是否正常」之类的结论。

### 4.3 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | /api/elders/{id}/health-records | 提交一条记录 |
| GET | /api/elders/{id}/health-records | 查询记录（分页） |
| DELETE | /api/elders/{id}/health-records/{record_id} | 软删除 |

**提交 `POST /api/elders/{id}/health-records`**

请求体只接受 `type`、`value`、`value2`、`measured_at`、`note` 五个字段。

成功：返回完整记录对象，放在三个固定字段之外，`status = 0`，`msg = "已记录"`。

```json
{
  "status": 0,
  "msg": "已记录",
  "trace_id": "...",
  "id": 1,
  "elder_id": 1,
  "type": "blood_pressure",
  "value": 135,
  "value2": 85,
  "unit": "mmHg",
  "measured_at": 1760000000,
  "note": "早饭后测的",
  "created_by": 1,
  "created_at": 1760000000,
  "deleted_at": null
}
```

失败：1001（类型非法、数值越界、`value2` 规则不符、`measured_at` 越界）、1008（无权限操作该老人）、1009（老人不存在或已软删）。

**查询 `GET /api/elders/{id}/health-records`**

- Query：`type` 可选，按类型过滤；`from` / `to` 可选，按 `measured_at` 过滤，闭区间；`page` 默认 1；`size` 默认 20、最大 100。
- 排序：`measured_at` 倒序，同值时按 `id` 倒序。
- 已软删的记录不出现在结果中。
- 返回：

```json
{
  "status": 0,
  "msg": "ok",
  "trace_id": "...",
  "items": [ { "id": 1, "elder_id": 1, "type": "blood_pressure", "value": 135, "value2": 85, "unit": "mmHg", "measured_at": 1760000000, "note": "早饭后测的", "created_by": 1, "created_at": 1760000000, "deleted_at": null } ],
  "total": 1,
  "page": 1,
  "size": 20
}
```

记录为空时返回 `items: []`、`total: 0`，`status` 仍为 0，不得返回 404。

**删除 `DELETE /api/elders/{id}/health-records/{record_id}`**

- 仅将 `deleted_at` 置为当前时间，`status = 0`，`msg = "已删除"`。
- 记录不存在、不属于该老人、或已软删，一律返回 1012。

## 5. 一键求助

### 5.1 字段

| 中文列 | JSON 键 | 类型 | 示例 | 描述 | 必填 |
| --- | --- | --- | --- | --- | --- |
| 编号 | id | Int | 1 | 主键 | 服务端生成 |
| 求助对象 | elder_id | Int | 1 | 取自路径参数 | 服务端生成 |
| 发起人 | user_id | Int | 1 | 发起求助的账号 id，取自会话 | 服务端生成 |
| 求助描述 | reason | Text | 头晕，站不稳 | 0–200 字，可为空 | 否 |
| 定位 | location | Text | 30.123456,120.123456 | 「纬度,经度」，各 6 位小数，按字符串传；可为空 | 否 |
| 状态 | state | Text | pending | `pending` / `acknowledged` / `closed`，创建时固定为 `pending`。**键名必须是 `state`，不能用 `status`**：`status` 已被响应体的业务码占用，同一对象内不允许重名 | 服务端生成 |
| 应通知号码 | notify_phones | List[Text] | ["18888888888"] | 取自该老人档案的 `emergency_phone`，创建时快照保存，之后档案变更不影响历史记录 | 服务端生成 |
| 处理人 | acknowledged_by | Int \| null | 3 | 标记处理时的账号 id | 服务端生成 |
| 处理时间 | acknowledged_at | Timestamp \| null | null | 标记处理的时间 | 服务端生成 |
| 创建时间 | created_at | Timestamp | 1760000000 | 求助发起时间 | 服务端生成 |

### 5.2 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | /api/elders/{id}/sos | 发起求助 |
| GET | /api/elders/{id}/sos | 查询求助记录（分页） |
| PATCH | /api/sos/{sos_id} | 标记为已处理 |

**发起 `POST /api/elders/{id}/sos`**

请求体只接受 `reason`、`location` 两个可选字段。

- 权限：owner 与 viewer 都可以发起。
- **防连按（必须实现）**：同一账号对同一老人，60 秒内重复提交不得新建记录，直接返回已存在的那条，`status = 0`，`msg = "已发送过求助，请等待处理"`。
- 成功新建时 `status = 0`，`msg = "求助已发送"`。

```json
{
  "status": 0,
  "msg": "求助已发送",
  "trace_id": "...",
  "id": 1,
  "elder_id": 1,
  "user_id": 1,
  "reason": "头晕，站不稳",
  "location": "30.123456,120.123456",
  "state": "pending",
  "notify_phones": ["18888888888"],
  "acknowledged_by": null,
  "acknowledged_at": null,
  "created_at": 1760000000
}
```

失败：1008（无权限操作该老人）、1009（老人不存在或已软删）、1001（`location` 格式不符、`reason` 超长）。

**查询 `GET /api/elders/{id}/sos`**

- Query：`state` 可选，取 `pending` / `acknowledged` / `closed`；`page` 默认 1；`size` 默认 20、最大 100。
- 排序：`created_at` 倒序。
- 返回结构同 4.3 的列表（`items` / `total` / `page` / `size`）。
- 本期不提供删除求助记录的接口，记录永久保留。

**标记处理 `PATCH /api/sos/{sos_id}`**

- 请求体只接受 `{"state": "acknowledged"}` 或 `{"state": "closed"}`，其他值返回 1001。
- 状态只能从 `pending` 改为 `acknowledged` / `closed`；已是 `acknowledged` 时只允许改为 `closed`；`closed` 为终态，再改返回 1001。
- 同时写入 `acknowledged_by` 与 `acknowledged_at`（取自会话与当前时间）。
- owner 与 viewer 都可以操作。
- 成功返回更新后的完整对象，`msg = "已处理"`。
- 不存在返回 1013；越权返回 1008。

### 5.3 本期限制（必须知悉）

- 本接口**只落库并返回应通知的号码，不接入短信、电话外呼或推送通道**。真正的通知能力属于待定事项，实现方不要自行接入第三方短信服务。
- 因此前端必须在求助请求失败或超时（建议 3 秒）时，直接调起本地拨号 `tel:110` / `tel:120`，不能把「求助成功」的提示建立在接口返回之上。
- 求助接口依赖有效登录会话。老人本人若没有账号，无法发起——这是已知的产品缺口，见待定事项。

## 6. AI 反诈分析（流式）

**接口：`POST /api/analyze`**，返回 `text/event-stream`。

这是本项目唯一调用大模型的接口。前端把用户粘贴的短信、聊天记录，或者短信截图发给后端，
后端做「RAG 检索 + 大模型判断」，把结论**边生成边推**给前端。

### 6.1 请求

| 字段 | 类型 | 示例 | 描述 | 必填 |
| --- | --- | --- | --- | --- |
| text | Text | 您的快递丢失，请点击链接… | 待判断的文本，6–2000 字 | 二选一 |
| image | Text | /9j/4AAQSk… | 图片的 base64（不带 `data:` 前缀），原图 ≤ 2MB | 二选一 |

`text` 与 `image` 必须**恰好提供一个**，同时传或都不传返回 1001。

### 6.2 响应：SSE 事件序列

响应是 `text/event-stream`，每一帧格式固定为 `data: <JSON>\n\n`，**没有 `event:` 字段**，
前端按 `type` 分派即可。事件按下表顺序出现：

| type | 时机 | 载荷 | 前端怎么用 |
| --- | --- | --- | --- |
| `start` | 立即 | `trace_id`、`model`、`input` | 显示「正在分析…」 |
| `context` | RAG 检索完（约 0.6s） | `rag`（命中的知识库 id 数组）、`elapsed_ms` | 可显示「已匹配 3 条相似骗术」 |
| `hint` | 随生成增量，可能多次 | `text`（本次新增的一段） | **追加到气泡里逐字显示** |
| `result` | 生成结束 | `source`、`rag`、`detail`、`elapsed_ms` | 用 `detail` 渲染风险卡片 |
| `done` | 最后一条 | `elapsed_ms` | 结束 loading，关闭连接 |

`result` 里的 `detail` 结构：

```json
{
  "hint": "这是典型快递理赔诈骗，链接是假域名。",
  "level": "high",
  "score": 92,
  "reasons": ["假域名", "索要验证码", "要求点击链接"],
  "advice": "别点链接，打 96110 核实。"
}
```

`level` 只可能是 `high` / `medium` / `low` / `none`；`score` 是 0–100 的整数；
`reasons` 2–4 条；`advice` 一句话。字段缺失或格式非法时服务端会补齐默认值，前端不必做空值判断。

### 6.3 降级事件

大模型超时、网络失败、返回的 JSON 解析不了，都会发一个 `fallback` 事件然后 `done`：

```json
{"type": "fallback", "reason": "ai_error", "detail": "SiliconFlow 请求超时", "elapsed_ms": 8000}
```

`reason` 取值：`ai_error`（上游失败）、`bad_json`（模型没按格式返回）、`internal`（服务端异常）。

**收到 `fallback` 时，前端必须改用本地规则引擎**（`js/fraud-engine.js` 的 `FraudEngine.analyze`）
给出结果，并提示「AI 分析暂不可用，已用本地规则判断」。后端不复制规则引擎，降级只在前端做。

### 6.4 其他约束

- **不需要登录**：反诈识别页是公开页面。按 IP 限流，默认每分钟 6 次，超出返回 1016。
- **图片路径没有增量**：视觉模型一次返回完整 JSON，服务端会一次性发 `hint` 再发 `result`。
- **接口未配置时**（服务端没有 API Key）直接返回 1017 与普通 JSON，不进入 SSE。
- **超时**：服务端对上游设 60 秒超时；前端建议自己在 15 秒没有新帧时断开并降级。
- **`X-Accel-Buffering: no`** 已由服务端返回，nginx 侧仍需 `proxy_buffering off;`，否则会整段缓存。

## 7. 语音合成

**接口：`POST /api/tts`**，成功时返回 `audio/mpeg` 二进制，失败时返回常规 JSON 信封。

这是全站唯一一个「成功返回的不是 JSON」的接口，因为音频没法塞进信封，也没必要。

### 7.1 请求

| 字段 | 类型 | 示例 | 描述 | 必填 |
| --- | --- | --- | --- | --- |
| text | Text | 这条短信很像快递理赔诈骗… | 要朗读的文字，1–500 字 | 是 |
| voice | Text | FunAudioLLM/CosyVoice2-0.5B:alex | 音色，不传用服务端默认 | 否 |
| speed | Float | 0.9 | 语速，0.5–2.0，不传用默认 | 否 |

### 7.2 响应

**成功**：HTTP 200，`Content-Type: audio/mpeg`，body 是 mp3 字节流。

| 响应头 | 说明 |
| --- | --- |
| `Cache-Control: public, max-age=86400` | 同一段文字结果稳定，浏览器可以缓存一天 |
| `X-TTS-Cache: hit \| miss` | 是否命中服务端缓存，仅用于排查 |

服务端对「文字 + 音色 + 语速」做了进程内缓存（默认 64 条），命中时不产生任何 API 调用。
识别结果里的固定建议语会反复朗读，命中率很高。

**失败**：HTTP 4xx/5xx，返回常规 JSON 信封 `{status, msg, trace_id}`。

| status | 触发条件 |
| --- | --- |
| 1001 | `text` 为空或超过 500 字、`speed` 越界 |
| 1016 | 同一 IP 每分钟超过 10 次 |
| 1017 | 服务端没有配置 API Key |
| 1099 | 上游语音服务失败 |

### 7.3 前端用法

不要用 `fetch` 读文本，要读成 blob 再播放：

```js
const response = await fetch(API_BASE + "/api/tts", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: "拿不准时先问家人，或拨打 96110 核实。" }),
});
if (!response.ok) {
  const error = await response.json();      // 失败才是 JSON
  throw new Error(error.msg);
}
const url = URL.createObjectURL(await response.blob());
new Audio(url).play();
```

不需要登录。建议保留浏览器 `speechSynthesis` 作为降级——接口不可用时仍然能读。

## 待定事项（本期不实现，实现方不要自行设计）

1. 老人档案的扩展字段：与账号的关系、出生日期、性别、身份证号、病史用药。这些属于敏感个人信息，需要单独同意和加密，暂不进入本期表结构。
2. 紧急联系人拆表（姓名 + 关系 + 电话 + 优先级）。当前只有手机号一个字段。
3. `viewer_ids` 的绑定确认流程。当前 owner 可直接把任意账号加为只读，被绑定方无确认动作，属于已知越权风险，上线前必须补确认（短信或邀请码）。
4. 登出接口、`GET /api/me`（刷新页面后恢复登录态）。未实现时前端在刷新后按未登录处理。
5. 会话刷新（refresh token）。当前固定 2 小时，过期需重新登录。
6. SM2 公钥轮换机制。当前公钥硬编码在前端。
7. 验证码按 IP 维度的限流。
8. `shell` 的采集口径与隐私告知。当前只登记、不参与判定。
9. 求助的真实通知通道：短信、电话外呼、App 推送、家人端轮询/长连接。当前只落库，见 5.3。
10. 老人本人的免登录入口（设备令牌或绑定链接）。当前求助必须登录，老人无账号时无法使用。
11. 求助的定位精度与地址反解。当前只接收「纬度,经度」字符串，不校验真实位置、不做逆地理编码。
12. 健康记录的脱敏、导出与留存期限。本期按普通业务数据存储，未做字段级加密。
13. 健康记录的异常值提醒。本期只记录，不做判断、不推送。
