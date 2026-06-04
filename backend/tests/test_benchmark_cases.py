import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app
from backend.tests.benchmark_catalog import load_benchmark_catalog


BENCHMARK_CASES = load_benchmark_catalog()["cases"]


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


def test_benchmark_case_catalog_is_populated():
    assert len(BENCHMARK_CASES) >= 60


def test_benchmark_case_catalog_exposes_verification_levels():
    allowed_levels = {"A", "B", "C", "D"}
    for case in BENCHMARK_CASES:
        verification = case["verification"]
        assert verification["verificationLevel"] in allowed_levels
        assert verification["verificationLevelLabel"]
        assert verification["verificationLevelDescription"]
        assert verification["sourceType"]


def test_truss_unstable_benchmark_rejects_insufficient_constraints(client):
    payload = {
        "analysisType": "truss",
        "projectName": "桁架约束不足错误算例",
        "materialId": "q345",
        "structure": {
            "template": "explicit",
            "nodes": [
                {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "roller"},
                {"id": "N2", "x": 4.0, "y": 0.0, "supportType": "free"},
            ],
            "members": [
                {"id": "M1", "start": "N1", "end": "N2", "E_GPa": 200, "A_cm2": 20, "kind": "truss"},
            ],
            "loads": [
                {"type": "nodal", "node": "N2", "fxKn": 5.0, "fyKn": -10.0},
            ],
        },
    }

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 400
    assert response.get_json()["error"]["message"] == "桁架约束条件不足，系统无稳定自由度可求解"


