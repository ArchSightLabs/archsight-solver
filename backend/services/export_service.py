from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
from typing import Any, Dict, Optional

from backend.common.analysis_types import get_analysis_type, get_material_name
from backend.application.calculation import attach_method_comparison_provenance
from backend.contracts.diagnostics import ApiError
from backend.exporters.beam.docx_exporter import export_docx as export_beam_docx
from backend.exporters.beam.xlsx_exporter import export_xlsx as export_beam_xlsx
from backend.exporters.common.artifact import ExportArtifact
from backend.exporters.common.report_model import ReportModel
from backend.contracts.diagnostics import legacy_diagnostic_issues_for_message
from backend.contracts.response_envelope import _stable_hash
from backend.exporters.frame.docx_exporter import export_docx as export_frame_docx
from backend.exporters.frame.xlsx_exporter import export_xlsx as export_frame_xlsx
from backend.exporters.failure_review import export_docx as export_failure_review_docx
from backend.exporters.failure_review import export_xlsx as export_failure_review_xlsx
from backend.exporters.truss.docx_exporter import export_docx as export_truss_docx
from backend.exporters.truss.xlsx_exporter import export_xlsx as export_truss_xlsx
from backend.services.beam_workbench import build_solution as build_beam_solution
from backend.services.frame_workbench import build_solution as build_frame_solution
from backend.services.job_store import load_job as load_job_record
from backend.services.truss_workbench import build_solution as build_truss_solution
from backend.exporters.common.result_source import project_last_converged_nonlinear_result, project_result_source
from backend.contracts.failure_review import normalize_failure_review_payload


def build_report_model(
    data: Dict[str, Any],
    *,
    analysis_type: str,
    material_name: str,
    sensitivity_results: Optional[Dict[str, Any]],
    report_images: Optional[Dict[str, str]],
    report_options: Optional[Dict[str, Any]] = None,
    precomputed_solution: Optional[Dict[str, Any]] = None,
) -> ReportModel:
    if precomputed_solution is not None:
        solution = precomputed_solution
    else:
        if analysis_type == "frame":
            solution = build_frame_solution(data, material_name)
        elif analysis_type == "truss":
            solution = build_truss_solution(data, material_name)
        else:
            solution = build_beam_solution(data, material_name)
    if isinstance(data.get("benchmark"), dict):
        solution = {**solution, "benchmark": data["benchmark"]}
    if isinstance(data.get("resultSource"), dict):
        solution = {**solution, "resultSource": data["resultSource"]}
    if isinstance(data.get("resultProvenance"), dict):
        solution = {**solution, "resultProvenance": data["resultProvenance"]}
    if isinstance(data.get("learningReview"), dict):
        solution = {**solution, "learningReview": data["learningReview"]}
    request_value = solution.get("payload") if isinstance(solution.get("payload"), Mapping) else data
    model_value = solution.get("structure") if isinstance(solution.get("structure"), Mapping) else solution.get("beam", {})
    attach_method_comparison_provenance(
        solution,
        request_hash=_stable_hash(request_value),
        model_hash=_stable_hash(model_value),
    )
    solution = project_result_source(solution)
    solution = project_last_converged_nonlinear_result(solution)
    return ReportModel.from_solution(
        analysis_type=analysis_type,
        material_name=material_name,
        solution=solution,
        sensitivity_results=sensitivity_results,
        report_images=report_images,
        report_options=report_options,
    )


def export_report(report: ReportModel, format_type: str) -> ExportArtifact:
    if report.analysis_type == "frame":
        if format_type == "xlsx":
            return export_frame_xlsx(report, report.material_name, report.report_options)
        if format_type == "docx":
            return export_frame_docx(report, report.material_name, report.sensitivity_results, report.report_images, report.report_options)
    elif report.analysis_type == "truss":
        if format_type == "xlsx":
            return export_truss_xlsx(report, report.material_name, report.report_options)
        if format_type == "docx":
            return export_truss_docx(report, report.material_name, report.sensitivity_results, report.report_images, report.report_options)
    else:
        if format_type == "xlsx":
            return export_beam_xlsx(report, report.material_name, report.report_options)
        if format_type == "docx":
            return export_beam_docx(report, report.material_name, report.sensitivity_results, report.report_images, report.report_options)
    raise ValueError("不支持的导出格式")


