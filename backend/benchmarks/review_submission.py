from __future__ import annotations

import argparse
import json
from copy import deepcopy
from datetime import date
from pathlib import Path
from typing import Any, Dict, Mapping, Sequence

from backend.benchmarks.catalog import BENCHMARK_CATALOG_PATH
from backend.benchmarks.submissions import (
    BenchmarkSubmissionError,
    build_benchmark_submission_package,
    read_submission_package,
)


def review_submission_file(
    submission_path: str | Path,
    *,
    append: bool = False,
    catalog_path: str | Path = BENCHMARK_CATALOG_PATH,
) -> Dict[str, Any]:
    package = read_submission_package(submission_path)
    fresh_package = build_benchmark_submission_package(package)
    case = fresh_package["case"]
    precheck = fresh_package["precheck"]
    result = {
        "submissionPath": str(Path(submission_path)),
        "catalogPath": str(Path(catalog_path)),
        "package": fresh_package,
        "case": case,
        "precheck": precheck,
        "appended": False,
    }

    if append:
        if not precheck["passed"]:
            raise BenchmarkSubmissionError("自动复核未通过，不能合并到 benchmark_cases.json")
        append_case_to_catalog(case, catalog_path)
        result["appended"] = True

    return result


def append_case_to_catalog(case: Mapping[str, Any], catalog_path: str | Path = BENCHMARK_CATALOG_PATH) -> None:
    path = Path(catalog_path)
    with path.open("r", encoding="utf-8") as handle:
        catalog = json.load(handle)
    if not isinstance(catalog, dict):
        raise BenchmarkSubmissionError("benchmark catalog 顶层必须是对象")

    cases = catalog.setdefault("cases", [])
    if not isinstance(cases, list):
        raise BenchmarkSubmissionError("benchmark catalog cases 必须是数组")

    case_id = str(case.get("id", "")).strip()
    if any(str(item.get("id", "")).strip() == case_id for item in cases if isinstance(item, Mapping)):
        raise BenchmarkSubmissionError(f"benchmark catalog 已存在 case.id: {case_id}")

    cases.append(deepcopy(dict(case)))
    catalog["updatedAt"] = date.today().isoformat()
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(catalog, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def format_review_report(result: Mapping[str, Any]) -> str:
    case = result["case"]
    precheck = result["precheck"]
    contributor = result["package"].get("contributor", {})
    verification = case.get("verification", {})
    checks = precheck.get("checks", [])
    failed_checks = [check for check in checks if not check.get("passed")]
    warnings = precheck.get("diagnostics", {}).get("warnings", [])

    lines = [
        "Benchmark 投稿包复核",
        f"- 算例 ID: {case.get('id')}",
        f"- 名称: {case.get('title')}",
        f"- 类型: {case.get('category')}",
        f"- 投稿人: {contributor.get('name') or '未填写'}",
        f"- 来源类型: {verification.get('sourceType')}",
        f"- 参考来源: {verification.get('reference') or '未填写'}",
        f"- 复核方法: {verification.get('method')}",
        f"- 自动复核: {'通过' if precheck.get('passed') else '未通过'}",
        f"- 审核状态: {precheck.get('reviewStatus')}",
        f"- 合并结果: {'已写入目录' if result.get('appended') else '未写入目录'}",
    ]

    if warnings:
        lines.append("警告:")
        lines.extend(f"- {warning}" for warning in warnings)

    if failed_checks:
        lines.append("未通过指标:")
        for check in failed_checks:
            lines.append(f"- {check.get('metric')}: {check.get('error')}")
    else:
        lines.append("指标检查:")
        for check in checks:
            lines.append(
                f"- {check.get('metric')}: actual={check.get('actual')} expected={check.get('expected')} tolerance={check.get('tolerance')}"
            )

    lines.extend(
        [
            "人工确认清单:",
            "- 验证来源是否可公开引用。",
            "- 标准值、容许误差和单位换算是否有独立依据。",
            "- 算例标题、目的和校核指标是否符合结构工程常用口径。",
        ]
    )
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="复核并可选合并 ArchSight benchmark 投稿包。")
    parser.add_argument("submission", help="benchmark-submission-*.json 投稿包路径")
    parser.add_argument("--append", action="store_true", help="自动复核通过后写入 benchmark_cases.json")
    parser.add_argument("--catalog", default=str(BENCHMARK_CATALOG_PATH), help="benchmark_cases.json 路径")
    args = parser.parse_args(argv)

    try:
        result = review_submission_file(args.submission, append=args.append, catalog_path=args.catalog)
    except (BenchmarkSubmissionError, OSError, json.JSONDecodeError) as exc:
        print(f"复核失败: {exc}")
        return 1

    print(format_review_report(result))
    return 0 if result["precheck"]["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
