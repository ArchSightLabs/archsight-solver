import { Trash2 } from "lucide-react";

import { Button } from "./ui/button";
import { DropdownSelect } from "./ui/DropdownSelect";
import { Input } from "./ui/input";
import {
  TRUSS_LOAD_TYPE_OPTIONS,
  TRUSS_MEMBER_LOAD_DIRECTION_OPTIONS,
  createTrussMemberLoadDraft,
  createTrussNodalLoadDraft,
} from "../lib/truss-editor-model.ts";
import { modelObjectMemberTerm } from "../lib/model-object-vocabulary.ts";
import type { TrussLoad, TrussMember, TrussNode } from "../types/structure.ts";

interface TrussLoadEditorProps {
  load: TrussLoad;
  index: number;
  nodes: TrussNode[];
  members: TrussMember[];
  nodeOptions: Array<{ value: string; label: string }>;
  memberOptions: Array<{ value: string; label: string }>;
  fieldLabelClass: string;
  onUpdate: (patch: Partial<TrussLoad> | TrussLoad) => void;
  onRemove: () => void;
  variant: "selected" | "table";
}

export function TrussLoadEditor({
  load,
  index,
  nodes,
  members,
  nodeOptions,
  memberOptions,
  fieldLabelClass,
  onUpdate,
  onRemove,
  variant,
}: TrussLoadEditorProps) {
  const isMemberLoad = load.type !== "nodal";
  const isSelectedVariant = variant === "selected";
  const memberTerm = modelObjectMemberTerm("truss");

  return (
    <div className={`space-y-3 border border-white/8 bg-slate-950/20 p-3 ${isSelectedVariant ? "rounded-xl" : "rounded-2xl"}`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="space-y-1">
          <div className={fieldLabelClass}>荷载类型</div>
          <DropdownSelect
            value={isMemberLoad ? "distributed" : "nodal"}
            onChange={(nextValue) => {
              if (nextValue === "distributed") {
                onUpdate(createTrussMemberLoadDraft(members, isMemberLoad ? load.member : undefined));
                return;
              }
              onUpdate(createTrussNodalLoadDraft(nodes));
            }}
            options={TRUSS_LOAD_TYPE_OPTIONS}
            className="text-xs font-mono"
            menuClassName="text-xs font-mono"
            ariaLabel={`第 ${index + 1} 条荷载类型`}
          />
        </div>
        <div className="space-y-1">
          <div className={fieldLabelClass}>{isMemberLoad ? `作用${memberTerm}` : "作用节点"}</div>
          {isMemberLoad ? (
            <DropdownSelect value={load.member} onChange={(nextValue) => onUpdate({ member: nextValue } as Partial<TrussLoad>)} options={memberOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel={`第 ${index + 1} 条荷载作用${memberTerm}`} />
          ) : (
            <DropdownSelect value={load.node} onChange={(nextValue) => onUpdate({ node: nextValue })} options={nodeOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel={`第 ${index + 1} 条荷载作用节点`} />
          )}
        </div>
        <div className="flex items-end">
          <Button variant="ghost" size="icon" className={isSelectedVariant ? "h-10 w-10 self-end" : "h-10 w-10"} onClick={onRemove} aria-label={isSelectedVariant ? "删除当前荷载" : `删除第 ${index + 1} 条荷载`}>
            <Trash2 className="h-4 w-4 text-rose-300" />
          </Button>
        </div>
      </div>
      {isMemberLoad ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <div className={fieldLabelClass}>荷载方向</div>
            <DropdownSelect
              value={load.direction ?? "global_y"}
              onChange={(nextValue) => onUpdate({ direction: nextValue as "global_x" | "global_y" } as Partial<TrussLoad>)}
              options={TRUSS_MEMBER_LOAD_DIRECTION_OPTIONS}
              className="text-xs font-mono"
              menuClassName="text-xs font-mono"
              ariaLabel={`第 ${index + 1} 条荷载方向`}
            />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>起点线荷载（kN/m）</div>
            <Input aria-label={`第 ${index + 1} 条荷载起点线荷载（kN/m）`} type="number" step="0.1" value={load.qStartKnPerM ?? load.wyKnPerM ?? 0} onChange={(event) => onUpdate({ qStartKnPerM: Number(event.target.value) || 0 } as Partial<TrussLoad>)} className="h-10 min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>终点线荷载（kN/m）</div>
            <Input aria-label={`第 ${index + 1} 条荷载终点线荷载（kN/m）`} type="number" step="0.1" value={load.qEndKnPerM ?? load.wyKnPerM ?? 0} onChange={(event) => onUpdate({ qEndKnPerM: Number(event.target.value) || 0 } as Partial<TrussLoad>)} className="h-10 min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>自重强度（可选，kN/m）</div>
            <Input aria-label={`第 ${index + 1} 条荷载自重强度（可选，kN/m）`} type="number" step="0.1" value={load.selfWeightKnPerM ?? ""} onChange={(event) => onUpdate({ selfWeightKnPerM: event.target.value === "" ? undefined : Number(event.target.value) || 0 } as Partial<TrussLoad>)} className="h-10 min-w-0 font-mono text-xs" placeholder={isSelectedVariant ? "留空则按起终点线荷载" : "优先按向下自重换算"} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <div className={fieldLabelClass}>{isSelectedVariant ? "X 向力（kN）" : "X 向力"}</div>
            <Input aria-label={`第 ${index + 1} 条荷载 X 向力${isSelectedVariant ? "（kN）" : ""}`} type="number" step="0.1" value={load.fxKn ?? 0} onChange={(event) => onUpdate({ fxKn: Number(event.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>{isSelectedVariant ? "Y 向力（kN）" : "Y 向力"}</div>
            <Input aria-label={`第 ${index + 1} 条荷载 Y 向力${isSelectedVariant ? "（kN）" : ""}`} type="number" step="0.1" value={load.fyKn ?? 0} onChange={(event) => onUpdate({ fyKn: Number(event.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
        </div>
      )}
    </div>
  );
}
