import { createPortalFrameModelFromState } from "./lib/workspace-state.ts";
import { MAX_FRAME_MEMBERS, MAX_FRAME_NODES, MAX_TRUSS_MEMBERS, MAX_TRUSS_NODES } from "./lib/solver-limits.ts";
import type { BeamApiPayload, BeamLinearLoadConfig, BeamSpanConfig, BeamWorkspaceState } from "./types/beam.ts";
import type {
  FrameFormPayload,
  FrameLoad,
  FrameLoadCase,
  FrameLoadCombination,
  FrameWorkspaceState,
  StructureNode,
  TrussFormPayload,
  TrussLoad,
  TrussNode,
  TrussWorkspaceState,
} from "./types/structure.ts";

const DEFAULT_BEAM_SPAN: BeamSpanConfig = { length: 4, E: 210, I: 4500 };

function beamLoadType(value: BeamWorkspaceState): BeamApiPayload["loadType"] {
  const linearLoads = activeBeamLinearLoads(value);
  const activeTypeCount = (value.uniformLoadEnabled ? 1 : 0) + linearLoads.length + value.pointLoads.length;
  if (activeTypeCount === 0) return "none";
  if (activeTypeCount > 1) return "combined";
  if (value.uniformLoadEnabled) return "uniform";
  if (linearLoads.length) return "linear";
  return "point";
}

function activeBeamLinearLoads(value: BeamWorkspaceState): BeamLinearLoadConfig[] {
  if (!value.linearLoadEnabled) {
    return [];
  }
  if (value.linearLoads.length) {
    return value.linearLoads;
  }
  return [{
    id: "L1",
    qStartKnPerM: value.distributedLoadStart,
    qEndKnPerM: value.distributedLoadEnd,
    startRatio: value.distributedLoadStartRatio,
    endRatio: value.distributedLoadEndRatio,
  }];
}

function normalizedRatioRange(startRatio: number, endRatio: number) {
  let start = Number.isFinite(startRatio) ? Math.min(Math.max(startRatio, 0), 1) : 0;
  let end = Number.isFinite(endRatio) ? Math.min(Math.max(endRatio, 0), 1) : 1;
  if (end < start) {
    [start, end] = [end, start];
  }
  if (Math.abs(end - start) < 1e-9) {
    end = Math.min(1, start + 0.01);
    if (Math.abs(end - start) < 1e-9) {
      start = Math.max(0, end - 0.01);
    }
  }
  return { start, end };
}

function buildBeamLoads(value: BeamWorkspaceState) {
  const totalLength = Math.max(value.spans.reduce((sum, span) => sum + span.length, 0), 1e-9);
  const uniformRange = normalizedRatioRange(value.uniformLoadStartRatio, value.uniformLoadEndRatio);
  const uniformLoad = {
    type: "uniform" as const,
    qKnPerM: value.q,
    ...(uniformRange.start > 1e-9 || uniformRange.end < 1 - 1e-9
      ? { start: uniformRange.start * totalLength, end: uniformRange.end * totalLength }
      : {}),
  };
  return [
    ...(value.uniformLoadEnabled ? [uniformLoad] : []),
    ...activeBeamLinearLoads(value).map((load) => {
      const startRatio = Math.min(load.startRatio, load.endRatio);
      const endRatio = Math.max(load.startRatio, load.endRatio);
      return {
          type: "linear" as const,
          qStartKnPerM: load.qStartKnPerM,
          qEndKnPerM: load.qEndKnPerM,
          start: startRatio * totalLength,
          end: endRatio * totalLength,
        };
    }),
    ...value.pointLoads.map((load) => ({
      type: "point" as const,
      pointLoadKn: load.magnitudeKn,
      x: Math.min(Math.max(load.positionRatio, 0), 1) * totalLength,
    })),
  ];
}

