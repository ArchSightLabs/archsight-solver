from __future__ import annotations

from backend.api.analysis_types import get_material_name
from backend.common.material_catalog import material_catalog_by_id, material_report_rows
from backend.exporters.common.member_materials import member_elasticity_summary


def test_shared_material_catalog_preserves_engineering_names() -> None:
    catalog = material_catalog_by_id()

    assert catalog["q345"].name == "Q345 低合金高强度结构钢"
    assert catalog["q345"].young_modulus_gpa == 210.0
    assert catalog["q345"].density_kg_per_m3 == 7850.0
    assert "规范设计" in catalog["q345"].note


def test_api_material_name_uses_shared_catalog_and_keeps_unknown_fallback() -> None:
    assert get_material_name("c40") == "C40 混凝土"
    assert get_material_name("steel-verify") == "自定义材料"


def test_material_report_rows_explain_calculation_scope() -> None:
    rows = material_report_rows("q345", include_name=True)
    text = "\n".join(f"{key}: {value}" for key, value in rows)

    assert "材料名称: Q345 低合金高强度结构钢" in text
    assert "材料库弹性模量 E (GPa): 210.0" in text
    assert "规范设计" in text

    unknown_rows = material_report_rows("steel-verify")
    assert any(row == ["材料库状态", "未命中共享材料库"] for row in unknown_rows)


def test_member_elasticity_summary_uses_explicit_member_material_ids() -> None:
    summary = member_elasticity_summary(
        [
            {"id": "M1", "materialId": "q235", "E_GPa": 206},
            {"id": "M2", "materialId": "custom", "E_GPa": 198.5},
            {"id": "M3", "E_GPa": 210},
        ],
        "杆件",
    )

    assert "Q235 · E=206 GPa：1 个杆件" in summary
    assert "E=198.5 GPa：1 个杆件" in summary
    assert "E=210 GPa：1 个杆件" in summary
