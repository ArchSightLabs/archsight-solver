from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_release_workflow_builds_verifies_and_publishes_developer_assets():
    workflow = (ROOT / ".github/workflows/release.yml").read_text(encoding="utf-8")

    for token in (
        "uv build --wheel --sdist --out-dir dist",
        "npm pack ./packages/solver-host-client --pack-destination dist",
        "scripts/check_python_distribution.py",
        "frontend/scripts/check-host-client-package.mjs",
        "dist/archsight_solver-*.tar.gz",
        "dist/archsight_solver-*.whl",
        "dist/archsight-solver-host-client-*.tgz",
    ):
        assert token in workflow

    checksum_command = next(line for line in workflow.splitlines() if "sha256sum" in line)
    assert "dist/*.tar.gz" in checksum_command
    assert "dist/*.whl" in checksum_command
    assert "dist/*.tgz" in checksum_command
