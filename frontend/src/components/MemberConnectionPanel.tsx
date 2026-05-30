import { Plus } from "lucide-react";

import { Button } from "./ui/button";
import { DropdownSelect, type DropdownOption } from "./ui/DropdownSelect";

interface MemberConnectionPanelProps {
  fieldLabelClass: string;
  memberTerm: string;
  nodeOptions: DropdownOption[];
  startNodeId: string;
  endNodeId: string;
  disabledReason?: string;
  onStartNodeChange: (nextId: string) => void;
  onEndNodeChange: (nextId: string) => void;
  onAddConnection: () => void;
}

export function MemberConnectionPanel({
  fieldLabelClass,
  memberTerm,
  nodeOptions = [],
  startNodeId = "",
  endNodeId = "",
  disabledReason,
  onStartNodeChange,
  onEndNodeChange,
  onAddConnection,
}: MemberConnectionPanelProps) {
  const canConnect = nodeOptions.length >= 2 && !disabledReason;

  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="space-y-1">
          <div className={fieldLabelClass}>起点节点</div>
          <DropdownSelect
            value={startNodeId}
            onChange={onStartNodeChange}
            options={nodeOptions}
            className="text-xs font-mono"
            menuClassName="text-xs font-mono"
            ariaLabel={`新增${memberTerm}起点节点`}
          />
        </div>
        <div className="space-y-1">
          <div className={fieldLabelClass}>终点节点</div>
          <DropdownSelect
            value={endNodeId}
            onChange={onEndNodeChange}
            options={nodeOptions}
            className="text-xs font-mono"
            menuClassName="text-xs font-mono"
            ariaLabel={`新增${memberTerm}终点节点`}
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddConnection}
            disabled={!canConnect}
            className="h-10 rounded-lg px-3"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            连接为{memberTerm}
          </Button>
        </div>
      </div>
      {disabledReason ? (
        <div className="mt-2 text-[10px] font-semibold text-muted-foreground">{disabledReason}</div>
      ) : null}
    </div>
  );
}
