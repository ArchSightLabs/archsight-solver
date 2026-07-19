import pytest

from backend.exporters.common.result_source import validate_result_source


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
