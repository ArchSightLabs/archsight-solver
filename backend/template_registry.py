from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_BENCHMARK_MAP_PATH = ROOT / "data" / "verification" / "template_benchmark_map.json"
TEMPLATE_REGISTRY_VERSION = "1.0.0"


def _load_template_map() -> list[Mapping[str, Any]]:
    data = json.loads(TEMPLATE_BENCHMARK_MAP_PATH.read_text(encoding="utf-8"))
    templates = data.get("templates", [])
    return [item for item in templates if isinstance(item, Mapping)]


def list_builtin_template_registry() -> dict[str, Any]:
    templates = []
    for item in _load_template_map():
        validation_refs = item.get("validationRefs") if isinstance(item.get("validationRefs"), list) else []
        templates.append({
            "templateId": str(item.get("templateId") or ""),
            "structureType": str(item.get("module") or ""),
            "title": str(item.get("templateTitle") or ""),
            "supportedActions": ["load", "solve", "export"],
            "benchmarkMapping": [
                {
                    "caseId": str(ref.get("caseId") or ""),
                    "relation": str(ref.get("relation") or ""),
                    "note": str(ref.get("note") or ""),
                }
                for ref in validation_refs
                if isinstance(ref, Mapping)
            ],
            "source": "builtin",
        })
    return {
        "registryVersion": TEMPLATE_REGISTRY_VERSION,
        "templateCount": len(templates),
        "templates": templates,
    }
