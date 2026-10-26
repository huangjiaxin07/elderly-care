"""健康记录：提交、查询、软删除。

权限：owner 与 viewer 都可以提交和删除（见 server.md §3.4 的例外说明），
查询对两者一致。看不到档案的人一律 1009，不暴露档案是否存在。
"""

from flask import Blueprint, g, request

import store
from responses import ApiError, json_body, respond
from security import login_required

bp = Blueprint("health", __name__, url_prefix="/api")


@bp.get("/elders/<int:elder_id>/health-records")
@login_required
def list_records(elder_id):
    store.resolve_elder(elder_id, g.user["ID"])
    items, total, page, size = store.query_health(elder_id, request.args)
    return respond(0, "ok", items=items, total=total, page=page, size=size)


@bp.post("/elders/<int:elder_id>/health-records")
@login_required
def create_record(elder_id):
    store.resolve_elder(elder_id, g.user["ID"])
    data = json_body()
    payload = store.validate_health(data)
    record = store.create_health(elder_id, g.user["ID"], payload)
    return respond(0, "已记录", **record)


@bp.delete("/elders/<int:elder_id>/health-records/<int:record_id>")
@login_required
def delete_record(elder_id, record_id):
    store.resolve_elder(elder_id, g.user["ID"])
    row = store.get_health(record_id)
    # 不存在、不属于该老人、已删除，三种情况统一 1012，不让人靠响应差异试探
    if row is None or row["ELDER_ID"] != elder_id or row["DELETE_AT"] is not None:
        raise ApiError(1012, "健康记录不存在")
    store.soft_delete_health(record_id)
    return respond(0, "已删除")
