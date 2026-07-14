import argparse

import pytest

from scripts.run_host_iframe_demo import build_urls, validate_http_url


def _args(**overrides):
    values = {
        "solver_host": "127.0.0.1",
        "solver_port": 6241,
        "solver_url": None,
        "host_host": "127.0.0.1",
        "host_port": 6250,
    }
    values.update(overrides)
    return argparse.Namespace(**values)


def test_build_urls_keeps_solver_and_host_on_distinct_origins():
    solver_url, host_origin, host_url = build_urls(_args())

    assert solver_url == "http://127.0.0.1:6241"
    assert host_origin == "http://127.0.0.1:6250"
    assert host_url == "http://127.0.0.1:6250/?solverUrl=http%3A%2F%2F127.0.0.1%3A6241"


def test_validate_http_url_rejects_opaque_and_non_http_urls():
    with pytest.raises(ValueError):
        validate_http_url("file:///tmp/index.html", "Solver URL")
    with pytest.raises(ValueError):
        validate_http_url("not-a-url", "Solver URL")
