import { Trash2 } from "lucide-react";
import { nodeCoordinateAriaLabel, nodeCoordinateLabel, supportAngleApplies, supportAngleAriaLabel, supportAngleHelpText, supportAngleLabel } from "../lib/node-field-vocabulary.ts";
import type { StructureNode } from "../types/structure.ts";
import { DeferredIdInput } from "./ui/DeferredIdInput";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { FrameNodeSpringField } from "./FrameNodeSpringField";
import { NodeSupportField } from "./NodeSupportField";
import { SelectedNodeConnectionPanel } from "./SelectedNodeConnectionPanel";

interface FrameNodeEditorProps {
  node: StructureNode;
  nodeIndex: number;
  nodeCount: number;
  nodeOptions: Array<{ value: string; label: string }>;
  fieldLabelClass: string;
  onUpdate: (patch: Partial<StructureNode>) => void;
  onRemove: () => void;
  variant: "selected" | "table";
  connectionTargetId?: string;
  onConnectionTargetChange?: (nextId: string) => void;
  onAddMemberBetweenNodes?: (startId: string, endId: string) => void;
  memberConnectionExists?: (startId: string, endId: string) => boolean;
}

export function FrameNodeEditor({
  node,
  nodeIndex,
  nodeCount,
  nodeOptions,
  fieldLabelClass,
  onUpdate,
  onRemove,
  variant,
  connectionTargetId,
  onConnectionTargetChange,
  onAddMemberBetweenNodes,
  memberConnectionExists = () => false,
}: FrameNodeEditorProps) {
  const isSelectedVariant = variant === "selected";
  const labelPrefix = isSelectedVariant ? "节点" : `第 ${nodeIndex + 1} 个节点`;
  const xLabel = nodeCoordinateLabel("x");
  const yLabel = nodeCoordinateLabel("y");
  const angleLabel = supportAngleLabel();
  const showSupportAngle = supportAngleApplies(node.supportType);
  const handleSupportTypeChange = (supportType: StructureNode["supportType"]) => {
    onUpdate({
      supportType,
      supportAngleDeg: supportAngleApplies(supportType) ? node.supportAngleDeg : undefined,
    });
  };

  return (
    <div className={`space-y-3 border border-white/8 bg-slate-950/20 p-3 ${isSelectedVariant ? "rounded-xl" : "rounded-2xl"}`}>
      {isSelectedVariant ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className={fieldLabelClass}>当前节点</div>
            <div className="mt-1 text-sm font-bold">{node.id}</div>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onRemove} disabled={nodeCount <= 1} aria-label="删除当前节点">
            <Trash2 className="h-4 w-4 text-rose-300" />
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className={fieldLabelClass}>节点编号</div>
          <DeferredIdInput
            key={`${variant}-frame-node-id-${node.id}`}
            ariaLabel={`${labelPrefix}编号`}
            value={node.id}
            onCommit={(nextId) => onUpdate({ id: nextId })}
            className="h-10 min-w-0 font-mono text-xs"
          />
        </div>
        <NodeSupportField
          mode="frame"
          supportType={node.supportType}
          supportAngleDeg={node.supportAngleDeg}
          springs={node.springs}
          onSupportTypeChange={handleSupportTypeChange}
          fieldLabelClass={fieldLabelClass}
          ariaLabel={`${labelPrefix}支座约束`}
          showHint={isSelectedVariant}
        />
        <div className="space-y-1">
          <div className={fieldLabelClass}>{xLabel}</div>
          <Input
            aria-label={nodeCoordinateAriaLabel(labelPrefix, "x")}
            name={`${node.id}-x`}
            type="number"
            step="0.1"
            value={node.x}
            onChange={(event) => onUpdate({ x: Number(event.target.value) || 0 })}
            className="h-10 min-w-0 font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <div className={fieldLabelClass}>{yLabel}</div>
          <Input
            aria-label={nodeCoordinateAriaLabel(labelPrefix, "y")}
            name={`${node.id}-y`}
            type="number"
            step="0.1"
            value={node.y}
            onChange={(event) => onUpdate({ y: Number(event.target.value) || 0 })}
            className="h-10 min-w-0 font-mono text-xs"
          />
        </div>
        {showSupportAngle ? (
          <div className="space-y-1">
            <div className={fieldLabelClass}>{angleLabel}</div>
            <Input
              aria-label={supportAngleAriaLabel(labelPrefix)}
              name={`${node.id}-support-angle`}
              type="number"
              step="1"
              value={node.supportAngleDeg ?? ""}
              onChange={(event) => onUpdate({ supportAngleDeg: event.target.value === "" ? undefined : Number(event.target.value) || 0 })}
              className="h-10 min-w-0 font-mono text-xs"
              placeholder="90"
            />
            {isSelectedVariant ? <div className="text-[10px] font-semibold leading-relaxed text-muted-foreground">{supportAngleHelpText()}</div> : null}
          </div>
        ) : null}
        {!isSelectedVariant ? (
          <div className="col-span-2 flex justify-end">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onRemove} disabled={nodeCount <= 1} aria-label={`删除第 ${nodeIndex + 1} 个节点`}>
              <Trash2 className="h-4 w-4 text-rose-300" />
            </Button>
          </div>
        ) : null}
      </div>

      {isSelectedVariant ? (
        <SelectedNodeConnectionPanel
          currentNodeId={node.id}
          nodeOptions={nodeOptions}
          connectionTargetId={connectionTargetId}
          fieldLabelClass={fieldLabelClass}
          memberTerm="构件"
          duplicateExists={memberConnectionExists}
          onConnectionTargetChange={onConnectionTargetChange ?? (() => undefined)}
          onAddConnection={onAddMemberBetweenNodes ?? (() => undefined)}
        />
      ) : null}

      <FrameNodeSpringField
        nodeId={node.id}
        springs={node.springs}
        fieldLabelClass={fieldLabelClass}
        onChange={(springs) => onUpdate({ springs })}
        showHint={isSelectedVariant}
        compactWhenEmpty={!isSelectedVariant}
      />
    </div>
  );
}
