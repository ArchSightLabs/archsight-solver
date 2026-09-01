from __future__ import annotations

from copy import deepcopy

import pytest

from backend.application.calculation import build_calculation_result
from backend.contracts.calculation_evidence import (
    CALCULATION_TRACE_SCHEMA,
    CRITICAL_POINT_SCHEMA,
    GOVERNING_ENVELOPE_SCHEMA,
    REVIEW_POINT_SCHEMA,
    _series_points,
    diff_calculation_snapshots,
)
from backend.contracts.calculation_response import build_api_v1_response
from backend.tests.test_frame_workbench import frame_payload
from backend.tests.test_truss_workbench import _base_payload as truss_payload


def _beam_payload() -> dict:
    return {
        "analysisType": "beam",
        "projectName": "Trace Beam",
        "materialId": "q345",
        "beamType": "simply_supported",
        "loadType": "uniform",
        "spans": [6.0],
        "spanProperties": [{"E": 206.0, "I": 85000.0}],
        "q": 12.0,
        "queryPointsM": [0.0, 3.0, 6.0],
    }


def _payloads():
    return [
        ("beam", _beam_payload()),
        ("frame", frame_payload()),
        ("truss", truss_payload()),
    ]


def test_calculation_trace_and_evidence_round_trip_through_api_adapter():
    for analysis_type, payload in _payloads():
        canonical = build_calculation_result(deepcopy(payload))
        adapted = build_api_v1_response(canonical)

        assert canonical["analysisType"] == analysis_type
        assert canonical["resultHash"] == canonical["solution"]["resultHash"]
        assert canonical["calculationTrace"]["schema"] == CALCULATION_TRACE_SCHEMA
        assert canonical["criticalPoints"]["schema"] == CRITICAL_POINT_SCHEMA
        assert canonical["reviewPoints"]["schema"] == REVIEW_POINT_SCHEMA
        assert canonical["governingEnvelope"]["schema"] == GOVERNING_ENVELOPE_SCHEMA
        assert canonical["calculationSnapshot"]["schema"] == "CalculationSnapshot@1"
        assert canonical["calculationTrace"]["requestHash"] == canonical["requestHash"]
        assert canonical["calculationTrace"]["modelHash"] == canonical["modelHash"]
        assert canonical["calculationTrace"]["resultHash"] == canonical["resultHash"]
        assert canonical["criticalPoints"]["points"]
        assert canonical["criticalPoints"]["bounded"] is True
        assert canonical["criticalPoints"]["truncated"] in {True, False}
        assert canonical["reviewPoints"]["systemPoints"]
        assert canonical["reviewPoints"]["points"]
        assert canonical["governingEnvelope"]["entries"]
        assert canonical["governingEnvelope"]["bounded"] is True
        assert canonical["governingEnvelope"]["truncated"] in {True, False}
        assert canonical["calculationSnapshot"]["resultHash"] == canonical["resultHash"]
        assert canonical["calculationSnapshot"]["evidenceHashes"]["calculationTrace"]
        assert canonical["calculationSnapshot"]["counts"]["criticalPoints"] == canonical["criticalPoints"]["pointCount"]
        assert adapted["resultHash"] == canonical["resultHash"]
        assert adapted["results"]["resultHash"] == canonical["resultHash"]
        assert adapted["calculationTrace"] == canonical["calculationTrace"]
        assert adapted["results"]["calculationTrace"] == canonical["calculationTrace"]
        assert adapted["criticalPoints"] == canonical["criticalPoints"]
        assert adapted["results"]["criticalPoints"] == canonical["criticalPoints"]
        assert adapted["reviewPoints"] == canonical["reviewPoints"]
        assert adapted["results"]["reviewPoints"] == canonical["reviewPoints"]
        assert adapted["governingEnvelope"] == canonical["governingEnvelope"]
        assert adapted["results"]["governingEnvelope"] == canonical["governingEnvelope"]
        assert adapted["calculationSnapshot"] == canonical["calculationSnapshot"]
        assert adapted["results"]["calculationSnapshot"] == canonical["calculationSnapshot"]


