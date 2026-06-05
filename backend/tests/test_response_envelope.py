from backend.api.response_envelope import attach_unified_envelope, _stable_hash


def test_stable_hash_ignores_key_order():
    dict1 = {"a": 1, "b": 2, "c": {"d": 3, "e": 4}}
    dict2 = {"b": 2, "a": 1, "c": {"e": 4, "d": 3}}
    assert _stable_hash(dict1) == _stable_hash(dict2)


def test_stable_hash_different_values():
    dict1 = {"a": 1}
    dict2 = {"a": 2}
    assert _stable_hash(dict1) != _stable_hash(dict2)


def test_attach_unified_envelope_includes_hashes():
    response = {}
    request_echo = {"q": 10, "L": 5}
    structure_model = {"nodes": [], "members": []}

    result = attach_unified_envelope(
        response=response,
        analysis_type="beam",
        request_echo=request_echo,
        structure_model=structure_model,
        operation="calculate",
    )

    meta = result.get("meta", {})
    assert "requestHash" in meta
    assert "modelHash" in meta
    assert meta["requestHash"] == _stable_hash(request_echo)
    assert meta["modelHash"] == _stable_hash(structure_model)
