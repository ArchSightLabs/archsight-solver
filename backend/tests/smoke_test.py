import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import pytest

BASE_URL = "http://127.0.0.1:6240"


def _post_json(path, payload):
    request = Request(
        f"{BASE_URL}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=5) as response:
        return response.status, response.read().decode("utf-8")


def _assert_endpoint_ok(path, payload):
    try:
        status_code, body = _post_json(path, payload)
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        pytest.fail(f"{path} failed: {exc.code} {body}")
    except (OSError, TimeoutError, URLError) as exc:
        pytest.skip(f"本地后端服务未运行，跳过外部 smoke 测试: {exc}")

    assert status_code == 200, f"{path} failed: {status_code} {body}"


def test_api_health():
    print("Checking API endpoints...")

    # Test calculate (Beam)
    beam_payload = {
        "analysisType": "beam",
        "project_name": "Test Beam",
        "material_id": "q235",
        "beam_type": "continuous",
        "spans": [5.0, 5.0],
        "span_E_gpa": [210, 210],
        "span_I_cm4": [8000, 8000],
        "load_type": "uniform",
        "q_kn": 10.0,
        "freq": 1.0,
        "duration": 5.0,
        "point_position": 2.5,
        "point_load_kn": 0,
        "distributed_start_kn": 0,
        "distributed_end_kn": 0,
        "E_gpa": 210,
        "I_cm4": 8000
    }

    _assert_endpoint_ok("/api/calculate", beam_payload)
    print("/api/calculate (Beam) OK")

    _assert_endpoint_ok("/api/preview", beam_payload)
    print("/api/preview OK")

    sens_payload = {**beam_payload, "config": {"range": 20, "steps": 5}, "targetSpanIndex": 0}
    _assert_endpoint_ok("/api/sensitivity", sens_payload)
    print("/api/sensitivity OK")


if __name__ == "__main__":
    test_api_health()
    print("\nAll core API tests passed!")
