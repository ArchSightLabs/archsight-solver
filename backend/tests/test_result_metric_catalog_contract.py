from __future__ import annotations

from backend.common.result_metric_catalog import default_sensitivity_metric, result_metric_label, sensitivity_response_meta


def test_shared_result_metric_catalog_preserves_analysis_specific_defaults() -> None:
    assert default_sensitivity_metric("beam") == "max_deflection"
    assert default_sensitivity_metric("frame") == "max_ux"
    assert default_sensitivity_metric("truss") == "max_node_displacement"


def test_shared_result_metric_catalog_preserves_truss_axial_vocabulary() -> None:
    truss_meta = sensitivity_response_meta("truss")

    assert truss_meta["max_member_axial"] == ("最大杆件轴力", "千牛")
    assert truss_meta["max_member_stress"] == ("最大杆件轴应力", "兆帕")
    assert result_metric_label("truss", "max_member_axial") == "最大杆件轴力"
