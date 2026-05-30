export interface NodePairConnectionSelection {
  startNodeId: string;
  endNodeId: string;
}

interface ResolveNodePairConnectionOptions extends NodePairConnectionSelection {
  nodeIds: string[];
  duplicateExists?: (startNodeId: string, endNodeId: string) => boolean;
  duplicateReason?: string;
  minNodeCountReason?: string;
  sameNodeReason?: string;
}

interface ResolveNodePairAfterStartChangeOptions {
  nodeIds: string[];
  nextStartNodeId: string;
  currentEndNodeId: string;
}

interface ResolveNodePairAfterEndChangeOptions {
  nodeIds: string[];
  currentStartNodeId: string;
  nextEndNodeId: string;
}

export interface NodePairConnectionState extends NodePairConnectionSelection {
  disabledReason?: string;
}

function firstDifferentNodeId(nodeIds: string[], nodeId: string): string {
  return nodeIds.find((candidate) => candidate !== nodeId) ?? "";
}

export function resolveNodePairConnection({
  nodeIds,
  startNodeId,
  endNodeId,
  duplicateExists = () => false,
  duplicateReason = "两节点间已有连接",
  minNodeCountReason = "至少需要 2 个节点",
  sameNodeReason = "起点和终点不能相同",
}: ResolveNodePairConnectionOptions): NodePairConnectionState {
  const resolvedStartNodeId = nodeIds.includes(startNodeId) ? startNodeId : nodeIds[0] ?? "";
  const resolvedEndNodeId =
    nodeIds.includes(endNodeId) && endNodeId !== resolvedStartNodeId
      ? endNodeId
      : firstDifferentNodeId(nodeIds, resolvedStartNodeId);
  const disabledReason =
    nodeIds.length < 2
      ? minNodeCountReason
      : resolvedStartNodeId === resolvedEndNodeId
        ? sameNodeReason
        : duplicateExists(resolvedStartNodeId, resolvedEndNodeId)
          ? duplicateReason
          : undefined;

  return {
    startNodeId: resolvedStartNodeId,
    endNodeId: resolvedEndNodeId,
    disabledReason,
  };
}

export function resolveNodePairAfterStartChange({
  nodeIds,
  nextStartNodeId,
  currentEndNodeId,
}: ResolveNodePairAfterStartChangeOptions): NodePairConnectionSelection {
  return {
    startNodeId: nextStartNodeId,
    endNodeId: nextStartNodeId === currentEndNodeId ? firstDifferentNodeId(nodeIds, nextStartNodeId) : currentEndNodeId,
  };
}

export function resolveNodePairAfterEndChange({
  nodeIds,
  currentStartNodeId,
  nextEndNodeId,
}: ResolveNodePairAfterEndChangeOptions): NodePairConnectionSelection {
  return {
    startNodeId: nextEndNodeId === currentStartNodeId ? firstDifferentNodeId(nodeIds, nextEndNodeId) : currentStartNodeId,
    endNodeId: nextEndNodeId,
  };
}
