from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any, Mapping

from backend.benchmarks.catalog import find_benchmark_case


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
LEGACY_TEMPLATE_IDS = {
    "beam.simple_span_uniform": "simple-span-uniform",
}


def _load_template_map() -> list[Mapping[str, Any]]:
    data = json.loads(TEMPLATE_BENCHMARK_MAP_PATH.read_text(encoding="utf-8"))
    templates = data.get("templates", [])
    return [item for item in templates if isinstance(item, Mapping)]


def _canonical_template_id(template_id: str) -> str:
    normalized = str(template_id or "").strip()
    return LEGACY_TEMPLATE_IDS.get(normalized, normalized)


def _benchmark_mapping(item: Mapping[str, Any]) -> list[dict[str, str]]:
    validation_refs = item.get("validationRefs") if isinstance(item.get("validationRefs"), list) else []
    return [
        {
            "caseId": str(ref.get("caseId") or ""),
            "relation": str(ref.get("relation") or ""),
            "note": str(ref.get("note") or ""),
        }
        for ref in validation_refs
        if isinstance(ref, Mapping)
    ]


def resolve_builtin_template(template_id: str) -> dict[str, Any] | None:
    """Resolve a public registry template to its executable benchmark payload."""

    canonical_id = _canonical_template_id(template_id)
    item = next(
        (candidate for candidate in _load_template_map() if str(candidate.get("templateId") or "") == canonical_id),
        None,
    )
    if item is None:
        return None
    benchmark_mapping = _benchmark_mapping(item)
    direct_refs = [ref for ref in benchmark_mapping if ref["relation"] == "对应"]
    for ref in [*direct_refs, *benchmark_mapping]:
        case = find_benchmark_case(ref["caseId"])
        payload = case.get("payload") if isinstance(case, Mapping) else None
        if isinstance(payload, Mapping):
            structure_type = str(item.get("module") or case.get("category") or "")
            executable_payload = deepcopy(dict(payload))
            executable_payload.setdefault("analysisType", structure_type)
            return {
                "templateId": canonical_id,
                "structureType": structure_type,
                "title": str(item.get("templateTitle") or case.get("title") or canonical_id),
                "benchmarkCaseId": ref["caseId"],
                "solverPayload": executable_payload,
            }
    return None


def list_builtin_template_registry() -> dict[str, Any]:
    templates = []
    for item in _load_template_map():
        structure_type = str(item.get("module") or "")
        template_id = str(item.get("templateId") or "")
        benchmark_mapping = _benchmark_mapping(item)
        is_executable = resolve_builtin_template(template_id) is not None
        templates.append({
            "templateId": template_id,
            "structureType": structure_type,
            "structureLabel": STRUCTURE_TYPE_LABELS.get(structure_type, "未知结构体系"),
            "title": str(item.get("templateTitle") or ""),
            "entryPoints": TEMPLATE_ENTRY_POINTS if is_executable else ["workbench"],
            "supportedActions": SUPPORTED_ACTIONS if is_executable else [],
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
