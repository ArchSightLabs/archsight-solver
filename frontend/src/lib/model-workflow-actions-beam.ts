import { MAX_BEAM_SPANS } from "./solver-limits.ts";
import { mergeDefaultBeamSupportLayout, renumberDefaultBeamSpanIds } from "./workspace-state.ts";
import type { WorkbenchSelection } from "../types/workbench-selection.ts";
import type { WorkspaceState } from "./workspace-state.ts";
import type { ApplyModelGeometryActionResult, ApplyModelSelectionDeleteOptions, ModelGeometryAction, ModelGeometryToolbarState, MoveModelCanvasNodeOptions } from "./model-workflow-actions-types.ts";

export function moveBeamCanvasNode({ workspace, nodeId, point }: MoveModelCanvasNodeOptions): ApplyModelGeometryActionResult | null {
  if (nodeId.startsWith("support-")) {
    const supportIndex = parseInt(nodeId.replace("support-", ""), 10);
    if (isNaN(supportIndex) || supportIndex < 0 || supportIndex >= workspace.beam.supports.length) return null;
    const total = Math.max(0.1, workspace.beam.spans.reduce((sum, span) => sum + span.length, 0));
    const supportX = Number(Math.min(total, Math.max(0, point.x)).toFixed(3));
    const supports = workspace.beam.supports.map((support, index) => (index === supportIndex ? { ...support, x: supportX } : support));

    return {
      workspace: { ...workspace, beam: { ...workspace.beam, supports } },
      selection: { mode: "beam", type: "support", id: nodeId },
    };
  }

  if (!nodeId.startsWith("node-")) return null;
  const nodeIndex = parseInt(nodeId.replace("node-", ""), 10);
  if (isNaN(nodeIndex) || nodeIndex <= 0 || nodeIndex >= workspace.beam.spans.length) return null;

  const spans = [...workspace.beam.spans];
  const prevSpan = spans[nodeIndex - 1];
  const nextSpan = spans[nodeIndex];
  const oldPrevLength = prevSpan.length;
  const oldNextLength = nextSpan.length;
  const totalLength = oldPrevLength + oldNextLength;

  let newPrevLength = point.x - workspace.beam.spans.slice(0, nodeIndex - 1).reduce((sum, span) => sum + span.length, 0);
  newPrevLength = Math.max(0.1, Math.min(totalLength - 0.1, newPrevLength));
  const nextPrevLength = Number(newPrevLength.toFixed(3));
  const nextNextLength = Number((totalLength - nextPrevLength).toFixed(3));

  spans[nodeIndex - 1] = { ...prevSpan, length: nextPrevLength };
  spans[nodeIndex] = { ...nextSpan, length: nextNextLength };
  const supports = mergeDefaultBeamSupportLayout(workspace.beam.beamType, spans, workspace.beam.supports);

  return {
    workspace: { ...workspace, beam: { ...workspace.beam, spans, supports } },
    selection: { mode: "beam", type: "node", id: nodeId },
  };
}

export function deleteBeamSelections({ workspace, selections }: ApplyModelSelectionDeleteOptions): ApplyModelGeometryActionResult | null {
  const spanSelections = selections.filter((selection) => selection.mode === "beam" && selection.type === "span");
  if (spanSelections.length === 0 || workspace.beam.spans.length <= spanSelections.length) return null;
  const spanIndexesToDelete = spanSelections.map((selection) => parseInt(selection.id.replace("span-", ""), 10)).filter((index) => !isNaN(index));
  const newSpans = renumberDefaultBeamSpanIds(workspace.beam.spans.filter((_, index) => !spanIndexesToDelete.includes(index)));
  const nextBeamType = workspace.beam.beamType === "continuous" && newSpans.length === 1 ? "simply_supported" : workspace.beam.beamType;
  const remainingSupports = workspace.beam.supports.filter((_, index) => !spanIndexesToDelete.includes(index));
  const supports = mergeDefaultBeamSupportLayout(nextBeamType, newSpans, remainingSupports);

  return {
    workspace: { ...workspace, beam: { ...workspace.beam, beamType: nextBeamType, spans: newSpans, supports } },
    selection: undefined,
  };
}

export function canDeleteBeamSelections(workspace: WorkspaceState, selections: WorkbenchSelection[]) {
  const hasSpans = selections.some((selection) => selection.mode === "beam" && selection.type === "span");
  return hasSpans && workspace.beam.spans.length > selections.filter((selection) => selection.mode === "beam" && selection.type === "span").length;
}

export function beamGeometryToolbarState(workspace: WorkspaceState, selection?: WorkbenchSelection | null): ModelGeometryToolbarState | null {
  const isSpanSelected = selection?.mode === "beam" && selection.type === "span";
  return {
    mode: "beam",
    targetLabel: isSpanSelected ? "选中跨段" : "全模型",
    memberTerm: "跨段",
    canTransform: false,
    canAddConnectedNode: workspace.beam.spans.length < MAX_BEAM_SPANS,
    connectsSelectedNodes: false,
    addConnectedNodeLabel: "增加跨段",
  };
}

export function applyBeamGeometryAction(workspace: WorkspaceState, action: ModelGeometryAction): ApplyModelGeometryActionResult | null {
  if (action !== "add-connected-node") return null;
  const spans = [...workspace.beam.spans];
  if (spans.length >= MAX_BEAM_SPANS) return null;
  const lastSpan = spans[spans.length - 1] ?? { length: 5, E: 30000000, I: 200000 };

  const existingIds = new Set(spans.map((s) => s.id));
  let suffix = spans.length + 1;
  let nextSpanId = `(${suffix})`;
  while (existingIds.has(nextSpanId)) {
    suffix += 1;
    nextSpanId = `(${suffix})`;
  }

  spans.push({
    id: nextSpanId,
    length: lastSpan.length,
    E: lastSpan.E,
    I: lastSpan.I,
    materialId: lastSpan.materialId,
  });

  const nextBeamType = workspace.beam.beamType === "simply_supported" ? "continuous" : workspace.beam.beamType;
  const supports = mergeDefaultBeamSupportLayout(nextBeamType, spans, workspace.beam.supports);

  return {
    workspace: { ...workspace, beam: { ...workspace.beam, beamType: nextBeamType, spans, supports } },
    selection: { mode: "beam", type: "span", id: `span-${spans.length - 1}` },
  };
}
