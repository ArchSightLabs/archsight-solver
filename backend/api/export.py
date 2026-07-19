from flask import Blueprint, request, jsonify, send_file
import traceback
from backend.api.errors import ApiError, error_payload
from backend.exporters.common.artifact import ExportArtifact
from backend.api.analysis_types import get_analysis_type, get_material_name
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
        job_id = data.get('jobId')
        precomputed_solution = None
        if job_id:
            from backend.services.job_store import load_job
            job = load_job(job_id)
            if not job:
                raise ApiError(f"未找到指定的作业: {job_id}", code='COMMON_JOB_NOT_FOUND', status_code=404)
            if job.get('status') != 'succeeded':
                raise ApiError(f"指定作业未成功完成，无法导出，状态：{job.get('status')}", code='COMMON_JOB_NOT_READY', status_code=400)
            if job.get('operation') != 'calculate':
                raise ApiError(f"只支持计算类型的作业导出，当前为：{job.get('operation')}", code='COMMON_INVALID_JOB_OPERATION', status_code=400)
            precomputed_solution = job.get('result')
            if precomputed_solution and 'solution' in precomputed_solution:
                precomputed_solution = precomputed_solution['solution']
            job_payload = dict(job.get('payload', {}))
            job_payload.update({
                'format': data.get('format', 'xlsx'),
                'reportOptions': data.get('reportOptions'),
                'reportImages': data.get('reportImages'),
                'sensitivityResults': data.get('sensitivityResults'),
                'benchmark': data.get('benchmark'),
                'resultSource': data.get('resultSource'),
                'resultProvenance': data.get('resultProvenance'),
            })
            data = job_payload

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
            precomputed_solution=precomputed_solution,
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
