from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import math
from typing import Any, Dict, List, Mapping, Sequence

import numpy as np

from backend.common.numbers import to_float
from backend.solver.frame.assembler import assemble_global_system
from backend.solver.frame.corotational import CorotationalMemberState, evaluate_corotational_member
from backend.solver.frame.solver import solve_frame_system


NONLINEAR_PATH_SCHEMA = "NonlinearPathTrace@1"
DEFAULT_MEMBER_SUBDIVISIONS = 4
MAX_REFINED_DOF = 1800
MAX_PATH_KEYFRAMES = 48


@dataclass(frozen=True)
class CorotationalPathResult:
    success: bool
    equilibrium_status: str
    stability_status: str
    load_factor: float
    fixed_load_factor: float
    displacements: np.ndarray
    reactions: np.ndarray
    member_states: Dict[str, CorotationalMemberState]
    path_trace: Dict[str, Any]
    termination_reason: str | None
    refined_structure: Dict[str, Any]
    assembly: Dict[str, Any]


@dataclass(frozen=True)
class _IterationState:
    internal_force: np.ndarray
    tangent: np.ndarray
    member_states: Dict[str, CorotationalMemberState]


def solve_corotational_path(
    structure: Mapping[str, Any],
    *,
    solver_backend: str = "auto",
    options: Mapping[str, Any] | None = None,
) -> CorotationalPathResult:
    """Trace a conservative 2D elastic geometric-nonlinear load path.

    The path uses full Newton iterations, a deterministic residual-reduction
    line search and adaptive load-step cutback. It intentionally stops at a
    failed load-controlled step and returns the last converged state; it does
    not claim arc-length or post-limit-point tracing.
    """

    settings = _normalize_options(options or {})
    reference_structure, imperfection_evidence = _apply_initial_imperfection(
        structure,
        settings["initialImperfection"],
    )
    mesh = _refine_structure(reference_structure, settings["memberSubdivisions"])
    _apply_member_shape_imperfection(mesh["structure"], settings["initialImperfection"])
    mesh["diagnostics"]["initialImperfection"] = imperfection_evidence
    mesh["diagnostics"]["referenceNodes"] = [
        {
            "id": str(node["id"]),
            "x": round(float(node["x"]), 12),
            "y": round(float(node["y"]), 12),
            "sourceMemberId": node.get("sourceMemberId"),
            "sourceRatio": node.get("sourceRatio"),
        }
        for node in mesh["structure"].get("nodes", [])
    ]
    mesh["diagnostics"]["refinedMembers"] = [
        {
            "id": str(member["id"]),
            "start": str(member["start"]),
            "end": str(member["end"]),
            "sourceMemberId": member.get("sourceMemberId"),
        }
        for member in mesh["structure"].get("members", [])
    ]
    refined_structure = mesh["structure"]
    ndof = len(refined_structure.get("nodes", [])) * 3
    if ndof > settings["maxRefinedDofs"]:
        raise ValueError(
            f"共回转分析细分后自由度 {ndof} 超过当前上限 {settings['maxRefinedDofs']}；"
            "请减少模型规模或降低 memberSubdivisions，系统不会静默回退旧算法"
        )

    mechanical_structure = deepcopy(refined_structure)
    mechanical_structure["loads"] = [
        deepcopy(load) for load in refined_structure.get("loads", []) if str(load.get("type")) != "temperature"
    ]
    assembly = assemble_global_system(mechanical_structure, solver_backend=solver_backend)
    fixed_mechanical_structure = deepcopy(refined_structure)
    fixed_mechanical_structure["loads"] = [
        deepcopy(load)
        for load in refined_structure.get("loads", [])
        if str(load.get("type")) != "temperature" and str(load.get("pathRole") or "variable") == "fixed"
    ]
    variable_mechanical_structure = deepcopy(refined_structure)
    variable_mechanical_structure["loads"] = [
        deepcopy(load)
        for load in refined_structure.get("loads", [])
        if str(load.get("type")) != "temperature" and str(load.get("pathRole") or "variable") != "fixed"
    ]
    fixed_assembly = assemble_global_system(fixed_mechanical_structure, solver_backend=solver_backend)
    variable_assembly = assemble_global_system(variable_mechanical_structure, solver_backend=solver_backend)
    fixed_external_load = np.asarray(fixed_assembly["load_vector"], dtype=float)
    variable_external_load = np.asarray(variable_assembly["load_vector"], dtype=float)
    fixed_thermal_extensions = _thermal_extensions(refined_structure, assembly["member_records"], path_role="fixed")
    variable_thermal_extensions = _thermal_extensions(refined_structure, assembly["member_records"], path_role="variable")
    has_fixed_load = any(
        str(load.get("pathRole") or "variable") == "fixed" for load in refined_structure.get("loads", [])
    )
    has_variable_load = any(
        str(load.get("pathRole") or "variable") != "fixed" for load in refined_structure.get("loads", [])
    )
    path_mode = "fixed_then_variable" if has_fixed_load and has_variable_load else (
        "fixed_only" if has_fixed_load else "variable_only"
    )
    path_end = 2.0 if path_mode == "fixed_then_variable" else 1.0
    characteristic_length = _characteristic_length(refined_structure)

    initial_constraints = _constraint_state(refined_structure, assembly, 0.0)
    free_basis = initial_constraints["free_basis"]
    initial_particular = np.asarray(initial_constraints["particular"], dtype=float)
    displacement = initial_particular.copy()
    unit_constraints = _constraint_state(refined_structure, assembly, 1.0)
    unit_basis = np.asarray(unit_constraints["free_basis"], dtype=float)
    if unit_basis.shape != free_basis.shape or not np.allclose(unit_basis, free_basis, rtol=0.0, atol=1e-10):
        raise ValueError("共回转分析的约束允许空间会随规定位移变化，当前算法不允许静默重建自由度路径")
    unit_particular = np.asarray(unit_constraints["particular"], dtype=float)
    converged_particular = displacement.copy()
    converged_factor = 0.0
    converged_state = _assemble_iteration_state(assembly, displacement, {}, 1.0)
    converged_reactions = converged_state.internal_force.copy()
    converged_stability, converged_eigenvalue, converged_inertia = _stability_state(
        free_basis.T @ converged_state.tangent @ free_basis
    )

    iterations: List[Dict[str, Any]] = []
    steps: List[Dict[str, Any]] = []
    attempts: List[Dict[str, Any]] = []
    keyframes: List[Dict[str, Any]] = [
        _keyframe(
            0,
            0.0,
            displacement,
            len(refined_structure["nodes"]),
            fixed_load_factor=0.0,
            phase="fixed_preload" if has_fixed_load else "variable",
        )
    ]
    minimum_eigenvalue = converged_eigenvalue
    cutback_count = 0
    accepted_step = 0
    step_size = settings["initialStep"]
    final_attempt: Dict[str, Any] | None = None

    while converged_factor < path_end - 1e-12:
        target_factor = min(path_end, converged_factor + step_size)
        if path_mode == "fixed_then_variable" and converged_factor < 1.0 < target_factor:
            target_factor = 1.0
        target_loads = _path_load_factors(target_factor, path_mode)
        target_variable_factor = target_loads["variable"]
        target_fixed_factor = target_loads["fixed"]
        target_phase = target_loads["phase"]
        target_particular = initial_particular + target_variable_factor * (unit_particular - initial_particular)
        trial_displacement = displacement + (target_particular - converged_particular)
        external = fixed_external_load * target_fixed_factor + variable_external_load * target_variable_factor
        thermal_extensions = _combined_thermal_extensions(
            fixed_thermal_extensions,
            variable_thermal_extensions,
            target_fixed_factor,
            target_variable_factor,
        )
        attempt_iteration_records: List[Dict[str, Any]] = []
        failure_reason = "maximum_iterations_exhausted"
        accepted = False
        trial_state = _assemble_iteration_state(assembly, trial_displacement, thermal_extensions, 1.0)
        trial_reactions = trial_state.internal_force - external
        trial_stability, trial_eigenvalue, trial_inertia = _stability_state(free_basis.T @ trial_state.tangent @ free_basis)

        for iteration in range(1, settings["maxIterations"] + 1):
            projected_residual = free_basis.T @ (external - trial_state.internal_force)
            reduced_tangent = free_basis.T @ trial_state.tangent @ free_basis
            stability_status, minimum_tangent_eigenvalue, tangent_inertia = _stability_state(reduced_tangent)
            residual_norm = float(np.linalg.norm(projected_residual))
            reference_force = max(float(np.linalg.norm(free_basis.T @ external)), 1.0)

            force_limit = settings["absoluteResidualToleranceN"] + settings["relativeResidualTolerance"] * reference_force
            if residual_norm <= force_limit:
                record = {
                    "step": accepted_step + 1,
                    "attempt": cutback_count + 1,
                    "loadFactor": round(float(target_variable_factor), 12),
                    "fixedLoadFactor": round(float(target_fixed_factor), 12),
                    "pathPhase": target_phase,
                    "stepSize": round(float(step_size), 12),
                    "iteration": iteration,
                    "equilibriumResidualNormN": _finite_round(residual_norm, 12),
                    "equilibriumMaxResidualN": _finite_round(
                        float(np.max(np.abs(projected_residual))) if projected_residual.size else 0.0,
                        12,
                    ),
                    "equilibriumResidualRelative": _finite_round(residual_norm / reference_force, 14),
                    "displacementIncrementNormM": 0.0,
                    "displacementIncrementMaxM": 0.0,
                    "displacementIncrementRelative": 0.0,
                    "energyIncrementJ": 0.0,
                    "energyIncrementRelative": 0.0,
                    "lineSearchScale": 0.0,
                    "lineSearchTrials": 0,
                    "minimumTangentEigenvalue": _finite_round(minimum_tangent_eigenvalue, 10),
                    "tangentInertia": tangent_inertia,
                    "stabilityStatus": stability_status,
                    "status": "converged",
                }
                iterations.append(record)
                attempt_iteration_records.append(record)
                trial_reactions = trial_state.internal_force - external
                trial_stability = stability_status
                trial_eigenvalue = minimum_tangent_eigenvalue
                trial_inertia = tangent_inertia
                minimum_eigenvalue = min(minimum_eigenvalue, minimum_tangent_eigenvalue)
                accepted = True
                break

            try:
                reduced_increment = np.linalg.solve(reduced_tangent, projected_residual)
            except np.linalg.LinAlgError:
                failure_reason = "singular_tangent"
                break
            full_increment = free_basis @ reduced_increment
            if not np.all(np.isfinite(full_increment)):
                failure_reason = "non_finite_increment"
                break

            line_search = _line_search(
                assembly=assembly,
                free_basis=free_basis,
                external=external,
                displacement=trial_displacement,
                increment=full_increment,
                thermal_extensions=thermal_extensions,
                load_factor=1.0,
                initial_residual_norm=residual_norm,
                settings=settings,
            )
            if not line_search["accepted"]:
                failure_reason = "line_search_failed"
                break

            applied_increment = full_increment * float(line_search["scale"])
            candidate_displacement = trial_displacement + applied_increment
            candidate_state = line_search["state"]
            candidate_residual = free_basis.T @ (external - candidate_state.internal_force)
            candidate_residual_norm = float(np.linalg.norm(candidate_residual))
            candidate_residual_max = float(np.max(np.abs(candidate_residual))) if candidate_residual.size else 0.0
            relative_candidate_residual = candidate_residual_norm / reference_force
            increment_norm = float(np.linalg.norm(applied_increment))
            increment_max = float(np.max(np.abs(applied_increment))) if applied_increment.size else 0.0
            displacement_reference = max(float(np.linalg.norm(candidate_displacement)), characteristic_length, 1.0)
            relative_increment = increment_norm / displacement_reference
            energy_increment = abs(float(applied_increment @ (external - candidate_state.internal_force)))
            reference_work = max(abs(float(candidate_displacement @ external)), 1.0)
            relative_energy = energy_increment / reference_work
            candidate_reduced_tangent = free_basis.T @ candidate_state.tangent @ free_basis
            candidate_stability, candidate_eigenvalue, candidate_inertia = _stability_state(candidate_reduced_tangent)
            minimum_eigenvalue = min(minimum_eigenvalue, candidate_eigenvalue)

            force_converged = candidate_residual_norm <= (
                settings["absoluteResidualToleranceN"] + settings["relativeResidualTolerance"] * reference_force
            )
            displacement_converged = increment_norm <= (
                settings["absoluteDisplacementToleranceM"]
                + settings["relativeDisplacementTolerance"] * displacement_reference
            )
            energy_converged = energy_increment <= (
                settings["absoluteEnergyToleranceJ"] + settings["relativeEnergyTolerance"] * reference_work
            )
            converged = bool(force_converged and displacement_converged and energy_converged)
            record = {
                "step": accepted_step + 1,
                "attempt": cutback_count + 1,
                "loadFactor": round(float(target_variable_factor), 12),
                "fixedLoadFactor": round(float(target_fixed_factor), 12),
                "pathPhase": target_phase,
                "stepSize": round(float(step_size), 12),
                "iteration": iteration,
                "equilibriumResidualNormN": _finite_round(candidate_residual_norm, 12),
                "equilibriumMaxResidualN": _finite_round(candidate_residual_max, 12),
                "equilibriumResidualRelative": _finite_round(relative_candidate_residual, 14),
                "displacementIncrementNormM": _finite_round(increment_norm, 14),
                "displacementIncrementMaxM": _finite_round(increment_max, 14),
                "displacementIncrementRelative": _finite_round(relative_increment, 14),
                "energyIncrementJ": _finite_round(energy_increment, 14),
                "energyIncrementRelative": _finite_round(relative_energy, 14),
                "lineSearchScale": _finite_round(float(line_search["scale"]), 12),
                "lineSearchTrials": int(line_search["trials"]),
                "minimumTangentEigenvalue": _finite_round(candidate_eigenvalue, 10),
                "tangentInertia": candidate_inertia,
                "stabilityStatus": candidate_stability,
                "status": "converged" if converged else "iterating",
            }
            iterations.append(record)
            attempt_iteration_records.append(record)
            trial_displacement = candidate_displacement
            trial_state = candidate_state
            trial_reactions = trial_state.internal_force - external
            trial_stability = candidate_stability
            trial_eigenvalue = candidate_eigenvalue
            trial_inertia = candidate_inertia

            if converged:
                accepted = True
                break

        if accepted:
            accepted_step += 1
            displacement = trial_displacement
            converged_particular = target_particular
            converged_factor = target_factor
            converged_state = trial_state
            converged_reactions = trial_reactions
            converged_stability = trial_stability
            converged_eigenvalue = trial_eigenvalue
            converged_inertia = trial_inertia
            converged_loads = _path_load_factors(converged_factor, path_mode)
            step_record = {
                "step": accepted_step,
                "loadFactor": round(float(converged_loads["variable"]), 12),
                "fixedLoadFactor": round(float(converged_loads["fixed"]), 12),
                "pathPhase": converged_loads["phase"],
                "stepSize": round(float(step_size), 12),
                "iterations": len(attempt_iteration_records),
                "equilibriumStatus": "converged",
                "stabilityStatus": converged_stability,
                "minimumTangentEigenvalue": _finite_round(converged_eigenvalue, 10),
                "tangentInertia": converged_inertia,
                "maxDisplacementMm": _finite_round(_max_translation(displacement) * 1000.0, 8),
            }
            steps.append(step_record)
            next_keyframe = _keyframe(
                    accepted_step,
                    converged_loads["variable"],
                    displacement,
                    len(refined_structure["nodes"]),
                    fixed_load_factor=converged_loads["fixed"],
                    phase=converged_loads["phase"],
                )
            _retain_keyframe(keyframes, next_keyframe)
            final_attempt = {**step_record, "status": "converged"}
            cutback_count = 0
            if accepted_step >= settings["maxAcceptedSteps"] and converged_factor < path_end - 1e-12:
                termination_reason = "maximum_accepted_steps_exhausted"
                final_attempt = {
                    "step": accepted_step + 1,
                    "loadFactor": round(float(converged_loads["variable"]), 12),
                    "fixedLoadFactor": round(float(converged_loads["fixed"]), 12),
                    "pathPhase": converged_loads["phase"],
                    "status": "failed",
                    "reason": "accepted_step_limit",
                    "terminationReason": termination_reason,
                }
                path_trace = _build_trace(
                    settings=settings,
                    steps=steps,
                    iterations=iterations,
                    attempts=attempts,
                    keyframes=keyframes,
                    load_factor=converged_loads["variable"],
                    fixed_load_factor=converged_loads["fixed"],
                    displacement=displacement,
                    stability_status=converged_stability,
                    minimum_eigenvalue=minimum_eigenvalue,
                    final_attempt=final_attempt,
                    termination_reason=termination_reason,
                    mesh=mesh,
                    member_states=converged_state.member_states,
                    path_mode=path_mode,
                )
                return CorotationalPathResult(
                    success=False,
                    equilibrium_status="not_converged",
                    stability_status=converged_stability,
                    load_factor=converged_loads["variable"],
                    fixed_load_factor=converged_loads["fixed"],
                    displacements=displacement,
                    reactions=converged_reactions,
                    member_states=converged_state.member_states,
                    path_trace=path_trace,
                    termination_reason=termination_reason,
                    refined_structure=refined_structure,
                    assembly=assembly,
                )
            if len(attempt_iteration_records) <= settings["targetIterations"]:
                step_size = min(settings["maxStep"], step_size * settings["stepGrowthFactor"])
            elif len(attempt_iteration_records) >= settings["slowIterationThreshold"]:
                step_size = max(settings["minStep"], step_size * settings["slowStepFactor"])
            continue

        failed_attempt = {
            "step": accepted_step + 1,
            "loadFactor": round(float(target_variable_factor), 12),
            "fixedLoadFactor": round(float(target_fixed_factor), 12),
            "pathPhase": target_phase,
            "stepSize": round(float(step_size), 12),
            "iterations": len(attempt_iteration_records),
            "status": "cutback",
            "reason": failure_reason,
            "lastResidualRelative": (
                attempt_iteration_records[-1]["equilibriumResidualRelative"] if attempt_iteration_records else None
            ),
        }
        attempts.append(failed_attempt)
        cutback_count += 1
        next_step = step_size * settings["cutbackFactor"]
        exhausted_by_count = cutback_count > settings["maxCutbacks"]
        exhausted_by_size = next_step < settings["minStep"] - 1e-15
        if exhausted_by_count or exhausted_by_size:
            termination_reason = "maximum_cutbacks_exhausted" if exhausted_by_count else "minimum_step_exhausted"
            final_attempt = {**failed_attempt, "status": "failed", "terminationReason": termination_reason}
            converged_loads = _path_load_factors(converged_factor, path_mode)
            path_trace = _build_trace(
                settings=settings,
                steps=steps,
                iterations=iterations,
                attempts=attempts,
                keyframes=keyframes,
                load_factor=converged_loads["variable"],
                fixed_load_factor=converged_loads["fixed"],
                displacement=displacement,
                stability_status=converged_stability,
                minimum_eigenvalue=minimum_eigenvalue,
                final_attempt=final_attempt,
                termination_reason=termination_reason,
                mesh=mesh,
                member_states=converged_state.member_states,
                path_mode=path_mode,
            )
            return CorotationalPathResult(
                success=False,
                equilibrium_status="not_converged",
                stability_status=converged_stability,
                load_factor=converged_loads["variable"],
                fixed_load_factor=converged_loads["fixed"],
                displacements=displacement,
                reactions=converged_reactions,
                member_states=converged_state.member_states,
                path_trace=path_trace,
                termination_reason=termination_reason,
                refined_structure=refined_structure,
                assembly=assembly,
            )
        step_size = max(settings["minStep"], next_step)

    converged_loads = _path_load_factors(converged_factor, path_mode)
    path_trace = _build_trace(
        settings=settings,
        steps=steps,
        iterations=iterations,
        attempts=attempts,
        keyframes=keyframes,
        load_factor=converged_loads["variable"],
        fixed_load_factor=converged_loads["fixed"],
        displacement=displacement,
        stability_status=converged_stability,
        minimum_eigenvalue=minimum_eigenvalue,
        final_attempt=final_attempt,
        termination_reason=None,
        mesh=mesh,
        member_states=converged_state.member_states,
        path_mode=path_mode,
    )
    return CorotationalPathResult(
        success=True,
        equilibrium_status="converged",
        stability_status=converged_stability,
        load_factor=converged_loads["variable"],
        fixed_load_factor=converged_loads["fixed"],
        displacements=displacement,
        reactions=converged_reactions,
        member_states=converged_state.member_states,
        path_trace=path_trace,
        termination_reason=None,
        refined_structure=refined_structure,
        assembly=assembly,
    )


