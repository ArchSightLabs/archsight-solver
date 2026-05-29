from backend.common.report_options_catalog import default_report_options, legacy_report_options, report_option_values
from backend.contracts.openapi import build_openapi_document
from backend.exporters.common.report_options import normalize_report_options


def test_report_options_catalog_defines_modern_and_legacy_defaults():
    assert default_report_options() == {
        "template": "standard",
        "figureMode": "overlay",
        "figureScope": "control",
    }
    assert legacy_report_options() == {
        "template": "complete",
        "figureMode": "traditional",
        "figureScope": "all",
    }


def test_report_options_normalization_keeps_legacy_missing_payload_compatibility():
    assert normalize_report_options(None) == legacy_report_options()
    assert normalize_report_options({}) == default_report_options()
    assert normalize_report_options({"template": "bad", "figureMode": "bad", "figureScope": "bad"}) == default_report_options()


def test_openapi_report_options_schema_uses_shared_catalog():
    schema = build_openapi_document()["components"]["schemas"]["export-payload"]["properties"]["reportOptions"]["properties"]
    assert schema["template"]["enum"] == list(report_option_values("templates"))
    assert schema["template"]["default"] == default_report_options()["template"]
    assert schema["figureMode"]["enum"] == list(report_option_values("figureModes"))
    assert schema["figureMode"]["default"] == default_report_options()["figureMode"]
    assert schema["figureScope"]["enum"] == list(report_option_values("figureScopes"))
    assert schema["figureScope"]["default"] == default_report_options()["figureScope"]
