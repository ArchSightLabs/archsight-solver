from __future__ import annotations

from typing import Any, Dict, List

from backend.config import get_max_frame_members, get_max_frame_nodes
from backend.common.numbers import to_float
from backend.common.solver_backend import normalize_solver_backend
from backend.normalizers.structural_model import (
    FRAME_SUPPORT_LABELS,
    build_structural_model,
    parse_support_type as parse_structural_support_type,
)


DEFAULT_PROJECT_NAME = "默认平面框架项目"
DEFAULT_MATERIAL_NAME = "自定义材料"

SUPPORT_LABELS = FRAME_SUPPORT_LABELS


def _first_value(*values: Any) -> Any:
    for value in values:
        if value is not None:
            return value
    return None


def parse_support_type(value: Any, default: str = "free") -> str:
    return parse_structural_support_type(value, SUPPORT_LABELS, default)


def _coerce_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "on", "enabled"}:
        return True
    if text in {"0", "false", "no", "n", "off", "disabled"}:
        return False
    return default


def _coerce_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        numeric = int(float(value))
    except (TypeError, ValueError):
        numeric = default
    return max(minimum, min(maximum, numeric))


def _coerce_float(value: Any, default: float, minimum: float, maximum: float) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        numeric = default
    if not numeric == numeric:  # NaN guard without importing math for a tiny helper.
        numeric = default
    return max(minimum, min(maximum, numeric))


def _normalize_initial_imperfection(raw: Any) -> Dict[str, Any]:
    value = raw if isinstance(raw, dict) else {}
    imperfection_type = str(value.get("type") or "none").strip().lower()
    if imperfection_type not in {"none", "explicit", "buckling_mode"}:
        imperfection_type = "none"
    offsets: List[Dict[str, Any]] = []
    if imperfection_type == "explicit" and isinstance(value.get("nodeOffsets"), list):
        for item in value["nodeOffsets"]:
            if not isinstance(item, dict) or not str(item.get("nodeId") or "").strip():
                continue
            offsets.append(
                {
                    "nodeId": str(item["nodeId"]).strip(),
                    "uxMm": _coerce_float(item.get("uxMm"), 0.0, -1000.0, 1000.0),
                    "uyMm": _coerce_float(item.get("uyMm"), 0.0, -1000.0, 1000.0),
                }
            )
    return {
        "type": imperfection_type,
        "nodeOffsets": offsets,
        "modeNumber": _coerce_int(value.get("modeNumber"), 1, 1, 12),
        "amplitudeMm": _coerce_float(value.get("amplitudeMm"), 0.0, 0.0, 1000.0),
        "direction": -1 if _coerce_float(value.get("direction"), 1.0, -1.0, 1.0) < 0 else 1,
    }