def _normalize_options(raw: Mapping[str, Any]) -> Dict[str, Any]:
    initial_step = _bounded_float(raw.get("initialStep"), 0.25, 1e-4, 1.0)
    minimum_step = _bounded_float(raw.get("minStep"), min(0.01, initial_step), 1e-6, initial_step)
    maximum_step = _bounded_float(raw.get("maxStep"), max(initial_step, 0.25), initial_step, 1.0)
    return {
        "initialStep": initial_step,
        "minStep": minimum_step,
        "maxStep": maximum_step,
        "maxIterations": _bounded_int(raw.get("maxIterations"), 30, 1, 100),
        "maxCutbacks": _bounded_int(raw.get("maxCutbacks"), 12, 0, 30),
        "maxAcceptedSteps": _bounded_int(raw.get("maxAcceptedSteps"), 2000, 1, 20000),
        "cutbackFactor": _bounded_float(raw.get("cutbackFactor"), 0.5, 0.1, 0.8),
        "stepGrowthFactor": _bounded_float(raw.get("stepGrowthFactor"), 1.5, 1.0, 2.0),
        "slowStepFactor": _bounded_float(raw.get("slowStepFactor"), 0.75, 0.25, 1.0),
        "targetIterations": _bounded_int(raw.get("targetIterations"), 4, 1, 20),
        "slowIterationThreshold": _bounded_int(raw.get("slowIterationThreshold"), 10, 2, 50),
        "relativeResidualTolerance": _bounded_float(raw.get("relativeResidualTolerance"), 1e-8, 1e-12, 1e-3),
        "absoluteResidualToleranceN": _bounded_float(raw.get("absoluteResidualToleranceN"), 1e-5, 1e-10, 1e3),
        "relativeDisplacementTolerance": _bounded_float(raw.get("relativeDisplacementTolerance"), 1e-8, 1e-12, 1e-3),
        "absoluteDisplacementToleranceM": _bounded_float(raw.get("absoluteDisplacementToleranceM"), 1e-10, 1e-14, 1e-3),
        "relativeEnergyTolerance": _bounded_float(raw.get("relativeEnergyTolerance"), 1e-10, 1e-14, 1e-3),
        "absoluteEnergyToleranceJ": _bounded_float(raw.get("absoluteEnergyToleranceJ"), 1e-8, 1e-14, 1e2),
        "lineSearchMaxTrials": _bounded_int(raw.get("lineSearchMaxTrials"), 8, 1, 20),
        "lineSearchReduction": _bounded_float(raw.get("lineSearchReduction"), 0.5, 0.1, 0.9),
        "lineSearchMinimumScale": _bounded_float(raw.get("lineSearchMinimumScale"), 1.0 / 128.0, 1e-4, 1.0),
        "memberSubdivisions": _bounded_int(raw.get("memberSubdivisions"), DEFAULT_MEMBER_SUBDIVISIONS, 1, 12),
        "maxRefinedDofs": _bounded_int(raw.get("maxRefinedDofs"), MAX_REFINED_DOF, 30, 5000),
        "initialImperfection": deepcopy(dict(raw.get("initialImperfection", {})))
        if isinstance(raw.get("initialImperfection"), Mapping)
        else {"type": "none", "nodeOffsets": []},
    }