export function buildBeamPayload(value: BeamWorkspaceState, projectName = value.projectName): BeamApiPayload {
  const loads = buildBeamLoads(value);
  const loadType = beamLoadType(value);
  const primaryPointLoad = value.pointLoads[0];
  return {
    analysisType: "beam",
    spans: value.spans.map((span) => span.length),
    projectName,
    materialId: value.materialId,
    beamType: value.beamType,
    loadType,
    loads,
    loadValue: value.q,
    loadPosition: primaryPointLoad?.positionRatio ?? value.pointLoadPositionRatio,
    loadEnd: value.distributedLoadEndRatio,
    E: value.spans[0]?.E ?? DEFAULT_BEAM_SPAN.E,
    I: value.spans[0]?.I ?? DEFAULT_BEAM_SPAN.I,
    q: value.q,
    pointLoad: primaryPointLoad?.magnitudeKn ?? value.pointLoad,
    pointLoadPositionRatio: primaryPointLoad?.positionRatio ?? value.pointLoadPositionRatio,
    uniformLoadStartRatio: normalizedRatioRange(value.uniformLoadStartRatio, value.uniformLoadEndRatio).start,
    uniformLoadEndRatio: normalizedRatioRange(value.uniformLoadStartRatio, value.uniformLoadEndRatio).end,
    distributedLoadStart: value.distributedLoadStart,
    distributedLoadEnd: value.distributedLoadEnd,
    distributedLoadStartRatio: value.distributedLoadStartRatio,
    distributedLoadEndRatio: value.distributedLoadEndRatio,
    spanProperties: value.spans.map((span) => ({
      id: span.id,
      E: span.E,
      I: span.I,
      materialId: span.materialId,
    })),
    supports: value.supports.map((support) => ({
      id: support.id,
      x: support.x,
      type: support.type,
      constraints: support.constraints ? [...support.constraints] : undefined,
      springs: support.springs?.map((spring) => ({ ...spring })),
    })),
    freq: value.freq,
    duration: value.duration,
  };
}

export function createPortalFramePayload(value: FrameWorkspaceState, projectName = value.projectName): FrameFormPayload {
  const model = createPortalFrameModelFromState(value);

  return {
    analysisType: "frame",
    projectName,
    materialId: value.materialId,
    structure: {
      template: "portal_frame",
      span: value.span,
      height: value.height,
      left_support: value.leftSupport,
      right_support: value.rightSupport,
      beam_load_kn_per_m: value.beamLoadKnPerM,
      lateral_load_kn: value.lateralLoadKn,
      top_vertical_load_kn: value.topVerticalLoadKn,
      nodes: model.nodes,
      members: model.members,
      loads: model.loads,
    },
  };
}

function normalizeFrameLoad(load: FrameLoad): FrameLoad {
  if (load.type === "distributed") {
    let qStart = Number.isFinite(load.qStartKnPerM)
      ? Number(load.qStartKnPerM)
      : Number.isFinite(load.wyKnPerM)
        ? Number(load.wyKnPerM)
        : 0;
    let qEnd = Number.isFinite(load.qEndKnPerM)
      ? Number(load.qEndKnPerM)
      : Number.isFinite(load.wyKnPerM)
        ? Number(load.wyKnPerM)
        : qStart;
    let startRatio = normalizeFrameLoadPositionRatio(load.startRatio ?? 0);
    let endRatio = normalizeFrameLoadPositionRatio(load.endRatio ?? 1);
    if (endRatio < startRatio) {
      [startRatio, endRatio] = [endRatio, startRatio];
      [qStart, qEnd] = [qEnd, qStart];
    }
    if (Math.abs(endRatio - startRatio) < 1e-9) {
      endRatio = Math.min(1, startRatio + 0.01);
      if (Math.abs(endRatio - startRatio) < 1e-9) {
        startRatio = Math.max(0, endRatio - 0.01);
      }
    }
    return {
      type: "distributed",
      member: String(load.member ?? "M1").trim() || "M1",
      direction: load.direction === "global_y" ? "global_y" : "local_y",
      qStartKnPerM: qStart,
      qEndKnPerM: qEnd,
      startRatio,
      endRatio,
    };
  }

  if (load.type === "member_point") {
    return {
      type: "member_point",
      member: String(load.member ?? "M1").trim() || "M1",
      direction: load.direction === "global_y" ? "global_y" : "local_y",
      forceKn: Number.isFinite(load.forceKn) ? Number(load.forceKn) : 0,
      positionRatio: normalizeFrameLoadPositionRatio(load.positionRatio),
    };
  }

  return {
    type: "nodal",
    node: String(load.node ?? "N1").trim() || "N1",
    fxKn: Number.isFinite(load.fxKn) ? Number(load.fxKn) : 0,
    fyKn: Number.isFinite(load.fyKn) ? Number(load.fyKn) : 0,
    mzKnM: Number.isFinite(load.mzKnM) ? Number(load.mzKnM) : 0,
  };
}

