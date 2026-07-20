from __future__ import annotations

from typing import List, Tuple

from backend.common.support_catalog import support_dof_indexes


def node_dofs(node_index: int) -> Tuple[int, int]:
    return node_index * 2, node_index * 2 + 1


def node_support_dofs(support_type: str) -> List[int]:
    return support_dof_indexes("truss", support_type)