def test_all_analysis_types_expose_the_engineering_calculation_stages():
    required_stages = [
        "input_normalized",
        "dof_mapping",
        "element_process",
        "global_assembly",
        "boundary_reduction",
        "solver_diagnostics",
        "result_recovery",
        "equilibrium_check",
    ]
    for _, payload in _payloads():
        result = build_calculation_result(deepcopy(payload))
        stages = [stage["stage"] for stage in result["calculationTrace"]["stages"]]
        assert stages[: len(required_stages)] == required_stages
        for stage in result["calculationTrace"]["stages"]:
            assert stage["bounded"] is True
            assert stage["truncated"] is False


def test_user_review_points_resolve_for_beam_frame_and_truss():
    beam = _beam_payload()
    beam["reviewPoints"] = [{"id": "mid", "targetType": "station", "targetId": "beam", "station": 3.0}]
    frame = frame_payload()
    frame["reviewPoints"] = [
        {"id": "beam-mid", "targetType": "station", "targetId": "B1", "stationRatio": 0.5, "metricKey": "moment"}
    ]
    truss = truss_payload()
    truss["reviewPoints"] = [{"id": "node-n2", "targetType": "node", "targetId": "N2"}]

    payloads = (beam, frame, truss)
    results = [build_calculation_result(payload) for payload in payloads]
    resolved = [result["reviewPoints"] for result in results]
    assert [(item["requestedCount"], item["requestedPoints"][0]["metric"]) for item in resolved] == [
        (1, "deflection"),
        (1, "moment"),
        (1, "resultant"),
    ]
    assert all(item["requestedPoints"][0]["sourceType"] == "request" for item in resolved)
    assert [result["request"]["reviewPoints"] for result in results] == [
        payload["reviewPoints"] for payload in payloads
    ]


def test_invalid_review_station_is_rejected_instead_of_silently_clamped():
    payload = _beam_payload()
    payload["reviewPoints"] = [{"id": "outside", "targetType": "station", "station": 99.0}]
    with pytest.raises(ValueError, match="超出"):
        build_calculation_result(payload)


@pytest.mark.parametrize("review_points", [{"station": 1.0}, [None], [{}] * 33])
def test_review_point_collection_has_a_bounded_object_array_contract(review_points):
    payload = _beam_payload()
    payload["reviewPoints"] = review_points
    with pytest.raises(ValueError, match="reviewPoints"):
        build_calculation_result(payload)


def test_series_points_only_mark_real_jumps_and_do_not_interpolate_across_them():
    common = {
        "source_type": "main",
        "source_id": "primary",
        "object_type": "beam",
        "object_id": "beam",
        "metric": "shear",
        "unit": "kN",
        "request_hash": "request",
        "model_hash": "model",
        "result_hash": "result",
        "source_path": "$.series",
    }
    continuous = _series_points(stations=[0.0, 1.0, 1.0, 2.0], values=[0.0, 1.0, 1.0, -1.0], **common)
    discontinuous = _series_points(stations=[0.0, 1.0, 1.0, 2.0], values=[0.0, 1.0, -1.0, -2.0], **common)
    assert not [point for point in continuous if point["kind"] == "jump"]
    jumps = [point for point in discontinuous if point["kind"] == "jump"]
    assert [(point["station"], point["side"], point["value"]) for point in jumps] == [
        (1.0, "jump_left", 1.0),
        (1.0, "jump_right", -1.0),
    ]
    assert not [point for point in discontinuous if point["kind"] == "zero" and point.get("station") == 1.0]


def test_governing_envelope_keeps_full_location_provenance_and_correct_signs():
    result = build_calculation_result(frame_payload())
    envelope = result["governingEnvelope"]
    assert envelope["entryCount"] == len(envelope["entries"])
    assert envelope["displayEntryCount"] == len(envelope["displayEntries"])
    assert envelope["entryCount"] > envelope["displayEntryCount"]
    assert {entry["scope"] for entry in envelope["entries"]} == {"global", "location"}
    assert all(entry["value"] > 0.0 for entry in envelope["entries"] if entry["kind"] == "positive")
    assert all(entry["value"] < 0.0 for entry in envelope["entries"] if entry["kind"] == "negative")


def test_snapshot_diff_marks_zero_baseline_as_incomparable():
    diff = diff_calculation_snapshots({"summary": {"value": 0.0}}, {"summary": {"value": 2.0}})
    assert diff["changes"] == [
        {
            "path": "$.summary.value",
            "kind": "numeric",
            "left": 0.0,
            "right": 2.0,
            "absolute": 2.0,
            "relative": None,
            "incomparableReason": "zero_baseline",
        }
    ]
