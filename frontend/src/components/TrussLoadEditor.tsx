import { Trash2 } from "lucide-react";

import { Button } from "./ui/button";
import { DropdownSelect } from "./ui/DropdownSelect";
import { Input } from "./ui/input";
import {
  TRUSS_LOAD_TYPE_OPTIONS,
  TRUSS_MEMBER_LOAD_DIRECTION_OPTIONS,
  createTrussMemberLoadDraft,
  createTrussNodalLoadDraft,
  createTrussTemperatureLoadDraft,
} from "../lib/truss-editor-model.ts";
import { modelObjectMemberTerm } from "../lib/model-object-vocabulary.ts";
import type { TrussLoad, TrussLoadPatch, TrussMember, TrussNode } from "../types/structure.ts";

function isTrussMemberLoadDirection(value: string): value is "global_x" | "global_y" {
  return value === "global_x" || value === "global_y";
}

interface TrussLoadEditorProps {
  load: TrussLoad;
  index: number;
  nodes: TrussNode[];
  members: TrussMember[];
  nodeOptions: Array<{ value: string; label: string }>;
  memberOptions: Array<{ value: string; label: string }>;
  fieldLabelClass: string;
  onUpdate: (patch: TrussLoadPatch | TrussLoad) => void;
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
  const isMemberLoad = load.type === "distributed" || load.type === "member_load" || load.type === "member";
  const isTemperatureLoad = load.type === "temperature";
  const isNodalLoad = load.type === "nodal";
  const memberLoad = isMemberLoad ? load : null;
  const temperatureLoad = isTemperatureLoad ? load : null;
  const nodalLoad = isNodalLoad ? load : null;
  const memberTargetLoad = memberLoad ?? temperatureLoad;
  const isSelectedVariant = variant === "selected";
  const memberTerm = modelObjectMemberTerm("truss");

  return (
    <div className={`space-y-3 border border-white/8 bg-slate-950/20 p-3 ${isSelectedVariant ? "rounded-xl" : "rounded-2xl"}`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="space-y-1">
          <div className={fieldLabelClass}>荷载类型</div>
          <DropdownSelect
            value={isMemberLoad ? "distributed" : isTemperatureLoad ? "temperature" : "nodal"}
            onChange={(nextValue) => {
              if (nextValue === "distributed") {
                onUpdate(createTrussMemberLoadDraft(members, memberTargetLoad?.member));
                return;
              }
              if (nextValue === "temperature") {
                onUpdate(createTrussTemperatureLoadDraft(members, memberTargetLoad?.member));
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
          <div className={fieldLabelClass}>{!isNodalLoad ? `作用${memberTerm}` : "作用节点"}</div>
          {memberTargetLoad ? (
            <DropdownSelect value={memberTargetLoad.member} onChange={(nextValue) => onUpdate({ member: nextValue })} options={memberOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel={`第 ${index + 1} 条荷载作用${memberTerm}`} />
          ) : (
            <DropdownSelect value={nodalLoad?.node ?? nodes[0]?.id ?? "N1"} onChange={(nextValue) => onUpdate({ node: nextValue })} options={nodeOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel={`第 ${index + 1} 条荷载作用节点`} />
          )}
        </div>
        <div className="flex items-end">
          <Button variant="ghost" size="icon" className={isSelectedVariant ? "h-10 w-10 self-end" : "h-10 w-10"} onClick={onRemove} aria-label={isSelectedVariant ? "删除当前荷载" : `删除第 ${index + 1} 条荷载`}>
            <Trash2 className="h-4 w-4 text-rose-300" />
          </Button>
        </div>
      </div>
      {memberLoad ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <div className={fieldLabelClass}>荷载方向</div>
            <DropdownSelect
              value={memberLoad.direction ?? "global_y"}
              onChange={(nextValue) => onUpdate({ direction: isTrussMemberLoadDirection(nextValue) ? nextValue : "global_y" })}
              options={TRUSS_MEMBER_LOAD_DIRECTION_OPTIONS}
              className="text-xs font-mono"
              menuClassName="text-xs font-mono"
              ariaLabel={`第 ${index + 1} 条荷载方向`}
            />
          </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>起点线荷载（kN/m）</div>
            <Input aria-label={`第 ${index + 1} 条荷载起点线荷载（kN/m）`} type="number" step="0.1" value={memberLoad.qStartKnPerM ?? memberLoad.wyKnPerM ?? 0} onChange={(event) => onUpdate({ qStartKnPerM: Number(event.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>终点线荷载（kN/m）</div>
            <Input aria-label={`第 ${index + 1} 条荷载终点线荷载（kN/m）`} type="number" step="0.1" value={memberLoad.qEndKnPerM ?? memberLoad.wyKnPerM ?? 0} onChange={(event) => onUpdate({ qEndKnPerM: Number(event.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>自重强度（可选，kN/m）</div>
            <Input aria-label={`第 ${index + 1} 条荷载自重强度（可选，kN/m）`} type="number" step="0.1" value={memberLoad.selfWeightKnPerM ?? ""} onChange={(event) => onUpdate({ selfWeightKnPerM: event.target.value === "" ? undefined : Number(event.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" placeholder={isSelectedVariant ? "留空则按起终点线荷载" : "优先按向下自重换算"} />
          </div>
        </div>
      ) : temperatureLoad ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <div className={fieldLabelClass}>温差（°C）</div>
            <Input aria-label={`第 ${index + 1} 条荷载温差（°C）`} type="number" step="1" value={temperatureLoad.deltaTempC ?? 0} onChange={(event) => onUpdate({ deltaTempC: Number(event.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>线膨胀系数（1/°C）</div>
            <Input aria-label={`第 ${index + 1} 条荷载线膨胀系数`} type="number" step="0.000001" value={temperatureLoad.alphaPerC ?? 1.2e-5} onChange={(event) => onUpdate({ alphaPerC: Number(event.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <div className={fieldLabelClass}>{isSelectedVariant ? "X 向力（kN）" : "X 向力"}</div>
            <Input aria-label={`第 ${index + 1} 条荷载 X 向力${isSelectedVariant ? "（kN）" : ""}`} type="number" step="0.1" value={nodalLoad?.fxKn ?? 0} onChange={(event) => onUpdate({ fxKn: Number(event.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>{isSelectedVariant ? "Y 向力（kN）" : "Y 向力"}</div>
            <Input aria-label={`第 ${index + 1} 条荷载 Y 向力${isSelectedVariant ? "（kN）" : ""}`} type="number" step="0.1" value={nodalLoad?.fyKn ?? 0} onChange={(event) => onUpdate({ fyKn: Number(event.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
        </div>
      )}
    </div>
  );
}
