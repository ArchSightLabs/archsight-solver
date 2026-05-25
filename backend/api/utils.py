from datetime import datetime, timezone

import numpy as np
from backend.api.errors import ApiError
from backend.persistence.policy import enforce_supported_persistence_policy
from backend.services.beam_workbench import build_solution as build_beam_solution
from backend.services.frame_workbench import build_solution as build_frame_solution
from backend.services.truss_workbench import build_solution as build_truss_solution

MATERIALS = {
    'custom': '自定义 (手动输入)',
    'q235': 'Q235 碳素结构钢',
    'q345': 'Q345 低合金高强度结构钢',
    'c30': 'C30 混凝土',
    'c35': 'C35 混凝土',
    'c40': 'C40 混凝土',
    'c50': 'C50 混凝土'
}

FROZEN_LEGACY_TOP_LEVEL_FIELDS = ('beam', 'frame', 'truss', 'solution', 'payload')


def get_material_name(material_id):
    return MATERIALS.get(material_id or 'custom', '自定义材料')

def get_analysis_type(data):
    raw_analysis_type = data.get('analysisType')
    analysis_type = str(raw_analysis_type if raw_analysis_type not in (None, '') else 'beam').strip().lower()
    if analysis_type == 'beam':
        return 'beam'
    if analysis_type in {'frame', 'frame2d', 'portal_frame'}:
        return 'frame'
    if analysis_type in {'truss', 'truss2d'}:
        return 'truss'
    raise ApiError(f"不支持的分析对象: {raw_analysis_type}", code="COMMON_UNSUPPORTED_ANALYSIS_TYPE")


def _collect_series(response):
    series = {}
    for key in (
        'x_data',
        'v_data',
        'moment_data',
        'shear_data',
        't_data',
        'q_t_data',
        'ux_data',
        'uy_data',
        'rz_data',
        'member_axial_data',
        'member_shear_data',
        'member_moment_data',
    ):
        if key in response:
            series[key] = response[key]
    return series


def _attach_unified_envelope(response, analysis_type, request_echo, structure_model, normalized_request=None, operation='calculate'):
    persistence_policy = enforce_supported_persistence_policy()
    response['success'] = True
    response['operation'] = operation
    response['version'] = 'v1'
    response['request'] = request_echo
    if normalized_request is not None:
        response['normalizedRequest'] = normalized_request
    response['model'] = {
        'analysisType': analysis_type,
        'structure': structure_model,
    }
    response['results'] = {
        'summary': response.get('summary'),
        'preview': response.get('preview'),
        'diagram': response.get('diagram'),
        'nodeResults': response.get('nodeResults', []),
        'memberResults': response.get('memberResults', []),
        'memberDiagrams': response.get('memberDiagrams', []),
        'loadCaseResults': response.get('loadCaseResults', []),
        'loadCombinationResults': response.get('loadCombinationResults', []),
        'envelope': response.get('envelope', {}),
        'queryResults': response.get('queryResults', []),
        'teachingNotes': response.get('teachingNotes', {}),
        'symbolicCheck': response.get('symbolicCheck', {}),
        'secondOrder': response.get('secondOrder', {}),
        'buckling': response.get('buckling', {}),
        'nodeIds': response.get('nodeIds', []),
        'memberIds': response.get('memberIds', []),
        'series': _collect_series(response),
    }
    response['diagnostics'] = {
        'status': response.get('summary', {}).get('status'),
        'statusCode': response.get('summary', {}).get('statusCode'),
        'method': response.get('summary', {}).get('method'),
        **response.get('diagnostics', {}),
        'warnings': response.get('preview', {}).get('warnings', []),
        'infos': response.get('diagnostics', {}).get('infos', []),
        'persistence': persistence_policy,
    }
    response['errors'] = []
    # 统一 envelope 是后续字段演进入口；顶层 legacy 字段仅保留既有兼容面。
    legacy_fields = [key for key in FROZEN_LEGACY_TOP_LEVEL_FIELDS if key in response]
    response['meta'] = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'compat': {
            'legacyFields': legacy_fields,
        },
    }
    return response

