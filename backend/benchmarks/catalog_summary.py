from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable, Mapping

from backend.benchmarks.catalog import ROOT, load_benchmark_catalog


TEMPLATE_BENCHMARK_MAP_PATH = ROOT / "data" / "verification" / "template_benchmark_map.json"


SOURCE_LABELS = {
    "textbook-analytical": "教材解析解",
    "independent-stiffness-baseline": "独立刚度法基准",
    "engineering-software": "工程软件对标",
    "internal-regression": "内部回归算例",
}

CATEGORY_LABELS = {
    "beam": "梁系",
    "frame": "二维平面框架",
    "truss": "二维平面桁架",
    "frame-beam-verify": "框架梁退化验证",
    "truss-verify": "桁架专项验证",
}


def _source_label(source_type: str) -> str:
    return SOURCE_LABELS.get(source_type, source_type or "未标注")


def _format_mapping(values: Mapping[str, Any]) -> str:
    if not values:
        return "—"
    parts = []
    for key, value in values.items():
        if isinstance(value, list):
            parts.append(f"{key}={len(value)} 项")
        elif isinstance(value, dict):
            parts.append(f"{key}={len(value)} 项")
        else:
            parts.append(f"{key}={value}")
    return "；".join(parts)


def _format_metrics(metrics: Iterable[Any]) -> str:
    values = [str(metric) for metric in metrics if str(metric).strip()]
    return "、".join(values) if values else "—"


def _escape_cell(value: Any) -> str:
    return str(value).replace("|", "\\|").replace("\n", "<br>")


def _load_template_mapping() -> list[Mapping[str, Any]]:
    if not TEMPLATE_BENCHMARK_MAP_PATH.exists():
        return []
    with TEMPLATE_BENCHMARK_MAP_PATH.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    templates = data.get("templates", [])
    return [item for item in templates if isinstance(item, Mapping)]


def _template_mapping_lines() -> list[str]:
    templates = _load_template_mapping()
    if not templates:
        return []
    lines = [
        "## 模板验证映射",
        "",
        "> “对应”表示模板与 benchmark 的结构体系、边界和荷载基本一致；“相近/相关”表示可作为同类口径参考，但仍需要后续补专项算例。",
        "",
        "| 模块 | 模板 | 对应 benchmark | 关系 | 说明 |",
        "|---|---|---|---|---|",
    ]
    for template in templates:
        refs = template.get("validationRefs", [])
        if not isinstance(refs, list) or not refs:
            lines.append(
                "| "
                f"{_escape_cell(template.get('module', '—'))} | "
                f"`{_escape_cell(template.get('templateId', '—'))}` / {_escape_cell(template.get('templateTitle', '—'))} | "
                "— | — | 未配置验证映射 |"
            )
            continue
        for ref in refs:
            if not isinstance(ref, Mapping):
                continue
            lines.append(
                "| "
                f"{_escape_cell(template.get('module', '—'))} | "
                f"`{_escape_cell(template.get('templateId', '—'))}` / {_escape_cell(template.get('templateTitle', '—'))} | "
                f"`{_escape_cell(ref.get('caseId', '—'))}` | "
                f"{_escape_cell(ref.get('relation', '—'))} | "
                f"{_escape_cell(ref.get('note', '—'))} |"
            )
    lines.append("")
    return lines


def build_catalog_summary() -> str:
    catalog = load_benchmark_catalog()
    cases = catalog.get("cases", [])
    grouped: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for case in cases:
        grouped[str(case.get("category", "unknown"))].append(case)

    lines = [
        "# Benchmark 算例目录摘要",
        "",
        "> 本文件由 `python -m backend.benchmarks.catalog_summary --output docs/verification/benchmark-catalog-summary.md` 生成。`backend/benchmarks/benchmark_cases.json` 仍是机器事实源。",
        "",
        f"- 算例目录版本：{catalog.get('updatedAt', '—')}",
        f"- 算例总数：{len(cases)}",
        "- 用途：帮助人工快速阅读算例目的、验证来源、关键指标、标准值和容许误差。",
        "",
    ]

    for category in sorted(grouped, key=lambda key: (CATEGORY_LABELS.get(key, key), key)):
        category_cases = grouped[category]
        lines.extend(
            [
                f"## {CATEGORY_LABELS.get(category, category)}",
                "",
                f"- 算例数量：{len(category_cases)}",
                "",
                "| Case ID | 名称 | 目的 | 验证来源 | 校核指标 | 标准值 | 容许误差 |",
                "|---|---|---|---|---|---|---|",
            ]
        )
        for case in category_cases:
            verification = case.get("verification", {})
            source_type = str(verification.get("sourceType", "")) if isinstance(verification, Mapping) else ""
            metrics = verification.get("checkedMetrics", []) if isinstance(verification, Mapping) else []
            lines.append(
                "| "
                f"`{case.get('id', '—')}` | "
                f"{case.get('title', '—')} | "
                f"{case.get('purpose', '—')} | "
                f"{_source_label(source_type)} | "
                f"{_format_metrics(metrics)} | "
                f"{_format_mapping(case.get('expected', {}) if isinstance(case.get('expected', {}), Mapping) else {})} | "
                f"{_format_mapping(case.get('tolerances', {}) if isinstance(case.get('tolerances', {}), Mapping) else {})} |"
            )
        lines.append("")

    lines.extend(_template_mapping_lines())
    lines.extend(
        [
            "## 使用说明",
            "",
            "- 人工评审优先看本摘要，定位算例后再打开 `benchmark_cases.json` 查看完整 payload。",
            "- `internal-regression` 只表示内部回归稳定，不等同于教材解析解或第三方工程软件对标。",
            "- 新增公开验证算例必须同时提供计算模型、标准值、容许误差和验证来源。",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a human-readable benchmark catalog summary.")
    parser.add_argument("--output", "-o", help="输出 Markdown 路径；省略时打印到 stdout。")
    args = parser.parse_args()

    summary = build_catalog_summary()
    if args.output:
        Path(args.output).write_text(summary, encoding="utf-8")
    else:
        print(summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
