from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping

from backend.benchmarks.runner import BenchmarkCaseError, evaluate_benchmark_case
from backend.contracts.json_schemas import API_SCHEMA_VERSION


SUBMISSION_PACKAGE_FORMAT = "archsight-benchmark-submission"
SUBMISSION_PACKAGE_FORMAT_VERSION = "1.0"
SUPPORTED_CATEGORIES = {"beam", "frame", "truss", "frame-beam-verify", "truss-verify"}
REQUIRED_CASE_FIELDS = {"id", "category", "title", "purpose", "payload", "expected", "tolerances", "verification"}
TRUSS_CATEGORIES = {"truss", "truss-verify"}
TRUSS_FORBIDDEN_PRIMARY_TOKENS = (
    "moment",
    "bending",
    "shear",
    "弯矩",
    "剪力",
)


class BenchmarkSubmissionError(ValueError):
    """Benchmark submission cannot be accepted for review."""


def build_benchmark_submission_package_response(data: Mapping[str, Any]) -> Dict[str, Any]:
    package = build_benchmark_submission_package(data)
    return {
        "success": True,
        "operation": "generate_benchmark_submission_package",
        "version": "v1",
        "schemaVersion": API_SCHEMA_VERSION,
        "submissionId": package["precheck"]["submissionId"],
        "filename": benchmark_submission_filename(package),
        "persisted": False,
        "package": package,
        "diagnostics": package["precheck"]["diagnostics"],
        "nextSteps": [
            "将下载得到的 JSON 投稿包通过 GitHub Issue 或官方邮箱 archsight-labs@qq.com 提交给项目维护者。",
            "维护者使用 python -m backend.benchmarks.review_submission <json> 重新复核。",
            "公开收录仍需人工确认验证来源、标准值和容许误差。",
        ],
        "meta": {
            "generatedAt": package["precheck"]["generatedAt"],
        },
    }


def build_benchmark_submission_package(data: Mapping[str, Any]) -> Dict[str, Any]:
    response = build_benchmark_submission_response(data)
    contributor = _normalize_contributor(data.get("contributor", {}))
    notes = str(data.get("notes", "")).strip()
    precheck = {
        "passed": response["evaluation"]["passed"],
        "reviewStatus": response["reviewStatus"],
        "submissionId": response["submissionId"],
        "schemaVersion": response["schemaVersion"],
        "persisted": False,
        "generatedAt": response["meta"]["generatedAt"],
        "checks": response["evaluation"]["checks"],
        "diagnostics": response["diagnostics"],
    }
    return {
        "format": SUBMISSION_PACKAGE_FORMAT,
        "formatVersion": SUBMISSION_PACKAGE_FORMAT_VERSION,
        "case": response["caseDraft"],
        "contributor": contributor,
        "notes": notes,
        "precheck": precheck,
    }


def build_benchmark_submission_response(data: Mapping[str, Any]) -> Dict[str, Any]:
    case = _extract_case(data)
    warnings = _validate_case_shape(case)
    warnings.extend(_validate_truss_primary_metrics(case))

    try:
        evaluation = evaluate_benchmark_case(case)
    except (BenchmarkCaseError, KeyError, TypeError, ValueError) as exc:
        raise BenchmarkSubmissionError(f"算例无法完成自动校验: {exc}") from exc

    submission_id = _submission_id(case)
    review_status = "ready_for_review" if evaluation["passed"] else "needs_correction"
    return {
        "success": True,
        "operation": "submit_benchmark_case",
        "version": "v1",
        "schemaVersion": API_SCHEMA_VERSION,
        "submissionId": submission_id,
        "reviewStatus": review_status,
        "persisted": False,
        "caseDraft": case,
        "evaluation": evaluation,
        "diagnostics": {
            "warnings": warnings,
            "infos": [
                "当前接口执行投稿前自动校验，不负责持久化存储。",
                "通过后可将 caseDraft 作为 GitHub Issue 附件，或通过官方邮箱 archsight-labs@qq.com 提交人工复核。",
            ],
        },
        "nextSteps": _next_steps(review_status),
        "meta": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        },
    }


def benchmark_submission_filename(package: Mapping[str, Any]) -> str:
    precheck = package.get("precheck", {})
    case = package.get("case", {})
    submission_id = str(precheck.get("submissionId") or _submission_id(case if isinstance(case, Mapping) else {}))
    category = str(case.get("category", "case") if isinstance(case, Mapping) else "case")
    category_token = _filename_token(category) or "case"
    digest_token = _filename_token(submission_id.rsplit("-", 1)[-1])[:8] or "00000000"
    return f"{category_token}-{_date_token(precheck.get('generatedAt'))}-{digest_token}.json"


def extract_submission_package(data: Mapping[str, Any]) -> Dict[str, Any]:
    if data.get("format") == SUBMISSION_PACKAGE_FORMAT and isinstance(data.get("case"), Mapping):
        return dict(data)
    if isinstance(data.get("package"), Mapping):
        return extract_submission_package(data["package"])
    return build_benchmark_submission_package(data)


def read_submission_package(path: str | Path) -> Dict[str, Any]:
    with Path(path).open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, Mapping):
        raise BenchmarkSubmissionError("投稿包 JSON 顶层必须是对象")
    return extract_submission_package(data)