def _bounded_float(value: Any, default: float, minimum: float, maximum: float) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        numeric = default
    if not math.isfinite(numeric):
        numeric = default
    return max(minimum, min(maximum, numeric))


def _bounded_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        numeric = int(float(value))
    except (TypeError, ValueError):
        numeric = default
    return max(minimum, min(maximum, numeric))


def _constraint_state(structure: Mapping[str, Any], assembly: Mapping[str, Any], load_factor: float) -> Dict[str, np.ndarray]:
    scaled = _scale_support_displacements(structure, load_factor)
    ndof = len(scaled["nodes"]) * 3
    probe = solve_frame_system(
        dict(scaled),
        dict(assembly),
        stiffness_override=np.eye(ndof, dtype=float),
        load_vector_override=np.zeros(ndof, dtype=float),
    )
    return {
        "free_basis": np.asarray(probe["free_basis"], dtype=float),
        "particular": np.asarray(probe["displacements"], dtype=float),
    }


def _scale_support_displacements(structure: Mapping[str, Any], load_factor: float) -> Dict[str, Any]:
    scaled = deepcopy(dict(structure))
    scaled_nodes: List[Dict[str, Any]] = []
    for node in structure.get("nodes", []):
        item = deepcopy(dict(node))
        displacements: List[Dict[str, Any]] = []
        for prescribed in node.get("supportDisplacements", []):
            value = deepcopy(dict(prescribed))
            if "displacementMm" in value:
                value["displacementMm"] = float(value["displacementMm"]) * load_factor
            if "rotationDeg" in value:
                value["rotationDeg"] = float(value["rotationDeg"]) * load_factor
            displacements.append(value)
        if displacements:
            item["supportDisplacements"] = displacements
        scaled_nodes.append(item)
    scaled["nodes"] = scaled_nodes
    return scaled