def normalize_frame_analysis_options(raw: Any) -> Dict[str, Any]:
    options = raw if isinstance(raw, dict) else {}
    nested = options.get("options") if isinstance(options.get("options"), dict) else {}
    pdelta_options = options.get("pDeltaOptions") or options.get("p_delta_options") or nested.get("pDeltaOptions") or {}
    buckling_options = options.get("bucklingOptions") or nested.get("bucklingOptions") or {}
    if not isinstance(pdelta_options, dict):
        pdelta_options = {}
    if not isinstance(buckling_options, dict):
        buckling_options = {}

    load_steps = _coerce_int(
        pdelta_options.get("loadSteps", options.get("loadSteps", nested.get("loadSteps", 4))),
        4,
        1,
        20,
    )
    algorithm = str(pdelta_options.get("algorithm") or "initial_stress_v1").strip().lower()
    if algorithm not in {"initial_stress_v1", "corotational_newton_v1"}:
        algorithm = "initial_stress_v1"

    return {
        "pDelta": _coerce_bool(options.get("pDelta", options.get("p_delta", nested.get("pDelta", nested.get("p_delta", False))))),
        "buckling": _coerce_bool(options.get("buckling", nested.get("buckling", False))),
        "pDeltaOptions": {
            "algorithm": algorithm,
            "loadSteps": load_steps,
            "maxIterations": _coerce_int(
                pdelta_options.get("maxIterations", options.get("maxIterations", nested.get("maxIterations", 12))),
                30 if algorithm == "corotational_newton_v1" else 12,
                1,
                100,
            ),
            "tolerance": _coerce_float(
                pdelta_options.get("tolerance", options.get("tolerance", nested.get("tolerance", 1e-6))),
                1e-6,
                1e-10,
                1e-3,
            ),
            "initialStep": _coerce_float(pdelta_options.get("initialStep"), 1.0 / load_steps, 1e-4, 1.0),
            "minStep": _coerce_float(pdelta_options.get("minStep"), min(0.01, 1.0 / load_steps), 1e-6, 1.0),
            "maxStep": _coerce_float(pdelta_options.get("maxStep"), max(0.25, 1.0 / load_steps), 1e-4, 1.0),
            "maxCutbacks": _coerce_int(pdelta_options.get("maxCutbacks"), 12, 0, 30),
            "maxAcceptedSteps": _coerce_int(pdelta_options.get("maxAcceptedSteps"), 2000, 1, 20000),
            "relativeResidualTolerance": _coerce_float(pdelta_options.get("relativeResidualTolerance"), 1e-8, 1e-12, 1e-3),
            "absoluteResidualToleranceN": _coerce_float(pdelta_options.get("absoluteResidualToleranceN"), 1e-5, 1e-10, 1e3),
            "relativeDisplacementTolerance": _coerce_float(pdelta_options.get("relativeDisplacementTolerance"), 1e-8, 1e-12, 1e-3),
            "absoluteDisplacementToleranceM": _coerce_float(pdelta_options.get("absoluteDisplacementToleranceM"), 1e-10, 1e-14, 1e-3),
            "relativeEnergyTolerance": _coerce_float(pdelta_options.get("relativeEnergyTolerance"), 1e-10, 1e-14, 1e-3),
            "absoluteEnergyToleranceJ": _coerce_float(pdelta_options.get("absoluteEnergyToleranceJ"), 1e-8, 1e-14, 1e2),
            "lineSearchMaxTrials": _coerce_int(pdelta_options.get("lineSearchMaxTrials"), 8, 1, 20),
            "memberSubdivisions": _coerce_int(pdelta_options.get("memberSubdivisions"), 4, 1, 12),
            "maxRefinedDofs": _coerce_int(pdelta_options.get("maxRefinedDofs"), 1800, 30, 5000),
            "includeMethodComparison": _coerce_bool(pdelta_options.get("includeMethodComparison"), False),
            "initialImperfection": _normalize_initial_imperfection(pdelta_options.get("initialImperfection")),
        },
        "bucklingOptions": {
            "modeCount": _coerce_int(
                buckling_options.get("modeCount", options.get("modeCount", nested.get("modeCount", 3))),
                3,
                1,
                12,
            ),
        },
    }