@pytest.mark.parametrize("case", BENCHMARK_CASES, ids=lambda case: case["id"])
def test_benchmark_case_regressions(client, case):
    response = client.post("/api/calculate", json=case["payload"])
    assert response.status_code == 200

    data = response.get_json()
    expected = case["expected"]
    tolerances = case["tolerances"]

    if case["category"] == "beam":
        beam = data["beam"]
        assert beam["beamType"] == case["payload"]["beamType"]
        assert beam["loadType"] == case["payload"]["loadType"]
        assert len(beam["supports"]) == expected["supportCount"]
        assert beam["maxDeflection"]["valueMm"] == pytest.approx(
            expected["maxDeflectionMm"],
            abs=tolerances["maxDeflectionMm"],
        )
        assert beam["maxDeflection"]["xM"] == pytest.approx(
            expected["maxDeflectionXM"],
            abs=tolerances["maxDeflectionXM"],
        )
    elif case["category"] == "frame":
        summary = data["summary"]
        assert data["analysisType"] == "frame"
        assert len(data["nodeIds"]) == expected["nodeCount"]
        assert len(data["memberIds"]) == expected["memberCount"]
        assert summary["statusCode"] == expected["statusCode"]
        assert summary["maxDisplacementMm"] == pytest.approx(
            expected["maxDisplacementMm"],
            abs=tolerances["maxDisplacementMm"],
        )
        assert summary["maxMomentKnM"] == pytest.approx(
            expected["maxMomentKnM"],
            abs=tolerances["maxMomentKnM"],
        )
    elif case["category"] == "truss":
        summary = data["summary"]
        assert data["analysisType"] == "truss"
        assert len(data["nodeIds"]) == expected["nodeCount"]
        assert len(data["memberIds"]) == expected["memberCount"]
        assert summary["statusCode"] == expected["statusCode"]
        assert summary["maxDisplacementMm"] == pytest.approx(
            expected["maxDisplacementMm"],
            abs=tolerances["maxDisplacementMm"],
        )
        assert summary["maxAxialForceKn"] == pytest.approx(
            expected["maxAxialForceKn"],
            abs=tolerances["maxAxialForceKn"],
        )
        assert summary["maxDisplacementNodeId"] == expected["maxDisplacementNodeId"]
        assert summary["maxAxialForceMemberId"] == expected["maxAxialForceMemberId"]
    elif case["category"] == "frame-beam-verify":
        # 通用力学验证分支：支持教材解析解对标
        # 当前案例：BM-001（简支梁集中荷载）、BM-003（超静定固端-滚动梁均布荷载）
        assert data["analysisType"] == "frame"
        assert len(data["nodeIds"]) == expected["nodeCount"]
        assert len(data["memberIds"]) == expected["memberCount"]

        node_by_id = {item["nodeId"]: item for item in data["nodeResults"]}

        # ① 支座反力验证（优先使用 supportReactions 列表；兼容旧式 reactionFyKn_node* 字段）
        if "supportReactions" in expected:
            for rxn in expected["supportReactions"]:
                nid = rxn["nodeId"]
                assert node_by_id[nid]["reactionFyKn"] == pytest.approx(
                    rxn["reactionFyKn"],
                    abs=tolerances["reactionFyKn"],
                ), f"{nid} 支座竖向反力应为 {rxn['reactionFyKn']} kN"
        else:
            # 向后兼容：BM-001 旧格式（按节点顺序索引）
            node_ids = list(node_by_id.keys())
            n_first, n_last = node_ids[0], node_ids[-1]
            assert node_by_id[n_first]["reactionFyKn"] == pytest.approx(
                expected["reactionFyKn_node0"], abs=tolerances["reactionFyKn"]
            ), f"首节点支座竖向反力应为 {expected['reactionFyKn_node0']} kN"
            assert node_by_id[n_last]["reactionFyKn"] == pytest.approx(
                expected["reactionFyKn_node2"], abs=tolerances["reactionFyKn"]
            ), f"末节点支座竖向反力应为 {expected['reactionFyKn_node2']} kN"

        # ② 跨中位移验证（可选：仅当 expected 包含 midSpanDisplacementMm 时执行）
        # 对应 BM-001（三节点模型，N2 为跨中节点）；BM-003 无独立跨中节点故不检查
        if "midSpanDisplacementMm" in expected:
            node_ids = list(node_by_id.keys())
            n_mid = node_ids[1]   # 三节点模型中间节点即跨中
            assert node_by_id[n_mid]["uyMm"] == pytest.approx(
                expected["midSpanDisplacementMm"],
                abs=tolerances["midSpanDisplacementMm"],
            ), f"跨中挠度应为 {expected['midSpanDisplacementMm']} mm"

        # ③ 最大弯矩验证（所有 frame-beam-verify 案例必须通过）
        summary = data["summary"]
        assert summary["maxMomentKnM"] == pytest.approx(
            expected["maxMomentKnM"],
            abs=tolerances["maxMomentKnM"],
        ), f"最大弯矩应为 {expected['maxMomentKnM']} kN·m"
    elif case["category"] == "truss-verify":
        # 桁架力学验证分支：支持杆件轴力（拉/压）与节点位移详细校验
        # 对应 BM-002（对称平面桁架）
        summary = data["summary"]
        assert data["analysisType"] == "truss"
        assert len(data["nodeIds"]) == expected["nodeCount"]
        assert len(data["memberIds"]) == expected["memberCount"]
        assert summary["statusCode"] == expected["statusCode"]

        # ① 整体结论校验
        assert summary["maxDisplacementMm"] == pytest.approx(
            expected["maxDisplacementMm"], abs=tolerances["maxDisplacementMm"]
        )
        assert summary["maxAxialForceKn"] == pytest.approx(
            expected["maxAxialForceKn"], abs=tolerances["maxAxialForceKn"]
        )
        assert summary["maxDisplacementNodeId"] == expected["maxDisplacementNodeId"]
        assert summary["maxAxialForceMemberId"] == expected["maxAxialForceMemberId"]

        # ② 逐节点位移校验（可选，ux/uy 单位为 mm）
        node_results = {item["nodeId"]: item for item in data["nodeResults"]}
        for exp_node in expected.get("nodeDisplacements", []):
            nid = exp_node["nodeId"]
            res = node_results[nid]
            if "uxMm" in exp_node:
                assert res["uxMm"] == pytest.approx(
                    exp_node["uxMm"], abs=tolerances["nodeDisplacementMm"]
                ), f"节点 {nid} 水平位移不符"
            if "uyMm" in exp_node:
                assert res["uyMm"] == pytest.approx(
                    exp_node["uyMm"], abs=tolerances["nodeDisplacementMm"]
                ), f"节点 {nid} 竖向位移不符"

        # ③ 逐杆轴力校验 (拉为正，压为负；truss_workbench 输出 axialForceKn)
        member_results = {item["memberId"]: item for item in data["memberResults"]}
        for exp_member in expected.get("memberAxialForces", []):
            mid = exp_member["memberId"]
            res = member_results[mid]
            assert res["axialForceKn"] == pytest.approx(
                exp_member["axialForceKn"], abs=tolerances["memberAxialForceKn"]
            ), f"构件 {mid} 轴力不符"
            assert res["forceState"] == exp_member["forceState"], f"构件 {mid} 受力状态不符"

        # ④ 支座反力校验 (rxKn, ryKn)
        for exp_rxn in expected.get("supportReactions", []):
            nid = exp_rxn["nodeId"]
            res = node_results[nid]
            if "rxKn" in exp_rxn:
                assert res["rxKn"] == pytest.approx(exp_rxn["rxKn"], abs=tolerances["reactionKn"]), f"节点 {nid} X向反力不符"
            if "ryKn" in exp_rxn:
                assert res["ryKn"] == pytest.approx(exp_rxn["ryKn"], abs=tolerances["reactionKn"]), f"节点 {nid} Y向反力不符"

    else:
        raise AssertionError(f"Unsupported benchmark category: {case['category']}")