def build_calculation_response(data, operation='calculate'):
    analysis_type = get_analysis_type(data)
    material_name = get_material_name(data.get('materialId'))
    
    if analysis_type == 'frame':
        solution = build_frame_solution(data, material_name)
        response = {
            'analysisType': 'frame',
            'frame': solution['preview'],
            'preview': solution['preview'],
            'diagram': solution['diagram'],
            'summary': solution['summary'],
            'payload': solution['payload'],
            'structure': solution['structure'],
            'nodeResults': solution['nodeResults'],
            'memberResults': solution['memberResults'],
            'memberDiagrams': solution['memberDiagrams'],
            'loadCaseResults': solution.get('loadCaseResults', []),
            'loadCombinationResults': solution.get('loadCombinationResults', []),
            'secondOrder': solution.get('secondOrder', {}),
            'buckling': solution.get('buckling', {}),
            'diagnostics': solution.get('diagnostics', {}),
            'nodeIds': solution['nodeIds'],
            'memberIds': solution['memberIds'],
            'ux_data': solution['ux_data'],
            'uy_data': solution['uy_data'],
            'rz_data': solution['rz_data'],
            'member_axial_data': solution['member_axial_data'],
            'member_shear_data': solution['member_shear_data'],
            'member_moment_data': solution['member_moment_data'],
            'solution': solution,
        }
        return _attach_unified_envelope(
            response=response,
            analysis_type='frame',
            request_echo=solution['payload'],
            structure_model=solution['structure'],
            operation=operation,
        )
        
    if analysis_type == 'truss':
        solution = build_truss_solution(data, material_name)
        response = {
            'analysisType': 'truss',
            'truss': solution['truss'],
            'preview': solution['preview'],
            'diagram': solution['diagram'],
            'summary': solution['summary'],
            'payload': solution['payload'],
            'structure': solution['structure'],
            'nodeResults': solution['nodeResults'],
            'memberResults': solution['memberResults'],
            'loadCaseResults': solution.get('loadCaseResults', []),
            'loadCombinationResults': solution.get('loadCombinationResults', []),
            'envelope': solution.get('envelope', {}),
            'diagnostics': solution.get('diagnostics', {}),
            'nodeIds': solution['nodeIds'],
            'memberIds': solution['memberIds'],
            'ux_data': solution['ux_data'],
            'uy_data': solution['uy_data'],
            'member_axial_data': solution['member_axial_data'],
            'solution': solution,
        }
        return _attach_unified_envelope(
            response=response,
            analysis_type='truss',
            request_echo=solution['payload'],
            structure_model=solution['structure'],
            normalized_request=solution.get('request'),
            operation=operation,
        )

    solution = build_beam_solution(data, material_name)
    request_data = solution['request']
    
    if request_data['load_type'] == 'point':
        load_value = request_data['point_load_kn']
        load_end = request_data['point_load_kn']
    elif request_data['load_type'] == 'linear':
        load_value = request_data['distributed_start_kn']
        load_end = request_data['distributed_end_kn']
    else:
        load_value = request_data['q_kn']
        load_end = request_data['q_kn']
        
    response = {
        'analysisType': 'beam',
        'x_data': list(solution['x_data']),
        'v_data': list(solution['v_data']),
        'moment_data': [round(float(value) / 1000.0, 6) for value in solution.get('element_end_moments', [])],
        'shear_data': [round(float(value) / 1000.0, 6) for value in solution.get('element_end_shears', [])],
        't_data': list(solution['t_data']),
        'q_t_data': list(solution['q_t_data']),
        'beam': solution['beam'],
        'preview': solution['beam'],
        'diagram': solution['diagram'],
        'loadCaseResults': solution.get('loadCaseResults', []),
        'loadCombinationResults': solution.get('loadCombinationResults', []),
        'envelope': solution.get('envelope', {}),
        'queryResults': solution.get('queryResults', []),
        'controlValues': solution.get('controlValues', {}),
        'teachingNotes': solution.get('teachingNotes', {}),
        'symbolicCheck': solution.get('symbolicCheck', {}),
        'summary': {
            'allowableMm': float(solution['allowable_mm']),
            'allowableRatio': 250,
            'maxDeflectionMm': float(solution['max_deflection_mm']),
            'maxDeflectionPositionM': float(solution['max_deflection_position_m']),
            'status': solution['status'],
            'statusCode': 'PASS' if solution['status'] == '合格' else 'REVIEW',
            'method': f"{solution.get('beamTheoryLabel', 'Euler-Bernoulli 梁理论')} + 梁单元法",
            **solution.get('controlValues', {}),
        },
        'payload': {
            'analysisType': 'beam',
            'projectName': request_data['project_name'],
            'materialId': request_data['material_id'],
            'beamType': request_data['beam_type'],
            'loadType': request_data['load_type'],
            'spans': request_data['spans'],
            'spanProperties': [
                {'E': float(span_e), 'I': float(span_i)}
                for span_e, span_i in zip(request_data['span_E_gpa'], request_data['span_I_cm4'])
            ],
            'q': request_data['q_kn'],
            'loadValue': load_value,
            'loadPosition': request_data['point_position'],
            'loadEnd': load_end,
            'freq': request_data['freq'],
            'duration': request_data['duration'],
            'E': request_data['E_gpa'],
            'I': request_data['I_cm4'],
            'beamTheory': request_data.get('beam_theory', 'euler_bernoulli'),
            'supports': request_data.get('supports', []),
        },
        'request': request_data,
        'solution': solution,
    }
    return _attach_unified_envelope(
        response=response,
        analysis_type='beam',
        request_echo=response['payload'],
        structure_model=response['beam'],
        normalized_request=request_data,
        operation=operation,
    )
