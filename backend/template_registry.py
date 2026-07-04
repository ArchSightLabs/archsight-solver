from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_BENCHMARK_MAP_PATH = ROOT / "data" / "verification" / "template_benchmark_map.json"
TEMPLATE_REGISTRY_VERSION = "1.0.0"

STRUCTURE_TYPE_LABELS = {
    "beam": "梁系",
    "frame": "二维平面框架",
    "truss": "二维平面桁架",
}

PRIMARY_RESULT_METRICS = {
    "beam": ["挠度", "弯矩", "剪力", "支座反力"],
    "frame": ["节点位移", "构件弯矩", "杆端内力", "支座反力"],
    "truss": ["节点位移", "杆件轴力", "杆件轴应力", "支座反力"],
}

TEMPLATE_ENTRY_POINTS = ["workbench", "agent", "external-host"]
SUPPORTED_ACTIONS = ["load", "solve", "export", "host-launch"]


def _load_template_map() -> list[Mapping[str, Any]]:
    data = json.loads(TEMPLATE_BENCHMARK_MAP_PATH.read_text(encoding="utf-8"))
    templates = data.get("templates", [])
    return [item for item in templates if isinstance(item, Mapping)]


def list_builtin_template_registry() -> dict[str, Any]:
    templates = []
    for item in _load_template_map():
        validation_refs = item.get("validationRefs") if isinstance(item.get("validationRefs"), list) else []
        structure_type = str(item.get("module") or "")
        benchmark_mapping = [
            {
                "caseId": str(ref.get("caseId") or ""),
                "relation": str(ref.get("relation") or ""),
                "note": str(ref.get("note") or ""),
            }
            for ref in validation_refs
            if isinstance(ref, Mapping)
        ]
        templates.append({
            "templateId": str(item.get("templateId") or ""),
            "structureType": structure_type,
            "structureLabel": STRUCTURE_TYPE_LABELS.get(structure_type, "未知结构体系"),
            "title": str(item.get("templateTitle") or ""),
            "entryPoints": TEMPLATE_ENTRY_POINTS,
            "supportedActions": SUPPORTED_ACTIONS,
            "primaryResultMetrics": PRIMARY_RESULT_METRICS.get(structure_type, []),
            "benchmarkMapping": benchmark_mapping,
            "benchmarkRefCount": len(benchmark_mapping),
            "hasDirectBenchmark": any(ref["relation"] == "对应" for ref in benchmark_mapping),
            "source": "builtin",
        })
    return {
        "registryVersion": TEMPLATE_REGISTRY_VERSION,
        "templateCount": len(templates),
        "templates": templates,
    }
