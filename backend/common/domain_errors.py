from __future__ import annotations

from typing import Any, Iterable, Mapping, Sequence


class SolverDomainError(ValueError):
    """Stable, transport-neutral error raised by model normalization and solving."""

    def __init__(
        self,
        message: str,
        *,
        code: str,
        title: str,
        detail: str,
        category: str,
        suggestions: Sequence[str],
        action_id: str,
        action_label: str,
        object_refs: Iterable[Mapping[str, Any]] = (),
    ) -> None:
        super().__init__(message)
        self.code = code
        self.title = title
        self.detail = detail
        self.category = category
        self.suggestions = tuple(str(item) for item in suggestions)
        self.action_id = action_id
        self.action_label = action_label
        self.object_refs = tuple(
            {"kind": str(ref.get("kind", "")), "id": str(ref.get("id", ""))}
            for ref in object_refs
            if ref.get("kind") and ref.get("id")
        )


class DuplicateStructureIdError(SolverDomainError):
    def __init__(self, object_kind: str, object_id: str, message: str) -> None:
        super().__init__(
            message,
            code="STRUCTURE_DUPLICATE_ID",
            title="结构对象编号重复",
            detail="结构对象编号重复会导致引用关系无法唯一解析。",
            category="reference",
            suggestions=("为每个结构对象使用唯一编号。",),
            action_id="review_structure_ids",
            action_label="检查结构对象编号",
            object_refs=({"kind": object_kind, "id": object_id},),
        )


class InvalidStructureReferenceError(SolverDomainError):
    def __init__(
        self,
        object_kind: str,
        object_id: str,
        message: str,
        *,
        referenced_kind: str | None = None,
        referenced_id: str | None = None,
    ) -> None:
        refs = [{"kind": object_kind, "id": object_id}]
        if referenced_kind and referenced_id:
            refs.append({"kind": referenced_kind, "id": referenced_id})
        super().__init__(
            message,
            code="STRUCTURE_INVALID_REFERENCE",
            title="结构对象引用无效",
            detail="模型对象引用了不存在的节点、构件或荷载工况，拓扑关系无法完成装配。",
            category="reference",
            suggestions=("检查对象引用 ID 是否对应当前模型中已定义的对象。",),
            action_id="review_references",
            action_label="检查对象引用",
            object_refs=refs,
        )


class InvalidStiffnessInputError(SolverDomainError):
    def __init__(self, object_kind: str, object_id: str, message: str) -> None:
        super().__init__(
            message,
            code="STRUCTURE_INVALID_STIFFNESS_INPUT",
            title="刚度输入异常",
            detail="构件或弹性约束的刚度输入必须为有效正值，并符合公开单位口径。",
            category="input",
            suggestions=("检查 E、A、I 或弹性约束刚度是否大于 0，并复核单位。",),
            action_id="review_stiffness_units",
            action_label="检查刚度与单位",
            object_refs=({"kind": object_kind, "id": object_id},),
        )


class StructureStabilityError(SolverDomainError):
    def __init__(self, message: str, *, kind: str = "unstable") -> None:
        if kind == "overconstrained":
            code = "STRUCTURE_OVERCONSTRAINED"
            title = "结构自由度被全部约束"
            detail = "当前模型没有可求解的自由自由度。"
        elif kind == "singular":
            code = "STRUCTURE_SINGULAR_STIFFNESS"
            title = "刚度矩阵奇异"
            detail = "整体刚度矩阵秩不足，模型可能存在机构、孤立对象或无效刚度。"
        else:
            code = "STRUCTURE_UNSTABLE_CONSTRAINTS"
            title = "结构约束不足"
            detail = "当前约束不足以消除刚体位移或转角，结构体系无法稳定求解。"
        suggestions = ["检查支座、连接关系、构件刚度和自由度约束。"]
        if kind == "singular":
            suggestions.append("检查 E、A、I 等刚度输入及单位是否合理。")
        super().__init__(
            message,
            code=code,
            title=title,
            detail=detail,
            category="constraint" if kind != "singular" else "solver",
            suggestions=suggestions,
            action_id="review_connectivity" if kind == "singular" else "review_supports",
            action_label="检查连接、刚度与约束" if kind == "singular" else "检查支座与约束",
        )


class FrameStabilityError(SolverDomainError):
    def __init__(
        self,
        message: str,
        *,
        code: str,
        title: str,
        detail: str,
        suggestions: Sequence[str],
    ) -> None:
        super().__init__(
            message,
            code=code,
            title=title,
            detail=detail,
            category="solver",
            suggestions=suggestions,
            action_id="review_stability_analysis",
            action_label="检查稳定分析参数",
        )


class FramePDeltaConvergenceError(FrameStabilityError):
    def __init__(self, message: str) -> None:
        super().__init__(
            message,
            code="FRAME_PDELTA_NOT_CONVERGED",
            title="P-Delta 未收敛",
            detail="二阶迭代在给定荷载步与迭代上限内未达到收敛容差。",
            suggestions=(
                "增加 loadSteps 或 maxIterations。",
                "检查初始刚度、支座约束和荷载规模是否导致强烈失稳。",
            ),
        )


class FramePDeltaSingularError(FrameStabilityError):
    def __init__(self, message: str) -> None:
        super().__init__(
            message,
            code="FRAME_PDELTA_TANGENT_SINGULAR",
            title="P-Delta 切线刚度奇异",
            detail="几何刚度迭代引起的切线刚度矩阵秩不足，无法继续求解二阶状态。",
            suggestions=(
                "检查支座、侧向约束和构件连接关系。",
                "检查构件轴压是否导致局部或整体机构。",
            ),
        )


class FrameBucklingSolveError(FrameStabilityError):
    def __init__(self, message: str) -> None:
        super().__init__(
            message,
            code="FRAME_BUCKLING_EIGEN_FAILURE",
            title="屈曲特征求解失败",
            detail="约束投影后的线性屈曲特征值问题未能得到有效正特征值。",
            suggestions=(
                "检查初始受力状态与约束投影是否合理。",
                "检查模型是否以拉力为主或不存在可识别的压屈模态。",
            ),
        )


class FrameBucklingResidualError(FrameStabilityError):
    def __init__(self, message: str) -> None:
        super().__init__(
            message,
            code="FRAME_BUCKLING_RESIDUAL_FAILURE",
            title="屈曲模态残差失败",
            detail="屈曲模态的特征方程残差或约束残差超过容差，结果不满足公开稳定性门限。",
            suggestions=(
                "提高 bucklingOptions.modeCount 并复核正特征值排序。",
                "检查支座位移、角支座约束和局部释放是否引入数值病态。",
            ),
        )