def _assemble_iteration_state(
    assembly: Mapping[str, Any],
    displacement: np.ndarray,
    thermal_extensions: Mapping[str, float],
    load_factor: float,
) -> _IterationState:
    ndof = displacement.size
    tangent = np.zeros((ndof, ndof), dtype=float)
    internal = np.zeros(ndof, dtype=float)
    states: Dict[str, CorotationalMemberState] = {}
    for record in assembly["member_records"]:
        dofs = np.asarray(record["dofs"], dtype=int)
        state = evaluate_corotational_member(
            record["start_coords"],
            record["end_coords"],
            displacement[dofs],
            E=float(record["e"]),
            A=float(record["a"]),
            I=float(record["i"]),
            release_dofs=record.get("release_dofs", []),
            thermal_extension=float(thermal_extensions.get(str(record["id"]), 0.0)) * load_factor,
        )
        tangent[np.ix_(dofs, dofs)] += state.tangent_stiffness
        internal[dofs] += state.internal_force
        states[str(record["id"])] = state
    for spring in assembly.get("spring_records", []):
        index = int(spring["matrix_index"])
        stiffness = float(spring["stiffness"])
        tangent[index, index] += stiffness
        internal[index] += stiffness * float(displacement[index])
    return _IterationState(internal_force=internal, tangent=tangent, member_states=states)


