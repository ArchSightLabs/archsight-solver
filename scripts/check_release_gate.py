from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_PATHS = (
    ".github/workflows/release.yml",
    "docs/verification/release-1-6-1-acceptance.md",
    "docs/verification/release-1-6-acceptance.md",
    "examples/host-iframe-demo/host.js",
    "examples/host-iframe-demo/solver-host-client.js",
    "examples/host-iframe-demo/sample-project.slv",
    "frontend/public/runtime-config.js",
    "frontend/src/lib/workbench-presentation.ts",
    "frontend/tests/visual/release-1-6-1-host-reference.spec.ts",
    "scripts/run_host_iframe_demo.py",
    "scripts/check_versions.py",
    "Dockerfile",
    "deploy/.env.example",
    "deploy/docker-compose.yml.example",
)
REQUIRED_MARKERS = {
    "app.py": ("ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS", 'Cache-Control', "frame-ancestors"),
    "Dockerfile": ("USER app", "HEALTHCHECK"),
    "frontend/index.html": ('src="/runtime-config.js"',),
    "examples/host-iframe-demo/host.js": (
        'searchParams.set("embed", "1")',
        "SolverHostClient",
        "client.requestSave",
    ),
    "examples/host-iframe-demo/solver-host-client.js": (
        "acceptHostSaveRequest",
        "DEFAULT_SAVE_TIMEOUT_MS",
        "solverWindow.postMessage(message, this.solverOrigin)",
    ),
    "frontend/src/lib/solver-host-client.ts": (
        "SOLVER_HOST_CLIENT_REQUIRED_CAPABILITIES",
        "save-timeout",
        "late-save-snapshot",
    ),
    ".github/workflows/ci.yml": (
        "python scripts/check_versions.py",
        "python scripts/check_release_gate.py",
        "docker build",
        "release-1-6-host-integration.spec.ts",
        "release-1-6-1-host-reference.spec.ts",
        "npm audit --omit=dev --audit-level=moderate",
        "ARCHSIGHT_SOLVER_E2E_URL",
        "Run built image Host integration",
    ),
    ".github/workflows/release.yml": (
        'tags: ["v*"]',
        "trivy-action",
        "sbom-action",
        "sha256sum",
        "gh release create",
        "ARCHSIGHT_SOLVER_E2E_URL",
        "Run built image Host integration",
    ),
}


def main() -> int:
    failures: list[str] = []
    for relative_path in REQUIRED_PATHS:
        if not (ROOT / relative_path).is_file():
            failures.append(f"缺少发布文件: {relative_path}")

    for relative_path, markers in REQUIRED_MARKERS.items():
        path = ROOT / relative_path
        if not path.is_file():
            failures.append(f"缺少发布文件: {relative_path}")
            continue
        text = path.read_text(encoding="utf-8")
        for marker in markers:
            if marker not in text:
                failures.append(f"{relative_path} 缺少门禁标记: {marker}")

    deploy_expectations = {
        "deploy/.env.example": ("IMAGE_TAG=v1.6.1", "ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS="),
        "deploy/docker-compose.yml.example": (
            "${IMAGE_TAG:-v1.6.1}",
            "ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS: ${ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS:-}",
        ),
        "deploy/deploy.sh": ('${IMAGE_TAG:-v1.6.1}',),
        "docs/deployment.md": ("archsight-solver:v1.6.1", "ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS"),
    }
    for relative_path, expected_markers in deploy_expectations.items():
        text = (ROOT / relative_path).read_text(encoding="utf-8")
        for expected_marker in expected_markers:
            if expected_marker not in text:
                failures.append(f"{relative_path} 未对齐发布配置: {expected_marker}")

    wildcard_post_message = re.compile(
        r"postMessage\s*\((?:(?!\)\s*;).){0,2000}?,\s*['\"]\*['\"]\s*\)",
        flags=re.DOTALL,
    )
    for directory in (ROOT / "frontend", ROOT / "examples"):
        for path in directory.rglob("*"):
            if {"node_modules", "dist", "test-results", "playwright-report"}.intersection(path.parts):
                continue
            if path.suffix not in {".ts", ".tsx", ".js", ".html"} or not path.is_file():
                continue
            if wildcard_post_message.search(path.read_text(encoding="utf-8")):
                failures.append(f"发现不安全的 postMessage 通配 targetOrigin: {path.relative_to(ROOT)}")

    sample_path = ROOT / "examples/host-iframe-demo/sample-project.slv"
    if sample_path.is_file():
        sample = json.loads(sample_path.read_text(encoding="utf-8"))
        if sample.get("schemaVersion") != "2.0.0":
            failures.append("Host Reference 示例项目 schemaVersion 未对齐 2.0.0")
        if sample.get("contract", {}).get("asmsJsonSchemaVersion") != "2026-05-30":
            failures.append("Host Reference 示例项目 ASMS-JSON 契约版本漂移")
        if sample.get("manifest", {}).get("projectFileKind") != "single-json":
            failures.append("Host Reference 示例项目 manifest 不是 single-json")

    if failures:
        print("发布工程门禁失败:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("发布工程门禁通过")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
