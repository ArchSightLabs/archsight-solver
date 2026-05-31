from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_beam_text_model_docs_explain_support_dof_override():
    text_model_doc = (ROOT / "docs" / "text-model-spec.md").read_text(encoding="utf-8")
    beam_serializer = (ROOT / "frontend" / "src" / "lib" / "beam-text-model.ts").read_text(encoding="utf-8")

    expected = [
        "SUPPORT,支座编号,x位置m,类型[,约束自由度]",
        "`SUPPORT` 第 5 列可显式覆盖支座自由度",
        "`v`、`rz`、`v+rz` 或 `-`",
        "`SPRING` 会把对应自由度从固定约束中释放",
        "SPRING,S2,rz,12000",
    ]

    for phrase in expected:
        assert phrase in text_model_doc

    assert "# SUPPORT,支座编号,x位置m,支座类型[,约束自由度]" in beam_serializer
    assert "约束自由度可写 v、rz、v+rz 或 -" in beam_serializer
