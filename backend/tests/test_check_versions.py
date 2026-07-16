from scripts.check_versions import _first_release_from_text


def test_first_release_parses_formal_release_date():
    assert _first_release_from_text("## v1.6.1\n\n发布时间：2026-07-16\n") == (
        "1.6.1",
        "发布时间",
        "2026-07-16",
    )


def test_first_release_parses_release_candidate_state():
    assert _first_release_from_text(
        "## v1.6.1\n\n状态：发布候选（尚未创建 tag）\n"
    ) == (
        "1.6.1",
        "状态",
        "发布候选（尚未创建 tag）",
    )
