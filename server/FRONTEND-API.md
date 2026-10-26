# 前端对接文档

后端地址：`http://127.0.0.1:14087`，所有接口以 `/api` 开头。
这份文档只讲前端怎么调，业务规则细节看 [`server.md`](server.md)。

---

## 一、三句话记住核心

1. **每次请求都要带 Cookie**：`fetch(..., { credentials: "include" })`，不加就等于没登录。
2. **成功与否只看 `data.status`**：`0` 成功，其它都是失败。不要用 `response.ok` 判断。
3. **登录/注册成功后什么都不用存**：Cookie 由浏览器自动管理，前端不需要保存 token。

---

## 二、先跑通一条链路

```bash
# 1. 启动后端
server\.winv\Scripts\python.exe server\app.py

# 2. 浏览器打开这个地址，应该看到 {"status":1007,...}
http://127.0.0.1:14087/api/elders
```

看到 `1007` 说明后端正常（因为还没登录）。

---

## 三、复制这段就够用了

新建 `js/api.js`，把下面整段复制进去，后面所有接口都靠它：

```js
// 后端地址只写这一处，换环境改这里
const API_BASE = "http://127.0.0.1:14087";

async function api(path, method = "GET", body) {
  let response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      credentials: "include",                    // 必须：带上会话 Cookie
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    // 网络层失败：后端没开、断网、CORS 被拦
    return { status: -1, msg: "连不上服务器，请检查网络" };
  }

  const data = await response.json().catch(() => null);
  if (!data || typeof data.status !== "number") {
    return { status: 1099, msg: "服务器返回格式异常" };
  }
  if (data.status === 1007) {
    // 会话过期：这里可以统一跳登录页
    // location.href = "login.html";
  }
  return data;
}
```

调用方式统一是 `await api(路径, 方法, 参数)`。

---

## 四、接口速查

| 功能 | 方法 | 路径 | 登录 |
| --- | --- | --- | --- |
| 取验证码 | POST | `/api/verify` | 否 |
| 注册 | POST | `/api/register` | 否 |
| 登录 | POST | `/api/login` | 否 |
| 老人列表 | GET | `/api/elders` | 是 |
| 新增老人 | POST | `/api/elders` | 是 |
| 老人详情 | GET | `/api/elders/{id}` | 是 |
| 修改老人 | PATCH | `/api/elders/{id}` | 是 |
| 删除老人 | DELETE | `/api/elders/{id}` | 是 |
| 健康记录列表 | GET | `/api/elders/{id}/health-records` | 是 |
| 新增健康记录 | POST | `/api/elders/{id}/health-records` | 是 |
| 删除健康记录 | DELETE | `/api/elders/{id}/health-records/{记录id}` | 是 |
| 求助记录列表 | GET | `/api/elders/{id}/sos` | 是 |
| 发起求助 | POST | `/api/elders/{id}/sos` | 是 |
| 标记已处理 | PATCH | `/api/sos/{求助id}` | 是 |

返回格式全部长这样：

```json
{ "status": 0, "msg": "登录成功", "trace_id": "a0a06523-..." }
```

`status` 之外还可能有业务字段（比如 `uid`、`items`），见下面各节。

---

## 五、注册和登录

### 1. 取验证码

```js
const result = await api("/api/verify", "POST", {
  phone: "13800000001",
  scene: "register",        // 注册用 register，登录用 login，不能混
});
```

- 成功后 `msg` 就是给用户看的提示，直接显示即可；
- **没有接短信，验证码打印在后端控制台**，形如 `[SMS] phone=13800000001 scene=register code=481921`；
- 60 秒内重复请求会返回 `1003`，按钮上要做倒计时。

### 2. 注册

先引入加密脚本（放在 `api.js` 之前）：

```html
<script src="js/crypto.js"></script>
<script src="js/api.js"></script>
```

```js
const result = await api("/api/register", "POST", {
  user: phone,
  uname: "张阿姨",
  passwd: YinLingCrypto.encryptPassword(password),   // 加密，不要传明文
  verify: code,
});

if (result.status === 0) {
  // 注册成功即登录，Cookie 已经种好了
  location.href = "profile.html";
} else {
  alert(result.msg);
}
```

