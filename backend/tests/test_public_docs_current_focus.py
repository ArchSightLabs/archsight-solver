from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def _read_doc(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_public_docs_prioritize_professional_modeling_and_export_evidence():
    roadmap = _read_doc("docs/roadmap.md")
    capabilities = _read_doc("docs/capabilities.md")
    api_reference = _read_doc("docs/api-reference.md")

    assert "专业建模控制、计算书可信度和契约漂移治理" in roadmap
    assert "模板 / 基本 / 对象 / 文本 / 表格" in capabilities
    assert "材料编号用于保留工程语义" in capabilities
    assert "梁系为 v / θz，平面框架为 ux / uy / rz，平面桁架仅为 ux / uy 平动自由度" in capabilities
    assert "DOCX 图形导出链路提供 Chromium / Firefox / WebKit 三浏览器矩阵入口" in capabilities
    assert "shared/report-figures.json" in api_reference
    assert "npm --prefix frontend run test:visual:export-docx" in api_reference