def _line_search(
    *,
    assembly: Mapping[str, Any],
    free_basis: np.ndarray,
    external: np.ndarray,
    displacement: np.ndarray,
    increment: np.ndarray,
    thermal_extensions: Mapping[str, float],
    load_factor: float,
    initial_residual_norm: float,
    settings: Mapping[str, Any],
) -> Dict[str, Any]:
    scale = 1.0
    best: Dict[str, Any] | None = None
    for trial in range(1, int(settings["lineSearchMaxTrials"]) + 1):
        candidate = displacement + scale * increment
        try:
            state = _assemble_iteration_state(assembly, candidate, thermal_extensions, load_factor)
        except ValueError:
            state = None
        if state is not None:
            residual_norm = float(np.linalg.norm(free_basis.T @ (external - state.internal_force)))
            if best is None or residual_norm < float(best["residualNorm"]):
                best = {"accepted": False, "scale": scale, "trials": trial, "state": state, "residualNorm": residual_norm}
            if residual_norm <= initial_residual_norm * (1.0 - 1e-4 * scale) or residual_norm <= 1e-12:
                return {"accepted": True, "scale": scale, "trials": trial, "state": state, "residualNorm": residual_norm}
        scale *= float(settings["lineSearchReduction"])
        if scale < float(settings["lineSearchMinimumScale"]) - 1e-15:
            break
    if best is not None and float(best["residualNorm"]) < initial_residual_norm:
        best["accepted"] = True
        return best
    return {"accepted": False, "scale": 0.0, "trials": int(settings["lineSearchMaxTrials"]), "state": None}


def _stability_state(reduced_tangent: np.ndarray) -> tuple[str, float, Dict[str, int]]:
    if reduced_tangent.size == 0:
        return "stable", 0.0, {"positive": 0, "nearZero": 0, "negative": 0}
    eigenvalues = np.linalg.eigvalsh(0.5 * (reduced_tangent + reduced_tangent.T))
    scale = max(float(np.max(np.abs(eigenvalues))), 1.0)
    tolerance = scale * 1e-9
    negative = int(np.count_nonzero(eigenvalues < -tolerance))
    near_zero = int(np.count_nonzero(np.abs(eigenvalues) <= tolerance))
    positive = int(eigenvalues.size - negative - near_zero)
    minimum = float(eigenvalues[0])
    if negative:
        status = "unstable"
    elif near_zero:
        status = "near_critical"
    else:
        status = "stable"
    return status, minimum, {"positive": positive, "nearZero": near_zero, "negative": negative}


def _thermal_extensions(
    structure: Mapping[str, Any],
    member_records: Sequence[Mapping[str, Any]],
    *,
    path_role: str,
) -> Dict[str, float]:
    lengths = {str(record["id"]): float(record["length"]) for record in member_records}
    extensions: Dict[str, float] = {}
    for load in structure.get("loads", []):
        if str(load.get("type")) != "temperature":
            continue
        load_role = str(load.get("pathRole") or "variable")
        if load_role != path_role:
            continue
        member_id = str(load.get("member"))
        if member_id not in lengths:
            continue
        alpha = to_float(load.get("alphaPerC", load.get("thermalExpansionPerC", 1.2e-5)), 1.2e-5)
        delta = to_float(load.get("deltaTempC", load.get("temperatureDeltaC", 0.0)), 0.0)
        extensions[member_id] = extensions.get(member_id, 0.0) + alpha * delta * lengths[member_id]
    return extensions


def _combined_thermal_extensions(
    fixed: Mapping[str, float],
    variable: Mapping[str, float],
    fixed_factor: float,
    variable_factor: float,
) -> Dict[str, float]:
    member_ids = set(fixed) | set(variable)
    return {
        member_id: float(fixed.get(member_id, 0.0)) * fixed_factor
        + float(variable.get(member_id, 0.0)) * variable_factor
        for member_id in member_ids
    }


def _path_load_factors(path_coordinate: float, path_mode: str) -> Dict[str, Any]:
    coordinate = float(path_coordinate)
    if path_mode == "variable_only":
        return {"fixed": 0.0, "variable": min(1.0, max(0.0, coordinate)), "phase": "variable"}
    if path_mode == "fixed_only":
        return {"fixed": min(1.0, max(0.0, coordinate)), "variable": 0.0, "phase": "fixed_preload"}
    if coordinate <= 1.0 + 1e-12:
        return {"fixed": min(1.0, max(0.0, coordinate)), "variable": 0.0, "phase": "fixed_preload"}
    return {"fixed": 1.0, "variable": min(1.0, max(0.0, coordinate - 1.0)), "phase": "variable"}


def _characteristic_length(structure: Mapping[str, Any]) -> float:
    coordinates = [(float(node["x"]), float(node["y"])) for node in structure.get("nodes", [])]
    if not coordinates:
        return 1.0
    xs = [point[0] for point in coordinates]
    ys = [point[1] for point in coordinates]
    return max(max(xs) - min(xs), max(ys) - min(ys), 1.0)


def _max_translation(displacement: np.ndarray) -> float:
    if displacement.size == 0:
        return 0.0
    translations = displacement.reshape((-1, 3))[:, :2]
    return float(np.max(np.linalg.norm(translations, axis=1))) if translations.size else 0.0


def _keyframe(
    step: int,
    load_factor: float,
    displacement: np.ndarray,
    node_count: int,
    *,
    fixed_load_factor: float = 0.0,
    phase: str = "variable",
) -> Dict[str, Any]:
    node_values = displacement.reshape((node_count, 3))
    return {
        "step": int(step),
        "loadFactor": round(float(load_factor), 12),
        "fixedLoadFactor": round(float(fixed_load_factor), 12),
        "pathPhase": phase,
        "nodeDisplacements": [
            {
                "nodeIndex": index,
                "uxM": _finite_round(float(values[0]), 12),
                "uyM": _finite_round(float(values[1]), 12),
                "rzRad": _finite_round(float(values[2]), 12),
            }
            for index, values in enumerate(node_values)
        ],
    }


def _retain_keyframe(keyframes: List[Dict[str, Any]], candidate: Dict[str, Any]) -> None:
    """Retain a bounded, path-distributed playback set including the final state."""

    if len(keyframes) < MAX_PATH_KEYFRAMES:
        keyframes.append(candidate)
        return
    combined = [*keyframes, candidate]
    protected = {0, len(combined) - 1}
    for index, item in enumerate(combined):
        if (
            str(item.get("pathPhase")) == "fixed_preload"
            and float(item.get("fixedLoadFactor", 0.0)) >= 1.0 - 1e-12
        ):
            protected.add(index)
            break

    def progress(item: Mapping[str, Any]) -> float:
        if str(item.get("pathPhase")) == "fixed_preload":
            return float(item.get("fixedLoadFactor", 0.0))
        has_preload = any(float(frame.get("fixedLoadFactor", 0.0)) > 0.0 for frame in combined)
        return (1.0 if has_preload else 0.0) + float(item.get("loadFactor", 0.0))

    removable = [index for index in range(1, len(combined) - 1) if index not in protected]
    remove_index = min(
        removable,
        # Removing a point merges its two neighbouring intervals.  Minimise
        # that merged span so dense regions are decimated first.  Using the
        # smaller adjacent interval here causes an adaptive path with tiny
        # near-limit steps to discard every late frame and retain only the
        # first 47 states plus the final state.
        key=lambda index: abs(progress(combined[index + 1]) - progress(combined[index - 1])),
    )
    del combined[remove_index]
    keyframes[:] = combined