def build_failure_review_model(data: Dict[str, Any]) -> Dict[str, Any]:
    job_id = str(data.get("jobId") or "").strip()
    if job_id:
        return _build_failure_review_model_from_job(job_id, data)
    return normalize_failure_review_payload(data)


def export_failure_review(review: Dict[str, Any], format_type: str) -> ExportArtifact:
    if format_type == "xlsx":
        return export_failure_review_xlsx(review, format_type)
    if format_type == "docx":
        return export_failure_review_docx(review, format_type)
    raise ValueError("不支持的导出格式")


def _build_failure_review_model_from_job(job_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    job = load_job_record(job_id)
    if job is None:
        raise ApiError(f"未找到指定的作业: {job_id}", code="COMMON_JOB_NOT_FOUND", status_code=404)

    status = str(job.get("status") or "").strip().lower()
    stored_result = job.get("result") if isinstance(job.get("result"), Mapping) else {}
    stored_solution = stored_result.get("solution") if isinstance(stored_result.get("solution"), Mapping) else {}
    second_order = stored_solution.get("secondOrder") if isinstance(stored_solution.get("secondOrder"), Mapping) else {}
    nonlinear_partial = status == "succeeded" and str(second_order.get("status") or "") == "not_converged"
    if status != "failed" and not nonlinear_partial:
        raise ApiError(f"指定作业没有可审查的失败或部分收敛结果，状态：{status or 'unknown'}", code="COMMON_JOB_NOT_READY", status_code=400)

    forbidden_fields = [field for field in ("inputId", "completedStages", "stableErrorCode", "objectRefs", "diagnostics", "hashes", "suggestedActions", "nonlinearPartialEvidence") if field in data]
    if forbidden_fields:
        raise ValueError(f"jobId 模式不接受这些手工字段: {', '.join(forbidden_fields)}")

    payload = dict(job.get("payload") or {})
    if nonlinear_partial:
        trace = second_order.get("nonlinearPathTrace") if isinstance(second_order.get("nonlinearPathTrace"), Mapping) else {}
        stable_error_code = str(second_order.get("failureCode") or "GNA_PATH_NOT_COMPLETED")
        failure_reason = str(second_order.get("failureReason") or "共回转牛顿路径未完成")
        review = {
            "materialType": "failure-review",
            "format": str(data.get("format") or "docx"),
            "inputId": _failure_review_input_id(job),
            "completedStages": ["输入校验", "模型装配", "求解执行", "最后收敛状态恢复"],
            "stableErrorCode": stable_error_code,
            "objectRefs": [],
            "diagnostics": [
                {
                    "code": stable_error_code,
                    "title": "几何非线性路径未完成",
                    "detail": failure_reason,
                    "severity": "error",
                }
            ],
            "hashes": {
                "requestHash": _stable_hash(payload),
                "resultHash": str(stored_result.get("resultHash") or _stable_hash(stored_result)),
                "pathHash": _stable_hash(trace),
            },
            "suggestedActions": [
                "复核最后收敛荷载点与失败尝试，不得把部分结果解释为目标荷载点已收敛。",
                "检查最小步长、最大迭代次数、切步回退记录与切线稳定状态后再决定调整路径控制。",
            ],
            "nonlinearPartialEvidence": {
                "algorithm": deepcopy(second_order.get("algorithm")),
                "equilibriumStatus": second_order.get("equilibriumStatus"),
                "stabilityStatus": second_order.get("stabilityStatus"),
                "failureCode": stable_error_code,
                "terminationReason": second_order.get("terminationReason"),
                "lastConverged": deepcopy(second_order.get("lastConverged")),
                "finalAttempt": deepcopy(trace.get("finalAttempt")),
                "attempts": deepcopy(list(trace.get("attempts", []))),
                "pathHash": _stable_hash(trace),
            },
        }
        return normalize_failure_review_payload(review, allow_server_evidence=True)

    analysis_type = get_analysis_type(payload)
    error = job.get("error") if isinstance(job.get("error"), Mapping) else {}
    stable_error_code = str(error.get("code") or "COMMON_ASYNC_JOB_FAILED").strip()
    error_message = str(error.get("message") or stable_error_code).strip()
    issues = legacy_diagnostic_issues_for_message(error_message, analysis_type)

    review = {
        "materialType": "failure-review",
        "format": str(data.get("format") or "docx"),
        "inputId": _failure_review_input_id(job),
        "completedStages": _failure_review_completed_stages(stable_error_code, error_message),
        "stableErrorCode": stable_error_code,
        "objectRefs": _failure_review_object_refs(issues),
        "diagnostics": _failure_review_diagnostics(issues),
        "hashes": {
            "requestHash": _stable_hash(payload),
            "errorHash": _stable_hash(error),
        },
        "suggestedActions": _failure_review_suggested_actions(issues),
    }
    return normalize_failure_review_payload(review)


def _failure_review_input_id(job: Mapping[str, Any]) -> str:
    client_job_id = str(job.get("clientJobId") or "").strip()
    if client_job_id:
        return client_job_id
    return str(job.get("jobId") or "").strip()


def _failure_review_completed_stages(stable_error_code: str, error_message: str) -> list[str]:
    input_only_prefixes = (
        "COMMON_INVALID",
        "FRAME_INVALID",
        "TRUSS_INVALID",
        "BEAM_INVALID",
        "STRUCTURE_INVALID",
        "STRUCTURE_DUPLICATE",
        "LOAD_OUT_OF_MODEL_RANGE",
        "LOAD_UNSUPPORTED_TYPE",
        "STRUCTURE_INPUT_REVIEW_REQUIRED",
    )
    if stable_error_code.startswith(input_only_prefixes):
        return ["输入校验"]
    if "输入" in error_message and "失败" in error_message:
        return ["输入校验"]
    return ["输入校验", "模型装配", "求解执行"]


def _failure_review_object_refs(issues: list[Mapping[str, Any]]) -> list[dict[str, str]]:
    refs: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for issue in issues:
        for ref in issue.get("objectRefs", []) if isinstance(issue.get("objectRefs"), list) else []:
            if not isinstance(ref, Mapping):
                continue
            kind = str(ref.get("kind") or "").strip()
            object_id = str(ref.get("id") or "").strip()
            if not kind or not object_id:
                continue
            key = (kind, object_id)
            if key in seen:
                continue
            seen.add(key)
            refs.append({"kind": kind, "id": object_id})
    return refs


def _failure_review_diagnostics(issues: list[Mapping[str, Any]]) -> list[dict[str, str]]:
    diagnostics: list[dict[str, str]] = []
    for issue in issues:
        diagnostics.append(
            {
                "code": _sanitize_failure_review_text(str(issue.get("code") or "STRUCTURE_INPUT_REVIEW_REQUIRED").strip()),
                "title": _sanitize_failure_review_text(str(issue.get("title") or "结构输入需要复核").strip()),
                "detail": _sanitize_failure_review_text(str(issue.get("detail") or "—").strip()),
                "severity": str(issue.get("severity") or "error").strip().lower(),
            }
        )
    return diagnostics


def _failure_review_suggested_actions(issues: list[Mapping[str, Any]]) -> list[str]:
    actions: list[str] = []
    seen: set[str] = set()
    for issue in issues:
        for suggestion in issue.get("suggestions", []) if isinstance(issue.get("suggestions"), list) else []:
            text = _sanitize_failure_review_text(str(suggestion).strip())
            if text and text not in seen:
                seen.add(text)
                actions.append(text)
    return actions


def _sanitize_failure_review_text(text: str) -> str:
    replacements = {
        "位移": "自由度",
        "反力": "支座响应",
        "内力": "构件响应",
        "关键点": "控制点",
        "包络": "汇总",
        "计算完成": "处理完成",
    }
    sanitized = text
    for source, target in replacements.items():
        sanitized = sanitized.replace(source, target)
    return sanitized