> `encryptPassword` 每次结果都不同，这是正常的。**不要缓存它的返回值重复使用**，服务端会把重复密文当成重放拒绝（返回 1001）。

### 3. 登录（两种方式二选一）

```js
// 方式一：密码登录
const result = await api("/api/login", "POST", {
  user: phone,
  passwd: YinLingCrypto.encryptPassword(password),
});

// 方式二：验证码登录
const result = await api("/api/login", "POST", {
  user: phone,
  verify: code,
});
```

**两种方式只能传一个**，两个都传或都不传会返回 `1001`。

成功后能拿到：

```json
{ "status": 0, "msg": "登录成功", "uid": 1, "uname": "张阿姨", "phone": "138****0001" }
```

`phone` 是脱敏的，直接显示没问题。

### 4. 怎么判断「现在是登录状态」

后端没有 `/api/me` 接口，最简单的办法是调一次列表：

```js
const result = await api("/api/elders");
const loggedIn = result.status === 0;
```

页面加载时调一次，`1007` 就是没登录。

---

## 六、老人档案

档案对象长这样：

```json
{
  "id": 1,
  "owner_id": 1,
  "viewer_ids": [3],
  "name": "张阿姨",
  "phone": "13800000001",
  "emergency_phone": "13900000009",
  "created_at": 1760000000,
  "updated_at": 1760000000,
  "deleted_at": null
}
```

> 时间戳是**秒**，不是毫秒。转日期用 `new Date(ts * 1000)`。

### 列表

```js
const result = await api("/api/elders?page=1&size=20");
// result.items 是数组，result.total 是总数
```

### 新增

```js
const result = await api("/api/elders", "POST", {
  name: "张阿姨",
  phone: "13800000001",
  emergency_phone: "13900000009",
  viewer_ids: [],            // 可选，只读账号的 uid 数组
});
```

### 详情 / 修改 / 删除

```js
await api(`/api/elders/${id}`);

// 只传要改的字段，没传的保持原样
await api(`/api/elders/${id}`, "PATCH", { name: "张奶奶" });

await api(`/api/elders/${id}`, "DELETE");
```

删除是软删除，之后所有接口查这个 id 都返回 `1009`「老人信息不存在」。

---

## 七、健康记录

### 五种类型

| type | 中文 | value | value2 | 单位 |
| --- | --- | --- | --- | --- |
| `blood_pressure` | 血压 | 收缩压 60–260 | **必传**，舒张压 30–180，且小于 value | mmHg |
| `blood_glucose` | 血糖 | 1.0–35.0 | 不传 | mmol/L |
| `heart_rate` | 心率 | 30–220 | 不传 | 次/分 |
| `weight` | 体重 | 20–200 | 不传 | kg |
| `temperature` | 体温 | 33.0–43.0 | 不传 | °C |

单位由服务端填，不用传；传了也会被忽略。超出范围返回 `1001`。

### 提交

```js
// 血压要传两个值
await api(`/api/elders/${id}/health-records`, "POST", {
  type: "blood_pressure",
  value: 135,
  value2: 85,
  measured_at: Math.floor(Date.now() / 1000),
  note: "早饭后测的",        // 可选
});

// 其它类型只传 value
await api(`/api/elders/${id}/health-records`, "POST", {
  type: "weight",
  value: 62,
  measured_at: Math.floor(Date.now() / 1000),
});
```

`measured_at` 不能比当前时间晚 5 分钟以上。

### 查询

```js
// 全部
await api(`/api/elders/${id}/health-records`);

// 按类型 + 时间段过滤
await api(`/api/elders/${id}/health-records?type=blood_pressure&from=1760000000&to=1760086400`);
```

结果按测量时间倒序，`items` 里每条形如：

```json
{ "id": 1, "type": "blood_pressure", "value": 135, "value2": 85, "unit": "mmHg", "measured_at": 1760000000, "note": "早饭后测的", "created_by": 1, "created_at": 1760000000 }
```

### 删除

```js
await api(`/api/elders/${id}/health-records/${recordId}`, "DELETE");
```

---

## 八、一键求助

