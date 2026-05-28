from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
README_PATH = ROOT / "README.md"


def test_benchmark_contract_document_matches_project_terms():
    readme_text = README_PATH.read_text(encoding="utf-8")
    source_text = "\n".join(
        [
            (ROOT / "backend" / "normalizers" / "beam" / "request_normalizer.py").read_text(encoding="utf-8"),
            (ROOT / "backend" / "normalizers" / "structural_model.py").read_text(encoding="utf-8"),
            (ROOT / "backend" / "normalizers" / "truss" / "request_normalizer.py").read_text(encoding="utf-8"),
            (ROOT / "backend" / "solver" / "beam" / "solver.py").read_text(encoding="utf-8"),
            (ROOT / "backend" / "solver" / "frame" / "solver.py").read_text(encoding="utf-8"),
        ]
    )

    assert "基准算例与错误契约" in readme_text

    expected_signatures = [
        "跨度必须大于 0",
        "跨度数量超出系统限制 (最大 300 跨)",
        "模拟时长超出系统限制 (最大 120s)",
        "梁模型刚度矩阵奇异，请检查支座与跨度设置",
        "节点 ID 重复",
        "构件 ID 重复",
        "起止节点无效",
        "节点荷载引用了不存在的节点",
        "构件荷载引用了不存在的构件",
        "约束条件过多，系统无自由度可求解",
        "框架刚度矩阵奇异，请检查支座与构件连接",
    ]

    for signature in expected_signatures:
        assert signature in source_text
