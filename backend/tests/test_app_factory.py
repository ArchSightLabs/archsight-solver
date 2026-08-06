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


def test_html_frame_ancestors_matches_the_runtime_host_allowlist(monkeypatch, tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>ArchSight</title>", encoding="utf-8")
    monkeypatch.setenv(
        "ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS",
        "https://classroom.example.edu, https://review.example.edu,*,https://invalid.example.edu/path",
    )
    factory_app = create_app(static_folder=tmp_path)

    response = factory_app.test_client().get("/")

    assert response.headers["Content-Security-Policy"] == (
        "frame-ancestors 'self' https://classroom.example.edu https://review.example.edu"
    )


def test_html_frame_ancestors_defaults_to_same_origin(monkeypatch, tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>ArchSight</title>", encoding="utf-8")
    monkeypatch.delenv("ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS", raising=False)
    factory_app = create_app(static_folder=tmp_path)

    response = factory_app.test_client().get("/")

    assert response.headers["Content-Security-Policy"] == "frame-ancestors 'self'"


def test_runtime_allowlist_rejects_unicode_idn_and_accepts_explicit_punycode(monkeypatch, tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>ArchSight</title>", encoding="utf-8")
    monkeypatch.setenv(
        "ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS",
        "https://例子.测试,https://xn--fsqu00a.xn--0zwm56d:443",
    )
    factory_app = create_app(static_folder=tmp_path)

    html_response = factory_app.test_client().get("/")
    config_response = factory_app.test_client().get("/runtime-config.js")

    expected_origin = "https://xn--fsqu00a.xn--0zwm56d"
    assert html_response.headers["Content-Security-Policy"] == f"frame-ancestors 'self' {expected_origin}"
    assert expected_origin.encode() in config_response.data
