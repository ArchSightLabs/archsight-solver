import { Plus, Trash2 } from "lucide-react";
import { frameMemberExists } from "../lib/frame-editor-model.ts";
import { nodeCoordinateAriaLabel, nodeCoordinateLabel, supportAngleApplies, supportAngleAriaLabel, supportAngleHelpText, supportAngleLabel } from "../lib/node-field-vocabulary.ts";
import type { StructureMember, StructureNode } from "../types/structure.ts";
import { DeferredIdInput } from "./ui/DeferredIdInput";
import { Button } from "./ui/button";
import { DropdownSelect } from "./ui/DropdownSelect";
import { Input } from "./ui/input";
import { FrameNodeSpringField } from "./FrameNodeSpringField";
import { NodeSupportField } from "./NodeSupportField";

interface FrameNodeEditorProps {
  node: StructureNode;
  nodeIndex: number;
  nodeCount: number;
  members: StructureMember[];
  nodeOptions: Array<{ value: string; label: string }>;
  fieldLabelClass: string;
  onUpdate: (patch: Partial<StructureNode>) => void;
  onRemove: () => void;
  variant: "selected" | "table";
  connectionTargetId?: string;
  onConnectionTargetChange?: (nextId: string) => void;
  onAddMemberBetweenNodes?: (startId: string, endId: string) => void;
}

export function FrameNodeEditor({
  node,
  nodeIndex,
  nodeCount,
  members,
  nodeOptions,
  fieldLabelClass,
  onUpdate,
  onRemove,
  variant,
  connectionTargetId,
  onConnectionTargetChange,
  onAddMemberBetweenNodes,
}: FrameNodeEditorProps) {
  const isSelectedVariant = variant === "selected";
  const labelPrefix = isSelectedVariant ? "节点" : `第 ${nodeIndex + 1} 个节点`;
  const xLabel = nodeCoordinateLabel("x");
  const yLabel = nodeCoordinateLabel("y");
  const angleLabel = supportAngleLabel();
  const showSupportAngle = supportAngleApplies(node.supportType);
  const connectableNodeOptions = nodeOptions.filter((option) => option.value !== node.id && !frameMemberExists(members, node.id, option.value));
  const resolvedConnectionTargetId = connectableNodeOptions.some((option) => option.value === connectionTargetId)
    ? connectionTargetId ?? ""
    : connectableNodeOptions[0]?.value ?? "";
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
        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-1">
              <div className={fieldLabelClass}>连接到节点</div>
              {connectableNodeOptions.length > 0 ? (
                <DropdownSelect
                  value={resolvedConnectionTargetId}
                  onChange={onConnectionTargetChange ?? (() => undefined)}
                  options={connectableNodeOptions}
                  className="text-xs font-mono"
                  menuClassName="text-xs font-mono"
                  ariaLabel="连接到节点"
                />
              ) : (
                <div className="flex h-10 items-center rounded-md border border-white/8 bg-slate-950/20 px-3 text-xs text-muted-foreground">
                  无可连接节点
                </div>
              )}
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAddMemberBetweenNodes?.(node.id, resolvedConnectionTargetId)}
                disabled={!resolvedConnectionTargetId}
                className="h-10 rounded-lg px-3"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                新增构件
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <FrameNodeSpringField
        nodeId={node.id}
        springs={node.springs}
        fieldLabelClass={fieldLabelClass}
        onChange={(springs) => onUpdate({ springs })}
        showHint={isSelectedVariant}
      />
    </div>
  );
}
