from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Tuple


@dataclass(frozen=True)
class MaterialSpec:
    id: str
    name: str
    young_modulus_gpa: float
    density_kg_per_m3: float
    category: str
    note: str


_MATERIALS_PATH = Path(__file__).resolve().parents[2] / "shared" / "materials.json"
_CATEGORY_LABELS = {
    "custom": "自定义材料",
    "steel": "结构钢",
    "concrete": "混凝土",
}


@lru_cache(maxsize=1)
def material_catalog() -> Tuple[MaterialSpec, ...]:
    payload = json.loads(_MATERIALS_PATH.read_text(encoding="utf-8"))
    return tuple(
        MaterialSpec(
            id=str(item["id"]),
            name=str(item["name"]),
            young_modulus_gpa=float(item["youngModulusGPa"]),
            density_kg_per_m3=float(item["densityKgPerM3"]),
            category=str(item.get("category", "")),
            note=str(item.get("note", "")),
        )
        for item in payload
    )


def material_catalog_by_id() -> Dict[str, MaterialSpec]:
    return {material.id: material for material in material_catalog()}


def get_material_name(material_id: Any) -> str:
    normalized_id = str(material_id or "custom").strip().lower()
    material = material_catalog_by_id().get(normalized_id)
    if material:
        return material.name
    return "自定义材料"


def get_material_spec(material_id: Any) -> MaterialSpec | None:
    normalized_id = str(material_id or "custom").strip().lower()
    return material_catalog_by_id().get(normalized_id)


def material_report_rows(material_id: Any, *, include_name: bool = False) -> List[List[Any]]:
    normalized_id = str(material_id or "custom").strip().lower()
    material = get_material_spec(normalized_id)
    if not material:
        return [
            ["材料编号", normalized_id or "custom"],
            ["材料库状态", "未命中共享材料库"],
            ["工程说明", "计算以模型输入的弹性模量、截面面积和惯性矩为准；强度、稳定、连接和规范设计需单独复核。"],
        ]

    rows: List[List[Any]] = [["材料编号", material.id]]
    if include_name:
        rows.append(["材料名称", material.name])
    rows.extend(
        [
            ["材料类别", _CATEGORY_LABELS.get(material.category, material.category or "未分类")],
            ["材料库弹性模量 E (GPa)", material.young_modulus_gpa],
            ["材料库密度 ρ (kg/m³)", material.density_kg_per_m3],
            ["工程说明", material.note],
        ]
    )
    return rows
