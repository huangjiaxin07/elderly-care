"""一键求助：发起、查询、标记处理。

注意：本模块只把求助落库并把「应通知的号码」写进记录，
没有接入短信、外呼、推送。真正的通知能力见 server.md 待定事项。
"""

from flask import Blueprint, current_app, g, request

import store
from responses import ApiError, json_body, respond
from security import login_required

bp = Blueprint("sos", __name__, url_prefix="/api")

DEBOUNCE_SECONDS = 60


@bp.get("/elders/<int:elder_id>/sos")
@login_required
def list_sos(elder_id):
    store.resolve_elder(elder_id, g.user["ID"])
    items, total, page, size = store.query_sos(elder_id, request.args)
    return respond(0, "ok", items=items, total=total, page=page, size=size)


@bp.post("/elders/<int:elder_id>/sos")
@login_required
def create_sos(elder_id):
    elder = store.resolve_elder(elder_id, g.user["ID"])
    data = json_body()

    reason = store.as_optional_text(data.get("reason"), "求助描述", 200)
    location = store.validate_location(data.get("location"))

    # 防连按：同一账号对同一老人 60 秒内只认一条，老人手抖连点不会刷出一串记录
    existing = store.recent_sos(elder_id, g.user["ID"], DEBOUNCE_SECONDS)
    if existing is not None:
        return respond(0, "已发送过求助，请等待处理", **store.serialize_sos(existing))

    row = store.create_sos(elder, g.user["ID"], reason, location)
    payload = store.serialize_sos(row)
    current_app.logger.warning(
        "[SOS] elder=%s user=%s reason=%s location=%s notify=%s",
        elder_id, g.user["ID"], reason, location, payload["notify_phones"])
    return respond(0, "求助已发送", **payload)


@bp.patch("/sos/<int:sos_id>")
@login_required
def patch_sos(sos_id):
    row = store.get_sos(sos_id)
    if row is None:
        raise ApiError(1013, "求助记录不存在")
    if not store.can_access_elder(row["ELDER_ID"], g.user["ID"]):
        raise ApiError(1008, "无权访问该老人信息")

    data = json_body()
    target = data.get("state")
    updated = store.ack_sos(row, g.user["ID"], target)
    return respond(0, "已处理", **store.serialize_sos(updated))
