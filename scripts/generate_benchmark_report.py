from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.benchmarks.catalog import load_benchmark_catalog
from backend.benchmarks.runner import evaluate_benchmark_suite


def _format_check_summary(checks: list[dict]) -> str:
    failed = [check for check in checks if not check["passed"]]
    if failed:
        return "；".join(f"{check['metric']} 未通过：{check['error']}" for check in failed)
    key_checks = checks[:3]
    return "；".join(
        f"{check['metric']}={check['actual']}（标准 {check['expected']}）"
        for check in key_checks
    )


def build_report() -> str:
    catalog = load_benchmark_catalog()
    suite = evaluate_benchmark_suite()
    source_types = sorted({result["verification"].get("sourceType", "") for result in suite["results"]})

    lines = [
        "# ArchSight Solver 公开验证集报告",
        "",
        f"- 算例目录版本：{catalog['updatedAt']}",
        f"- 算例数量：{suite['total']}",
        f"- 通过数量：{suite['passed']}",
        f"- 未通过数量：{suite['failed']}",
        f"- 来源类型：{', '.join(source_types)}",
        "",
        "## 结论",
        "",
        (
            "当前公开验证集覆盖梁系、二维平面框架、二维平面桁架和框架梁等基础力学场景。"
            "每个算例均保留标准值、容许误差和验证来源元数据，可作为 CI 回归门禁与对外专业可信度材料。"
        ),
        "",
        "## 算例明细",
        "",
        "| 算例 | 类型 | 状态 | 关键校核 |",
        "|---|---|---|---|",
    ]

    for result in suite["results"]:
        status = "通过" if result["passed"] else "未通过"
        lines.append(
            f"| `{result['caseId']}` | {result['category']} | {status} | {_format_check_summary(result['checks'])} |"
        )

    lines.extend(
        [
            "",
            "## 使用方式",
            "",
            "```powershell",
            "python -m pytest backend/tests/test_benchmark_cases.py backend/tests/test_benchmark_runner.py -q",
            "python scripts/generate_benchmark_report.py --output docs/verification/benchmark-validation-report.md",
            "```",
            "",
            "## 专业边界",
            "",
            "- 本报告证明当前求解器在公开验证集覆盖范围内满足数值回归阈值，不等同于所有结构设计场景的规范合规结论。",
            "- 工程签审、施工安全专项方案和地区规范适用性仍需注册结构工程师或企业技术负责人复核。",
            "- 后续新增商业软件对标算例时，应记录软件名称、版本、单元类型、单位制和模型文件来源。",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate ArchSight Solver benchmark validation report.")
    parser.add_argument("--output", "-o", help="输出 Markdown 路径；省略时打印到 stdout。")
    args = parser.parse_args()

    report = build_report()
    if args.output:
        Path(args.output).write_text(report, encoding="utf-8")
    else:
        print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
