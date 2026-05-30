import { useMemo, useState } from "react";

import {
  findAvailableNodePairForNode,
  findNextAvailableNodePair,
  resolveNodePairAfterEndChange,
  resolveNodePairAfterStartChange,
  resolveNodePairConnection,
  type NodePairConnectionSelection,
} from "../lib/node-pair-connection.ts";

export type NodePairDuplicateExists = (startNodeId: string, endNodeId: string) => boolean;

interface UseNodePairConnectionOptions {
  nodeIds: string[];
  duplicateExists: NodePairDuplicateExists;
  duplicateReason: string;
  initialStartNodeId?: string;
  initialEndNodeId?: string;
}

interface ResetNodePairOptions {
  nodeIds: string[];
  duplicateExists: NodePairDuplicateExists;
}

interface SelectNodePairForNodeOptions extends ResetNodePairOptions {
  nodeId: string;
  preferredNeighborId?: string;
}

interface AdvanceNodePairAfterConnectionOptions extends ResetNodePairOptions, NodePairConnectionSelection {}

export function useNodePairConnection({
  nodeIds,
  duplicateExists,
  duplicateReason,
  initialStartNodeId = nodeIds[0] ?? "",
  initialEndNodeId = nodeIds[1] ?? "",
}: UseNodePairConnectionOptions) {
  const [selectedStartNodeId, setSelectedStartNodeId] = useState(initialStartNodeId);
  const [selectedEndNodeId, setSelectedEndNodeId] = useState(initialEndNodeId);

  const connection = useMemo(
    () => resolveNodePairConnection({
      nodeIds,
      startNodeId: selectedStartNodeId,
      endNodeId: selectedEndNodeId,
      duplicateExists,
      duplicateReason,
    }),
    [duplicateExists, duplicateReason, nodeIds, selectedEndNodeId, selectedStartNodeId],
  );

  const setConnection = (next?: NodePairConnectionSelection) => {
    setSelectedStartNodeId(next?.startNodeId ?? nodeIds[0] ?? "");
    setSelectedEndNodeId(next?.endNodeId ?? nodeIds.find((id) => id !== nodeIds[0]) ?? "");
  };

  const updateStartNodeId = (nextId: string) => {
    setConnection(resolveNodePairAfterStartChange({
      nodeIds,
      nextStartNodeId: nextId,
      currentEndNodeId: connection.endNodeId,
    }));
  };

  const updateEndNodeId = (nextId: string) => {
    setConnection(resolveNodePairAfterEndChange({
      nodeIds,
      currentStartNodeId: connection.startNodeId,
      nextEndNodeId: nextId,
    }));
  };

  const resetToAvailablePair = ({ nodeIds: nextNodeIds, duplicateExists: nextDuplicateExists }: ResetNodePairOptions) => {
    const nextConnection = findNextAvailableNodePair({
      nodeIds: nextNodeIds,
      startNodeId: "",
      endNodeId: "",
      duplicateExists: nextDuplicateExists,
    });
    setSelectedStartNodeId(nextConnection?.startNodeId ?? nextNodeIds[0] ?? "");
    setSelectedEndNodeId(nextConnection?.endNodeId ?? nextNodeIds.find((id) => id !== nextNodeIds[0]) ?? "");
  };

  const selectAvailablePairForNode = ({
    nodeIds: nextNodeIds,
    nodeId,
    preferredNeighborId,
    duplicateExists: nextDuplicateExists,
  }: SelectNodePairForNodeOptions) => {
    const nextConnection = findAvailableNodePairForNode({
      nodeIds: nextNodeIds,
      nodeId,
      preferredNeighborId,
      duplicateExists: nextDuplicateExists,
    });
    if (nextConnection) {
      setSelectedStartNodeId(nextConnection.startNodeId);
      setSelectedEndNodeId(nextConnection.endNodeId);
      return;
    }
    resetToAvailablePair({ nodeIds: nextNodeIds, duplicateExists: nextDuplicateExists });
  };

  const advanceAfterConnection = ({
    nodeIds: nextNodeIds,
    startNodeId,
    endNodeId,
    duplicateExists: nextDuplicateExists,
  }: AdvanceNodePairAfterConnectionOptions) => {
    const nextConnection = findNextAvailableNodePair({
      nodeIds: nextNodeIds,
      startNodeId,
      endNodeId,
      duplicateExists: nextDuplicateExists,
    });
    if (nextConnection) {
      setSelectedStartNodeId(nextConnection.startNodeId);
      setSelectedEndNodeId(nextConnection.endNodeId);
    }
  };

  return {
    startNodeId: connection.startNodeId,
    endNodeId: connection.endNodeId,
    disabledReason: connection.disabledReason,
    updateStartNodeId,
    updateEndNodeId,
    resetToAvailablePair,
    selectAvailablePairForNode,
    advanceAfterConnection,
  };
}
