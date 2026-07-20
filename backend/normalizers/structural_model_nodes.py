from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional, Sequence

from backend.common.domain_errors import DuplicateStructureIdError, InvalidStiffnessInputError
from backend.common.numbers import to_float
from backend.normalizers.structural_model_types import StructuralNode, node_label, parse_support_type


def parse_nodes(
    raw_nodes: Sequence[Dict[str, Any]],
    *,
    labels: Mapping[str, str],
    min_count_error: str,
    max_count: int | None = None,
    max_count_error: str | None = None,
    allow_springs: bool = True,
    allow_support_angle: bool = True,
    allow_condensed_dofs: bool = True,
    allow_support_displacements: bool = True,
    unsupported_springs_error: str = "当前结构对象不支持节点弹性约束",
    unsupported_support_angle_error: str = "当前结构对象不支持滚动支座法向角",
    unsupported_condensed_dofs_error: str = "当前结构对象不支持节点凝聚自由度",
    unsupported_support_displacements_error: str = "当前结构对象不支持支座位移",
) -> List[StructuralNode]:
    nodes: List[StructuralNode] = []
    seen_ids: set[str] = set()
    for index, node in enumerate(raw_nodes):
        node_id = str(node.get("id") or node_label(index))
        if node_id in seen_ids:
            raise DuplicateStructureIdError("node", node_id, f"节点 ID 重复: {node_id}")
        seen_ids.add(node_id)
        if not allow_springs and node.get("springs") not in (None, "", []):
            raise ValueError(unsupported_springs_error)
        if not allow_support_angle and (node.get("supportAngleDeg") not in (None, "") or node.get("rollerAngleDeg") not in (None, "")):
            raise ValueError(unsupported_support_angle_error)
        if not allow_condensed_dofs and node.get("condensedDofs") not in (None, "", []):
            raise ValueError(unsupported_condensed_dofs_error)
        if not allow_support_displacements and node.get("supportDisplacements") not in (None, "", []):
            raise ValueError(unsupported_support_displacements_error)
        springs = parse_node_springs(node.get("springs", []), node_id=node_id)
        support_angle_deg = parse_support_angle(node.get("supportAngleDeg", node.get("rollerAngleDeg")))
        support_type = parse_support_type(node.get("supportType", node.get("support", "free")), labels)
        support_displacements = parse_node_support_displacements(node.get("supportDisplacements", []))
        validate_node_support_displacements(support_type, support_angle_deg, support_displacements)
        nodes.append(
            StructuralNode(
                id=node_id,
                x=to_float(node.get("x"), 0.0),
                y=to_float(node.get("y"), 0.0),
                support_type=support_type,
                support_angle_deg=support_angle_deg,
                condensed_dofs=parse_condensed_dofs(node.get("condensedDofs", [])),
                springs=springs,
                support_displacements=support_displacements,
            )
        )
    if len(nodes) < 2:
        raise ValueError(min_count_error)
    if max_count is not None and len(nodes) > max_count:
        raise ValueError(max_count_error or f"节点数量超出系统限制 (最大 {max_count} 个)")
    return nodes


def parse_condensed_dofs(raw_dofs: Any) -> List[str]:
    if raw_dofs in (None, ""):
        return []
    if isinstance(raw_dofs, str):
        raw_dofs = [raw_dofs]
    if not isinstance(raw_dofs, Sequence):
        raise ValueError("节点凝聚自由度必须使用数组定义")
    dofs = [str(item).strip().lower() for item in raw_dofs]
    invalid = [dof for dof in dofs if dof not in {"ux", "uy", "rz"}]
    if invalid:
        raise ValueError("节点凝聚自由度必须为 ux、uy 或 rz")
    return sorted(set(dofs), key={"ux": 0, "uy": 1, "rz": 2}.get)


def parse_support_angle(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    angle = to_float(value, 90.0)
    while angle < 0.0:
        angle += 180.0
    while angle >= 180.0:
        angle -= 180.0
    return angle


def parse_node_springs(raw_springs: Any, *, node_id: str = "unknown") -> List[Dict[str, Any]]:
    if raw_springs in (None, ""):
        return []
    if not isinstance(raw_springs, Sequence) or isinstance(raw_springs, (str, bytes)):
        raise ValueError("节点弹性约束必须使用 springs 数组定义")
    springs: List[Dict[str, Any]] = []
    for spring in raw_springs:
        if not isinstance(spring, Mapping):
            raise ValueError("节点弹性约束必须使用对象定义")
        dof = str(spring.get("dof") or "").strip().lower()
        if dof not in {"ux", "uy", "rz"}:
            raise ValueError("节点弹性约束自由度必须为 ux、uy 或 rz")
        if dof == "rz":
            stiffness = to_float(
                spring.get("stiffnessKnMPerRad", spring.get("stiffness", spring.get("k"))),
                0.0,
            )
            key = "stiffnessKnMPerRad"
        else:
            stiffness = to_float(
                spring.get("stiffnessKnPerM", spring.get("stiffness", spring.get("k"))),
                0.0,
            )
            key = "stiffnessKnPerM"
        if stiffness <= 0:
            raise InvalidStiffnessInputError("node", node_id, "节点弹性约束刚度必须大于 0")
        springs.append({"dof": dof, key: stiffness})
    return springs


def parse_node_support_displacements(raw_displacements: Any) -> List[Dict[str, Any]]:
    if raw_displacements in (None, ""):
        return []
    if not isinstance(raw_displacements, Sequence) or isinstance(raw_displacements, (str, bytes)):
        raise ValueError("支座位移必须使用 supportDisplacements 数组定义")
    displacements: List[Dict[str, Any]] = []
    seen_dofs: set[str] = set()
    for displacement in raw_displacements:
        if not isinstance(displacement, Mapping):
            raise ValueError("支座位移必须使用对象定义")
        dof = str(displacement.get("dof") or "").strip().lower()
        if dof not in {"ux", "uy", "rz", "n"}:
            raise ValueError("支座位移自由度必须为 ux、uy、rz 或 n")
        if dof in seen_dofs:
            continue
        seen_dofs.add(dof)
        if dof == "rz":
            rotation_deg = to_float(
                displacement.get("rotationDeg", displacement.get("valueDeg", displacement.get("value"))),
                0.0,
            )
            displacements.append({"dof": dof, "rotationDeg": rotation_deg})
            continue
        displacement_mm = to_float(
            displacement.get(
                "displacementMm",
                displacement.get("settlementMm", displacement.get("valueMm", displacement.get("value"))),
            ),
            0.0,
        )
        displacements.append({"dof": dof, "displacementMm": displacement_mm})
    return displacements


def validate_node_support_displacements(support_type: str, support_angle_deg: Optional[float], support_displacements: Sequence[Dict[str, Any]]) -> None:
    if not support_displacements:
        return
    if support_type == "fixed":
        allowed = {"ux", "uy", "rz"}
    elif support_type == "pinned":
        allowed = {"ux", "uy"}
    elif support_type == "roller" and support_angle_deg is not None:
        allowed = {"n"}
    elif support_type == "roller":
        allowed = {"uy"}
    else:
        allowed = set()
    invalid = [str(displacement.get("dof")) for displacement in support_displacements if str(displacement.get("dof")) not in allowed]
    if invalid:
        raise ValueError("支座位移只能定义在当前支座的刚性约束自由度上")
