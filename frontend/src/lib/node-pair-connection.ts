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

interface FindNextAvailableNodePairOptions extends NodePairConnectionSelection {
  nodeIds: string[];
  duplicateExists: (startNodeId: string, endNodeId: string) => boolean;
}

export interface NodePairConnectionState extends NodePairConnectionSelection {
  disabledReason?: string;
}

function firstDifferentNodeId(nodeIds: string[], nodeId: string): string {
  return nodeIds.find((candidate) => candidate !== nodeId) ?? "";
}

function nodePairKey(startNodeId: string, endNodeId: string): string {
  return [startNodeId, endNodeId].sort().join("\u0000");
}

function listNodePairs(nodeIds: string[]): NodePairConnectionSelection[] {
  const pairs: NodePairConnectionSelection[] = [];
  for (let startIndex = 0; startIndex < nodeIds.length; startIndex += 1) {
    for (let endIndex = startIndex + 1; endIndex < nodeIds.length; endIndex += 1) {
      pairs.push({
        startNodeId: nodeIds[startIndex],
        endNodeId: nodeIds[endIndex],
      });
    }
  }
  return pairs;
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

export function findNextAvailableNodePair({
  nodeIds,
  startNodeId,
  endNodeId,
  duplicateExists,
}: FindNextAvailableNodePairOptions): NodePairConnectionSelection | undefined {
  const pairs = listNodePairs(nodeIds);
  if (pairs.length === 0) {
    return undefined;
  }
  const currentPairKey = nodePairKey(startNodeId, endNodeId);
  const currentIndex = pairs.findIndex((pair) => nodePairKey(pair.startNodeId, pair.endNodeId) === currentPairKey);

  for (let offset = 1; offset <= pairs.length; offset += 1) {
    const pair = pairs[((currentIndex >= 0 ? currentIndex : -1) + offset) % pairs.length];
    if (!duplicateExists(pair.startNodeId, pair.endNodeId)) {
      return pair;
    }
  }

  return undefined;
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
