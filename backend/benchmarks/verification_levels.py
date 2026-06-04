from __future__ import annotations

from typing import Any, Dict, Mapping


VERIFICATION_LEVELS: Dict[str, Dict[str, str]] = {
    "A": {
        "label": "A 级验证",
        "description": "教材解析解或标准公式，可用于校验基本公式、单位换算、边界条件和符号约定。",
    },
    "B": {
        "label": "B 级验证",
        "description": "独立刚度法基线或独立矩阵法算例，可用于校验装配、约束和结果恢复。",
    },
    "C": {
        "label": "C 级验证",
        "description": "版本明确的工程软件对标，应记录软件、版本、单元类型、单位制和建模假定。",
    },
    "D": {
        "label": "D 级验证",
        "description": "项目内部回归基线，只用于防止行为漂移，不作为外部专业背书。",
    },
}

SOURCE_TYPE_TO_LEVEL = {
    "textbook-analytical": "A",
    "independent-stiffness-baseline": "B",
    "engineering-software": "C",
    "internal-regression": "D",
}


def verification_level_for_source_type(source_type: str) -> str:
    return SOURCE_TYPE_TO_LEVEL.get(source_type, "D")


def verification_level_meta(level: str) -> Dict[str, str]:
    normalized_level = level if level in VERIFICATION_LEVELS else "D"
    meta = VERIFICATION_LEVELS[normalized_level]
    return {
        "verificationLevel": normalized_level,
        "verificationLevelLabel": meta["label"],
        "verificationLevelDescription": meta["description"],
    }


def normalize_verification_metadata(verification: Mapping[str, Any] | None) -> Dict[str, Any]:
    normalized = dict(verification or {})
    source_type = str(normalized.get("sourceType") or "internal-regression")
    inferred_level = verification_level_for_source_type(source_type)
    level = str(normalized.get("verificationLevel") or inferred_level)
    normalized.update(verification_level_meta(level))
    return normalized
