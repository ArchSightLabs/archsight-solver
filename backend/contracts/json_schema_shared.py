from __future__ import annotations

API_SCHEMA_VERSION = "2026-05-30"
SCHEMA_ID_BASE_URI = "https://solver.archsight.cn/schemas"


def _schema_id(name: str) -> str:
    return f"{SCHEMA_ID_BASE_URI}/{name}.schema.json"
