import pytest

from backend.exporters.common.result_source import project_last_converged_nonlinear_result, project_result_source, validate_result_source


def test_result_source_accepts_primary_and_existing_case_or_combination():
    solution = {
        "loadCaseResults": [{"id": "DL"}],
        "loadCombinationResults": [{"id": "ULS1"}],
    }

    validate_result_source({**solution, "resultSource": {"source": "primary", "id": "__primary__"}})
    validate_result_source({**solution, "resultSource": {"source": "case", "id": "DL"}})
    validate_result_source({**solution, "resultSource": {"source": "combination", "id": "ULS1"}})


@pytest.mark.parametrize(
    ("source", "source_id"),
    [("case", "MISSING"), ("combination", "MISSING"), ("unknown", "X")],
)
def test_result_source_rejects_unknown_or_missing_result(source, source_id):
    with pytest.raises(ValueError, match="结果来源"):
        validate_result_source({
            "resultSource": {"source": source, "id": source_id},
            "loadCaseResults": [{"id": "DL"}],
            "loadCombinationResults": [{"id": "ULS1"}],
        })


def test_result_source_projection_replaces_all_result_dependent_facts_and_preserves_catalogs():
    primary = {
        "summary": {"maxDisplacementMm": 2.0},
        "nodeResults": [{"nodeId": "N2", "uxMm": 2.0}],
        "memberResults": [{"memberId": "M1", "axialStartKn": 1.0}],
        "ux_data": [999.0],
        "secondOrder": {"maxDisplacementMm": 3.0},
        "buckling": {"criticalLoadFactor": 8.0},
        "results": {
            "summary": {"maxDisplacementMm": 2.0},
            "nodeResults": [{"nodeId": "PRIMARY", "uxMm": 999.0}],
            "diagram": {"loads": [{"fxKn": 999.0}]},
        },
        "loadCaseResults": [{"id": "DL", "summary": {"maxDisplacementMm": 5.0}}],
        "loadCombinationResults": [
            {
                "id": "ULS1",
                "title": "基本组合",
                "factors": {"DL": 1.2},
                "summary": {"maxDisplacementMm": 20.0, "maxDeflectionMm": 19.5},
                "nodeResults": [{"nodeId": "N2", "uxMm": 20.0}],
                "memberResults": [{"memberId": "M1", "axialStartKn": 10.0}],
                "secondOrder": {"maxDisplacementMm": 28.0},
                "buckling": {"criticalLoadFactor": 2.5},
                "inputSnapshot": {
                    "structure": {"loads": [{"type": "nodal", "node": "N2", "fxKn": 10.0}]},
                    "payload": {"structure": {"loads": [{"type": "nodal", "node": "N2", "fxKn": 10.0}]}},
                },
            }
        ],
        "resultSource": {"source": "combination", "id": "ULS1"},
    }

    projected = project_result_source(primary)

    assert projected["summary"]["maxDisplacementMm"] == 20.0
    assert projected["nodeResults"][0]["uxMm"] == 20.0
    assert projected["memberResults"][0]["axialStartKn"] == 10.0
    assert projected["secondOrder"]["maxDisplacementMm"] == 28.0
    assert projected["buckling"]["criticalLoadFactor"] == 2.5
    assert projected["structure"]["loads"][0]["fxKn"] == 10.0
    assert projected["payload"]["structure"]["loads"][0]["fxKn"] == 10.0
    assert projected["max_deflection_mm"] == 19.5
    assert projected["results"]["summary"]["maxDisplacementMm"] == 20.0
    assert projected["results"]["nodeResults"][0]["nodeId"] == "N2"
    assert "diagram" not in projected["results"]
    assert "ux_data" not in projected
    assert projected["loadCombinationResults"] == primary["loadCombinationResults"]
    assert projected["selectedResult"]["factors"] == {"DL": 1.2}
    assert primary["summary"]["maxDisplacementMm"] == 2.0


def test_result_source_projection_fails_closed_without_selected_input_snapshot():
    with pytest.raises(ValueError, match="缺少输入快照"):
        project_result_source(
            {
                "structure": {"loads": [{"type": "nodal", "node": "N2", "fxKn": 1.0}]},
                "loadCaseResults": [{"id": "C10", "summary": {"maxDisplacementMm": 10.0}}],
                "loadCombinationResults": [],
                "resultSource": {"source": "case", "id": "C10"},
            }
        )


def test_partial_nonlinear_projection_uses_last_converged_state_without_hiding_failure():
    solution = {
        "summary": {"maxDisplacementMm": 1.0},
        "nodeResults": [{"nodeId": "N2", "uxMm": 1.0}],
        "secondOrder": {
            "status": "not_converged",
            "failureCode": "GNA_MINIMUM_STEP_EXHAUSTED",
            "terminationReason": "minimum_step_exhausted",
            "lastConverged": {"loadFactor": 0.6},
            "lastConvergedSolution": {
                "summary": {"maxDisplacementMm": 8.0},
                "nodeResults": [{"nodeId": "N2", "uxMm": 8.0}],
            },
        },
    }

    projected = project_last_converged_nonlinear_result(solution)

    assert projected["summary"]["maxDisplacementMm"] == 8.0
    assert projected["nodeResults"][0]["uxMm"] == 8.0
    assert projected["secondOrder"]["status"] == "not_converged"
    assert projected["partialResultSource"]["failureCode"] == "GNA_MINIMUM_STEP_EXHAUSTED"
