"""短信发送：默认只在控制台提示，可切换到阿里云真正发送。

设计成两种通道，是因为课程演示阶段不该被别人收不到短信卡住：
- SMS_PROVIDER=log（默认）：不发短信，验证码打到控制台；
- SMS_PROVIDER=aliyun：调用阿里云短信服务，真的发出去。

阿里云这部分没有用官方 SDK（环境里没有 pip），直接按 RPC 签名规范
拼 URL：HMAC-SHA1 + 参数排序 + percent-encode，官方文档的「签名机制」。
"""

import base64
import hashlib
import hmac
import json
import logging
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone

import config

log = logging.getLogger("sms")

ALIYUN_ENDPOINT = "https://dysmsapi.aliyuncs.com/"

# 常见错误码 -> 排查提示（官方文档里的错误码表）
ALIYUN_HINTS = {
    "isv.SMS_SIGNATURE_ILLEGAL": "短信签名不存在或未审核通过",
    "isv.SMS_TEMPLATE_ILLEGAL": "短信模板不存在或未审核通过",
    "isv.MOBILE_NUMBER_ILLEGAL": "手机号格式不合法",
    "isv.BUSINESS_LIMIT_CONTROL": "同一号码发送过于频繁，触发流控",
    "isv.AMOUNT_NOT_ENOUGH": "账户余额或免费额度不足",
    "isv.DAY_LIMIT_CONTROL": "该号码今日发送量已达上限",
    "InvalidAccessKeyId.NotFound": "AccessKeyId 不存在",
    "SignatureDoesNotMatch": "签名计算不匹配，检查 AccessKeySecret",
    "Forbidden.RAM": "RAM 用户没有短信发送权限",
}


class SmsError(Exception):
    """短信没发出去。调用方要把验证码一并失效，不能假装成功。"""


def _percent_encode(value):
    # 阿里云要求：空格编码成 %20、* 编码成 %2A、~ 不编码
    return urllib.parse.quote(str(value), safe="~")


def _signature(params, secret):
    canonical = "&".join(
        "{}={}".format(_percent_encode(k), _percent_encode(params[k]))
        for k in sorted(params))
    string_to_sign = "GET&%2F&" + _percent_encode(canonical)
    digest = hmac.new((secret + "&").encode("utf-8"),
                      string_to_sign.encode("utf-8"),
                      hashlib.sha1).digest()
    return base64.b64encode(digest).decode("ascii")


def _aliyun_send(phone, code):
    conf = config.Config
    missing = [
        name for name, value in (
            ("ALIYUN_ACCESS_KEY_ID", conf.ALIYUN_ACCESS_KEY_ID),
            ("ALIYUN_ACCESS_KEY_SECRET", conf.ALIYUN_ACCESS_KEY_SECRET),
            ("ALIYUN_SMS_SIGN_NAME", conf.ALIYUN_SMS_SIGN_NAME),
            ("ALIYUN_SMS_TEMPLATE_CODE", conf.ALIYUN_SMS_TEMPLATE_CODE),
        ) if not value
    ]
    if missing:
        raise SmsError("阿里云短信配置不完整，缺少：" + "、".join(missing))

    params = {
        "AccessKeyId": conf.ALIYUN_ACCESS_KEY_ID,
        "Action": "SendSms",
        "Format": "JSON",
        "PhoneNumbers": phone,
        "RegionId": conf.ALIYUN_SMS_REGION,
        "SignName": conf.ALIYUN_SMS_SIGN_NAME,
        "SignatureMethod": "HMAC-SHA1",
        "SignatureNonce": uuid.uuid4().hex,
        "SignatureVersion": "1.0",
        "TemplateCode": conf.ALIYUN_SMS_TEMPLATE_CODE,
        "TemplateParam": json.dumps(
            {conf.ALIYUN_SMS_TEMPLATE_PARAM: code}, ensure_ascii=False),
        "Timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "Version": "2017-05-25",
    }
    params["Signature"] = _signature(params, conf.ALIYUN_ACCESS_KEY_SECRET)

    query = "&".join(
        "{}={}".format(_percent_encode(k), _percent_encode(params[k]))
        for k in sorted(params))
    url = ALIYUN_ENDPOINT + "?" + query

    request = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=conf.SMS_TIMEOUT) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as error:
        raise SmsError("调用阿里云短信接口失败：{}".format(error))

    if payload.get("Code") != "OK":
        hint = ALIYUN_HINTS.get(payload.get("Code"), payload.get("Message", "未知错误"))
        raise SmsError("阿里云返回 {}：{}".format(payload.get("Code"), hint))

    return payload.get("BizId")


def deliver(phone, code):
    """把验证码送出去。log 模式什么都不做，aliyun 模式真正发送。"""
    provider = config.Config.SMS_PROVIDER

    if provider == "log":
        log.info("[SMS:log] phone=%s code=%s（未真正发送，仅提示）", phone, code)
        return {"provider": "log", "sent": False}

    if provider == "aliyun":
        biz_id = _aliyun_send(phone, code)
        log.info("[SMS:aliyun] phone=%s biz_id=%s", phone, biz_id)
        return {"provider": "aliyun", "sent": True, "biz_id": biz_id}

    raise SmsError("未知的短信通道：{}".format(provider))
