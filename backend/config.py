from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict


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