function normalizeFrameLoadPositionRatio(value: unknown): number {
  const ratio = Number(value);
  return Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : 0.5;
}

function normalizeFrameLoadCases(loadCases: FrameLoadCase[]): FrameLoadCase[] {
  return loadCases.map((loadCase, index) => {
    const id = String(loadCase.id ?? `LC${index + 1}`).trim() || `LC${index + 1}`;
    return {
      id,
      title: String(loadCase.title ?? id).trim() || id,
      loads: loadCase.loads.map(normalizeFrameLoad),
    };
  });
}

function normalizeFrameLoadCombinations(combinations: FrameLoadCombination[], loadCases: FrameLoadCase[]): FrameLoadCombination[] {
  const caseIds = new Set(loadCases.map((loadCase) => loadCase.id));
  return combinations.map((combination, index) => {
    const id = String(combination.id ?? `COMB${index + 1}`).trim() || `COMB${index + 1}`;
    const factors = Object.fromEntries(
      Object.entries(combination.factors ?? {})
        .map(([caseId, factor]) => [caseId.trim(), factor] as const)
        .filter(([caseId]) => caseIds.has(caseId))
        .map(([caseId, factor]) => [caseId, Number.isFinite(factor) ? Number(factor) : 0])
    );
    return {
      id,
      title: String(combination.title ?? id).trim() || id,
      factors,
      tags: normalizeCombinationTags(combination.tags),
    };
  });
}

function normalizeCombinationTags(tags: FrameLoadCombination["tags"]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const rawTag of tags ?? []) {
    const tag = String(rawTag).trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    normalized.push(tag);
  }
  return normalized;
}

function normalizeCustomFrameCollections(value: FrameWorkspaceState) {
  const loadCases = normalizeFrameLoadCases(value.customLoadCases ?? []);
  return {
    nodes: value.customNodes.map((node, index) => ({
      id: String(node.id ?? `N${index + 1}`).trim() || `N${index + 1}`,
      x: Number.isFinite(node.x) ? Number(node.x) : 0,
      y: Number.isFinite(node.y) ? Number(node.y) : 0,
      supportType: (node.supportType ?? "free") as StructureNode["supportType"],
      supportAngleDeg: Number.isFinite(node.supportAngleDeg) ? Number(node.supportAngleDeg) : undefined,
      condensedDofs: node.condensedDofs?.length ? node.condensedDofs : undefined,
      springs: node.springs?.length ? node.springs.map((spring) => ({ ...spring })) : undefined,
    })),
    members: value.customMembers.map((member, index) => ({
      id: String(member.id ?? `M${index + 1}`).trim() || `M${index + 1}`,
      start: String(member.start ?? "N1").trim() || "N1",
      end: String(member.end ?? "N2").trim() || "N2",
      elementType: "frame" as const,
      E_GPa: Number.isFinite(member.E_GPa) ? Number(member.E_GPa) : 210,
      A_cm2: Number.isFinite(member.A_cm2) ? Number(member.A_cm2) : 120,
      I_cm4: Number.isFinite(member.I_cm4) ? Number(member.I_cm4) : 8000,
      kind: String(member.kind ?? "generic").trim() || "generic",
      endReleases: member.endReleases,
      internalHinges: member.internalHinges?.length ? member.internalHinges.map((hinge) => ({ ratio: Number(hinge.ratio) })) : undefined,
    })),
    loads: value.customLoads.map(normalizeFrameLoad) as FrameLoad[],
    loadCases,
    loadCombinations: normalizeFrameLoadCombinations(value.customLoadCombinations ?? [], loadCases),
  };
}

