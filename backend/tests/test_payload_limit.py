import pytest
from app import create_app

@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

def test_payload_too_large(client):
    # 16 MB is the limit. Let's send 17 MB.
    # We can just send a string of 'a's that is 17 MB long.
    large_payload = "a" * (17 * 1024 * 1024)
    response = client.post("/api/jobs", data=large_payload, content_type="application/json")
    # Flask automatically returns 413 for oversized payloads
    assert response.status_code == 413
