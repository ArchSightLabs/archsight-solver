from __future__ import annotations

from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
PACKAGED_RESOURCES_ROOT = Path(__file__).resolve().with_name("resources")

PACKAGED_RESOURCE_FILES = (
    "shared/materials.json",
    "shared/supports.json",
    "shared/result-metrics.json",
    "shared/report-options.json",
    "shared/analysis-assumptions.json",
    "shared/report-figures.json",
    "data/verification/template_benchmark_map.json",
    "data/sections/builtin_sections.json",
    "data/sections/builtin_sections.csv",
    "data/agent_workflows/asms_few_shots.json",
    "docs/asms-json-schema.md",
    "docs/verification/benchmark-validation-report.md",
    "docs/mcp-resources.md",
    "config/defaults.json",
)


def _safe_relative_path(relative_path: str | Path) -> Path:
    candidate = Path(relative_path)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise ValueError(f"运行时资源路径必须位于发行包内: {relative_path}")
    return candidate


def packaged_resource_path(relative_path: str | Path) -> Path:
    return PACKAGED_RESOURCES_ROOT / _safe_relative_path(relative_path)


def runtime_resource_path(
    relative_path: str | Path,
    *,
    repository_root: str | Path | None = None,
) -> Path:
    """开发态优先读取仓库事实源，安装态回退到 wheel 内同步副本。"""
    relative = _safe_relative_path(relative_path)
    root = Path(repository_root) if repository_root is not None else REPOSITORY_ROOT
    repository_path = root / relative
    if repository_path.exists():
        return repository_path
    return packaged_resource_path(relative)
