"""
Test suite for: Feature Specification: Calculation Report Generation
Auto-generated from spec. 4 acceptance criteria, 0 edge cases.

All tests are stubs — implement the test body to make them pass.
"""

import pytest
import io
import pandas as pd
import sys
import os

# Ensure the root directory is in sys.path to find 'app.py' correctly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

try:
    from app import app
except ImportError:
    # If the above fails, try importing directly from the file
    import importlib.util
    spec = importlib.util.spec_from_file_location("app", os.path.abspath(os.path.join(os.path.dirname(__file__), "../../app.py")))
    app_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(app_module)
    app = app_module.app

class TestFeatureSpecificationCalculationReportGeneration:
    """Tests for Feature Specification: Calculation Report Generation."""

    @pytest.fixture
    def client(self):
        app.config['TESTING'] = True
        return app.test_client()

    def test_ac1_multi_sheet_structure(self, client):
        """AC-1: Multi-Sheet Structure [FR-1, FR-4, NFR-2]"""
        payload = {
            "q": 1, "E": 206, "I": 0.00001, "spans": [4, 4],
            "freq": 1.0, "duration": 5.0, "materialId": "q345",
            "projectName": "Test Project"
        }
        response = client.post('/api/export', json=payload)
        assert response.status_code == 200
        
        # Load excel from binary response
        excel_data = io.BytesIO(response.data)
        with pd.ExcelFile(excel_data) as xls:
            assert xls.sheet_names == [
                '01_复核总览',
                '02_输入模型',
                '03_单位换算',
                '04_边界条件',
                '05_校核证据',
                '06_结果明细',
                '99_原始数据',
            ]

    def test_ac2_parameter_logging(self, client):
        """AC-2: Parameter Logging [FR-2, NFR-2]"""
        payload = {
            "q": 1, "E": 206, "I": 0.00001, "spans": [4, 4],
            "freq": 1.0, "duration": 5.0, "materialId": "q345",
            "projectName": "Localized UI Test"
        }
        response = client.post('/api/export', json=payload)
        assert response.status_code == 200
        
        excel_data = io.BytesIO(response.data)
        df_params = pd.read_excel(excel_data, sheet_name='02_输入模型', header=None)
        
        assert '参数记录' in df_params.to_string()
        assert 'Q345 低合金高强度结构钢' in df_params.to_string()

    def test_ac3_calculate_preview_data(self, client):
        """AC-3: Preview Data Shape [FR-3, FR-5, FR-6]"""
        payload = {
            "beamType": "continuous",
            "loadType": "uniform",
            "q": 1,
            "E": 206,
            "I": 0.00001,
            "spans": [4, 4],
            "materialId": "q345"
        }
        response = client.post('/api/calculate', json=payload)
        assert response.status_code == 200
        data = response.get_json()
        assert 'preview' in data
        assert 'diagram' in data
        assert 'beam' in data

        beam = data['beam']
        assert beam['beamType'] == 'continuous'
        assert beam['loadType'] == 'uniform'
        assert len(beam['supports']) >= 2
        assert len(beam['loads']) >= 1
        assert len(beam['curve']) > 0
        assert 'maxDeflection' in beam
        assert beam['maxDeflection']['valueMm'] != 0
        assert beam['maxDeflection']['spanIndex'] >= 0

    def test_ac4_error_handling(self, client):
        """AC-4: Error Handling [NFR-1]"""
        # Invalid payload (missing spans)
        payload = {"q": 1}
        response = client.post('/api/export', json=payload)
        assert response.status_code == 400
        assert "error" in response.get_json()
