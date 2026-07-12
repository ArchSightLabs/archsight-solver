from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_PATHS = (
    ".github/workflows/release.yml",
    "docs/verification/release-1-6-acceptance.md",
    "scripts/check_versions.py",
    "Dockerfile",
    "deploy/.env.example",
    "deploy/docker-compose.yml.example",
)
REQUIRED_MARKERS = {
    "Dockerfile": ("USER app", "HEALTHCHECK"),
    ".github/workflows/ci.yml": (
        "python scripts/check_versions.py",
        "python scripts/check_release_gate.py",
        "docker build",
        "release-1-6-host-integration.spec.ts",
        "npm audit --omit=dev --audit-level=moderate",
    ),
    ".github/workflows/release.yml": (
        'tags: ["v*"]',
        "trivy-action",
        "sbom-action",
        "sha256sum",
        "gh release create",
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
        "deploy/.env.example": "IMAGE_TAG=v1.6.0",
        "deploy/docker-compose.yml.example": "${IMAGE_TAG:-v1.6.0}",
        "deploy/deploy.sh": '${IMAGE_TAG:-v1.6.0}',
        "docs/deployment.md": "archsight-solver:v1.6.0",
    }
    for relative_path, expected_marker in deploy_expectations.items():
        text = (ROOT / relative_path).read_text(encoding="utf-8")
        if expected_marker not in text:
            failures.append(f"{relative_path} 未对齐当前发布版本: {expected_marker}")

    if failures:
        print("发布工程门禁失败:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("发布工程门禁通过")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
