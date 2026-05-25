import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LOCAL_SPEC_CATALOG_PATH = ROOT / "specs" / "004-open-source-structure-solver" / "contracts" / "benchmark-cases.json"


PUBLIC_FALLBACK_CATALOG = {
    "schemaVersion": 1,
    "updatedAt": "2026-05-25",
    "cases": [
        {
            "id": "beam-simply-supported-uniform",
            "category": "beam",
            "title": "简支梁均布荷载",
            "purpose": "验证基础梁系求解、支座约束和挠度峰值位置。",
            "payload": {
                "beamType": "simply_supported",
                "loadType": "uniform",
                "q": 12,
                "E": 206,
                "I": 85000,
                "spans": [6],
                "projectName": "Benchmark Simply Uniform",
            },
            "expected": {"maxDeflectionMm": 1.1565, "maxDeflectionXM": 3, "supportCount": 2},
            "tolerances": {"maxDeflectionMm": 0.01, "maxDeflectionXM": 0.01},
            "verification": {
                "sourceType": "textbook-analytical",
                "reference": "材料力学简支梁全跨均布荷载经典解析解，delta_max = 5qL^4/(384EI)",
                "method": "按 GPa、kN/m、cm^4 单位换算后与解析最大挠度和峰值位置对标",
                "checkedMetrics": ["最大挠度", "峰值位置", "支座数量"],
            },
        },
        {
            "id": "frame-portal-benchmark",
            "category": "frame",
            "title": "门式刚架标准算例",
            "purpose": "验证二维框架刚度法、节点输出和整体位移控制。",
            "payload": {
                "analysisType": "frame",
                "projectName": "Benchmark Portal Frame",
                "materialId": "q345",
                "structure": {
                    "template": "portal_frame",
                    "span": 6,
                    "height": 4,
                    "left_support": "fixed",
                    "right_support": "fixed",
                    "beam_load_kn_per_m": 18,
                    "lateral_load_kn": 24,
                    "top_vertical_load_kn": 0,
                },
            },
            "expected": {
                "maxDisplacementMm": 3.8141,
                "maxMomentKnM": 58.1043,
                "statusCode": "PASS",
                "nodeCount": 4,
                "memberCount": 3,
            },
            "tolerances": {"maxDisplacementMm": 0.01, "maxMomentKnM": 0.01},
            "verification": {
                "sourceType": "independent-fea",
                "reference": "二维平面框架杆单元独立刚度法基线，门式刚架水平荷载与梁均布荷载组合工况",
                "method": "校验最大节点位移、构件弯矩和模型规模",
                "checkedMetrics": ["最大位移", "构件弯矩", "节点数量", "构件数量"],
            },
        },
        {
            "id": "truss-simple-roof",
            "category": "truss",
            "title": "简单屋架",
            "purpose": "验证二维平面桁架求解、支座反力和轴力峰值。",
            "payload": {
                "analysisType": "truss",
                "projectName": "Benchmark Simple Roof",
                "materialId": "q345",
                "structure": {
                    "template": "explicit",
                    "nodes": [
                        {"id": "N1", "x": 0, "y": 0, "supportType": "pinned"},
                        {"id": "N2", "x": 6, "y": 0, "supportType": "roller"},
                        {"id": "N3", "x": 2, "y": 3, "supportType": "free"},
                        {"id": "N4", "x": 4, "y": 3, "supportType": "free"},
                    ],
                    "members": [
                        {"id": "M1", "start": "N1", "end": "N3", "E_GPa": 210, "A_cm2": 24},
                        {"id": "M2", "start": "N3", "end": "N4", "E_GPa": 210, "A_cm2": 24},
                        {"id": "M3", "start": "N4", "end": "N2", "E_GPa": 210, "A_cm2": 24},
                        {"id": "M4", "start": "N3", "end": "N2", "E_GPa": 210, "A_cm2": 24},
                        {"id": "M5", "start": "N1", "end": "N4", "E_GPa": 210, "A_cm2": 24},
                    ],
                    "loads": [
                        {"type": "nodal", "node": "N3", "fxKn": 0, "fyKn": -50},
                        {"type": "nodal", "node": "N4", "fxKn": 0, "fyKn": -50},
                    ],
                },
            },
            "expected": {
                "statusCode": "PASS",
                "nodeCount": 4,
                "memberCount": 5,
                "maxDisplacementMm": 8.8209,
                "maxAxialForceKn": 133.3333,
                "maxDisplacementNodeId": "N2",
                "maxAxialForceMemberId": "M2",
            },
            "tolerances": {"maxDisplacementMm": 0.01, "maxAxialForceKn": 0.01},
            "verification": {
                "sourceType": "independent-fea",
                "reference": "二维平面桁架杆单元独立刚度法基线，四节点简单屋架竖向节点荷载工况",
                "method": "校验节点位移、杆件轴力和模型规模",
                "checkedMetrics": ["节点位移", "杆件轴力", "节点数量", "杆件数量"],
            },
        },
    ],
}


def load_benchmark_catalog():
    if LOCAL_SPEC_CATALOG_PATH.exists():
        with LOCAL_SPEC_CATALOG_PATH.open("r", encoding="utf-8") as f:
            return json.load(f)
    return PUBLIC_FALLBACK_CATALOG
