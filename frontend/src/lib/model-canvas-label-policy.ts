export interface ModelCanvasLabelPolicy {
  density: "normal" | "dense";
  nodeLabelStep: number;
  memberLabelStep: number;
}

function labelStep(total: number, visibleTarget: number) {
  if (total <= visibleTarget) return 1;
  return Math.max(2, Math.ceil(total / visibleTarget));
}

export function modelCanvasLabelPolicy({
  nodeCount,
  memberCount,
  nodeVisibleTarget,
  memberVisibleTarget,
}: {
  nodeCount: number;
  memberCount: number;
  nodeVisibleTarget: number;
  memberVisibleTarget: number;
}): ModelCanvasLabelPolicy {
  const nodeLabelStep = labelStep(nodeCount, nodeVisibleTarget);
  const memberLabelStep = labelStep(memberCount, memberVisibleTarget);

  return {
    density: nodeLabelStep > 1 || memberLabelStep > 1 ? "dense" : "normal",
    nodeLabelStep,
    memberLabelStep,
  };
}

export function shouldShowSteppedLabel({
  index,
  total,
  step,
  selected = false,
  pinned = false,
}: {
  index: number;
  total: number;
  step: number;
  selected?: boolean;
  pinned?: boolean;
}) {
  if (selected || pinned || step <= 1) return true;
  return index === 0 || index === total - 1 || index % step === 0;
}
