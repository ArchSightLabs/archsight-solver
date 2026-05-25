from flask import Blueprint, request, jsonify, send_file
import traceback
from backend.api.errors import ApiError, error_payload
from backend.exporters.common.artifact import ExportArtifact
from .utils import get_analysis_type, get_material_name
from backend.services.export_service import build_report_model, export_report

export_bp = Blueprint('export', __name__)


def _send_export_artifact(artifact: ExportArtifact):
    artifact.buffer.seek(0)
    return send_file(
        artifact.buffer,
        as_attachment=True,
        download_name=artifact.filename,
        mimetype=artifact.mimetype,
    )

@export_bp.route('/export', methods=['POST'])
def export():
    data = request.json or {}
    try:
        material_name = get_material_name(data.get('materialId'))
        analysis_type = get_analysis_type(data)
        format_type = data.get('format', 'xlsx')
        sensitivity_results = data.get('sensitivityResults') if isinstance(data.get('sensitivityResults'), dict) else None
        report_images = data.get('reportImages') if isinstance(data.get('reportImages'), dict) else None
        report_options = data.get('reportOptions') if isinstance(data.get('reportOptions'), dict) else None
        report = build_report_model(
            data,
            analysis_type=analysis_type,
            material_name=material_name,
            sensitivity_results=sensitivity_results,
            report_images=report_images,
            report_options=report_options,
        )
        return _send_export_artifact(export_report(report, str(format_type)))
    except ApiError as e:
        return jsonify(error_payload(e, operation='export', data=data)), e.status_code
    except ValueError as e:
        return jsonify(error_payload(e, operation='export', data=data)), 400
    except RuntimeError as e:
        return jsonify(error_payload(e, operation='export', data=data, code='COMMON_EXPORT_FAILED')), 500
    except Exception as e:
        traceback.print_exc()
        return jsonify(error_payload(f'导出失败: {str(e)}', operation='export', data=data, code='COMMON_INTERNAL_ERROR')), 400
