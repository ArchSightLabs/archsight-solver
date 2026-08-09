from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_PATHS = (
    ".github/workflows/release.yml",
    ".github/workflows/nightly-quality.yml",
    "docs/verification/release-1-6-3-acceptance.md",
    "docs/verification/release-1-6-2-acceptance.md",
    "docs/verification/release-1-6-1-acceptance.md",
    "docs/verification/release-1-6-acceptance.md",
    "docs/analytics-and-privacy.md",
    "examples/host-iframe-demo/host.js",
    "examples/host-iframe-demo/solver-host-client.js",
    "examples/host-iframe-demo/sample-project.slv",
    "frontend/public/runtime-config.js",
    "frontend/playwright.config.ts",
    "frontend/src/lib/workbench-presentation.ts",
    "frontend/tests/visual/release-1-6-1-host-reference.spec.ts",
    "frontend/tests/visual/release-1-6-2-acceptance.spec.ts",
    "frontend/tests/visual/release-1-6-2-project-lifecycle.spec.ts",
    "frontend/tests/visual/release-1-6-2-diagnostics.spec.ts",
    "frontend/tests/visual/release-1-6-2-result-validity.spec.ts",
    "frontend/tests/visual/workbench-export-docx.spec.ts",
    "scripts/run_host_iframe_demo.py",
    "scripts/build-image.ps1",
    "scripts/check_versions.py",
    "Dockerfile",
    "deploy/.env.example",
    "deploy/docker-compose.yml.example",
)
REQUIRED_MARKERS = {
    "app.py": ("ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS", 'Cache-Control', "frame-ancestors"),
    "Dockerfile": (
        "USER app",
        "HEALTHCHECK",
        "python -m pip uninstall --yes pip",
        "ARG VITE_ENABLE_BUSUANZI=true",
        "ARG VITE_UMAMI_ENABLED=true",
        "ARG VITE_UMAMI_WEBSITE_ID=21791f13-6214-44db-8724-0e1dcd656bfb",
        "node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
        "python:3.13-slim@sha256:6771159cd4fa5d9bba1258caf0b82e6b73458c694d178ad97c5e925c2d0e1a91",
    ),
    "scripts/build-image.ps1": (
        '"NODE_IMAGE"',
        '"PYTHON_IMAGE"',
        '"NODE_IMAGE=$NodeImage"',
        '"PYTHON_IMAGE=$PythonImage"',
        '"VITE_ENABLE_BUSUANZI=$EnableBusuanzi"',
        '"VITE_UMAMI_WEBSITE_ID=$UmamiWebsiteId"',
        "$RefreshBaseImages",
    ),
    "frontend/playwright.config.ts": (
        'command: "npm run dev -- --host 127.0.0.1 --port 6241 --strictPort"',
        "reuseExistingServer: false",
    ),
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
        "release-1-6-2-acceptance.spec.ts",
        "release-1-6-2-project-lifecycle.spec.ts",
        "release-1-6-2-diagnostics.spec.ts",
        "release-1-6-2-result-validity.spec.ts",
        "workbench-export-docx.spec.ts",
        "npm ci --include=optional",
        "npm --prefix frontend ci --include=optional",
        "Frontend Windows Native Build",
        "runs-on: windows-latest",
        "@rolldown/binding-win32-x64-msvc",
        "needs: [backend, frontend, frontend-windows]",
        "npm audit --omit=dev --audit-level=moderate",
        "npm audit --audit-level=high",
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
        "release-1-6-2-acceptance.spec.ts",
        "release-1-6-2-project-lifecycle.spec.ts",
        "release-1-6-2-diagnostics.spec.ts",
        "release-1-6-2-result-validity.spec.ts",
        "workbench-export-docx.spec.ts",
        "npm --prefix frontend ci --include=optional",
        "npm --prefix frontend audit --omit=dev --audit-level=moderate",
        "npm --prefix frontend audit --audit-level=high",
    ),
    ".github/workflows/nightly-quality.yml": (
        'cron: "0 20 * * 0"',
        "scripts/measure_scale_baseline.py",
        "performance-baseline-v1.6.2.json",
        "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
        "workbench-export-docx.spec.ts",
        "browser: [chromium, firefox, webkit]",
        "npm --prefix frontend ci --include=optional",
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

    playwright_config_path = ROOT / "frontend/playwright.config.ts"
    if playwright_config_path.is_file():
        playwright_config = playwright_config_path.read_text(encoding="utf-8")
        if playwright_config.count("reuseExistingServer: false") != 2:
            failures.append("frontend/playwright.config.ts 必须让 Solver 与 Host 两个测试服务都由当前验收进程独占")

    build_script_path = ROOT / "scripts/build-image.ps1"
    if build_script_path.is_file() and "DOCKER_BUILDKIT" in build_script_path.read_text(encoding="utf-8"):
        failures.append("scripts/build-image.ps1 不得回退到已弃用的 Legacy Builder")

    deploy_expectations = {
        "deploy/.env.example": (
            "IMAGE_TAG=v1.6.3",
            "NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim@sha256:",
            "PYTHON_IMAGE=public.ecr.aws/docker/library/python:3.13-slim@sha256:",
            "ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS=",
        ),
        "deploy/docker-compose.yml.example": (
            "${IMAGE_TAG:-v1.6.3}",
            "ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS: ${ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS:-}",
        ),
        "deploy/deploy.sh": (
            '${IMAGE_TAG:-v1.6.3}',
            'ps --all --quiet',
            "docker inspect --format",
            "DEPLOY_HEALTH_TIMEOUT_SECONDS",
            "logs --tail=100",
            "wait_for_services_healthy",
        ),
        "docs/deployment.md": ("archsight-solver:v1.6.3", "ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS", "VITE_UMAMI_WEBSITE_ID"),
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
