# 阿里云短信接入：从零到能收到验证码

后端默认 `SMS_PROVIDER=log`，验证码只打到控制台、不真正发送。
想让它真的发短信，按下面做一遍，大约 30 分钟（审核时间另算）。

代码已经写好了，你只需要准备四个值填进 `server/.env`：
`ALIYUN_ACCESS_KEY_ID`、`ALIYUN_ACCESS_KEY_SECRET`、`ALIYUN_SMS_SIGN_NAME`、`ALIYUN_SMS_TEMPLATE_CODE`。

---

## 第 0 步：确认你有的东西

| 需要 | 说明 |
| --- | --- |
| 阿里云账号 | 已完成**实名认证**（个人或企业），没实名的账号开不了短信 |
| 免费额度 | 新用户国内短信 100 条 / 3 个月，在短信控制台首页领取 |
| 一个能收短信的手机号 | 测试期就用你自己的号 |

> 菜单名可能随阿里云改版变化，按「短信服务 → 国内消息 → 签名/模板管理」这条路径找。

## 第 1 步：开通短信服务并领免费额度

1. 打开 <https://dysms.console.aliyun.com/>，点「开通服务」。
2. 首页一般有「免费试用 / 领取免费资源包」，领那 100 条。

免费额度是**按账号**送的，用完了就按量计费（国内短信约 0.045 元/条），
所以测试时别写循环狂刷。

## 第 2 步：加签名（最容易卡住的一步）

「国内消息 → 签名管理 → 添加签名」。

签名就是短信开头那个【xxx】，必须和你的主体有关联，个人认证尤其严格：

- 有已备案网站 / 公众号 / 小程序 / APP 的，用它们的名称，并上传对应截图；
- 作为课程项目，通常用**学校、学院或社团**的名称更容易过，需要组织证明材料；
- 什么都没有的，审核大概率被驳回，这是个人开发者最常见的卡点，建议先问客服有没有可用方案。

审核一般几个小时内出结果（工作日），**没通过之前短信发不出去**，
错误码会是 `isv.SMS_SIGNATURE_ILLEGAL`。

审核通过后，把签名**名称**（不含【】）填到 `ALIYUN_SMS_SIGN_NAME`，例如 `银龄无诈`。

## 第 3 步：加模板

「国内消息 → 模板管理 → 添加模板」，选「验证码」类型，内容照抄这个格式：

```
您的验证码为${code}，10分钟内有效，请勿泄露。
```

要点：

- 变量只能写在 `${}` 里，名字必须和 `.env` 的 `ALIYUN_SMS_TEMPLATE_PARAM` 一致（默认 `code`）；
- 模板内容不能自己随便加营销词，否则审核不过；
- 审核通过后拿到 `SMS_` 开头的模板 CODE，填到 `ALIYUN_SMS_TEMPLATE_CODE`。

## 第 4 步：创建 RAM 子账号（不要用主账号 AccessKey）

主账号的 AccessKey 权限过大，泄露等于整个账号被接管。

1. 打开「访问控制 RAM」控制台 → 用户 → 创建用户；
2. 勾选「使用永久 AccessKey 访问」，创建后会**只显示一次** Secret，当场复制；
3. 给这个用户授权：`AliyunDysmsFullAccess`（只想发短信的话，可以自定义一条只允许 `dysms:SendSms` 的策略）。

拿到 `AccessKey ID` 和 `AccessKey Secret`，填进 `.env`。

## 第 5 步：填配置并切换

编辑 [`server/.env`](.env)：

```ini
SMS_PROVIDER=aliyun

ALIYUN_ACCESS_KEY_ID=LTAI5t********
ALIYUN_ACCESS_KEY_SECRET=********************************
ALIYUN_SMS_SIGN_NAME=银龄无诈
ALIYUN_SMS_TEMPLATE_CODE=SMS_123456789
ALIYUN_SMS_TEMPLATE_PARAM=code
```

重启后端（配置只在启动时读一次）：

```powershell
server\.winv\Scripts\python.exe server\app.py
```

## 第 6 步：测试

```powershell
curl -X POST http://127.0.0.1:14087/api/verify `
  -H 'Content-Type: application/json' `
  -d '{"phone":"你自己的手机号","scene":"register"}'
```

三种结果：

| 现象 | 含义 |
| --- | --- |
| 手机收到短信，控制台出现 `[SMS:aliyun] phone=... biz_id=...` | 成功 |
| 返回 `status=1099`，控制台有 `发送失败：...` | 失败，看下一节的错误码 |
| 返回 `status=0` 但没收到 | 号码填错了，或进了运营商黑名单 |

失败时后端会**把这条验证码删掉**，不会出现「库里有效、用户收不到」的情况。

## 第 7 步：常见错误码

| 错误码 | 原因 | 怎么办 |
| --- | --- | --- |
| `isv.SMS_SIGNATURE_ILLEGAL` | 签名不存在或未审核通过 | 检查签名名称是否和审核通过的一字不差 |
| `isv.SMS_TEMPLATE_ILLEGAL` | 模板不存在或未审核通过 | 检查 `SMS_` 开头的 CODE |
| `isv.MOBILE_NUMBER_ILLEGAL` | 手机号格式不合法 | 必须是 11 位大陆手机号 |
| `isv.BUSINESS_LIMIT_CONTROL` | 同一号码发太频繁 | 阿里云默认 1 分钟 1 条、1 天 10 条 |
| `isv.AMOUNT_NOT_ENOUGH` | 免费额度用完了 | 买资源包或充值 |
| `SignatureDoesNotMatch` | 签名算错 | AccessKeySecret 填错了，重新复制 |
| `Forbidden.RAM` | 子账号没权限 | 给它加 `AliyunDysmsFullAccess` |

代码里的错误码提示表在 [`sms.py`](sms.py) 的 `ALIYUN_HINTS`，想加新条目改那里。

## 上线前必须改的三件事

1. **`CODE_LOG` 关掉**：走阿里云时验证码本来就不会打印，但确认一下日志里没有；
2. **`PASSWORD_MODE=sm2`**：现在默认 `auto`（明文也能登录），正式环境应该只收密文；
3. **AccessKey 不要提交到仓库**：`.env` 目前是演示配置，填了真实 AK 后要把它加到 `.gitignore`。
