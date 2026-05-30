export interface NodeConnectionOption {
  value: string;
  label: string;
}

interface SelectedNodeConnectionOptions {
  currentNodeId: string;
  nodeOptions: NodeConnectionOption[];
  duplicateExists: (startNodeId: string, endNodeId: string) => boolean;
}

interface ResolveSelectedNodeConnectionTargetOptions extends SelectedNodeConnectionOptions {
  currentTargetId?: string;
}

export function connectableNodeOptionsForNode({
  currentNodeId,
  nodeOptions,
  duplicateExists,
}: SelectedNodeConnectionOptions): NodeConnectionOption[] {
  return nodeOptions.filter((option) => option.value !== currentNodeId && !duplicateExists(currentNodeId, option.value));
}

export function resolveSelectedNodeConnectionTarget({
  currentNodeId,
  currentTargetId,
  nodeOptions,
  duplicateExists,
}: ResolveSelectedNodeConnectionTargetOptions): string {
  const connectableOptions = connectableNodeOptionsForNode({ currentNodeId, nodeOptions, duplicateExists });
  return connectableOptions.some((option) => option.value === currentTargetId)
    ? currentTargetId ?? ""
    : connectableOptions[0]?.value ?? "";
}
