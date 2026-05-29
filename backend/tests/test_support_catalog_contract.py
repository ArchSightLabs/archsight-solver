from __future__ import annotations

from backend.common.support_catalog import support_constraint_dofs, support_label, support_system_note
from backend.normalizers.beam.request_normalizer import normalize_beam_supports
from backend.normalizers.structural_model import FRAME_SUPPORT_LABELS, SUPPORT_DOF_MAP, TRUSS_SUPPORT_LABELS


def test_shared_support_catalog_drives_backend_labels_and_dofs() -> None:
    assert FRAME_SUPPORT_LABELS["fixed"] == "固结支座"
    assert TRUSS_SUPPORT_LABELS["roller"] == "滚动支座"
    assert SUPPORT_DOF_MAP["frame"]["fixed"] == ["ux", "uy", "rz"]
    assert SUPPORT_DOF_MAP["truss"]["roller"] == ["uy"]


def test_beam_support_defaults_use_shared_constraints() -> None:
    supports = normalize_beam_supports(None, beam_type="simply_supported", span_boundaries=[0.0, 6.0], total_length=6.0)

    assert supports[0]["type"] == "pinned"
    assert supports[0]["constraints"] == support_constraint_dofs("beam", "pinned")
    assert supports[1]["type"] == "roller"
    assert supports[1]["constraints"] == ["v"]
    assert support_label("beam", "fixed") == "固结支座"
    assert "整体刚度矩阵" in support_system_note("beam")