def _build_trace(
    *,
    settings: Mapping[str, Any],
    steps: Sequence[Mapping[str, Any]],
    iterations: Sequence[Mapping[str, Any]],
    attempts: Sequence[Mapping[str, Any]],
    keyframes: Sequence[Mapping[str, Any]],
    load_factor: float,
    fixed_load_factor: float,
    displacement: np.ndarray,
    stability_status: str,
    minimum_eigenvalue: float,
    final_attempt: Mapping[str, Any] | None,
    termination_reason: str | None,
    mesh: Mapping[str, Any],
    member_states: Mapping[str, CorotationalMemberState],
    path_mode: str,
) -> Dict[str, Any]:
    control_types = {
        "fixed_then_variable": "fixed_preload_then_adaptive_variable_load",
        "fixed_only": "adaptive_fixed_load_control",
        "variable_only": "adaptive_load_control",
    }
    return {
        "schema": NONLINEAR_PATH_SCHEMA,
        "algorithm": {"id": "corotational_newton_v1", "version": "1"},
        "control": {
            "type": control_types[path_mode],
            "initialStep": settings["initialStep"],
            "minimumStep": settings["minStep"],
            "maximumStep": settings["maxStep"],
            "lineSearch": "residual_reduction",
        },
        "convergence": {
            key: settings[key]
            for key in (
                "relativeResidualTolerance",
                "absoluteResidualToleranceN",
                "relativeDisplacementTolerance",
                "absoluteDisplacementToleranceM",
                "relativeEnergyTolerance",
                "absoluteEnergyToleranceJ",
            )
        },
        "mesh": deepcopy(dict(mesh["diagnostics"])),
        "representativeElementState": _representative_element_state(member_states),
        "steps": [deepcopy(dict(item)) for item in steps],
        "iterations": [deepcopy(dict(item)) for item in iterations],
        "attempts": [deepcopy(dict(item)) for item in attempts],
        "keyframes": [deepcopy(dict(item)) for item in keyframes],
        "keyPoints": _nonlinear_key_points(
            steps=steps,
            iterations=iterations,
            attempts=attempts,
            keyframes=keyframes,
            final_attempt=final_attempt,
            path_mode=path_mode,
        ),
        "lastConverged": {
            "loadFactor": round(float(load_factor), 12),
            "fixedLoadFactor": round(float(fixed_load_factor), 12),
            "maxDisplacementMm": _finite_round(_max_translation(displacement) * 1000.0, 8),
            "step": len(steps),
        },
        "finalAttempt": deepcopy(dict(final_attempt)) if final_attempt else None,
        "summary": {
            "equilibriumStatus": "converged" if termination_reason is None else "not_converged",
            "stabilityStatus": stability_status,
            "minimumTangentEigenvalue": _finite_round(minimum_eigenvalue, 10),
            "acceptedSteps": len(steps),
            "failedAttempts": len(attempts),
            "totalIterations": len(iterations),
            "terminationReason": termination_reason,
        },
    }


def _representative_element_state(
    member_states: Mapping[str, CorotationalMemberState],
) -> Dict[str, Any] | None:
    if not member_states:
        return None
    member_id = sorted(member_states)[0]
    state = member_states[member_id]
    tangent = np.asarray(state.tangent_stiffness, dtype=float)
    symmetry_residual = float(np.linalg.norm(tangent - tangent.T))
    return {
        "memberId": member_id,
        "referenceLengthM": _finite_round(state.reference_length, 12),
        "currentLengthM": _finite_round(state.current_length, 12),
        "referenceAngleRad": _finite_round(state.reference_angle, 12),
        "currentAngleRad": _finite_round(state.current_angle, 12),
        "chordRotationRad": _finite_round(state.chord_rotation, 12),
        "basicDeformations": {
            "axialExtensionM": _finite_round(state.basic_deformations[0], 12),
            "startRotationRad": _finite_round(state.basic_deformations[1], 12),
            "endRotationRad": _finite_round(state.basic_deformations[2], 12),
        },
        "basicForces": {
            "axialN": _finite_round(state.basic_forces[0], 8),
            "startMomentNm": _finite_round(state.basic_forces[1], 8),
            "endMomentNm": _finite_round(state.basic_forces[2], 8),
        },
        "tangentSymmetryResidual": _finite_round(symmetry_residual, 14),
    }


