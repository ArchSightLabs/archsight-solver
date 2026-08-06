from __future__ import annotations

import os
import shlex
import shutil
import stat
import subprocess
import uuid
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]


FAKE_DOCKER = r"""#!/usr/bin/env bash
set -euo pipefail

if [[ "$1" = "compose" && "${2:-}" = "version" ]]; then
    exit 0
fi

if [[ "$1" = "compose" ]]; then
    case " $* " in
        *" ps --all --quiet "*)
            echo "fake-container"
            ;;
        *" logs --tail=100 "*)
            echo "fake deployment logs"
            ;;
        *)
            ;;
    esac
    exit 0
fi

if [[ "$1" = "inspect" ]]; then
    if [[ "${FAKE_HEALTH_MODE:-healthy}" = "unhealthy" ]]; then
        echo "running unhealthy"
        exit 0
    fi

    state_file="/tmp/archsight-solver-deploy-${FAKE_TEST_ID}"
    if [[ ! -f "${state_file}" ]]; then
        touch "${state_file}"
        echo "running starting"
    else
        rm -f "${state_file}"
        echo "running healthy"
    fi
    exit 0
fi

exit 1
"""


def _path_for_bash(bash: str, path: Path) -> str:
    if os.name != "nt":
        return str(path)
    quoted_path = shlex.quote(str(path))
    converted = subprocess.run(
        [
            bash,
            "-lc",
            "if command -v wslpath >/dev/null 2>&1; then "
            f"wslpath -a {quoted_path}; "
            "elif command -v cygpath >/dev/null 2>&1; then "
            f"cygpath -u {quoted_path}; "
            "else exit 127; fi",
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=5,
        check=True,
    )
    return converted.stdout.strip()


def _run_deploy_with_fake_docker(tmp_path: Path, *, health_mode: str) -> subprocess.CompletedProcess[str]:
    bash = shutil.which("bash")
    if bash is None:
        pytest.skip("需要 Bash 验证部署脚本")

    deploy_dir = tmp_path / "deploy"
    deploy_dir.mkdir()
    for filename in ("deploy.sh", ".env.example", "docker-compose.yml.example"):
        shutil.copy2(ROOT / "deploy" / filename, deploy_dir / filename)

    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_docker = fake_bin / "docker"
    fake_docker.write_text(FAKE_DOCKER, encoding="utf-8", newline="\n")
    fake_docker.chmod(fake_docker.stat().st_mode | stat.S_IEXEC)

    env = os.environ.copy()
    fake_bin_for_bash = _path_for_bash(bash, fake_bin)
    deploy_script_for_bash = _path_for_bash(bash, deploy_dir / "deploy.sh")
    fake_test_id = uuid.uuid4().hex

    return subprocess.run(
        [
            bash,
            "-lc",
            f"export PATH={shlex.quote(fake_bin_for_bash)}:\"$PATH\"; "
            "export DEPLOY_HEALTH_TIMEOUT_SECONDS=5 DEPLOY_HEALTH_POLL_SECONDS=1; "
            f"export FAKE_HEALTH_MODE={shlex.quote(health_mode)} "
            f"FAKE_TEST_ID={shlex.quote(fake_test_id)}; "
            f"exec {shlex.quote(deploy_script_for_bash)} v1.6.2",
        ],
        cwd=deploy_dir,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=15,
        check=False,
    )


def test_deploy_script_waits_for_all_compose_containers_before_success():
    script = (ROOT / "deploy" / "deploy.sh").read_text(encoding="utf-8")

    assert "ps --all --quiet" in script
    assert "docker inspect --format" in script
    assert "{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}" in script
    assert "exited|dead|removing|paused" in script
    assert "未定义 Docker HEALTHCHECK" in script
    assert "logs --tail=100" in script
    assert script.index("wait_for_services_healthy\n") < script.index('echo "部署完成。"')


def test_deploy_health_wait_is_bounded_and_configurable():
    script = (ROOT / "deploy" / "deploy.sh").read_text(encoding="utf-8")
    env_example = (ROOT / "deploy" / ".env.example").read_text(encoding="utf-8")

    assert 'DEPLOY_HEALTH_TIMEOUT_SECONDS="${DEPLOY_HEALTH_TIMEOUT_SECONDS:-120}"' in script
    assert 'DEPLOY_HEALTH_POLL_SECONDS="${DEPLOY_HEALTH_POLL_SECONDS:-2}"' in script
    assert "DEPLOY_HEALTH_TIMEOUT_SECONDS=120" in env_example
    assert "DEPLOY_HEALTH_POLL_SECONDS=2" in env_example
    assert "require_positive_integer" in script


def test_deploy_readiness_reuses_the_image_healthcheck_contract():
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    deploy_readme = (ROOT / "deploy" / "readme.md").read_text(encoding="utf-8")
    deployment_doc = (ROOT / "docs" / "deployment.md").read_text(encoding="utf-8")

    assert "HEALTHCHECK" in dockerfile
    assert "只有在 Compose 容器通过 Docker 健康检查后才会返回成功" in deploy_readme
    assert "会有界等待 Docker `HEALTHCHECK` 变为 `healthy`" in deployment_doc


def test_deploy_script_waits_until_the_container_is_healthy(tmp_path):
    completed = _run_deploy_with_fake_docker(tmp_path, health_mode="healthy")

    assert completed.returncode == 0, completed.stderr
    assert "[4/4] 等待容器健康检查" in completed.stdout
    assert "容器健康检查通过" in completed.stdout
    assert "部署完成" in completed.stdout


def test_deploy_script_stops_and_prints_logs_when_healthcheck_fails(tmp_path):
    completed = _run_deploy_with_fake_docker(tmp_path, health_mode="unhealthy")

    assert completed.returncode != 0
    assert "健康状态为 unhealthy" in completed.stdout
    assert "fake deployment logs" in completed.stdout
    assert "部署完成" not in completed.stdout
