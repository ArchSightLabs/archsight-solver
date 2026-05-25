from __future__ import annotations

import csv
import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Mapping

from backend.common.numbers import to_float
from backend.common.units import from_si


ROOT = Path(__file__).resolve().parents[2]
SECTION_LIBRARY_PATH = ROOT / "data" / "sections" / "builtin_sections.json"
SECTION_LIBRARY_CSV_PATH = ROOT / "data" / "sections" / "builtin_sections.csv"


@lru_cache(maxsize=1)
def load_section_library() -> Dict[str, Dict[str, Any]]:
    with SECTION_LIBRARY_PATH.open("r", encoding="utf-8") as handle:
        rows = json.load(handle)
    return {str(row["sectionId"]): dict(row) for row in rows}


@lru_cache(maxsize=1)
def load_section_library_csv() -> Dict[str, Dict[str, Any]]:
    if not SECTION_LIBRARY_CSV_PATH.exists():
        return {}
    with SECTION_LIBRARY_CSV_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = csv.DictReader(handle)
        return {
            str(row["sectionId"]): {
                "sectionId": row["sectionId"],
                "name": row["name"],
                "A_cm2": float(row["A_cm2"]),
                "I_cm4": float(row["I_cm4"]),
                "source": row.get("source") or "builtin_csv",
            }
            for row in rows
        }


def resolve_section(member: Mapping[str, Any]) -> Dict[str, Any]:
    section_id = str(member.get("sectionId") or member.get("section_id") or "").strip()
    raw_section = member.get("section")
    if section_id:
        section = load_section_library().get(section_id) or load_section_library_csv().get(section_id)
        if not section:
            raise ValueError(f"未知截面库 ID: {section_id}")
        return dict(section)
    if not isinstance(raw_section, Mapping):
        return {}

    section_type = str(raw_section.get("type") or raw_section.get("shape") or "").strip().lower()
    if section_type in {"rectangle", "rect", "矩形"}:
        width_m = to_float(raw_section.get("widthM"), 0.0) or to_float(raw_section.get("widthMm"), 0.0) / 1000.0
        depth_m = to_float(raw_section.get("depthM", raw_section.get("heightM")), 0.0) or to_float(raw_section.get("depthMm", raw_section.get("heightMm")), 0.0) / 1000.0
        if width_m <= 0 or depth_m <= 0:
            raise ValueError("矩形截面宽度和高度必须大于 0")
        return {
            "sectionId": raw_section.get("id", "custom_rectangle"),
            "name": raw_section.get("name", "自定义矩形截面"),
            "A_cm2": from_si(width_m * depth_m, "area", "cm2"),
            "I_cm4": from_si(width_m * depth_m**3 / 12.0, "moment_of_inertia", "cm4"),
            "source": "custom",
        }
    if section_type in {"circle", "circular", "圆形"}:
        diameter_m = to_float(raw_section.get("diameterM"), 0.0) or to_float(raw_section.get("diameterMm"), 0.0) / 1000.0
        if diameter_m <= 0:
            raise ValueError("圆形截面直径必须大于 0")
        return {
            "sectionId": raw_section.get("id", "custom_circle"),
            "name": raw_section.get("name", "自定义圆形截面"),
            "A_cm2": from_si(math.pi * diameter_m**2 / 4.0, "area", "cm2"),
            "I_cm4": from_si(math.pi * diameter_m**4 / 64.0, "moment_of_inertia", "cm4"),
            "source": "custom",
        }
    raise ValueError("截面类型必须为 rectangle 或 circle")