def _nonlinear_key_points(
    *,
    steps: Sequence[Mapping[str, Any]],
    iterations: Sequence[Mapping[str, Any]],
    attempts: Sequence[Mapping[str, Any]],
    keyframes: Sequence[Mapping[str, Any]],
    final_attempt: Mapping[str, Any] | None,
    path_mode: str,
) -> List[Dict[str, Any]]:
    """Build canonical path facts consumed by UI and report renderers.

    The records deliberately contain raw values and provenance rather than
    presentation labels. Consumers may format them, but must not re-detect
    turning points, residual peaks or failure locations independently.
    """

    records: List[Dict[str, Any]] = []
    seen: set[tuple[str, str, int]] = set()

    def add(
        kind: str,
        source: str,
        source_index: int,
        item: Mapping[str, Any],
        *,
        step_fallback: Mapping[str, Any] | None = None,
    ) -> None:
        key = (kind, source, source_index)
        if key in seen:
            return
        seen.add(key)
        fallback = step_fallback or {}
        load_factor = float(item.get("loadFactor", fallback.get("loadFactor", 0.0)) or 0.0)
        fixed_factor = float(item.get("fixedLoadFactor", fallback.get("fixedLoadFactor", 0.0)) or 0.0)
        phase = str(item.get("pathPhase", fallback.get("pathPhase", "variable")) or "variable")
        record = {
            "id": f"{kind}:{source}:{source_index}",
            "kind": kind,
            "source": source,
            "sourceIndex": int(source_index),
            "step": int(item.get("step", fallback.get("step", 0)) or 0),
            "pathPhase": phase,
            "pathProgress": _path_progress(phase, fixed_factor, load_factor, path_mode),
            "fixedLoadFactor": round(fixed_factor, 12),
            "loadFactor": round(load_factor, 12),
            "maxDisplacementMm": _optional_finite_round(
                item.get("maxDisplacementMm", fallback.get("maxDisplacementMm")), 8
            ),
            "minimumTangentEigenvalue": _optional_finite_round(
                item.get("minimumTangentEigenvalue", fallback.get("minimumTangentEigenvalue")), 10
            ),
            "equilibriumResidualRelative": _optional_finite_round(
                item.get("equilibriumResidualRelative"), 14
            ),
            "status": item.get("status", fallback.get("equilibriumStatus")),
            "stabilityStatus": item.get("stabilityStatus", fallback.get("stabilityStatus")),
        }
        records.append(record)

    first_keyframe = keyframes[0] if keyframes else {}
    initial_displacement_mm = 0.0
    for node in first_keyframe.get("nodeDisplacements", []):
        initial_displacement_mm = max(
            initial_displacement_mm,
            math.hypot(float(node.get("uxM", 0.0)), float(node.get("uyM", 0.0))) * 1000.0,
        )
    add(
        "start",
        "keyframe",
        0,
        {
            **dict(first_keyframe),
            "maxDisplacementMm": initial_displacement_mm,
            "status": "converged",
        },
    )

    step_list = [dict(item) for item in steps]
    for index, step in enumerate(step_list):
        if (
            str(step.get("pathPhase")) == "fixed_preload"
            and float(step.get("fixedLoadFactor", 0.0)) >= 1.0 - 1e-12
        ):
            add("preload_end", "step", index, step)
            break

    for index in range(1, len(step_list) - 1):
        previous = step_list[index - 1]
        current = step_list[index]
        following = step_list[index + 1]
        previous_value = float(previous.get("maxDisplacementMm", 0.0))
        current_value = float(current.get("maxDisplacementMm", 0.0))
        following_value = float(following.get("maxDisplacementMm", 0.0))
        incoming = current_value - previous_value
        outgoing = following_value - current_value
        tolerance = max(1e-9, max(abs(previous_value), abs(current_value), abs(following_value)) * 1e-8)
        if abs(incoming) > tolerance and abs(outgoing) > tolerance and incoming * outgoing < 0.0:
            add("response_turning", "step", index, current)

    for index in range(1, len(step_list)):
        if step_list[index].get("stabilityStatus") != step_list[index - 1].get("stabilityStatus"):
            add("stability_change", "step", index, step_list[index])

    if step_list:
        minimum_index = min(
            range(len(step_list)),
            key=lambda index: float(step_list[index].get("minimumTangentEigenvalue", math.inf)),
        )
        add("minimum_stability", "step", minimum_index, step_list[minimum_index])

    iteration_list = [dict(item) for item in iterations]
    residual_candidates = [
        (index, item)
        for index, item in enumerate(iteration_list)
        if _is_finite_number(item.get("equilibriumResidualRelative"))
    ]
    if residual_candidates:
        residual_index, residual_record = max(
            residual_candidates,
            key=lambda pair: float(pair[1]["equilibriumResidualRelative"]),
        )
        matching_step = next(
            (item for item in reversed(step_list) if int(item.get("step", 0)) == int(residual_record.get("step", 0))),
            None,
        )
        add("residual_peak", "iteration", residual_index, residual_record, step_fallback=matching_step)

    for index, attempt in enumerate(attempts):
        if str(attempt.get("status")) != "cutback":
            continue
        prior = next(
            (item for item in reversed(step_list) if int(item.get("step", 0)) < int(attempt.get("step", 0))),
            step_list[0] if step_list else None,
        )
        add("cutback", "attempt", index, attempt, step_fallback=prior)

    if step_list:
        add("last_converged", "step", len(step_list) - 1, step_list[-1])
    if final_attempt and str(final_attempt.get("status")) == "failed":
        add(
            "failure",
            "finalAttempt",
            0,
            final_attempt,
            step_fallback=step_list[-1] if step_list else None,
        )

    priority = {
        "start": 0,
        "preload_end": 1,
        "response_turning": 2,
        "stability_change": 3,
        "minimum_stability": 4,
        "residual_peak": 5,
        "cutback": 6,
        "last_converged": 7,
        "failure": 8,
    }
    records.sort(
        key=lambda item: (
            float(item["pathProgress"]),
            int(item["step"]),
            priority.get(str(item["kind"]), 99),
            int(item["sourceIndex"]),
        )
    )
    return records


def _path_progress(phase: str, fixed_factor: float, load_factor: float, path_mode: str) -> float:
    if phase == "fixed_preload":
        return round(float(fixed_factor), 12)
    return round((1.0 if path_mode == "fixed_then_variable" else 0.0) + float(load_factor), 12)


def _is_finite_number(value: Any) -> bool:
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


def _optional_finite_round(value: Any, digits: int) -> float | None:
    if not _is_finite_number(value):
        return None
    return round(float(value), digits)


def _finite_round(value: float, digits: int) -> float:
    numeric = float(value)
    if not math.isfinite(numeric):
        return numeric
    return round(numeric, digits)


