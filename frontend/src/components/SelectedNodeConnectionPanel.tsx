import { Plus } from "lucide-react";
import {
  connectableNodeOptionsForNode,
  resolveSelectedNodeConnectionTarget,
  type NodeConnectionOption,
} from "../lib/selected-node-connection.ts";
import { Button } from "./ui/button";
import { DropdownSelect } from "./ui/DropdownSelect";

interface SelectedNodeConnectionPanelProps {
  currentNodeId: string;
  nodeOptions: NodeConnectionOption[];
  connectionTargetId?: string;
  fieldLabelClass: string;
  memberTerm: "跨段" | "构件" | "杆件";
  duplicateExists: (startNodeId: string, endNodeId: string) => boolean;
  onConnectionTargetChange: (nextId: string) => void;
  onAddConnection: (startNodeId: string, endNodeId: string) => void;
  compact?: boolean;
}

export function SelectedNodeConnectionPanel({
  currentNodeId,
  nodeOptions,
  connectionTargetId,
  fieldLabelClass,
  memberTerm,
  duplicateExists,
  onConnectionTargetChange,
  onAddConnection,
  compact = false }: SelectedNodeConnectionPanelProps) {
  const connectableNodeOptions = connectableNodeOptionsForNode({ currentNodeId, nodeOptions, duplicateExists });
  const resolvedConnectionTargetId = resolveSelectedNodeConnectionTarget({
    currentNodeId,
    currentTargetId: connectionTargetId,
    nodeOptions,
    duplicateExists,
  });

  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-1">
          <div className={fieldLabelClass}>连接到节点</div>
          {connectableNodeOptions.length > 0 ? (
            <DropdownSelect
              value={resolvedConnectionTargetId}
              onChange={onConnectionTargetChange}
              options={connectableNodeOptions}
              className="text-xs font-mono"
              menuClassName="text-xs font-mono"
              ariaLabel={`连接到节点以新增${memberTerm}`}
            compact={compact} />
          ) : (
            <div className="flex items-center rounded-md border border-white/8 bg-slate-950/20 px-3 text-xs text-muted-foreground">
              无可连接节点
            </div>
          )}
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAddConnection(currentNodeId, resolvedConnectionTargetId)}
            disabled={!resolvedConnectionTargetId}
            className="rounded-lg px-3"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            新增{memberTerm}
          </Button>
        </div>
      </div>
    </div>
  );
}
