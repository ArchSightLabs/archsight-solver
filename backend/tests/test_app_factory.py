from __future__ import annotations

from app import app, create_app


def test_app_factory_preserves_global_app_compatibility(tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>ArchSight</title>", encoding="utf-8")

    factory_app = create_app(static_folder=tmp_path)

    assert app is not factory_app
    assert any(rule.rule == "/api/calculate" for rule in factory_app.url_map.iter_rules())

    response = factory_app.test_client().get("/")
    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == "*"


def test_runtime_config_exposes_host_allowlist_without_baking_it_into_frontend(monkeypatch, tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>ArchSight</title>", encoding="utf-8")
    monkeypatch.setenv(
        "ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS",
        "https://classroom.example.edu,https://review.example.edu",
    )
    factory_app = create_app(static_folder=tmp_path)

    response = factory_app.test_client().get("/runtime-config.js")

    assert response.status_code == 200
    assert response.mimetype == "application/javascript"
    assert response.headers["Cache-Control"] == "no-store"
    assert b"https://classroom.example.edu,https://review.example.edu" in response.data
