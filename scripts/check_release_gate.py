from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_PATHS = (
    ".github/workflows/release.yml",
    ".github/workflows/nightly-quality.yml",
    "docs/verification/release-1-9-1-acceptance.md",
    "docs/verification/release-1-8-4-acceptance.md",
    "docs/verification/release-1-8-3-acceptance.md",
    "docs/verification/release-1-8-2-acceptance.md",
    "docs/verification/release-1-8-1-acceptance.md",
    "docs/verification/release-1-7-acceptance.md",
    "docs/verification/release-1-6-3-acceptance.md",
    "docs/verification/release-1-6-2-acceptance.md",
    "docs/verification/release-1-6-1-acceptance.md",
    "docs/verification/release-1-6-acceptance.md",
    "docs/analytics-and-privacy.md",
    "docs/release-governance.md",
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
    "frontend/tests/visual/release-1-7-verification-package.spec.ts",
    "frontend/tests/visual/release-1-7-learning-paths.spec.ts",
    "frontend/tests/visual/release-1-8-stability-keypoints.spec.ts",
    "frontend/tests/visual/release-1-8-calculation-trace.spec.ts",
    "frontend/tests/visual/release-1-8-workbench-accessibility.spec.ts",
    "frontend/tests/visual/release-1-8-1-real-teaching-e2e.spec.ts",
    "frontend/tests/visual/release-1-8-3-polish.spec.ts",
    "frontend/tests/visual/cloud-workspace-entry.spec.ts",
    "frontend/tests/visual/workbench-export-docx.spec.ts",
    "scripts/run_host_iframe_demo.py",
    "scripts/build-image.ps1",
    "scripts/check_versions.py",
    "Dockerfile",
    "deploy/.env.example",
    "deploy/docker-compose.yml.example",
)
REQUIRED_MARKERS = {
    "docs/release-governance.md": (
        "不少于 24 小时",
        "同一天不得连续发布两个稳定次版本",
        "维护者明确说出要发布的版本号",
    ),
    "CHANGELOG.md": (
        "## v1.9.1",
        "Host Portal",
        "requestPortalAction",
        "Solver 不接触 Cloud token",
    ),
    "docs/verification/release-1-9-1-acceptance.md": (
        "Host Portal",
        "requestPortalAction",
        "127.0.0.1:18082 -> app:6240",
        "未完成项不得提前勾选",
    ),
    "frontend/src/lib/calculation-artifacts.ts": (
        'max_displacement_mm: "最大位移"',
        'critical_load_factor: "临界荷载因子"',
        '["displayPoints", "points"]',
        '["displayEntries", "entries"]',
    ),
    "frontend/src/components/WorkbenchCalculationArtifactPanels.tsx": (
        "技术审计信息",
        "页面仅展示受控清单",
    ),
    "frontend/src/components/FrameStabilityPanel.tsx": (
        "荷载因子",
        "技术审计信息",
    ),
    "app.py": (
        "ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS",
        "ARCHSIGHT_SOLVER_CLOUD_WORKSPACE_URL",
        'Cache-Control',
        "frame-ancestors",
    ),
    "Dockerfile": (
        "USER app",
        "HEALTHCHECK",
        "python -m pip uninstall --yes pip",
        "ARG VITE_ENABLE_BUSUANZI=true",
        "ARG VITE_UMAMI_ENABLED=true",
        "ARG VITE_UMAMI_WEBSITE_ID=21791f13-6214-44db-8724-0e1dcd656bfb",
        "COPY LICENSE /app/LICENSE",
        "COPY pyproject.toml ./pyproject.toml",
        "node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
        "python:3.13-slim@sha256:6771159cd4fa5d9bba1258caf0b82e6b73458c694d178ad97c5e925c2d0e1a91",
        "libssl3t64=3.5.7-1~deb13u2",
        "openssl=3.5.7-1~deb13u2",
        "openssl-provider-legacy=3.5.7-1~deb13u2",
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
    "frontend/tests/visual/release-1-8-stability-keypoints.spec.ts": (
        "几何非线性过程播放显示规范关键点、数值和分层解释",
        "显示关键点类型",
        "共回转牛顿法 · 最大位移",
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
        "release-1-7-verification-package.spec.ts",
        "release-1-7-learning-paths.spec.ts",
        "release-1-8-stability-keypoints.spec.ts",
        "release-1-8-calculation-trace.spec.ts",
        "release-1-8-workbench-accessibility.spec.ts",
        "release-1-8-1-real-teaching-e2e.spec.ts",
        "release-1-8-3-polish.spec.ts",
        "cloud-workspace-entry.spec.ts",
        "workbench-export-docx.spec.ts",
        "npm ci --include=optional",
        "npm --prefix frontend ci --include=optional",
        "Frontend Windows Native Build",
        "中文提交治理",
        "ArchSightLabs/archsight-aios/.github/actions/commit-governance@7eddd6915bdb79c0b32a8295c2bd55b31f3353d7",
        "fetch-depth: 0",
        "runs-on: windows-latest",
        "@rolldown/binding-win32-x64-msvc",
        "needs: [commit-governance, backend, frontend, frontend-windows]",
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
        "release-1-7-verification-package.spec.ts",
        "release-1-7-learning-paths.spec.ts",
        "release-1-8-stability-keypoints.spec.ts",
        "release-1-8-calculation-trace.spec.ts",
        "release-1-8-workbench-accessibility.spec.ts",
        "release-1-8-1-real-teaching-e2e.spec.ts",
        "release-1-8-3-polish.spec.ts",
        "cloud-workspace-entry.spec.ts",
        "test:visual:export-docx",
        "npm --prefix frontend ci --include=optional",
        "npm --prefix frontend audit --omit=dev --audit-level=moderate",
        "npm --prefix frontend audit --audit-level=high",
        "ArchSightLabs/archsight-aios/.github/actions/commit-governance@7eddd6915bdb79c0b32a8295c2bd55b31f3353d7",
        "fetch-depth: 0",
        "PACKAGE_VERSION=",
    ),
    ".github/workflows/nightly-quality.yml": (
        'cron: "0 20 * * 0"',
        "scripts/measure_scale_baseline.py",
        "performance-baseline-v1.6.2.json",
        "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
        "workbench-export-docx.spec.ts",
        "release-1-7-verification-package.spec.ts",
        "release-1-7-learning-paths.spec.ts",
        "release-1-8-stability-keypoints.spec.ts",
        "release-1-8-calculation-trace.spec.ts",
        "release-1-8-workbench-accessibility.spec.ts",
        "cloud-workspace-entry.spec.ts",
        "browser: [chromium, firefox, webkit]",
        "npm --prefix frontend ci --include=optional",
    ),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="检查 Solver 发布工程门禁。")
    parser.add_argument(
        "--phase",
        choices=("candidate", "release"),
        default="candidate",
        help="candidate 允许准备中的候选只完成 Gate A-C；release 要求 Gate A-E 全部完成。",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
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

    current_acceptance_path = ROOT / "docs/verification/release-1-9-1-acceptance.md"
    if current_acceptance_path.is_file():
        acceptance = current_acceptance_path.read_text(encoding="utf-8")
        status_match = re.search(
            r"^> 状态：(发布候选准备中|发布候选就绪|已发布)\s*$",
            acceptance,
            flags=re.MULTILINE,
        )
        if not status_match:
            failures.append("v1.9.1 发布验收状态必须为‘发布候选准备中’、‘发布候选就绪’或‘已发布’")
        candidate_gate_heading = "## Gate D：候选制品与回滚准备"
        release_gate_heading = "## Gate F：正式发布与线上验收"
        if candidate_gate_heading not in acceptance:
            failures.append("v1.9.1 发布验收缺少 Gate D 候选制品与回滚准备")
        candidate_scope = acceptance.split(release_gate_heading, maxsplit=1)[0]
        if release_gate_heading not in acceptance:
            failures.append("v1.9.1 发布验收缺少 Gate F 正式发布与线上验收")
        status = status_match.group(1) if status_match else None
        if args.phase == "release" and status not in {"发布候选就绪", "已发布"}:
            failures.append("v1.9.1 Tag 发布前验收状态必须为‘发布候选就绪’或‘已发布’")
        if status == "已发布":
            checked_scope = acceptance
            phase = "正式发布"
        elif status == "发布候选就绪" or args.phase == "release":
            checked_scope = candidate_scope
            phase = "发布候选"
        else:
            checked_scope = acceptance.split(candidate_gate_heading, maxsplit=1)[0]
            phase = "候选准备"
        unchecked_items = re.findall(r"^- \[ \] ", checked_scope, flags=re.MULTILINE)
        if unchecked_items:
            failures.append(f"v1.9.1 {phase}范围仍有 {len(unchecked_items)} 项未完成")

    deploy_expectations = {
        "deploy/.env.example": (
            "IMAGE_TAG=v1.9.1",
            "NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim@sha256:",
            "PYTHON_IMAGE=public.ecr.aws/docker/library/python:3.13-slim@sha256:",
            "ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS=",
            "ARCHSIGHT_SOLVER_CLOUD_WORKSPACE_URL=https://cloud.archsight.cn/solver",
        ),
        "deploy/docker-compose.yml.example": (
            "${IMAGE_TAG:-v1.9.1}",
            "ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS: ${ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS:-}",
            "ARCHSIGHT_SOLVER_CLOUD_WORKSPACE_URL: ${ARCHSIGHT_SOLVER_CLOUD_WORKSPACE_URL:-}",
        ),
        "deploy/deploy.sh": (
            '${IMAGE_TAG:-v1.9.1}',
            'ps --all --quiet',
            "docker inspect --format",
            "DEPLOY_HEALTH_TIMEOUT_SECONDS",
            "logs --tail=100",
            "wait_for_services_healthy",
        ),
        "docs/deployment.md": (
            "archsight-solver:v1.9.1",
            "ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS",
            "ARCHSIGHT_SOLVER_CLOUD_WORKSPACE_URL",
            "VITE_UMAMI_WEBSITE_ID",
        ),
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
