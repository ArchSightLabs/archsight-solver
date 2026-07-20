from __future__ import annotations

import json

from backend.api.calculation_response import build_calculation_response
from backend.application.calculation import build_calculation_result
from backend.contracts.calculation_response import (
    CALCULATION_RESULT_SCHEMA,
    api_v1_response_from_stored_result,
    build_api_v1_response,
    solution_from_stored_result,
)


def _beam_payload():
    return {
        "analysisType": "beam",
        "beamType": "simply_supported",
        "loadType": "uniform",
        "q": 12,
        "E": 206,
        "I": 85000,
        "spans": [6],
        "projectName": "Canonical Result Contract",
    }


def test_canonical_result_round_trips_to_unchanged_api_v1_response():
    canonical = build_calculation_result(_beam_payload())
    adapted = build_api_v1_response(canonical)
    compatibility_entrypoint = build_calculation_response(_beam_payload())

    assert canonical["storageSchema"] == CALCULATION_RESULT_SCHEMA
    assert adapted["analysisType"] == compatibility_entrypoint["analysisType"]
    assert adapted["summary"] == compatibility_entrypoint["summary"]
    assert adapted["results"] == compatibility_entrypoint["results"]
    assert adapted["model"] == compatibility_entrypoint["model"]
    assert adapted["solution"] == canonical["solution"]


def test_canonical_storage_avoids_api_v1_payload_duplication():
    canonical = build_calculation_result(_beam_payload())
    public_response = build_api_v1_response(canonical)

    assert {"success", "version", "results", "beam"}.isdisjoint(canonical)
    canonical_size = len(json.dumps(canonical, ensure_ascii=False))
    public_size = len(json.dumps(public_response, ensure_ascii=False))
    assert canonical_size < public_size * 0.6


def test_stored_result_helpers_read_new_and_legacy_records():
    canonical = build_calculation_result(_beam_payload())
    public_response = build_api_v1_response(canonical)

    assert api_v1_response_from_stored_result(canonical)["summary"] == public_response["summary"]
    assert solution_from_stored_result(canonical) == canonical["solution"]
    assert api_v1_response_from_stored_result(public_response) == public_response
    assert solution_from_stored_result(public_response) == public_response["solution"]
