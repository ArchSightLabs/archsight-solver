from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_async_job_public_docs_disclose_local_queue_boundary():
    api_doc = (ROOT / "docs" / "api-reference.md").read_text(encoding="utf-8")
    capabilities_doc = (ROOT / "docs" / "capabilities.md").read_text(encoding="utf-8")
    combined = f"{api_doc}\n{capabilities_doc}"

    assert "未来 SaaS 长任务" not in combined
    assert "提交本地轻量异步作业" in api_doc
    assert "本地轻量异步求解入口" in capabilities_doc

    for expected in [
        "ThreadPoolExecutor",
        "本地 SQLite",
        "ARCHSIGHT_SOLVER_JOB_DB_PATH",
        "执行进程 ID",
        "COMMON_ASYNC_JOB_ORPHANED",
        "重新提交作业",
        "共享数据库",
        "Redis",
        "专用任务队列",
        "不承诺生产级多实例队列",
        "幂等重试",
        "跨主机调度",
        "高吞吐任务编排",
    ]:
        assert expected in combined
