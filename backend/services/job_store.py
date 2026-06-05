from __future__ import annotations

import json
import os
import sqlite3
import tempfile
from pathlib import Path
from typing import Any, Dict, Mapping


JOB_COLUMNS = {
    "jobId": "job_id",
    "clientJobId": "client_job_id",
    "operation": "operation",
    "payload": "payload_json",
    "status": "status",
    "result": "result_json",
    "error": "error_json",
    "warnings": "warnings_json",
    "infos": "infos_json",
    "cancelRequested": "cancel_requested",
    "createdAt": "created_at",
    "updatedAt": "updated_at",
    "startedAt": "started_at",
    "completedAt": "completed_at",
    "workerProcessId": "worker_process_id",
    "lastHeartbeatAt": "last_heartbeat_at",
}

JSON_FIELDS = {"payload", "result", "error", "warnings", "infos"}


def job_db_path() -> Path:
    configured = os.environ.get("ARCHSIGHT_SOLVER_JOB_DB_PATH")
    if configured and configured.strip():
        return Path(configured)
    return Path(tempfile.gettempdir()) / "archsight-solver-jobs.sqlite3"


def _json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _json_load(value: str | None, fallback: Any) -> Any:
    if value in (None, ""):
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def _connect() -> sqlite3.Connection:
    db_path = job_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout=30000")
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS solver_jobs (
            job_id TEXT PRIMARY KEY,
            client_job_id TEXT,
            operation TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            status TEXT NOT NULL,
            result_json TEXT,
            error_json TEXT,
            warnings_json TEXT NOT NULL,
            infos_json TEXT NOT NULL,
            cancel_requested INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT,
            worker_process_id INTEGER,
            last_heartbeat_at TEXT
        )
        """
    )
    existing_columns = {row["name"] for row in connection.execute("PRAGMA table_info(solver_jobs)").fetchall()}
    if "worker_process_id" not in existing_columns:
        connection.execute("ALTER TABLE solver_jobs ADD COLUMN worker_process_id INTEGER")
    if "last_heartbeat_at" not in existing_columns:
        connection.execute("ALTER TABLE solver_jobs ADD COLUMN last_heartbeat_at TEXT")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_solver_jobs_status_heartbeat ON solver_jobs(status, last_heartbeat_at)")
    return connection


def _row_to_record(row: sqlite3.Row | None) -> Dict[str, Any] | None:
    if row is None:
        return None
    return {
        "jobId": row["job_id"],
        "clientJobId": row["client_job_id"],
        "operation": row["operation"],
        "payload": _json_load(row["payload_json"], {}),
        "status": row["status"],
        "result": _json_load(row["result_json"], None),
        "error": _json_load(row["error_json"], None),
        "warnings": _json_load(row["warnings_json"], []),
        "infos": _json_load(row["infos_json"], []),
        "cancelRequested": bool(row["cancel_requested"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "startedAt": row["started_at"],
        "completedAt": row["completed_at"],
        "workerProcessId": row["worker_process_id"],
        "lastHeartbeatAt": row["last_heartbeat_at"],
    }


def _row_to_record_meta(row: sqlite3.Row | None) -> Dict[str, Any] | None:
    if row is None:
        return None
    return {
        "jobId": row["job_id"],
        "clientJobId": row["client_job_id"],
        "operation": row["operation"],
        "status": row["status"],
        "cancelRequested": bool(row["cancel_requested"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "startedAt": row["started_at"],
        "completedAt": row["completed_at"],
        "workerProcessId": row["worker_process_id"],
        "lastHeartbeatAt": row["last_heartbeat_at"],
    }


def store_job(record: Mapping[str, Any]) -> None:
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO solver_jobs (
                job_id, client_job_id, operation, payload_json, status,
                result_json, error_json, warnings_json, infos_json,
                cancel_requested, created_at, updated_at, started_at, completed_at, worker_process_id, last_heartbeat_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record["jobId"],
                record.get("clientJobId"),
                record["operation"],
                _json_dump(record["payload"]),
                record["status"],
                _json_dump(record.get("result")) if record.get("result") is not None else None,
                _json_dump(record.get("error")) if record.get("error") is not None else None,
                _json_dump(record.get("warnings", [])),
                _json_dump(record.get("infos", [])),
                1 if record.get("cancelRequested") else 0,
                record["createdAt"],
                record["updatedAt"],
                record.get("startedAt"),
                record.get("completedAt"),
                record.get("workerProcessId"),
                record.get("lastHeartbeatAt"),
            ),
        )


def load_job(job_id: str) -> Dict[str, Any] | None:
    with _connect() as connection:
        row = connection.execute("SELECT * FROM solver_jobs WHERE job_id = ?", (job_id,)).fetchone()
    return _row_to_record(row)


def load_active_jobs_meta() -> list[Dict[str, Any]]:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT job_id, client_job_id, operation, status, cancel_requested, "
            "created_at, updated_at, started_at, completed_at, worker_process_id, last_heartbeat_at "
            "FROM solver_jobs WHERE status IN ('queued', 'running')"
        ).fetchall()
    return [_row_to_record_meta(row) for row in rows if row is not None]


def bulk_fail_stale_jobs(cutoff_iso_string: str, exclude_job_ids: list[str]) -> int:
    with _connect() as connection:
        # Convert JSON objects to strings manually for standard _json_dump consistency
        error_json = _json_dump({
            "code": "COMMON_ASYNC_JOB_ORPHANED",
            "message": "异步作业心跳超时或句柄丢失，请重新提交作业。",
        })
        completed_at = cutoff_iso_string
        updated_at = cutoff_iso_string

        params = [error_json, completed_at, updated_at, cutoff_iso_string]
        exclude_placeholders = ""
        if exclude_job_ids:
            exclude_placeholders = " AND job_id NOT IN ({})".format(", ".join("?" for _ in exclude_job_ids))
            params.extend(exclude_job_ids)

        query = f"""
            UPDATE solver_jobs 
            SET status = 'failed', error_json = ?, completed_at = ?, updated_at = ?
            WHERE status IN ('queued', 'running') 
              AND last_heartbeat_at < ?
              {exclude_placeholders}
        """
        cursor = connection.execute(query, params)
        return cursor.rowcount


def update_job(job_id: str, **updates: Any) -> Dict[str, Any] | None:
    if not updates:
        return load_job(job_id)
    assignments: list[str] = []
    values: list[Any] = []
    for key, value in updates.items():
        column = JOB_COLUMNS[key]
        assignments.append(f"{column} = ?")
        if key in JSON_FIELDS:
            values.append(_json_dump(value))
        elif key == "cancelRequested":
            values.append(1 if value else 0)
        else:
            values.append(value)
    values.append(job_id)
    with _connect() as connection:
        connection.execute(f"UPDATE solver_jobs SET {', '.join(assignments)} WHERE job_id = ?", values)
    return load_job(job_id)


def prune_completed_jobs(max_jobs: int) -> list[str]:
    with _connect() as connection:
        total = int(connection.execute("SELECT COUNT(*) FROM solver_jobs").fetchone()[0])
        if total <= max_jobs:
            return []
        rows = connection.execute(
            """
            SELECT job_id FROM solver_jobs
            WHERE status IN ('succeeded', 'failed', 'cancelled')
            ORDER BY updated_at ASC
            LIMIT ?
            """,
            (max(0, total - max_jobs),),
        ).fetchall()
        job_ids = [str(row["job_id"]) for row in rows]
        if job_ids:
            connection.executemany("DELETE FROM solver_jobs WHERE job_id = ?", [(job_id,) for job_id in job_ids])
    return job_ids