### 发起

```js
const result = await api(`/api/elders/${id}/sos`, "POST", {
  reason: "头晕，站不稳",              // 可选，最多 200 字
  location: "30.123456,120.123456",    // 可选，纬度,经度，各 6 位小数
});
```

返回里有 `state` 和 `notify_phones`（应通知的号码）：

```json
{ "status": 0, "msg": "求助已发送", "id": 1, "state": "pending", "notify_phones": ["13900000009"] }
```

连点两次不会产生两条记录，第二次返回同一条，`msg` 变成「已发送过求助，请等待处理」。

### 重要：求助失败要直接打 110

后端目前只记录，**不会真的发短信或打电话**。所以按钮必须做兜底：

```js
async function sendSos(elderId) {
  const timer = new Promise((resolve) =>
    setTimeout(() => resolve({ status: -1 }), 3000));   // 3 秒超时

  const result = await Promise.race([
    api(`/api/elders/${elderId}/sos`, "POST", { reason: "一键求助" }),
    timer,
  ]);

  if (result.status === 0) {
    showToast("求助已记录，正在通知家人");
  } else {
    // 接口没通就直接拨号，不能把安全寄托在网络上
    location.href = "tel:110";
  }
}
```

### 查询 / 标记已处理

```js
await api(`/api/elders/${id}/sos?state=pending`);

await api(`/api/sos/${sosId}`, "PATCH", { state: "acknowledged" });
// 之后还能再改成 closed 表示结束，closed 是终态
```

---

## 九、错误码对照（用来决定怎么提示）

| status | 含义 | 前端建议 |
| --- | --- | --- |
| `-1` | 连不上服务器（前端自定义，不是后端返回） | 提示检查网络 / 后端是否启动 |
| `0` | 成功 | 正常流程 |
| `1001` | 参数错误 | 直接把 `msg` 显示给用户 |
| `1002` | 验证码错误或已过期 | 提示重新获取 |
| `1003` | 验证码发送过于频繁 | 按钮倒计时 |
| `1004` | 手机号或密码不正确 | 提示重新输入 |
| `1005` | 手机号已注册 | 引导去登录 |
| `1006` | 账号已锁定 | 提示 15 分钟后再试 |
| `1007` | 未登录或会话过期 | 跳登录页 |
| `1008` | 无权操作该老人 | 隐藏编辑/删除按钮 |
| `1009` | 老人信息不存在 | 返回列表页 |
| `1010` | 验证码错误次数过多 | 必须重新获取 |
| `1011` | 手机号未注册 | 引导去注册 |
| `1012` | 健康记录不存在 | 刷新列表 |
| `1013` | 求助记录不存在 | 刷新列表 |
| `1014` | 接口不存在 | 检查路径拼写 |
| `1099` | 服务器内部错误 | 提示稍后再试 |

多数情况下 `msg` 已经是能直接给用户看的中文，直接用即可。

---

## 十、五个一定会踩的坑

1. **忘了 `credentials: "include"`** → 登录成功但下一个请求还是 1007。
2. **`localhost` 和 `127.0.0.1` 混用** → Cookie 静默丢失，且不报错。前后端统一用一个。
3. **用 `response.ok` 判断成功** → 业务失败时 HTTP 码可能是 401/404，但成功时也可能不是 200，一律看 `data.status`。
4. **把时间戳当毫秒** → 传 `Date.now()` 会被拒，要 `Math.floor(Date.now() / 1000)`。
5. **重复使用同一个密文** → 服务端按重放拒绝，每次提交都要重新 `encryptPassword`。

---

## 十一、页面接入建议

| 页面 | 要接的接口 |
| --- | --- |
| 新增 `login.html` | 验证码、注册、登录 |
| `profile.html` | 老人档案增删改查；亲情联系人可以用 `emergency_phone` |
| `index.html` | 老人列表、一键求助 |
| `fraud.html` / `services.html` / `learn.html` | 暂时不用接，保持本地逻辑 |

接入顺序建议：先把 `login.html` 跑通（能看到 `status: 0`），再接档案，最后接健康记录和求助。
每接一个接口，先 `console.log` 打印完整返回，再写界面。
