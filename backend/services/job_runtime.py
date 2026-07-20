from __future__ import annotations

import atexit
import threading
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any, Callable

JobRunner = Callable[[str], None]
HeartbeatWriter = Callable[[list[str]], None]


class LocalJobRuntime:
    """Own the process-local async executor without starting work at import time."""

    def __init__(self, *, max_workers: int, heartbeat_interval_seconds: float = 5.0) -> None:
        self._max_workers = max_workers
        self._heartbeat_interval_seconds = heartbeat_interval_seconds
        self._executor: ThreadPoolExecutor | None = None
        self._heartbeat_thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._lock = threading.RLock()
        self._run_job: JobRunner | None = None
        self._write_heartbeat: HeartbeatWriter | None = None
        self._atexit_registered = False
        self.futures: dict[str, Future[Any]] = {}

    @property
    def is_running(self) -> bool:
        with self._lock:
            return self._executor is not None

    def start(self, run_job: JobRunner, write_heartbeat: HeartbeatWriter) -> bool:
        with self._lock:
            if self._executor is not None:
                return False
            self._run_job = run_job
            self._write_heartbeat = write_heartbeat
            self._stop_event.clear()
            self._executor = ThreadPoolExecutor(
                max_workers=self._max_workers,
                thread_name_prefix="solver-job",
            )
            self._heartbeat_thread = threading.Thread(
                target=self._heartbeat_loop,
                daemon=True,
                name="solver-heartbeat",
            )
            self._heartbeat_thread.start()
            if not self._atexit_registered:
                atexit.register(self.shutdown)
                self._atexit_registered = True
            return True

    def submit(self, job_id: str) -> Future[Any]:
        with self._lock:
            if self._executor is None or self._run_job is None:
                raise RuntimeError("异步作业运行时尚未启动")
            future = self._executor.submit(self._run_job, job_id)
            self.futures[job_id] = future
            return future

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            future = self.futures.get(job_id)
            if future is None or not future.cancel():
                return False
            self.futures.pop(job_id, None)
            return True

    def discard(self, job_id: str) -> None:
        with self._lock:
            self.futures.pop(job_id, None)

    def discard_many(self, job_ids: list[str]) -> None:
        with self._lock:
            for job_id in job_ids:
                self.futures.pop(job_id, None)

    def contains(self, job_id: str) -> bool:
        with self._lock:
            return job_id in self.futures

    def active_job_ids(self) -> list[str]:
        with self._lock:
            return list(self.futures)

    def shutdown(self, *, wait: bool = True) -> None:
        with self._lock:
            executor = self._executor
            heartbeat_thread = self._heartbeat_thread
            if executor is None:
                return
            self._executor = None
            self._heartbeat_thread = None
            self._stop_event.set()

        executor.shutdown(wait=wait, cancel_futures=True)
        if heartbeat_thread is not None and heartbeat_thread is not threading.current_thread():
            heartbeat_thread.join(timeout=max(1.0, self._heartbeat_interval_seconds * 2))
        with self._lock:
            self.futures.clear()

    def _heartbeat_loop(self) -> None:
        while not self._stop_event.wait(self._heartbeat_interval_seconds):
            try:
                job_ids = self.active_job_ids()
                if job_ids and self._write_heartbeat is not None:
                    self._write_heartbeat(job_ids)
            except Exception:
                pass  # pragma: no cover - heartbeat must not terminate the worker