function normalizeCustomTrussCollections(value: TrussWorkspaceState) {
  const members = value.customMembers.map((member, index) => ({
    id: String(member.id ?? `M${index + 1}`).trim() || `M${index + 1}`,
    start: String(member.start ?? "N1").trim() || "N1",
    end: String(member.end ?? "N2").trim() || "N2",
    elementType: "truss" as const,
    E_GPa: Number.isFinite(member.E_GPa) ? Number(member.E_GPa) : 210,
    A_cm2: Number.isFinite(member.A_cm2) ? Number(member.A_cm2) : 24,
    kind: String(member.kind ?? "generic").trim() || "generic",
  }));
  return {
    nodes: value.customNodes.map((node, index) => ({
      id: String(node.id ?? `N${index + 1}`).trim() || `N${index + 1}`,
      x: Number.isFinite(node.x) ? Number(node.x) : 0,
      y: Number.isFinite(node.y) ? Number(node.y) : 0,
      supportType: normalizeTrussSupportType(node.supportType),
    })),
    members,
    loads: value.customLoads.map((load) => {
      if (load.type === "distributed" || load.type === "member_load" || load.type === "member") {
        return {
          type: load.type,
          member: String(load.member ?? members[0]?.id ?? "M1").trim() || members[0]?.id || "M1",
          direction: load.direction === "global_x" ? "global_x" : "global_y",
          wyKnPerM: Number.isFinite(load.wyKnPerM) ? Number(load.wyKnPerM) : undefined,
          qStartKnPerM: Number.isFinite(load.qStartKnPerM) ? Number(load.qStartKnPerM) : undefined,
          qEndKnPerM: Number.isFinite(load.qEndKnPerM) ? Number(load.qEndKnPerM) : undefined,
          selfWeightKnPerM: Number.isFinite(load.selfWeightKnPerM) ? Number(load.selfWeightKnPerM) : undefined,
        };
      }
      const nodalLoad = load.type === "nodal" ? load : null;
      return {
        type: "nodal" as const,
        node: String(nodalLoad?.node ?? "N1").trim() || "N1",
        fxKn: Number.isFinite(nodalLoad?.fxKn) ? Number(nodalLoad?.fxKn) : 0,
        fyKn: Number.isFinite(nodalLoad?.fyKn) ? Number(nodalLoad?.fyKn) : 0,
      };
    }) as TrussLoad[],
  };
}

function normalizeTrussSupportType(supportType: TrussNode["supportType"]): Exclude<TrussNode["supportType"], "fixed"> {
  if (supportType === "fixed") return "pinned";
  if (supportType === "pinned" || supportType === "roller" || supportType === "free") return supportType;
  return "free";
}

function rollerNormalComponents(angleDeg: number | undefined) {
  const angleRad = ((Number.isFinite(angleDeg) ? Number(angleDeg) : 90) * Math.PI) / 180;
  return {
    x: Math.abs(Math.cos(angleRad)),
    y: Math.abs(Math.sin(angleRad)),
  };
}

function positiveFrameSpringDof(node: StructureNode, dof: "ux" | "uy" | "rz"): boolean {
  return (node.springs ?? []).some((spring) => {
    if (spring.dof !== dof) return false;
    return spring.dof === "rz" ? spring.stiffnessKnMPerRad > 0 : spring.stiffnessKnPerM > 0;
  });
}

