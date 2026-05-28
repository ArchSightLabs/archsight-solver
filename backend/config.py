from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Mapping


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG_PATH = ROOT / "config" / "defaults.json"


@lru_cache(maxsize=1)
def load_defaults() -> Dict[str, Any]:
    with DEFAULT_CONFIG_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _env_int(name: str, default: int) -> int:
    value = os.environ.get(name)
    if value is None or not value.strip():
        return default
    try:
        parsed = int(value)
    except ValueError:
        return default
    return parsed if parsed > 0 else default


def _bounded_int(value: Any, default: int, *, minimum: int = 0, maximum: int = 12) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return min(maximum, max(minimum, parsed))


def _env_choice(name: str, default: str, choices: set[str]) -> str:
    value = os.environ.get(name)
    if value is None or not value.strip():
        return default
    normalized = value.strip().lower()
    return normalized if normalized in choices else default


def get_backend_host() -> str:
    server = load_defaults()["server"]
    return os.environ.get("BEAM_SOLVER_BACKEND_HOST", server["backendHost"])


def get_backend_port() -> int:
    server = load_defaults()["server"]
    return _env_int("BEAM_SOLVER_BACKEND_PORT", int(server["backendPort"]))


def get_frontend_port() -> int:
    server = load_defaults()["server"]
    return _env_int("BEAM_SOLVER_FRONTEND_PORT", int(server["frontendPort"]))


def get_deployment_host_port() -> int:
    server = load_defaults()["server"]
    return _env_int("APP_HOST_PORT", int(server["deploymentHostPort"]))


def get_persistence_mode() -> str:
    persistence = load_defaults().get("persistence", {})
    return str(os.environ.get("BEAM_SOLVER_PERSISTENCE_MODE", persistence.get("mode", "stateless"))).strip().lower()


def get_persistence_decision() -> str:
    persistence = load_defaults().get("persistence", {})
    return str(persistence.get("decision", "当前求解器保持无状态计算 API。"))


def get_max_beam_spans() -> int:
    limits = load_defaults().get("analysisLimits", {})
    return _env_int("ARCHSIGHT_MAX_BEAM_SPANS", int(limits.get("beamMaxSpans", 64)))


def get_max_frame_nodes() -> int:
    limits = load_defaults().get("analysisLimits", {})
    return _env_int("ARCHSIGHT_MAX_FRAME_NODES", int(limits.get("frameMaxNodes", 300)))


def get_max_frame_members() -> int:
    limits = load_defaults().get("analysisLimits", {})
    return _env_int("ARCHSIGHT_MAX_FRAME_MEMBERS", int(limits.get("frameMaxMembers", 900)))


def get_max_truss_nodes() -> int:
    limits = load_defaults().get("analysisLimits", {})
    return _env_int("ARCHSIGHT_MAX_TRUSS_NODES", int(limits.get("trussMaxNodes", 300)))


def get_max_truss_members() -> int:
    limits = load_defaults().get("analysisLimits", {})
    return _env_int("ARCHSIGHT_MAX_TRUSS_MEMBERS", int(limits.get("trussMaxMembers", 900)))


def get_solver_backend() -> str:
    solver = load_defaults().get("solver", {})
    default = str(solver.get("backend", "auto")).strip().lower()
    return _env_choice("ARCHSIGHT_SOLVER_BACKEND", default, {"auto", "dense", "sparse"})


def get_sparse_dof_threshold() -> int:
    solver = load_defaults().get("solver", {})
    return _env_int("ARCHSIGHT_SPARSE_DOF_THRESHOLD", int(solver.get("sparseDofThreshold", 512)))


def resolve_output_precision(payload: Mapping[str, Any] | None = None) -> Dict[str, int]:
    defaults = load_defaults().get("outputPrecision", {})
    precision: Dict[str, int] = {
        "displayDecimals": _env_int("ARCHSIGHT_DISPLAY_DECIMALS", int(defaults.get("displayDecimals", 3))),
        "summaryDecimals": _env_int("ARCHSIGHT_SUMMARY_DECIMALS", int(defaults.get("summaryDecimals", 4))),
        "seriesDecimals": _env_int("ARCHSIGHT_SERIES_DECIMALS", int(defaults.get("seriesDecimals", 6))),
    }
    raw = None if payload is None else payload.get("outputPrecision", payload.get("precision"))
    if isinstance(raw, Mapping):
        precision["displayDecimals"] = _bounded_int(raw.get("displayDecimals", raw.get("display")), precision["displayDecimals"])
        precision["summaryDecimals"] = _bounded_int(raw.get("summaryDecimals", raw.get("summary")), precision["summaryDecimals"])
        precision["seriesDecimals"] = _bounded_int(raw.get("seriesDecimals", raw.get("series")), precision["seriesDecimals"])
    return precision
