from __future__ import annotations

import ast
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def _python_files(path: str) -> list[Path]:
    target = REPOSITORY_ROOT / path
    return sorted(target.rglob("*.py")) if target.is_dir() else [target]


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    imports: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imports.add(node.module)
    return imports


def test_backend_dependencies_point_inward():
    boundaries = {
        "backend/solver": ("backend.normalizers", "backend.api", "backend.services", "backend.application"),
        "backend/normalizers": ("backend.solver", "backend.api"),
        "backend/application": ("backend.api", "backend.capabilities", "backend.benchmarks"),
        "backend/services": ("backend.api",),
        "backend/benchmarks": ("backend.api",),
        "backend/capabilities": ("backend.api",),
        "backend/project_workflow.py": ("backend.api",),
    }
    violations: list[str] = []

    for source, forbidden_prefixes in boundaries.items():
        for path in _python_files(source):
            for imported_module in sorted(_imports(path)):
                if imported_module.startswith(forbidden_prefixes):
                    relative_path = path.relative_to(REPOSITORY_ROOT).as_posix()
                    violations.append(f"{relative_path} -> {imported_module}")

    assert violations == [], "后端依赖必须指向 common/contracts/application/solver 内层：\n" + "\n".join(violations)

def test_backend_hotspot_facades_remain_deep_and_small():
    line_budgets = {
        "backend/contracts/json_schemas.py": 120,
        "backend/normalizers/structural_model.py": 120,
    }

    violations = []
    for relative_path, budget in line_budgets.items():
        line_count = len((REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8").splitlines())
        if line_count > budget:
            violations.append(f"{relative_path}: {line_count} > {budget}")

    assert violations == [], "兼容 facade 不得重新吸收领域 Implementation：\n" + "\n".join(violations)