def normalize_frame_request(data: Dict[str, Any]) -> Dict[str, Any]:
    structure_source = data.get("structure") or data.get("frame") or {}
    if not isinstance(structure_source, dict):
        structure_source = {}

    project_name = str(data.get("projectName") or structure_source.get("projectName") or DEFAULT_PROJECT_NAME)
    material_id = str(data.get("materialId") or structure_source.get("materialId") or "custom")
    analysis_options = normalize_frame_analysis_options(data.get("analysisOptions") or structure_source.get("analysisOptions") or {})

    if structure_source.get("nodes") and structure_source.get("members"):
        max_nodes = get_max_frame_nodes()
        max_members = get_max_frame_members()
        model = build_structural_model(
            analysis_type="frame",
            template=structure_source.get("template", "explicit"),
            raw_nodes=structure_source.get("nodes", []),
            raw_members=structure_source.get("members", []),
            raw_loads=structure_source.get("loads", []),
            raw_load_cases=structure_source.get("loadCases"),
            raw_load_combinations=structure_source.get("loadCombinations"),
            labels=SUPPORT_LABELS,
            include_bending=True,
            allow_distributed=True,
            min_nodes_error="框架至少需要 2 个节点",
            min_members_error="框架至少需要 1 个构件",
            max_nodes=max_nodes,
            max_members=max_members,
            max_nodes_error=f"框架节点数量超出系统限制 (最大 {max_nodes} 个)",
            max_members_error=f"框架构件数量超出系统限制 (最大 {max_members} 个)",
        )
        return {
            "analysis_type": "frame",
            "project_name": project_name,
            "material_id": material_id,
            "structure": model.to_structure_contract(include_bending=True),
            "analysisOptions": analysis_options,
            "solver_backend": normalize_solver_backend(data.get("solverBackend", data.get("solver_backend"))),
        }

    span = max(0.1, to_float(structure_source.get("span", data.get("span", 6.0)), 6.0))
    height = max(0.1, to_float(structure_source.get("height", data.get("height", 4.0)), 4.0))
    beam_load_kn_per_m = max(
        0.0,
        to_float(
            _first_value(
                structure_source.get("beam_load_kn_per_m"),
                structure_source.get("beamLoadKnPerM"),
                data.get("beam_load_kn_per_m"),
                data.get("beamLoadKnPerM"),
                20.0,
            ),
            20.0,
        ),
    )
    lateral_load_kn = to_float(
        _first_value(
            structure_source.get("lateral_load_kn"),
            structure_source.get("lateralLoadKn"),
            data.get("lateral_load_kn"),
            data.get("lateralLoadKn"),
            20.0,
        ),
        20.0,
    )
    top_vertical_load_kn = to_float(
        _first_value(
            structure_source.get("top_vertical_load_kn"),
            structure_source.get("topVerticalLoadKn"),
            data.get("top_vertical_load_kn"),
            data.get("topVerticalLoadKn"),
            0.0,
        ),
        0.0,
    )
    left_support = parse_support_type(
        _first_value(
            structure_source.get("left_support"),
            structure_source.get("supportLeft"),
            data.get("left_support"),
            data.get("supportLeft"),
            "fixed",
        ),
        "fixed",
    )
    right_support = parse_support_type(
        _first_value(
            structure_source.get("right_support"),
            structure_source.get("supportRight"),
            data.get("right_support"),
            data.get("supportRight"),
            "fixed",
        ),
        "fixed",
    )

    common_e = to_float(structure_source.get("E", data.get("E", 210.0)), 210.0)
    common_a = to_float(structure_source.get("A_cm2", data.get("A_cm2", data.get("A", 120.0))), 120.0)
    common_i = to_float(structure_source.get("I_cm4", data.get("I_cm4", data.get("I", 8000.0))), 8000.0)

    column_e = to_float(structure_source.get("columnE_GPa", data.get("columnE_GPa", common_e)), common_e)
    beam_e = to_float(structure_source.get("beamE_GPa", data.get("beamE_GPa", common_e)), common_e)
    column_a = to_float(structure_source.get("columnA_cm2", data.get("columnA_cm2", common_a)), common_a)
    beam_a = to_float(structure_source.get("beamA_cm2", data.get("beamA_cm2", common_a)), common_a)
    column_i = to_float(structure_source.get("columnI_cm4", data.get("columnI_cm4", common_i)), common_i)
    beam_i = to_float(structure_source.get("beamI_cm4", data.get("beamI_cm4", common_i)), common_i)

    nodes = [
        {"id": "N1", "x": 0.0, "y": 0.0, "supportType": left_support},
        {"id": "N2", "x": span, "y": 0.0, "supportType": right_support},
        {"id": "N3", "x": 0.0, "y": height, "supportType": "free"},
        {"id": "N4", "x": span, "y": height, "supportType": "free"},
    ]
    members = [
        {"id": "C1", "start": "N1", "end": "N3", "E_GPa": column_e, "A_cm2": column_a, "I_cm4": column_i, "kind": "column"},
        {"id": "B1", "start": "N3", "end": "N4", "E_GPa": beam_e, "A_cm2": beam_a, "I_cm4": beam_i, "kind": "beam"},
        {"id": "C2", "start": "N2", "end": "N4", "E_GPa": column_e, "A_cm2": column_a, "I_cm4": column_i, "kind": "column"},
    ]
    loads = [
        {"type": "distributed", "member": "B1", "wyKnPerM": -beam_load_kn_per_m},
        {"type": "nodal", "node": "N4", "fxKn": lateral_load_kn, "fyKn": -top_vertical_load_kn, "mzKnM": 0.0},
    ]
    return {
        "analysis_type": "frame",
        "project_name": project_name,
        "material_id": material_id,
        "structure": {
            "template": "portal_frame",
            "span": span,
            "height": height,
            "left_support": left_support,
            "right_support": right_support,
            "beam_load_kn_per_m": beam_load_kn_per_m,
            "lateral_load_kn": lateral_load_kn,
            "top_vertical_load_kn": top_vertical_load_kn,
            "nodes": nodes,
            "members": members,
            "loads": loads,
        },
        "analysisOptions": analysis_options,
        "solver_backend": normalize_solver_backend(data.get("solverBackend", data.get("solver_backend"))),
    }
