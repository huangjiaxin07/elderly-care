"""RAG：把反诈知识库做成可检索的向量索引。

流程：embedding 建库 → 查询向量 → 余弦粗排 Top8 → reranker 精排 Top4。
任何一步失败都退化为「不给参考资料」，让模型按常识回答，不影响主流程。
"""

import json
import math
import time

import ai
import config
import db
import knowledge


def _cosine(a, b):
    if len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0 or nb <= 0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


def ensure_index(force=False):
    """首次调用时把知识库写进数据库；条数一致就跳过。"""
    total = db.fetchone("SELECT COUNT(*) AS C FROM KNOWLEDGE")["C"]
    if total == len(knowledge.DOCS) and not force:
        return False

    texts = [knowledge.as_text(doc) for doc in knowledge.DOCS]
    vectors = ai.embed(texts)

    db.execute("DELETE FROM KNOWLEDGE")
    current = int(time.time())
    for doc, vector in zip(knowledge.DOCS, vectors):
        db.execute(
            "INSERT INTO KNOWLEDGE (ID, TITLE, CONTENT, VECTOR, UPDATED_AT) "
            "VALUES (?, ?, ?, ?, ?)",
            (doc["id"], doc["title"], doc["content"], json.dumps(vector), current))
    return True


def _rows():
    return db.fetchall("SELECT ID, TITLE, CONTENT, VECTOR FROM KNOWLEDGE")


def _keyword_hits(query, rows, limit):
    """没有向量时的降级方案：按字符重合度粗略排序。"""
    scored = []
    for row in rows:
        text = row["TITLE"] + row["CONTENT"]
        hit = sum(1 for char in set(query) if char in text)
        scored.append((hit, row))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [row for hit, row in scored[:limit] if hit > 0]


def retrieve(query, top_k=None, candidates=8):
    """返回 [(doc_id, title, content, score), ...]，失败返回空列表。"""
    top_k = top_k or config.Config.RAG_TOP_K
    rows = _rows()
    if not rows:
        return []

    try:
        query_vector = ai.embed(query)[0]
        scored = [(_cosine(query_vector, json.loads(row["VECTOR"])), row) for row in rows]
        scored.sort(key=lambda item: item[0], reverse=True)
        shortlist = scored[:candidates]
    except Exception:
        return [(row["ID"], row["TITLE"], row["CONTENT"], 0.0)
                for row in _keyword_hits(query, rows, top_k)]

    try:
        pairs = ai.rerank(query, [row["TITLE"] + "\n" + row["CONTENT"]
                                  for _, row in shortlist], top_n=top_k)
        if pairs:
            return [(shortlist[index][1]["ID"], shortlist[index][1]["TITLE"],
                     shortlist[index][1]["CONTENT"], score)
                    for index, score in pairs]
    except Exception:
        pass

    # 重排不可用时，用向量粗排结果顶上
    return [(row["ID"], row["TITLE"], row["CONTENT"], score)
            for score, row in shortlist[:top_k]]


def context_block(docs):
    """拼成 Prompt 里的「参考资料」段落。"""
    if not docs:
        return ""
    lines = ["参考资料（仅供判断参考，可能与本条无关）："]
    for index, (doc_id, title, content, _score) in enumerate(docs, start=1):
        lines.append("{}. {}：{}".format(index, title, content))
    return "\n".join(lines)
