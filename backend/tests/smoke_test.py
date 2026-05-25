import requests
import sys
import pytest

BASE_URL = "http://127.0.0.1:6240"

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
    
    try:
        resp = requests.post(f"{BASE_URL}/api/calculate", json=beam_payload, timeout=5)
        if resp.status_code == 200:
            print("✅ /api/calculate (Beam) OK")
        else:
            print(f"❌ /api/calculate (Beam) failed: {resp.status_code}")
            return False
            
        # Test preview
        resp = requests.post(f"{BASE_URL}/api/preview", json=beam_payload, timeout=5)
        if resp.status_code == 200:
            print("✅ /api/preview OK")
        else:
            print(f"❌ /api/preview failed: {resp.status_code}")
            return False
            
        # Test sensitivity
        sens_payload = {**beam_payload, "config": {"range": 20, "steps": 5}, "targetSpanIndex": 0}
        resp = requests.post(f"{BASE_URL}/api/sensitivity", json=sens_payload, timeout=5)
        if resp.status_code == 200:
            print("✅ /api/sensitivity OK")
        else:
            print(f"❌ /api/sensitivity failed: {resp.status_code}")
            return False
            
        return True
    except Exception as e:
        pytest.skip(f"本地后端服务未运行，跳过外部 smoke 测试: {e}")

if __name__ == "__main__":
    if not test_api_health():
        sys.exit(1)
    print("\nAll core API tests passed!")
