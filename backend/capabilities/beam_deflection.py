from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Mapping

from backend.common.units import from_si, to_si
from backend.services.beam_workbench import build_solution

CAPABILITY_ID = "solver.beam_deflection"
CAPABILITY_VERSION = "2026-05-25"


class CapabilityInputError(ValueError):
    """输入 JSON 可解析，但不满足 solver.beam_deflection 契约。"""


def _invalid_result(message: str) -> Dict[str, Any]:
    return {
        "capabilityId": CAPABILITY_ID,
        "capabilityVersion": CAPABILITY_VERSION,
        "status": "invalid_input",
        "deflection": {"value": 0.0, "unit": "mm"},
        "inputValidated": False,
        "formulaRef": "",
        "warnings": [message],
    }


def _error_result(message: str) -> Dict[str, Any]:
    return {
        "capabilityId": CAPABILITY_ID,
        "capabilityVersion": CAPABILITY_VERSION,
        "status": "error",
        "deflection": {"value": 0.0, "unit": "mm"},
        "inputValidated": False,
        "formulaRef": "",
        "warnings": [message],
    }


def _read_payload(input_path: str | None) -> Dict[str, Any]:
    raw = sys.stdin.read() if input_path in (None, "-") else Path(input_path).read_text(encoding="utf-8")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise CapabilityInputError(f"Capability 输入不是合法 JSON: {exc.msg}") from exc
    if not isinstance(payload, dict):
        raise CapabilityInputError("Capability 输入必须是 JSON object")
    return payload


def _quantity(payload: Mapping[str, Any], key: str) -> tuple[float, str]:
    value = payload.get(key)
    if not isinstance(value, Mapping):
        raise CapabilityInputError(f"{key} 必须使用 {{value, unit}} 对象")
    try:
        number = float(value["value"])
    except (KeyError, TypeError, ValueError) as exc:
        raise CapabilityInputError(f"{key}.value 必须是数字") from exc
    unit = str(value.get("unit") or "").strip()
    if not unit:
        raise CapabilityInputError(f"{key}.unit 不能为空")
    return number, unit


def _load(payload: Mapping[str, Any]) -> tuple[str, float, str]:
    load = payload.get("load")
    if not isinstance(load, Mapping):
        raise CapabilityInputError("load 必须使用 {value, unit, case} 对象")
    case = str(load.get("case") or "uniform").strip().lower()
    if case not in {"uniform", "udl"}:
        raise CapabilityInputError("首版 solver.beam_deflection 仅支持 uniform 均布荷载")
    try:
        value = float(load["value"])
    except (KeyError, TypeError, ValueError) as exc:
        raise CapabilityInputError("load.value 必须是数字") from exc
    unit = str(load.get("unit") or "").strip()
    if not unit:
        raise CapabilityInputError("load.unit 不能为空")
    return "uniform", value, unit


def _beam_type(value: Any) -> str:
    raw = str(value or "simply_supported").strip().lower().replace("-", "_")
    aliases = {
        "simple": "simply_supported",
        "pinned_roller": "simply_supported",
        "fixed_free": "cantilever",
    }
    beam_type = aliases.get(raw, raw)
    if beam_type not in {"simply_supported", "cantilever", "continuous"}:
        raise CapabilityInputError("boundaryCondition 必须为 simply_supported、cantilever 或 continuous")
    return beam_type