def _apply_initial_imperfection(
    structure: Mapping[str, Any],
    imperfection: Mapping[str, Any],
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    reference = deepcopy(dict(structure))
    imperfection_type = str(imperfection.get("type") or "none")
    if imperfection_type == "none":
        return reference, {"type": "none", "nodeOffsets": [], "maximumAmplitudeMm": 0.0}
    if imperfection_type != "explicit":
        raise ValueError("共回转内核只接受已解析为 explicit 的初始缺陷；屈曲模态必须由应用层先解析")
    offsets = {
        str(item.get("nodeId")): (
            float(item.get("uxMm", 0.0)) / 1000.0,
            float(item.get("uyMm", 0.0)) / 1000.0,
        )
        for item in imperfection.get("nodeOffsets", [])
        if isinstance(item, Mapping) and str(item.get("nodeId") or "")
    }
    known_nodes = {str(node["id"]) for node in structure.get("nodes", [])}
    unknown = sorted(set(offsets) - known_nodes)
    if unknown:
        raise ValueError(f"初始缺陷引用了不存在的节点 {unknown[0]}")
    applied: List[Dict[str, Any]] = []
    nodes: List[Dict[str, Any]] = []
    for node in structure.get("nodes", []):
        item = deepcopy(dict(node))
        ux, uy = offsets.get(str(node["id"]), (0.0, 0.0))
        item["x"] = float(item["x"]) + ux
        item["y"] = float(item["y"]) + uy
        nodes.append(item)
        if abs(ux) > 0.0 or abs(uy) > 0.0:
            applied.append(
                {
                    "nodeId": str(node["id"]),
                    "uxMm": round(ux * 1000.0, 9),
                    "uyMm": round(uy * 1000.0, 9),
                }
            )
    reference["nodes"] = nodes
    maximum = max((math.hypot(item["uxMm"], item["uyMm"]) for item in applied), default=0.0)
    return reference, {
        "type": "explicit",
        "nodeOffsets": applied,
        "maximumAmplitudeMm": round(float(maximum), 9),
        "source": deepcopy(imperfection.get("source")),
        "memberShapeOffsets": deepcopy(list(imperfection.get("memberShapeOffsets", [])))
        if isinstance(imperfection.get("memberShapeOffsets"), list)
        else [],
    }


def _apply_member_shape_imperfection(structure: Dict[str, Any], imperfection: Mapping[str, Any]) -> None:
    raw_shapes = imperfection.get("memberShapeOffsets", [])
    if not isinstance(raw_shapes, list):
        return
    shapes = {
        str(item.get("memberId")): item
        for item in raw_shapes
        if isinstance(item, Mapping) and str(item.get("memberId") or "")
    }
    for node in structure.get("nodes", []):
        if not node.get("isNonlinearMeshNode"):
            continue
        shape = shapes.get(str(node.get("sourceMemberId")))
        if not shape:
            continue
        ratios = [float(value) for value in shape.get("ratios", [])]
        ux_values = [float(value) for value in shape.get("uxMm", [])]
        uy_values = [float(value) for value in shape.get("uyMm", [])]
        count = min(len(ratios), len(ux_values), len(uy_values))
        if count < 2:
            continue
        ratio = float(node.get("sourceRatio", 0.0))
        shape_ux_mm = float(np.interp(ratio, ratios[:count], ux_values[:count]))
        shape_uy_mm = float(np.interp(ratio, ratios[:count], uy_values[:count]))
        # The refined node already lies on the chord between the imperfect
        # input-member endpoints because nodal offsets are applied before mesh
        # refinement.  Member mode shapes contain absolute modal offsets, so
        # adding them directly would count the endpoint chord contribution a
        # second time.  Add only the modal deviation from that chord.
        start_ux_mm = float(np.interp(0.0, ratios[:count], ux_values[:count]))
        end_ux_mm = float(np.interp(1.0, ratios[:count], ux_values[:count]))
        start_uy_mm = float(np.interp(0.0, ratios[:count], uy_values[:count]))
        end_uy_mm = float(np.interp(1.0, ratios[:count], uy_values[:count]))
        ux_mm = shape_ux_mm - ((1.0 - ratio) * start_ux_mm + ratio * end_ux_mm)
        uy_mm = shape_uy_mm - ((1.0 - ratio) * start_uy_mm + ratio * end_uy_mm)
        node["x"] = float(node["x"]) + ux_mm / 1000.0
        node["y"] = float(node["y"]) + uy_mm / 1000.0


def _refine_structure(structure: Mapping[str, Any], subdivisions: int) -> Dict[str, Any]:
    original = deepcopy(dict(structure))
    original_nodes = [deepcopy(dict(node)) for node in structure.get("nodes", [])]
    node_by_id = {str(node["id"]): node for node in original_nodes}
    refined_nodes = list(original_nodes)
    refined_members: List[Dict[str, Any]] = []
    member_segments: Dict[str, List[str]] = {}

    for member in structure.get("members", []):
        member_id = str(member["id"])
        start = node_by_id[str(member["start"])]
        end = node_by_id[str(member["end"])]
        node_ids = [str(member["start"])]
        for index in range(1, subdivisions):
            ratio = index / subdivisions
            node_id = f"{member_id}__gna_node_{index}"
            refined_nodes.append(
                {
                    "id": node_id,
                    "x": float(start["x"]) + (float(end["x"]) - float(start["x"])) * ratio,
                    "y": float(start["y"]) + (float(end["y"]) - float(start["y"])) * ratio,
                    "supportType": "free",
                    "isNonlinearMeshNode": True,
                    "sourceMemberId": member_id,
                    "sourceRatio": ratio,
                }
            )
            node_ids.append(node_id)
        node_ids.append(str(member["end"]))
        segment_ids: List[str] = []
        releases = member.get("endReleases", {}) if isinstance(member.get("endReleases"), Mapping) else {}
        for index in range(subdivisions):
            segment = deepcopy(dict(member))
            segment_id = f"{member_id}__gna_{index + 1}"
            segment["id"] = segment_id
            segment["start"] = node_ids[index]
            segment["end"] = node_ids[index + 1]
            segment["sourceMemberId"] = member_id
            segment["sourceStartRatio"] = index / subdivisions
            segment["sourceEndRatio"] = (index + 1) / subdivisions
            segment["endReleases"] = {
                "start": deepcopy(list(releases.get("start", []))) if index == 0 else [],
                "end": deepcopy(list(releases.get("end", []))) if index == subdivisions - 1 else [],
            }
            refined_members.append(segment)
            segment_ids.append(segment_id)
        member_segments[member_id] = segment_ids

    refined_loads: List[Dict[str, Any]] = []
    for load in structure.get("loads", []):
        load_type = str(load.get("type"))
        if load_type == "nodal":
            refined_loads.append(deepcopy(dict(load)))
            continue
        member_id = str(load.get("member"))
        segments = member_segments.get(member_id)
        if not segments:
            refined_loads.append(deepcopy(dict(load)))
            continue
        if load_type == "member_point":
            ratio = min(1.0, max(0.0, to_float(load.get("positionRatio", load.get("ratio", 0.5)), 0.5)))
            index = min(subdivisions - 1, int(math.floor(ratio * subdivisions)))
            local_ratio = ratio * subdivisions - index
            item = deepcopy(dict(load))
            item["member"] = segments[index]
            item["positionRatio"] = min(1.0, max(0.0, local_ratio))
            refined_loads.append(item)
            continue
        if load_type == "temperature":
            for segment_id in segments:
                item = deepcopy(dict(load))
                item["member"] = segment_id
                refined_loads.append(item)
            continue
        if load_type == "distributed":
            refined_loads.extend(_split_distributed_load(load, segments, subdivisions))
            continue
        refined_loads.append(deepcopy(dict(load)))

    original["nodes"] = refined_nodes
    original["members"] = refined_members
    original["loads"] = refined_loads
    return {
        "structure": original,
        "memberSegments": member_segments,
        "diagnostics": {
            "originalNodeCount": len(original_nodes),
            "originalMemberCount": len(structure.get("members", [])),
            "refinedNodeCount": len(refined_nodes),
            "refinedMemberCount": len(refined_members),
            "memberSubdivisions": subdivisions,
            "originalNodeIds": [str(node["id"]) for node in original_nodes],
            "memberSegments": deepcopy(member_segments),
        },
    }


def _split_distributed_load(load: Mapping[str, Any], segments: Sequence[str], subdivisions: int) -> List[Dict[str, Any]]:
    start = min(1.0, max(0.0, to_float(load.get("startRatio", load.get("loadStartRatio", 0.0)), 0.0)))
    end = min(1.0, max(0.0, to_float(load.get("endRatio", load.get("loadEndRatio", 1.0)), 1.0)))
    q_start = to_float(load.get("qStartKnPerM", load.get("wyKnPerM", 0.0)), 0.0)
    q_end = to_float(load.get("qEndKnPerM", load.get("wyKnPerM", q_start)), q_start)
    if end < start:
        start, end = end, start
        q_start, q_end = q_end, q_start
    if end - start <= 1e-12:
        return []
    split: List[Dict[str, Any]] = []
    for index, segment_id in enumerate(segments):
        segment_start = index / subdivisions
        segment_end = (index + 1) / subdivisions
        overlap_start = max(start, segment_start)
        overlap_end = min(end, segment_end)
        if overlap_end - overlap_start <= 1e-12:
            continue
        ratio_start = (overlap_start - start) / (end - start)
        ratio_end = (overlap_end - start) / (end - start)
        item = deepcopy(dict(load))
        item["member"] = segment_id
        item["qStartKnPerM"] = q_start + (q_end - q_start) * ratio_start
        item["qEndKnPerM"] = q_start + (q_end - q_start) * ratio_end
        item["startRatio"] = (overlap_start - segment_start) * subdivisions
        item["endRatio"] = (overlap_end - segment_start) * subdivisions
        split.append(item)
    return split
