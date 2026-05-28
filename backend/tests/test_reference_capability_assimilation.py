from __future__ import annotations

from pathlib import Path

from backend.common.units import ENGINEERING_UNITS, from_si, to_si
from backend.config import (
    get_backend_port,
    get_deployment_host_port,
    get_frontend_port,
    get_persistence_decision,
    get_persistence_mode,
    load_defaults,
)
from backend.normalizers.section_library import load_section_library, load_section_library_csv, resolve_section
from backend.persistence.policy import enforce_supported_persistence_policy, get_persistence_policy


ROOT = Path(__file__).resolve().parents[2]


def test_engineering_unit_registry_covers_solver_quantities():
    assert to_si(1.0, "distributed", "kN/m") == 1000.0
    assert to_si(210.0, "elastic_modulus", "GPa") == 210_000_000_000.0
    assert to_si(4500.0, "moment_of_inertia", "cm4") == 4.5e-05
    assert from_si(0.012, "area", "cm2") == 120.0
    assert ENGINEERING_UNITS.default_unit("deflection") == "mm"


def test_default_config_centralizes_ports(monkeypatch):
    load_defaults.cache_clear()
    monkeypatch.delenv("BEAM_SOLVER_BACKEND_PORT", raising=False)
    monkeypatch.delenv("BEAM_SOLVER_FRONTEND_PORT", raising=False)
    monkeypatch.delenv("APP_HOST_PORT", raising=False)

    assert get_backend_port() == 6240
    assert get_frontend_port() == 6241
    assert get_deployment_host_port() == 6280
    assert get_persistence_mode() == "stateless"
    assert "无状态计算 API" in get_persistence_decision()
    assert get_persistence_policy()["supported"] is True
    assert enforce_supported_persistence_policy()["mode"] == "stateless"

    monkeypatch.setenv("BEAM_SOLVER_BACKEND_PORT", "6250")
    assert get_backend_port() == 6250


def test_docker_image_copies_runtime_config_directory():
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")

    assert "COPY config ./config" in dockerfile
    assert "ARCHSIGHT_GUNICORN_WORKERS=4" in dockerfile
    assert "gunicorn --workers ${ARCHSIGHT_GUNICORN_WORKERS:-4}" in dockerfile


def test_unsupported_persistence_mode_is_rejected(monkeypatch):
    monkeypatch.setenv("BEAM_SOLVER_PERSISTENCE_MODE", "sqlite")

    try:
        enforce_supported_persistence_policy()
    except ValueError as exc:
        assert "当前版本仅支持无状态计算 API" in str(exc)
        assert "sqlite" in str(exc)
    else:
        raise AssertionError("unsupported persistence mode should be rejected")


def test_section_library_is_loaded_from_project_json():
    library = load_section_library()
    assert "rect_300x500" in library
    assert library["rect_300x500"]["source"] == "builtin"

    section = resolve_section({"sectionId": "rect_300x500"})
    assert section["A_cm2"] == 1500.0
    assert section["I_cm4"] == 312500.0

    csv_library = load_section_library_csv()
    assert csv_library["csv_rect_200x300"]["source"] == "builtin_csv"
    csv_section = resolve_section({"sectionId": "csv_rect_200x300"})
    assert csv_section["A_cm2"] == 600.0


def test_custom_section_uses_shared_unit_conversions():
    section = resolve_section({"section": {"type": "rectangle", "widthMm": 300, "depthMm": 500}})
    assert round(section["A_cm2"], 6) == 1500.0
    assert round(section["I_cm4"], 6) == 312500.0


def test_public_repo_excludes_external_source_trees():
    gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")

    assert "external/" in gitignore
    assert not (ROOT / ".gitmodules").exists()