export function frameSupportStabilityWarning(nodes: StructureNode[]): string | null {
  let independentConstraintCount = 0;
  let hasXRestraint = false;
  let hasYRestraint = false;

  for (const node of nodes) {
    if (node.supportType === "fixed") {
      independentConstraintCount += 3;
      hasXRestraint = true;
      hasYRestraint = true;
    } else if (node.supportType === "pinned") {
      independentConstraintCount += 2;
      hasXRestraint = true;
      hasYRestraint = true;
    } else if (node.supportType === "roller") {
      independentConstraintCount += 1;
      const normal = rollerNormalComponents(node.supportAngleDeg);
      hasXRestraint = hasXRestraint || normal.x > 1e-6;
      hasYRestraint = hasYRestraint || normal.y > 1e-6;
    }

    if (positiveFrameSpringDof(node, "ux")) {
      independentConstraintCount += 1;
      hasXRestraint = true;
    }
    if (positiveFrameSpringDof(node, "uy")) {
      independentConstraintCount += 1;
      hasYRestraint = true;
    }
    if (positiveFrameSpringDof(node, "rz")) {
      independentConstraintCount += 1;
    }
  }

  if (!hasXRestraint) return "平面框架支座约束不足：缺少 X 向刚体位移约束。";
  if (!hasYRestraint) return "平面框架支座约束不足：缺少 Y 向刚体位移约束。";
  if (independentConstraintCount < 3) return "平面框架支座约束不足：至少需要 3 个独立约束（例如一个铰支座加一个滚动支座，或一个固结支座）。";
  return null;
}

export function trussSupportStabilityWarning(nodes: TrussNode[]): string | null {
  let independentConstraintCount = 0;
  let hasXRestraint = false;
  let hasYRestraint = false;

  for (const node of nodes) {
    const supportType = normalizeTrussSupportType(node.supportType);
    if (supportType === "pinned") {
      independentConstraintCount += 2;
      hasXRestraint = true;
      hasYRestraint = true;
    } else if (supportType === "roller") {
      independentConstraintCount += 1;
      hasYRestraint = true;
    }
  }

  if (!hasXRestraint) return "平面桁架支座约束不足：缺少 X 向刚体位移约束。";
  if (!hasYRestraint) return "平面桁架支座约束不足：缺少 Y 向刚体位移约束。";
  if (independentConstraintCount < 3) return "平面桁架支座约束不足：至少需要 3 个独立平动约束（例如一个铰支座加一个滚动支座）。";
  return null;
}

export function validateCustomFrameWorkspace(value: FrameWorkspaceState): string | null {
  const { nodes, members, loads } = normalizeCustomFrameCollections(value);

  if (nodes.length < 2) {
    return "自定义二维框架至少需要 2 个节点。";
  }
  if (nodes.length > MAX_FRAME_NODES) {
    return `框架节点数量超出系统限制（最大 ${MAX_FRAME_NODES} 个）。`;
  }

  const nodeIds = nodes.map((node) => node.id);
  if (new Set(nodeIds).size !== nodeIds.length) {
    return "节点 ID 不能重复。";
  }

  const memberIds = members.map((member) => member.id);
  if (members.length > 0 && new Set(memberIds).size !== memberIds.length) {
    return "构件 ID 不能重复。";
  }
  if (members.length > MAX_FRAME_MEMBERS) {
    return `框架构件数量超出系统限制（最大 ${MAX_FRAME_MEMBERS} 个）。`;
  }

  if (members.some((member) => !nodeIds.includes(member.start) || !nodeIds.includes(member.end))) {
    return "构件起止节点必须存在于当前节点列表中。";
  }

  const availableMemberIds = new Set(memberIds);
  if (
    loads.some((load) => frameLoadReferenceMissing(load, nodeIds, availableMemberIds)) ||
    (value.customLoadCases ?? []).some((loadCase) =>
      loadCase.loads.some((load) => frameLoadReferenceMissing(load, nodeIds, availableMemberIds))
    )
  ) {
    return "荷载引用了不存在的节点或构件。";
  }

  const loadCaseIds = (value.customLoadCases ?? []).map((loadCase) => loadCase.id.trim());
  if (new Set(loadCaseIds).size !== loadCaseIds.length) {
    return "荷载工况 ID 不能重复。";
  }
  const loadCaseSet = new Set(loadCaseIds);
  if ((value.customLoadCombinations ?? []).some((combination) => Object.keys(combination.factors).some((caseId) => !loadCaseSet.has(caseId.trim())))) {
    return "荷载组合引用了不存在的工况。";
  }
  if ((value.customLoadCombinations ?? []).some((combination) => Object.keys(combination.factors).length === 0)) {
    return "荷载组合 factors 不能为空。";
  }
  if ((value.customLoadCombinations ?? []).some((combination) => Object.values(combination.factors).every((factor) => Math.abs(Number(factor) || 0) < 1e-12))) {
    return "荷载组合 factors 不能全部为 0。";
  }

  if (members.length < 1) {
    return "自定义二维框架至少需要 1 个构件。";
  }

  const supportWarning = frameSupportStabilityWarning(nodes);
  if (supportWarning) {
    return supportWarning;
  }

  return null;
}

