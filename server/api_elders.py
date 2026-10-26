"""老人档案的增删改查。"""

import json

from flask import Blueprint, g, request

import store
from responses import ApiError, json_body, respond
from security import login_required

bp = Blueprint("elders", __name__, url_prefix="/api")


@bp.get("/elders")
@login_required
def list_elders():
    page, size = store.parse_paging(request.args)
    rows, total = store.list_elders(g.user["ID"], page, size)
    items = [store.serialize_elder(row) for row in rows]
    return respond(0, "ok", items=items, total=total, page=page, size=size)


@bp.post("/elders")
@login_required
def create_elder():
    data = json_body()
    name = store.as_text(data.get("name"), "名字", 1, 50)
    phone = store.as_phone(data.get("phone"), "老人手机号")
    emergency = store.as_phone(data.get("emergency_phone"), "紧急联系人手机号")
    viewers = store.normalize_viewer_ids(data.get("viewer_ids"), g.user["ID"])

    elder = store.create_elder(g.user["ID"], name, phone, emergency, viewers)
    return respond(0, "已保存", **elder)


@bp.get("/elders/<int:elder_id>")
@login_required
def get_elder(elder_id):
    row = store.resolve_elder(elder_id, g.user["ID"])
    return respond(0, "ok", **store.serialize_elder(row))


@bp.patch("/elders/<int:elder_id>")
@login_required
def patch_elder(elder_id):
    row = store.resolve_elder_owner(elder_id, g.user["ID"])
    data = json_body()

    fields = {}
    if "name" in data:
        fields["NAME"] = store.as_text(data["name"], "名字", 1, 50)
    if "phone" in data:
        fields["PHONE"] = store.as_phone(data["phone"], "老人手机号")
    if "emergency_phone" in data:
        fields["EMERGENCY_PHONE"] = store.as_phone(
            data["emergency_phone"], "紧急联系人手机号")
    if "viewer_ids" in data:
        viewers = store.normalize_viewer_ids(data["viewer_ids"], row["OWNER_ID"])
        fields["VIEWER_IDS"] = json.dumps(viewers)

    if not fields:
        raise ApiError(1001, "没有需要修改的字段")

    elder = store.update_elder(row["ID"], fields)
    return respond(0, "已保存", **elder)


@bp.delete("/elders/<int:elder_id>")
@login_required
def delete_elder(elder_id):
    row = store.resolve_elder_owner(elder_id, g.user["ID"])
    store.soft_delete_elder(row["ID"])
    return respond(0, "已删除")
