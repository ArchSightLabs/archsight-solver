from __future__ import annotations

import subprocess
import sys
import threading

import pytest

from backend.services.job_runtime import LocalJobRuntime


def test_importing_jobs_does_not_start_background_threads():
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import threading; import backend.api.jobs; "
                "print(','.join(thread.name for thread in threading.enumerate() "
                "if thread.name.startswith('solver-')))"
            ),
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    assert result.stdout.strip() == ""


def test_job_runtime_start_and_shutdown_are_idempotent():
    runtime = LocalJobRuntime(max_workers=1, heartbeat_interval_seconds=0.01)

    assert runtime.start(lambda _job_id: None, lambda _job_ids: None) is True
    assert runtime.start(lambda _job_id: None, lambda _job_ids: None) is False
    assert runtime.is_running is True

    runtime.shutdown()
    runtime.shutdown()

    assert runtime.is_running is False
    assert runtime.active_job_ids() == []


def test_job_runtime_heartbeats_active_jobs_and_rejects_submit_after_shutdown():
    release_job = threading.Event()
    heartbeat_seen = threading.Event()
    heartbeat_job_ids: list[list[str]] = []
    runtime = LocalJobRuntime(max_workers=1, heartbeat_interval_seconds=0.01)

    def run_job(_job_id: str) -> None:
        release_job.wait(timeout=1)

    def heartbeat(job_ids: list[str]) -> None:
        heartbeat_job_ids.append(job_ids)
        heartbeat_seen.set()

    runtime.start(run_job, heartbeat)
    runtime.submit("job-1")

    assert heartbeat_seen.wait(timeout=1)
    assert ["job-1"] in heartbeat_job_ids

    release_job.set()
    runtime.shutdown()

    with pytest.raises(RuntimeError, match="尚未启动"):
        runtime.submit("job-2")
