import { Trash2 } from "lucide-react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { DropdownSelect, type DropdownOption } from "./ui/DropdownSelect";
import {
  FRAME_LOAD_DIRECTION_OPTIONS,
  FRAME_LOAD_TYPE_OPTIONS,
  frameDistributedLoadKindLabel,
} from "../lib/frame-editor-model.ts";
import type { FrameLoad, FrameLoadDirection, StructureMember, StructureNode } from "../types/structure.ts";

interface FrameLoadEditorProps {
  load: FrameLoad;
  index: number;
  nodes: StructureNode[];
  members: StructureMember[];
  nodeOptions: DropdownOption[];
  memberOptions: DropdownOption[];
  fieldLabelClass: string;
  onUpdate: (patch: Partial<FrameLoad>) => void;
  onRemove: () => void;
}

function clampRatio(value: number): number {
  return Math.min(1, Math.max(0, value || 0));
}

export function FrameLoadEditor({
  load,
  index,
  nodes,
  members,
  nodeOptions,
  memberOptions,
  fieldLabelClass,
  onUpdate,
  onRemove,
}: FrameLoadEditorProps) {
  const loadTypeOptions =
    load.type === "distributed"
      ? FRAME_LOAD_TYPE_OPTIONS.map((option) => option.value === "distributed" ? { ...option, label: frameDistributedLoadKindLabel(load) } : option)
      : FRAME_LOAD_TYPE_OPTIONS;

  return (
    <div className="space-y-3 rounded-2xl border border-white/8 bg-slate-950/20 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto]">
        <div className="space-y-1">
          <div className={fieldLabelClass}>荷载类型</div>
          <DropdownSelect
            value={load.type}
            onChange={(nextValue) => {
              if (nextValue === "distributed") {
                onUpdate({
                  type: "distributed",
                  member: members[0]?.id ?? "M1",
                  direction: "local_y",
                  qStartKnPerM: "qStartKnPerM" in load ? load.qStartKnPerM ?? 0 : -10,
                  qEndKnPerM: "qEndKnPerM" in load ? load.qEndKnPerM ?? 0 : -10,
                  startRatio: "startRatio" in load ? load.startRatio ?? 0 : 0,
                  endRatio: "endRatio" in load ? load.endRatio ?? 1 : 1,
                } as FrameLoad);
                return;
              }
              if (nextValue === "member_point") {
                onUpdate({
                  type: "member_point",
                  member: "member" in load ? load.member : members[0]?.id ?? "M1",
                  direction: "direction" in load ? load.direction ?? "local_y" : "local_y",
                  forceKn: "forceKn" in load ? load.forceKn ?? -10 : -10,
                  positionRatio: "positionRatio" in load ? load.positionRatio ?? 0.5 : 0.5,
                } as FrameLoad);
                return;
              }
              onUpdate({
                type: "nodal",
                node: nodes[0]?.id ?? "N1",
                fxKn: "fxKn" in load ? load.fxKn ?? 0 : 0,
                fyKn: "fyKn" in load ? load.fyKn ?? -10 : -10,
                mzKnM: "mzKnM" in load ? load.mzKnM ?? 0 : 0,
              } as FrameLoad);
            }}
            options={loadTypeOptions}
            className="text-xs font-mono"
            menuClassName="text-xs font-mono"
            ariaLabel={`第 ${index + 1} 条荷载类型`}
          />
        </div>
        {load.type === "nodal" ? (
          <div className="space-y-1">
            <div className={fieldLabelClass}>作用节点</div>
            <DropdownSelect value={load.node} onChange={(nextValue) => onUpdate({ node: nextValue })} options={nodeOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel={`第 ${index + 1} 条荷载作用节点`} />
          </div>
        ) : (
          <div className="space-y-1">
            <div className={fieldLabelClass}>作用构件</div>
            <DropdownSelect value={load.member} onChange={(nextValue) => onUpdate({ member: nextValue })} options={memberOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel={`第 ${index + 1} 条荷载作用构件`} />
          </div>
        )}
        <div className="flex items-end">
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onRemove} aria-label={`删除第 ${index + 1} 条荷载`}>
            <Trash2 className="h-4 w-4 text-rose-300" />
          </Button>
        </div>
      </div>
      {load.type === "nodal" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1">
            <div className={fieldLabelClass}>X 向力（kN）</div>
            <Input aria-label={`第 ${index + 1} 条荷载 X 向力（kN）`} type="number" step="0.1" value={load.fxKn ?? 0} onChange={(e) => onUpdate({ fxKn: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>Y 向力（kN）</div>
            <Input aria-label={`第 ${index + 1} 条荷载 Y 向力（kN）`} type="number" step="0.1" value={load.fyKn ?? 0} onChange={(e) => onUpdate({ fyKn: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>节点弯矩（kN·m）</div>
            <Input aria-label={`第 ${index + 1} 条荷载节点弯矩（kN·m）`} type="number" step="0.1" value={load.mzKnM ?? 0} onChange={(e) => onUpdate({ mzKnM: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
        </div>
      ) : load.type === "distributed" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <div className={fieldLabelClass}>荷载方向</div>
            <DropdownSelect
              value={load.direction ?? "local_y"}
              onChange={(nextValue) => onUpdate({ direction: nextValue as FrameLoadDirection })}
              options={FRAME_LOAD_DIRECTION_OPTIONS}
              className="text-xs font-mono"
              menuClassName="text-xs font-mono"
              ariaLabel={`第 ${index + 1} 条荷载方向`}
            />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>起点强度（kN/m）</div>
            <Input aria-label={`第 ${index + 1} 条荷载起点强度（kN/m）`} type="number" step="0.1" value={load.qStartKnPerM ?? load.wyKnPerM ?? 0} onChange={(e) => onUpdate({ qStartKnPerM: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>终点强度（kN/m）</div>
            <Input aria-label={`第 ${index + 1} 条荷载终点强度（kN/m）`} type="number" step="0.1" value={load.qEndKnPerM ?? load.wyKnPerM ?? 0} onChange={(e) => onUpdate({ qEndKnPerM: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>起点位置 x/L</div>
            <Input
              aria-label={`第 ${index + 1} 条荷载起点位置 x/L`}
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={load.startRatio ?? 0}
              onChange={(e) => onUpdate({ startRatio: clampRatio(Number(e.target.value)) })}
              className="h-10 min-w-0 font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>终点位置 x/L</div>
            <Input
              aria-label={`第 ${index + 1} 条荷载终点位置 x/L`}
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={load.endRatio ?? 1}
              onChange={(e) => onUpdate({ endRatio: clampRatio(Number(e.target.value)) })}
              className="h-10 min-w-0 font-mono text-xs"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1">
            <div className={fieldLabelClass}>荷载方向</div>
            <DropdownSelect
              value={load.direction ?? "local_y"}
              onChange={(nextValue) => onUpdate({ direction: nextValue as FrameLoadDirection })}
              options={FRAME_LOAD_DIRECTION_OPTIONS}
              className="text-xs font-mono"
              menuClassName="text-xs font-mono"
              ariaLabel={`第 ${index + 1} 条荷载方向`}
            />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>位置比 x/L</div>
            <Input
              aria-label={`第 ${index + 1} 条荷载位置比 x/L`}
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={load.positionRatio ?? 0.5}
              onChange={(e) => onUpdate({ positionRatio: clampRatio(Number(e.target.value)) })}
              className="h-10 min-w-0 font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>集中力（kN）</div>
            <Input aria-label={`第 ${index + 1} 条荷载集中力（kN）`} type="number" step="0.1" value={load.forceKn ?? 0} onChange={(e) => onUpdate({ forceKn: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
        </div>
      )}
    </div>
  );
}