def _build_solver_payload(payload: Mapping[str, Any]) -> Dict[str, Any]:
    span_value, span_unit = _quantity(payload, "span")
    elastic_value, elastic_unit = _quantity(payload, "elasticModulus")
    inertia_value, inertia_unit = _quantity(payload, "secondMomentOfArea")
    load_type, load_value, load_unit = _load(payload)

    span_m = to_si(span_value, "length", span_unit)
    elastic_gpa = from_si(to_si(elastic_value, "elastic_modulus", elastic_unit), "elastic_modulus", "GPa")
    inertia_cm4 = from_si(to_si(inertia_value, "moment_of_inertia", inertia_unit), "moment_of_inertia", "cm4")
    load_kn_per_m = from_si(to_si(load_value, "distributed", load_unit), "distributed", "kN/m")
    beam_type = _beam_type(payload.get("boundaryCondition"))

    if span_m <= 0:
        raise CapabilityInputError("span 必须大于 0")
    if elastic_gpa <= 0:
        raise CapabilityInputError("elasticModulus 必须大于 0")
    if inertia_cm4 <= 0:
        raise CapabilityInputError("secondMomentOfArea 必须大于 0")

    return {
        "analysisType": "beam",
        "projectName": str(payload.get("projectName") or "Solver Capability Beam Deflection"),
        "materialId": "custom",
        "beamType": beam_type,
        "loadType": load_type,
        "spans": [span_m],
        "E": elastic_gpa,
        "I": inertia_cm4,
        "q": load_kn_per_m,
        "freq": 0.0,
        "duration": 1.0,
        "queryPointRatios": [0.0, 0.5, 1.0],
    }


def _formula_ref(solution: Mapping[str, Any]) -> str:
    symbolic = solution.get("symbolicCheck") or {}
    if symbolic.get("available") and symbolic.get("equations"):
        return f"{symbolic.get('scope', '教材公式校核')}: {'; '.join(symbolic['equations'])}"
    summary = solution.get("summary") or {}
    return str(summary.get("method") or "Euler-Bernoulli 梁单元法")


def solve_beam_deflection_capability(payload: Mapping[str, Any]) -> Dict[str, Any]:
    try:
        solver_payload = _build_solver_payload(payload)
        solution = build_solution(solver_payload, "自定义材料")
        summary = solution.get("summary", {})
        max_deflection_mm = float(summary.get("maxDeflectionMm", solution.get("max_deflection_mm", 0.0)))
        max_position_m = float(summary.get("maxDeflectionPositionM", solution.get("max_deflection_position_m", 0.0)))
        return {
            "capabilityId": CAPABILITY_ID,
            "capabilityVersion": CAPABILITY_VERSION,
            "status": "pass",
            "deflection": {
                "value": round(max_deflection_mm, 6),
                "unit": "mm",
                "kind": "max_abs_deflection",
                "position": {"value": round(max_position_m, 6), "unit": "m"},
            },
            "inputValidated": True,
            "formulaRef": _formula_ref(solution),
            "checkStatus": summary.get("status", "需校核"),
            "method": summary.get("method", "Euler-Bernoulli 梁理论 + 梁单元法"),
            "normalizedInput": {
                "span": {"value": solver_payload["spans"][0], "unit": "m"},
                "elasticModulus": {"value": solver_payload["E"], "unit": "GPa"},
                "secondMomentOfArea": {"value": solver_payload["I"], "unit": "cm4"},
                "load": {"value": solver_payload["q"], "unit": "kN/m", "case": "uniform"},
                "boundaryCondition": solver_payload["beamType"],
            },
            "warnings": [
                "本工具返回确定性数值计算结果，不替代结构工程师签审或规范合规最终判定。"
            ],
        }
    except CapabilityInputError as exc:
        return _invalid_result(str(exc))
    except Exception as exc:  # pragma: no cover - defensive adapter boundary
        return _error_result(f"求解器调用失败: {exc}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run solver.beam_deflection capability locally.")
    parser.add_argument("--input", "-i", help="输入 JSON 文件路径；省略或使用 - 时从 stdin 读取。")
    parser.add_argument("--pretty", action="store_true", help="格式化输出 JSON，便于人工查看。")
    args = parser.parse_args(argv)

    try:
        result = solve_beam_deflection_capability(_read_payload(args.input))
    except CapabilityInputError as exc:
        result = _invalid_result(str(exc))
    except OSError as exc:
        result = _error_result(f"读取 Capability 输入失败: {exc}")
    indent = 2 if args.pretty else None
    print(json.dumps(result, ensure_ascii=False, indent=indent, sort_keys=bool(indent)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