def _extract_case(data: Mapping[str, Any]) -> Dict[str, Any]:
    raw_case = data.get("case", data)
    if not isinstance(raw_case, Mapping):
        raise BenchmarkSubmissionError("必须提供 case 对象")
    return dict(raw_case)


def _normalize_contributor(raw: Any) -> Dict[str, str]:
    contributor = raw if isinstance(raw, Mapping) else {}
    return {
        "name": str(contributor.get("name", "")).strip(),
        "organization": str(contributor.get("organization", "")).strip(),
        "contact": str(contributor.get("contact", "")).strip(),
        "note": str(contributor.get("note", "")).strip(),
    }


def _validate_case_shape(case: Mapping[str, Any]) -> list[str]:
    missing = sorted(REQUIRED_CASE_FIELDS - set(case))
    if missing:
        raise BenchmarkSubmissionError("算例缺少必要字段: " + ", ".join(missing))

    category = str(case.get("category", "")).strip()
    if category not in SUPPORTED_CATEGORIES:
        raise BenchmarkSubmissionError(f"不支持的 benchmark category: {category}")
    if not str(case.get("id", "")).strip():
        raise BenchmarkSubmissionError("case.id 不能为空")
    if not str(case.get("title", "")).strip():
        raise BenchmarkSubmissionError("case.title 不能为空")
    if not str(case.get("purpose", "")).strip():
        raise BenchmarkSubmissionError("case.purpose 不能为空")
    if not isinstance(case.get("payload"), Mapping):
        raise BenchmarkSubmissionError("case.payload 必须是结构求解输入对象")
    if not isinstance(case.get("expected"), Mapping) or not case.get("expected"):
        raise BenchmarkSubmissionError("case.expected 必须提供标准结果值")
    if not isinstance(case.get("tolerances"), Mapping) or not case.get("tolerances"):
        raise BenchmarkSubmissionError("case.tolerances 必须提供容许误差")
    verification = case.get("verification")
    if not isinstance(verification, Mapping):
        raise BenchmarkSubmissionError("case.verification 必须说明验证来源")
    if not str(verification.get("sourceType", "")).strip():
        raise BenchmarkSubmissionError("case.verification.sourceType 不能为空")
    if not str(verification.get("method", "")).strip():
        raise BenchmarkSubmissionError("case.verification.method 不能为空")
    if not _non_empty_strings(verification.get("checkedMetrics", [])):
        raise BenchmarkSubmissionError("case.verification.checkedMetrics 必须列出校核指标")

    warnings: list[str] = []
    if str(verification.get("sourceType")) == "internal-regression":
        warnings.append("sourceType 为 internal-regression，只能作为内部回归证据，公开背书不足。")
    if not verification.get("reference") and not verification.get("sourceLinks"):
        warnings.append("建议补充 reference 或 sourceLinks，便于人工追溯验证来源。")
    return warnings


def _validate_truss_primary_metrics(case: Mapping[str, Any]) -> list[str]:
    if str(case.get("category")) not in TRUSS_CATEGORIES:
        return []
    primary_tokens = [
        *[str(key) for key in _mapping_keys(case.get("expected", {}))],
        *[str(key) for key in _mapping_keys(case.get("tolerances", {}))],
        *[str(metric) for metric in case.get("verification", {}).get("checkedMetrics", [])],
    ]
    bad_tokens = sorted(
        {
            token
            for token in primary_tokens
            if any(forbidden in token.lower() for forbidden in TRUSS_FORBIDDEN_PRIMARY_TOKENS)
        }
    )
    if bad_tokens:
        raise BenchmarkSubmissionError(
            "桁架 benchmark 的主校核指标不得使用弯矩或剪力: " + "、".join(bad_tokens)
        )
    return []


def _mapping_keys(value: Any) -> Iterable[str]:
    if isinstance(value, Mapping):
        return value.keys()
    return []


def _non_empty_strings(value: Any) -> bool:
    return isinstance(value, list) and any(str(item).strip() for item in value)


def _submission_id(case: Mapping[str, Any]) -> str:
    stable_text = json.dumps(case, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(stable_text.encode("utf-8")).hexdigest()[:12]
    case_id = str(case.get("id", "case")).strip().lower().replace(" ", "-")[:48]
    return f"bench-{case_id}-{digest}"


def _filename_token(value: str) -> str:
    token = "".join(char.lower() if char.isalnum() else "-" for char in value.strip())
    parts = [part for part in token.split("-") if part]
    return "-".join(parts)[:96]


def _date_token(value: Any) -> str:
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).strftime("%Y%m%d")
        except ValueError:
            pass
    return datetime.now(timezone.utc).strftime("%Y%m%d")


def _next_steps(review_status: str) -> list[str]:
    if review_status == "ready_for_review":
        return [
            "人工确认验证来源是否可公开引用。",
            "将 caseDraft 合并进 backend/benchmarks/benchmark_cases.json。",
            "重新生成公开验证报告与算例目录摘要。",
        ]
    return [
        "查看 evaluation.checks 中未通过的指标。",
        "修正 expected 或 tolerances，或复核 payload 单位与边界条件。",
        "再次提交本接口，直至 evaluation.passed 为 true。",
    ]
