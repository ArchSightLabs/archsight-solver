from __future__ import annotations

from typing import Dict

from backend.config import get_persistence_decision, get_persistence_mode


SUPPORTED_PERSISTENCE_MODES = {"stateless"}


def get_persistence_policy() -> Dict[str, str | bool]:
    mode = get_persistence_mode()
    return {
        "mode": mode,
        "enabled": mode != "stateless",
        "supported": mode in SUPPORTED_PERSISTENCE_MODES,
        "decision": get_persistence_decision(),
    }


def enforce_supported_persistence_policy() -> Dict[str, str | bool]:
    policy = get_persistence_policy()
    if not policy["supported"]:
        raise ValueError(
            "当前版本仅支持无状态计算 API；"
            f"检测到 BEAM_SOLVER_PERSISTENCE_MODE={policy['mode']}，"
            "请保持 stateless，或先完成数据库持久化设计、迁移与回归测试。"
        )
    return policy