function frameLoadReferenceMissing(load: FrameLoad, nodeIds: string[], memberIds: Set<string>): boolean {
  if (load.type === "nodal") {
    return !nodeIds.includes(load.node);
  }
  return !memberIds.has(load.member);
}

export function buildFramePayload(value: FrameWorkspaceState, projectName = value.projectName): FrameFormPayload | null {
  if (value.frameMode !== "custom") {
    return createPortalFramePayload(value, projectName);
  }

  const validationError = validateCustomFrameWorkspace(value);
  if (validationError) {
    return null;
  }

  const custom = normalizeCustomFrameCollections(value);
  const optionalLoadCaseFields = custom.loadCases.length
    ? {
        loadCases: custom.loadCases,
        loadCombinations: custom.loadCombinations,
      }
    : {};
  return {
    analysisType: "frame",
    projectName,
    materialId: value.materialId,
    structure: {
      template: "explicit",
      nodes: custom.nodes,
      members: custom.members,
      loads: custom.loads,
      ...optionalLoadCaseFields,
    },
  };
}

export function validateCustomTrussWorkspace(value: TrussWorkspaceState): string | null {
  const { nodes, members, loads } = normalizeCustomTrussCollections(value);

  if (nodes.length < 2) {
    return "自定义二维平面桁架至少需要 2 个节点。";
  }
  if (nodes.length > MAX_TRUSS_NODES) {
    return `桁架节点数量超出系统限制（最大 ${MAX_TRUSS_NODES} 个）。`;
  }

  const nodeIds = nodes.map((node) => node.id);
  if (new Set(nodeIds).size !== nodeIds.length) {
    return "节点 ID 不能重复。";
  }

  const memberIds = members.map((member) => member.id);
  if (members.length > 0 && new Set(memberIds).size !== memberIds.length) {
    return "杆件 ID 不能重复。";
  }
  if (members.length > MAX_TRUSS_MEMBERS) {
    return `桁架杆件数量超出系统限制（最大 ${MAX_TRUSS_MEMBERS} 根）。`;
  }

  if (members.some((member) => !nodeIds.includes(member.start) || !nodeIds.includes(member.end))) {
    return "杆件起止节点必须存在于当前节点列表中。";
  }

  if (members.length < 1) {
    return "自定义二维平面桁架至少需要 1 个杆件。";
  }

  const availableNodeIds = new Set(nodeIds);
  const availableMemberIds = new Set(members.map((member) => member.id));
  if (
    loads.some((load) => load.type === "nodal" && !availableNodeIds.has(load.node)) ||
    loads.some((load) => load.type !== "nodal" && !availableMemberIds.has(load.member))
  ) {
    return "荷载引用了不存在的节点或杆件。";
  }

  const supportWarning = trussSupportStabilityWarning(nodes);
  if (supportWarning) {
    return supportWarning;
  }

  return null;
}

export function buildTrussPayload(value: TrussWorkspaceState, projectName = value.projectName): TrussFormPayload | null {
  const validationError = validateCustomTrussWorkspace(value);
  if (validationError) {
    return null;
  }

  const custom = normalizeCustomTrussCollections(value);
  return {
    analysisType: "truss",
    projectName,
    materialId: value.materialId,
    structure: {
      template: "explicit",
      nodes: custom.nodes,
      members: custom.members,
      loads: custom.loads,
    },
  };
}
