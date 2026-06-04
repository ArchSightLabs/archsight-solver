import { Trash2 } from "lucide-react";
import { modelObjectMemberTerm } from "../lib/model-object-vocabulary.ts";
import { snapCoordinateToGrid } from "../lib/node-coordinate-snap.ts";
import { nodeCoordinateAriaLabel, nodeCoordinateLabel, supportAngleApplies, supportAngleAriaLabel, supportAngleHelpText, supportAngleLabel } from "../lib/node-field-vocabulary.ts";
import type { StructureNode } from "../types/structure.ts";
import { DeferredIdInput } from "./ui/DeferredIdInput";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { FrameNodeSpringField } from "./FrameNodeSpringField";
import { FrameSupportDisplacementField } from "./FrameSupportDisplacementField";
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
  gridSnapEnabled?: boolean;
  gridSnapStepM?: number;
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
  gridSnapEnabled = false,
  gridSnapStepM = 0.5,
}: FrameNodeEditorProps) {
  const isSelectedVariant = variant === "selected";
  const memberTerm = modelObjectMemberTerm("frame");
  const labelPrefix = isSelectedVariant ? "节点" : `第 ${nodeIndex + 1} 个节点`;
  const xLabel = nodeCoordinateLabel("x");
  const yLabel = nodeCoordinateLabel("y");
  const angleLabel = supportAngleLabel();
  const showSupportAngle = supportAngleApplies(node.supportType);
  const showSpringField = isSelectedVariant || (node.springs?.length ?? 0) > 0;
  const showSupportDisplacementField = isSelectedVariant || (node.supportDisplacements?.length ?? 0) > 0;
  const parseCoordinateInput = (value: string) => (value === "" ? 0 : Number(value) || 0);
  const updateCoordinate = (coordinate: "x" | "y", value: number) => {
    onUpdate(coordinate === "x" ? { x: value } : { y: value });
  };
  const commitCoordinate = (coordinate: "x" | "y", value: string) => {
    updateCoordinate(coordinate, snapCoordinateToGrid(parseCoordinateInput(value), { enabled: gridSnapEnabled, stepM: gridSnapStepM }));
  };
  const handleSupportTypeChange = (supportType: StructureNode["supportType"]) => {
    onUpdate({
      supportType,
      supportAngleDeg: supportAngleApplies(supportType) ? node.supportAngleDeg : undefined,
      supportDisplacements: undefined,
    });
  };

  return (
    <div className={`space-y-3 border border-white/8 bg-slate-950/20 p-3 ${isSelectedVariant ? "rounded-xl" : "rounded-2xl"}`}>
      {isSelectedVariant ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-foreground">节点 {node.id}</span>
            <span>x={node.x}</span>
            <span>y={node.y}</span>
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
          supportDisplacements={node.supportDisplacements}
          onSupportTypeChange={handleSupportTypeChange}
          fieldLabelClass={fieldLabelClass}
          ariaLabel={`${labelPrefix}支座类型`}
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
            onChange={(event) => updateCoordinate("x", parseCoordinateInput(event.target.value))}
            onBlur={(event) => commitCoordinate("x", event.target.value)}
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
            onChange={(event) => updateCoordinate("y", parseCoordinateInput(event.target.value))}
            onBlur={(event) => commitCoordinate("y", event.target.value)}
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
          memberTerm={memberTerm}
          duplicateExists={memberConnectionExists}
          onConnectionTargetChange={onConnectionTargetChange ?? (() => undefined)}
          onAddConnection={onAddMemberBetweenNodes ?? (() => undefined)}
        />
      ) : null}

      {showSpringField ? (
        <FrameNodeSpringField
          nodeId={node.id}
          springs={node.springs}
          fieldLabelClass={fieldLabelClass}
          onChange={(springs) => onUpdate({ springs })}
          showHint={false}
          compactWhenEmpty={!isSelectedVariant}
        />
      ) : null}

      {showSupportDisplacementField ? (
        <FrameSupportDisplacementField
          node={node}
          fieldLabelClass={fieldLabelClass}
          onChange={(supportDisplacements) => onUpdate({ supportDisplacements })}
          compactWhenEmpty={!isSelectedVariant}
        />
      ) : null}
    </div>
  );
}
