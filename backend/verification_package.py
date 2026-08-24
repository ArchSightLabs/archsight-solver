from __future__ import annotations

import hashlib
import json
import math
import tomllib
from copy import deepcopy
from datetime import datetime, timezone
from importlib import metadata
from pathlib import Path
from typing import Any, Dict, Mapping

from backend.application.calculation import build_calculation_result
from backend.contracts.calculation_evidence import strip_legacy_evidence_fields
from backend.exporters.common.result_source import validate_result_source


VERIFICATION_PACKAGE_FORMAT = "archsight-solver-verification-package"
VERIFICATION_PACKAGE_FORMAT_VERSION = "1.0.0"
VERIFICATION_OPERATION = "verification_package"
DEFAULT_ABSOLUTE_TOLERANCE = 1e-8
DEFAULT_RELATIVE_TOLERANCE = 1e-6
MAX_MISMATCHES = 100


def _solver_version() -> str:
    try:
        return metadata.version("archsight-solver")
    except metadata.PackageNotFoundError:
        pyproject_path = Path(__file__).resolve().parents[1] / "pyproject.toml"
        try:
            pyproject = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))
            version = pyproject["project"]["version"]
        except (FileNotFoundError, KeyError, OSError, tomllib.TOMLDecodeError):
            return "unknown"
        return version if isinstance(version, str) and version else "unknown"


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def _stable_hash(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _stable_result(result: Mapping[str, Any]) -> Dict[str, Any]:
    stable = deepcopy(dict(result))
    stable.pop("generatedAt", None)
    return stable


def _package_hash(package: Mapping[str, Any]) -> str:
    hashable = deepcopy(dict(package))
    integrity = hashable.get("integrity")
    if isinstance(integrity, dict):
        integrity.pop("packageHash", None)
    return _stable_hash(hashable)


def _semantic_result_source(
    solution: Mapping[str, Any],
    result_source: Mapping[str, Any],
) -> tuple[Dict[str, Any], Mapping[str, Any]]:
    source = str(result_source.get("source") or "primary")
    if source not in {"primary", "case", "combination"}:
        return deepcopy(dict(result_source)), {}
    normalized = deepcopy(dict(result_source))
    normalized["source"] = source
    normalized["id"] = str(result_source.get("id") or ("__primary__" if source == "primary" else ""))
    validate_result_source({**dict(solution), "resultSource": normalized})
    if source == "primary":
        selected: Mapping[str, Any] = {
            key: solution[key]
            for key in ("summary", "diagnostics", "nodeResults", "memberResults", "memberDiagrams", "secondOrder", "buckling")
            if key in solution
        }
    else:
        result_key = "loadCaseResults" if source == "case" else "loadCombinationResults"
        selected = next(
            item
            for item in solution.get(result_key, [])
            if isinstance(item, Mapping) and str(item.get("id") or "") == normalized["id"]
        )
    normalized["resultHash"] = _stable_hash(selected)
    return normalized, selected


def create_verification_package(
    payload: Mapping[str, Any],
    *,
    evidence: Mapping[str, Any] | None = None,
    solver_version: str | None = None,
    created_at: str | None = None,
) -> Dict[str, Any]:
    """执行现有求解链并生成可校验、可复算的单次计算包。"""
    if not isinstance(payload, Mapping):
        raise ValueError("payload 必须是结构求解输入对象")
    if evidence is not None and not isinstance(evidence, Mapping):
        raise ValueError("evidence 必须是对象")

    raw_input = deepcopy(dict(payload))
    calculation_result = build_calculation_result(
        deepcopy(raw_input),
        operation=VERIFICATION_OPERATION,
    )
    recorded_result = _stable_result(calculation_result)
    request_echo = deepcopy(calculation_result.get("request") or {})
    model = deepcopy(calculation_result.get("structure") or {})
    resolved_version = solver_version or _solver_version()

    normalized_evidence = deepcopy(dict(evidence or {}))
    result_source = normalized_evidence.get("resultSource")
    if isinstance(result_source, Mapping):
        normalized_source, _ = _semantic_result_source(calculation_result["solution"], result_source)
        normalized_evidence["resultSource"] = normalized_source

    package: Dict[str, Any] = {
        "format": VERIFICATION_PACKAGE_FORMAT,
        "formatVersion": VERIFICATION_PACKAGE_FORMAT_VERSION,
        "createdAt": created_at or datetime.now(timezone.utc).isoformat(),
        "solver": {
            "name": "archsight-solver",
            "version": resolved_version,
            "responseEnvelopeVersion": "v1",
            "calculationStorageSchema": calculation_result.get("storageSchema", "solver-calculation-result@1"),
        },
        "analysis": {
            "analysisType": calculation_result.get("analysisType"),
            "input": raw_input,
            "request": request_echo,
            "model": model,
            "recordedResult": recorded_result,
            "diagnostics": deepcopy(calculation_result.get("diagnostics") or {}),
        },
        "evidence": normalized_evidence,
        "replayPolicy": {
            "absoluteTolerance": DEFAULT_ABSOLUTE_TOLERANCE,
            "relativeTolerance": DEFAULT_RELATIVE_TOLERANCE,
            "ignoredPaths": [],
        },
        "integrity": {
            "algorithm": "sha256",
            "inputHash": _stable_hash(raw_input),
            "requestHash": _stable_hash(request_echo),
            "modelHash": _stable_hash(model),
            "recordedResultHash": _stable_hash(recorded_result),
        },
    }
    normalized_request = calculation_result.get("normalizedRequest")
    if normalized_request is not None:
        package["analysis"]["normalizedRequest"] = deepcopy(normalized_request)
    package["integrity"]["packageHash"] = _package_hash(package)
    return package


def _mismatch(path: str, detail: str, *, expected: Any = None, actual: Any = None) -> Dict[str, Any]:
    item: Dict[str, Any] = {"path": path, "detail": detail}
    if expected is not None:
        item["expected"] = expected
    if actual is not None:
        item["actual"] = actual
    return item


def _format_mismatches(package: Any) -> list[Dict[str, Any]]:
    if not isinstance(package, Mapping):
        return [_mismatch("$", "验证包必须是 JSON 对象", expected="object", actual=type(package).__name__)]

    mismatches: list[Dict[str, Any]] = []
    if package.get("format") != VERIFICATION_PACKAGE_FORMAT:
        mismatches.append(
            _mismatch(
                "$.format",
                "不支持的验证包格式",
                expected=VERIFICATION_PACKAGE_FORMAT,
                actual=package.get("format"),
            )
        )
    if package.get("formatVersion") != VERIFICATION_PACKAGE_FORMAT_VERSION:
        mismatches.append(
            _mismatch(
                "$.formatVersion",
                "不支持的验证包格式版本",
                expected=VERIFICATION_PACKAGE_FORMAT_VERSION,
                actual=package.get("formatVersion"),
            )
        )

    solver = package.get("solver")
    if not isinstance(solver, Mapping) or not isinstance(solver.get("version"), str) or not solver.get("version"):
        mismatches.append(_mismatch("$.solver.version", "缺少生成验证包的求解器版本"))

    analysis = package.get("analysis")
    if not isinstance(analysis, Mapping):
        mismatches.append(_mismatch("$.analysis", "analysis 必须是对象"))
    else:
        for field in ("input", "request", "model", "recordedResult"):
            if not isinstance(analysis.get(field), Mapping):
                mismatches.append(_mismatch(f"$.analysis.{field}", f"{field} 必须是对象"))

    policy = package.get("replayPolicy")
    expected_policy = {
        "absoluteTolerance": DEFAULT_ABSOLUTE_TOLERANCE,
        "relativeTolerance": DEFAULT_RELATIVE_TOLERANCE,
        "ignoredPaths": [],
    }
    if policy != expected_policy:
        mismatches.append(
            _mismatch(
                "$.replayPolicy",
                "1.0.0 格式仅支持固定复算容差且不允许忽略结果路径",
                expected=expected_policy,
                actual=policy,
            )
        )

    integrity = package.get("integrity")
    if not isinstance(integrity, Mapping):
        mismatches.append(_mismatch("$.integrity", "integrity 必须是对象"))
    else:
        if integrity.get("algorithm") != "sha256":
            mismatches.append(
                _mismatch("$.integrity.algorithm", "仅支持 sha256", expected="sha256", actual=integrity.get("algorithm"))
            )
        for field in ("inputHash", "requestHash", "modelHash", "recordedResultHash", "packageHash"):
            value = integrity.get(field)
            if not isinstance(value, str) or len(value) != 64:
                mismatches.append(_mismatch(f"$.integrity.{field}", f"{field} 必须是 64 位十六进制摘要"))
    return mismatches


def _integrity_mismatches(package: Mapping[str, Any]) -> list[Dict[str, Any]]:
    analysis = package["analysis"]
    integrity = package["integrity"]
    checks = {
        "inputHash": _stable_hash(analysis["input"]),
        "requestHash": _stable_hash(analysis["request"]),
        "modelHash": _stable_hash(analysis["model"]),
        "recordedResultHash": _stable_hash(analysis["recordedResult"]),
        "packageHash": _package_hash(package),
    }
    mismatches = []
    for field, actual in checks.items():
        expected = integrity.get(field)
        if expected != actual:
            mismatches.append(
                _mismatch(
                    f"$.integrity.{field}",
                    f"{field} 与验证包内容不一致",
                    expected=expected,
                    actual=actual,
                )
            )
    return mismatches


def _result_source_mismatches(package: Mapping[str, Any]) -> list[Dict[str, Any]]:
    evidence = package.get("evidence")
    analysis = package.get("analysis")
    if not isinstance(evidence, Mapping) or not isinstance(analysis, Mapping):
        return []
    result_source = evidence.get("resultSource")
    recorded_result = analysis.get("recordedResult")
    if not isinstance(result_source, Mapping) or not isinstance(recorded_result, Mapping):
        return []
    source = str(result_source.get("source") or "primary")
    if source not in {"primary", "case", "combination"}:
        return []
    solution = recorded_result.get("solution")
    if not isinstance(solution, Mapping):
        return [_mismatch("$.analysis.recordedResult.solution", "可信包缺少可验证的求解结果来源")]
    try:
        normalized, _ = _semantic_result_source(solution, result_source)
    except (ValueError, StopIteration) as exc:
        return [_mismatch("$.evidence.resultSource", f"结果来源不属于记录的计算结果: {exc}")]
    expected_hash = normalized.get("resultHash")
    actual_hash = result_source.get("resultHash")
    if actual_hash != expected_hash:
        return [
            _mismatch(
                "$.evidence.resultSource.resultHash",
                "结果来源摘要与记录的计算结果不一致",
                expected=expected_hash,
                actual=actual_hash,
            )
        ]
    return []


def _display_value(value: Any) -> Any:
    if isinstance(value, Mapping):
        return f"object({len(value)})"
    if isinstance(value, list):
        return f"array({len(value)})"
    if isinstance(value, str) and len(value) > 200:
        return value[:197] + "..."
    return value


def _compare_values(
    expected: Any,
    actual: Any,
    *,
    path: str,
    absolute_tolerance: float,
    relative_tolerance: float,
    mismatches: list[Dict[str, Any]],
) -> None:
    if len(mismatches) >= MAX_MISMATCHES:
        return

    expected_is_number = isinstance(expected, (int, float)) and not isinstance(expected, bool)
    actual_is_number = isinstance(actual, (int, float)) and not isinstance(actual, bool)
    if expected_is_number and actual_is_number:
        expected_number = float(expected)
        actual_number = float(actual)
        if not (
            math.isfinite(expected_number)
            and math.isfinite(actual_number)
            and math.isclose(
                expected_number,
                actual_number,
                abs_tol=absolute_tolerance,
                rel_tol=relative_tolerance,
            )
        ):
            mismatches.append(
                _mismatch(path, "数值超出复算容差", expected=expected, actual=actual)
            )
        return

    if isinstance(expected, Mapping) and isinstance(actual, Mapping):
        expected_keys = set(expected)
        actual_keys = set(actual)
        for key in sorted(expected_keys - actual_keys):
            mismatches.append(_mismatch(f"{path}.{key}", "复算结果缺少字段", expected=_display_value(expected[key])))
            if len(mismatches) >= MAX_MISMATCHES:
                return
        for key in sorted(actual_keys - expected_keys):
            mismatches.append(_mismatch(f"{path}.{key}", "复算结果出现额外字段", actual=_display_value(actual[key])))
            if len(mismatches) >= MAX_MISMATCHES:
                return
        for key in sorted(expected_keys & actual_keys):
            _compare_values(
                expected[key],
                actual[key],
                path=f"{path}.{key}",
                absolute_tolerance=absolute_tolerance,
                relative_tolerance=relative_tolerance,
                mismatches=mismatches,
            )
            if len(mismatches) >= MAX_MISMATCHES:
                return
        return

    if isinstance(expected, list) and isinstance(actual, list):
        if len(expected) != len(actual):
            mismatches.append(_mismatch(path, "数组长度不同", expected=len(expected), actual=len(actual)))
            return
        for index, (expected_item, actual_item) in enumerate(zip(expected, actual)):
            _compare_values(
                expected_item,
                actual_item,
                path=f"{path}[{index}]",
                absolute_tolerance=absolute_tolerance,
                relative_tolerance=relative_tolerance,
                mismatches=mismatches,
            )
            if len(mismatches) >= MAX_MISMATCHES:
                return
        return

    if type(expected) is not type(actual) or expected != actual:
        mismatches.append(
            _mismatch(
                path,
                "复算结果与记录值不一致",
                expected=_display_value(expected),
                actual=_display_value(actual),
            )
        )


def verify_verification_package(
    package: Any,
    *,
    current_solver_version: str | None = None,
) -> Dict[str, Any]:
    """校验摘要并用当前求解器复算；完整性摘要不是数字签名。"""
    resolved_version = current_solver_version or _solver_version()
    format_mismatches = _format_mismatches(package)
    format_valid = not format_mismatches
    recorded_version = (
        str(package.get("solver", {}).get("version"))
        if isinstance(package, Mapping) and isinstance(package.get("solver"), Mapping)
        else None
    )
    report: Dict[str, Any] = {
        "status": "fail",
        "formatValid": format_valid,
        "integrityValid": False,
        "replayMatched": None,
        "versionMatch": recorded_version == resolved_version if recorded_version else False,
        "recordedSolverVersion": recorded_version,
        "currentSolverVersion": resolved_version,
        "mismatches": format_mismatches[:MAX_MISMATCHES],
        "warnings": [],
        "disclaimer": "SHA-256 仅用于内容完整性校验，不是数字签名、工程认证或设计签审结论。",
    }
    if not format_valid:
        return report

    integrity_mismatches = _integrity_mismatches(package)
    if integrity_mismatches:
        report["mismatches"] = integrity_mismatches[:MAX_MISMATCHES]
        return report
    report["integrityValid"] = True

    result_source_mismatches = _result_source_mismatches(package)
    if result_source_mismatches:
        report["mismatches"] = result_source_mismatches[:MAX_MISMATCHES]
        return report

    analysis = package["analysis"]
    policy = package["replayPolicy"]
    try:
        replay_result = _stable_result(
            build_calculation_result(
                deepcopy(dict(analysis["input"])),
                operation=VERIFICATION_OPERATION,
            )
        )
    except Exception as exc:
        report["mismatches"] = [
            _mismatch("$.analysis.input", f"当前求解器无法复算验证包: {exc}")
        ]
        return report

    replay_result = strip_legacy_evidence_fields(replay_result, analysis["recordedResult"])

    replay_mismatches: list[Dict[str, Any]] = []
    _compare_values(
        analysis["recordedResult"],
        replay_result,
        path="$.analysis.recordedResult",
        absolute_tolerance=float(policy["absoluteTolerance"]),
        relative_tolerance=float(policy["relativeTolerance"]),
        mismatches=replay_mismatches,
    )
    report["replayMatched"] = not replay_mismatches
    report["mismatches"] = replay_mismatches
    if replay_mismatches:
        return report

    if report["versionMatch"]:
        report["status"] = "pass"
    else:
        report["status"] = "review"
        report["warnings"].append(
            "验证包与当前求解器版本不同；数值复算一致，但仍应审阅版本差异后再采用。"
        )
    return report
