from pathlib import Path
from collections import Counter
import json
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


def test_public_quickstart_is_reproducible_from_a_fresh_clone():
    readme = _read_doc("README.md")
    quickstart = _read_doc("docs/quickstart.md")

    for document in (readme, quickstart):
        assert "Python `>=3.13`" in document
        assert "Node.js `>=22.22.0`" in document
        assert "uv sync --frozen" in document
        assert "npm --prefix frontend ci --include=optional" in document
        assert "uv run python app.py" in document

    assert "git clone https://github.com/ArchSightLabs/archsight-solver.git" in readme
    assert "uv run python -m pytest backend/tests -q" in quickstart

    repository_usage_docs = (
        readme,
        quickstart,
        _read_doc("CONTRIBUTING.md"),
        _read_doc("docs/agent-integration.md"),
        _read_doc("docs/agent-engineering-workflow.md"),
        _read_doc("examples/host-iframe-demo/README.md"),
    )
    for document in repository_usage_docs:
        assert "python -m backend." not in document.replace("uv run python -m backend.", "")
        assert "python scripts/run_host_iframe_demo.py" not in document.replace(
            "uv run python scripts/run_host_iframe_demo.py", ""
        )


def test_public_roadmap_tracks_current_benchmark_catalog_counts():
    roadmap = _read_doc("docs/roadmap.md")
    catalog = json.loads(_read_doc("backend/benchmarks/benchmark_cases.json"))
    categories = Counter(case["category"] for case in catalog["cases"])
    beam_count = categories["beam"]
    frame_count = categories["frame"] + categories["frame-beam-verify"]
    nonlinear_frame_count = categories["frame-nonlinear-verify"]
    truss_count = categories["truss"] + categories["truss-verify"]

    assert f"公开验证集包含 {len(catalog['cases'])} 个通过算例" in roadmap
    assert f"| 梁系 | {beam_count} |" in roadmap
    assert f"| 二维平面桁架 | {truss_count} |" in roadmap
    assert f"| 二维平面框架 | {frame_count} |" in roadmap
    assert f"| 二维框架弹性几何非线性 | {nonlinear_frame_count} |" in roadmap


def test_learning_docs_describe_current_three_module_load_case_ui():
    learning = _read_doc("docs/learning/load-cases-and-combinations.md")

    assert "三类模块当前均已具备工况与组合的可视化编辑" in learning
    assert "三类模块可在 UI 中维护工况/组合、切换结果来源" in learning
    assert "梁系和平面桁架仍需要补齐 UI" not in learning
    assert "梁系和二维平面桁架的多工况 UI 属于后续补齐项" not in learning


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


def test_v170_bilingual_entry_and_golden_flows_share_one_verification_contract():
    readme_zh = _read_doc("README.md")
    readme_en = _read_doc("README.en.md")
    quickstart_zh = _read_doc("docs/quickstart.md")
    quickstart_en = _read_doc("docs/en/quickstart.md")
    capabilities_zh = _read_doc("docs/capabilities.md")
    capabilities_en = _read_doc("docs/en/capabilities.md")
    verification_zh = _read_doc("docs/verification-package.md")
    verification_en = _read_doc("docs/en/verification-package.md")
    golden_flows = _read_doc("docs/golden-flows.md")

    assert "[English](README.en.md)" in readme_zh
    assert "[中文](README.md)" in readme_en
    assert "[English](en/quickstart.md)" in quickstart_zh
    assert "[中文快速开始](../quickstart.md)" in quickstart_en
    assert "[English](en/capabilities.md)" in capabilities_zh
    assert "[中文](../capabilities.md)" in capabilities_en

    for document in (readme_zh, readme_en, capabilities_zh, capabilities_en):
        assert "beam" in document.lower() or "梁系" in document
        assert "truss" in document.lower() or "平面桁架" in document
        assert "frame" in document.lower() or "平面框架" in document
    for document in (readme_en, capabilities_en):
        assert "linear-elastic" in document.lower()
        assert "3D" in document
        assert "P-Delta" in document
        assert "linear eigenvalue buckling" in document
        assert "engineering sign-off" in document

    for document in (verification_zh, verification_en):
        assert "archsight-solver-verification-package@1.0.0" in document
        assert "POST /api/verification-packages" in document
        assert "verification_package_create" in document
        assert "verification_package_verify" in document
        assert "1e-8" in document
        assert "1e-6" in document
        assert "digital signature" in document.lower() or "数字签名" in document

    assert "archsight_solver-1.8.1-py3-none-any.whl" in quickstart_en
    assert "archsight-solver-tool verification_package_create" in quickstart_en
    assert "archsight-solver-mcp" in quickstart_en
    assert "public Release archive is the direct container distribution path" in quickstart_en
    assert "docker login ghcr.io" in quickstart_en
    assert "ghcr.io/archsightlabs/archsight-solver:v1.8.1" in quickstart_en
    assert "Alibaba Cloud Container Registry" in quickstart_en
    assert "Host Client" in quickstart_en
    example_request = json.loads(_read_doc("examples/verification-package/create-request.json"))
    assert example_request["payload"]["analysisType"] == "beam"
    assert example_request["evidence"]["source"] == "five-minute-quickstart"

    assert "流程 A：结构工程师" in golden_flows
    assert "流程 B：教师或学习者" in golden_flows
    assert "流程 C：开发者" in golden_flows
    assert "不要求招募外部试用者" in golden_flows
    assert "不要求第三方系统完成接入" in golden_flows


