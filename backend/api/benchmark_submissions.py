from __future__ import annotations

from flask import Blueprint, jsonify, request

from backend.api.errors import error_payload
from backend.benchmarks.submissions import BenchmarkSubmissionError, build_benchmark_submission_response


benchmark_submissions_bp = Blueprint("benchmark_submissions", __name__)


@benchmark_submissions_bp.route("/benchmark-submissions", methods=["POST"])
def submit_benchmark_case():
    data = request.json or {}
    try:
        return jsonify(build_benchmark_submission_response(data))
    except BenchmarkSubmissionError as exc:
        return jsonify(error_payload(exc, operation="submit_benchmark_case", data=data, code="BENCHMARK_SUBMISSION_INVALID")), 400
