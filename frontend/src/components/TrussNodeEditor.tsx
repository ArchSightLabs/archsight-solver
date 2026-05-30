import { Trash2 } from "lucide-react";

import { Button } from "./ui/button";
import { DeferredIdInput } from "./ui/DeferredIdInput";
import { Input } from "./ui/input";
import { NodeSupportField } from "./NodeSupportField";
import { nodeCoordinateAriaLabel, nodeCoordinateLabel } from "../lib/node-field-vocabulary.ts";
import type { TrussNode } from "../types/structure.ts";

interface TrussNodeEditorProps {
  node: TrussNode;
  nodeIndex: number;
  nodeCount: number;
  fieldLabelClass: string;
  onUpdate: (patch: Partial<TrussNode>) => void;
  onRemove: () => void;
  variant: "selected" | "table";
}

export function TrussNodeEditor({
  node,
  nodeIndex,
  nodeCount,
  fieldLabelClass,
  onUpdate,
  onRemove,
  variant,
}: TrussNodeEditorProps) {
  const isSelectedVariant = variant === "selected";
  const labelPrefix = isSelectedVariant ? "节点" : `第 ${nodeIndex + 1} 个节点`;
  const xLabel = nodeCoordinateLabel("x");
  const yLabel = nodeCoordinateLabel("y");

  return (
    <div
      className={
        isSelectedVariant
          ? "space-y-3 rounded-xl border border-white/8 bg-slate-950/20 p-3"
          : "grid grid-cols-1 gap-3 rounded-2xl border border-white/8 bg-slate-950/20 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.45fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto]"
      }
    >
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

      <div className={isSelectedVariant ? "grid grid-cols-2 gap-3" : "contents"}>
        <div className="space-y-1">
          <div className={fieldLabelClass}>节点编号</div>
          <DeferredIdInput
            key={`${variant}-truss-node-id-${node.id}`}
            ariaLabel={`${labelPrefix}编号`}
            value={node.id}
            onCommit={(nextId) => onUpdate({ id: nextId })}
            className="h-10 min-w-0 font-mono text-xs"
          />
        </div>
        <NodeSupportField
          mode="truss"
          supportType={node.supportType}
          onSupportTypeChange={(supportType) => onUpdate({ supportType })}
          fieldLabelClass={fieldLabelClass}
          showHint={isSelectedVariant}
          className={isSelectedVariant ? undefined : "sm:col-span-2 xl:col-span-1"}
          ariaLabel={`${labelPrefix}支座约束`}
        />
        <div className="space-y-1">
          <div className={fieldLabelClass}>{xLabel}</div>
          <Input
            aria-label={nodeCoordinateAriaLabel(labelPrefix, "x")}
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
            type="number"
            step="0.1"
            value={node.y}
            onChange={(event) => onUpdate({ y: Number(event.target.value) || 0 })}
            className="h-10 min-w-0 font-mono text-xs"
          />
        </div>
        {!isSelectedVariant ? (
          <div className="flex items-end sm:col-span-2 xl:col-span-1">
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onRemove} disabled={nodeCount <= 1} aria-label={`删除第 ${nodeIndex + 1} 个节点`}>
              <Trash2 className="h-4 w-4 text-rose-300" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
