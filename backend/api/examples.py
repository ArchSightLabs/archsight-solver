from flask import Blueprint, jsonify

from backend.examples.public_validation_projects import build_public_validation_projects

examples_bp = Blueprint("examples", __name__)


@examples_bp.route("/examples/projects", methods=["GET"])
def list_public_example_projects():
    return jsonify(build_public_validation_projects())