def test_v170_new_public_document_links_resolve_inside_repository():
    document_paths = (
        "README.md",
        "README.en.md",
        "docs/quickstart.md",
        "docs/capabilities.md",
        "docs/verification-package.md",
        "docs/golden-flows.md",
        "docs/en/quickstart.md",
        "docs/en/capabilities.md",
        "docs/en/verification-package.md",
        "docs/release-governance.md",
    )
    for path in document_paths:
        document_path = ROOT / path
        for raw_target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", _read_doc(path)):
            target = raw_target.split("#", 1)[0]
            if not target or target.startswith(("http://", "https://", "mailto:")):
                continue
            resolved = (document_path.parent / target).resolve()
            assert resolved.is_file(), f"{path} 包含失效本地链接: {raw_target}"


def test_release_governance_blocks_back_to_back_minor_releases():
    governance = _read_doc("docs/release-governance.md")

    assert "不少于 24 小时" in governance
    assert "同一天不得连续发布两个稳定次版本" in governance
    assert "维护者明确说出要发布的版本号" in governance
    assert "不超过五条重点" in governance


def test_published_acceptance_records_do_not_look_pending():
    acceptance_paths = (
        "docs/verification/release-1-5-acceptance.md",
        "docs/verification/release-1-6-acceptance.md",
        "docs/verification/release-1-6-1-acceptance.md",
        "docs/verification/release-1-6-2-acceptance.md",
        "docs/verification/release-1-6-3-acceptance.md",
        "docs/verification/release-1-7-acceptance.md",
        "docs/verification/release-1-8-acceptance.md",
    )

    for path in acceptance_paths:
        acceptance = _read_doc(path)
        assert "> 发布状态：已发布" in acceptance
        assert "- [ ]" not in acceptance

    v170_acceptance = _read_doc("docs/verification/release-1-7-acceptance.md")
    assert "重新规划的正式 `v1.8.0` 后于 2026-08-23 独立发布" in v170_acceptance
    assert "latest 为合并后的 `v1.7.0`" not in v170_acceptance


def test_v170_quickstarts_and_golden_flows_are_published_as_online_pages():
    changelog = _read_doc("CHANGELOG.md")
    release_html = _read_doc("frontend/public/docs/release-notes.html")
    quickstart_zh_html = _read_doc("frontend/public/docs/quickstart.html")
    quickstart_en_html = _read_doc("frontend/public/docs/quickstart.en.html")
    golden_flows_html = _read_doc("frontend/public/docs/golden-flows.html")

    assert "https://solver.archsight.cn/docs/quickstart.html" in changelog
    assert "https://solver.archsight.cn/docs/golden-flows.html" in changelog
    assert 'href="https://solver.archsight.cn/docs/quickstart.html"' in release_html
    assert 'href="https://solver.archsight.cn/docs/golden-flows.html"' in release_html

    assert "GitHub Release 五分钟路径" in quickstart_zh_html
    assert 'href="/docs/quickstart.en.html"' in quickstart_zh_html
    assert "Five-minute quickstart" in quickstart_en_html
    assert 'href="/docs/quickstart.html"' in quickstart_en_html
    assert "流程 A：结构工程师携带并复核一次计算" in golden_flows_html
    assert "流程 C：开发者五分钟创建并验证计算包" in golden_flows_html
    assert 'href="/docs/quickstart.en.html"' in golden_flows_html
