from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[2]


def _read_doc(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_public_docs_prioritize_professional_modeling_and_export_evidence():
    roadmap = _read_doc("docs/roadmap.md")
    capabilities = _read_doc("docs/capabilities.md")
    api_reference = _read_doc("docs/api-reference.md")
    contributing = _read_doc("CONTRIBUTING.md")

    assert "专业建模控制、计算书可信度和契约漂移治理" in roadmap
    assert "模板 / 基本 / 对象 / 文本 / 表格" in capabilities
    assert "材料编号用于保留工程语义" in capabilities
    assert "梁系为 v / θz，平面桁架仅为 ux / uy 平动自由度，平面框架为 ux / uy / rz" in capabilities
    assert "DOCX 图形导出链路提供 Chromium / Firefox / WebKit 三浏览器矩阵入口" in capabilities
    assert "shared/report-figures.json" in api_reference
    assert "npm --prefix frontend run test:visual:export-docx" in api_reference
    assert "shared/asms-contract-fields.json" in roadmap
    assert "data/verification/template_benchmark_map.json" in roadmap
    assert "shared/report-figures.json" in roadmap
    assert "不要只改 UI、API 或导出中的单一入口" in contributing


def _release_date(markdown: str, version: str) -> str:
    match = re.search(rf"## {re.escape(version)}\s+发布时间：(\d{{4}}-\d{{2}}-\d{{2}})", markdown)
    assert match is not None, f"未找到 {version} 发布时间"
    return match.group(1)


def test_v130_release_notes_are_current_and_synced():
    changelog = _read_doc("CHANGELOG.md")
    release_markdown = _read_doc("frontend/public/docs/release-notes.md")
    release_html = _read_doc("frontend/public/docs/release-notes.html")

    assert _release_date(changelog, "v1.3.0") == "2026-06-02"
    assert _release_date(release_markdown, "v1.3.0") == _release_date(changelog, "v1.3.0")
    assert "发布时间：2026-06-02" in release_html
    assert "BM-006" in changelog
    assert "BM-006" in release_markdown


def test_v161_host_reference_has_bounded_product_acceptance_and_protocol_lifecycle():
    readme = _read_doc("README.md")
    roadmap = _read_doc("docs/roadmap.md")
    acceptance = _read_doc("docs/verification/release-1-6-1-acceptance.md")
    host_reference = _read_doc("examples/host-iframe-demo/README.md")
    agent_integration = _read_doc("docs/agent-integration.md")
    changelog = _read_doc("CHANGELOG.md")

    assert "前端接入开发者" in readme
    assert "不依赖 `archsight-solver-platform` 或其他外部项目完成验收" in readme
    assert "加载、修改、保存、刷新重开和只读审阅" in roadmap
    assert "本仓库内置的 Reference Host" in roadmap
    assert "不以第三方团队数量、陌生工程师接入耗时或商业试点作为发布门槛" in acceptance
    assert "验收不依赖 `archsight-solver-platform` 或其他外部项目" in acceptance
    assert "基础 DEMO 只需验证" in host_reference
    assert "### Host Protocol 生命周期" in agent_integration
    assert "当前实现只接受精确的 `1.0.0`" in agent_integration
    assert "发布时间：2026-07-16" in changelog
