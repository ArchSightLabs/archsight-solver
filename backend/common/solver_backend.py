from __future__ import annotations

from typing import Any

from backend.config import get_solver_backend


SUPPORTED_SOLVER_BACKENDS = {"auto", "dense", "sparse"}


def normalize_solver_backend(value: Any) -> str:
    requested = str(value or get_solver_backend()).strip().lower()
    return requested if requested in SUPPORTED_SOLVER_BACKENDS else get_solver_backend()
