import { Trash2 } from "lucide-react";

import { Button } from "./ui/button";
import { DropdownSelect } from "./ui/DropdownSelect";
import { Input } from "./ui/input";
import { MemberMaterialPresetField } from "./MemberMaterialPresetField";
import { memberPropertyAriaLabel, memberPropertyLabels } from "../lib/member-property-vocabulary.ts";
import { TRUSS_MEMBER_KIND_OPTIONS } from "../lib/truss-editor-model.ts";
import type { TrussMember } from "../types/structure.ts";

interface TrussMemberEditorProps {
  member: TrussMember;
  memberIndex: number;
  nodeOptions: Array<{ value: string; label: string }>;
  fieldLabelClass: string;
  onUpdate: (patch: Partial<TrussMember>) => void;
  onRemove: () => void;
  variant: "selected" | "table";
}

export function TrussMemberEditor({
  member,
  memberIndex,
  nodeOptions,
  fieldLabelClass,
  onUpdate,
  onRemove,
  variant,
}: TrussMemberEditorProps) {
  const isSelectedVariant = variant === "selected";
  const labelPrefix = isSelectedVariant ? "杆件" : `第 ${memberIndex + 1} 个杆件`;
  const propertyLabels = memberPropertyLabels("truss");

  return (
    <div className={`space-y-3 border border-white/8 bg-slate-950/20 p-3 ${isSelectedVariant ? "rounded-xl" : "rounded-2xl"}`}>
      {isSelectedVariant ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className={fieldLabelClass}>当前杆件</div>
            <div className="mt-1 text-sm font-bold">{member.id}</div>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onRemove} aria-label="删除当前杆件">
            <Trash2 className="h-4 w-4 text-rose-300" />
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="space-y-1">
            <div className={fieldLabelClass}>杆件编号</div>
            <Input aria-label={`第 ${memberIndex + 1} 个杆件编号`} value={member.id} onChange={(event) => onUpdate({ id: event.target.value })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>起点节点</div>
            <DropdownSelect value={member.start} onChange={(nextValue) => onUpdate({ start: nextValue })} options={nodeOptions} className="min-w-0 text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel={`第 ${memberIndex + 1} 个杆件起点节点`} />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>终点节点</div>
            <DropdownSelect value={member.end} onChange={(nextValue) => onUpdate({ end: nextValue })} options={nodeOptions} className="min-w-0 text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel={`第 ${memberIndex + 1} 个杆件终点节点`} />
          </div>
          <div className="flex items-end md:justify-end">
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onRemove} aria-label={`删除第 ${memberIndex + 1} 个杆件`}>
              <Trash2 className="h-4 w-4 text-rose-300" />
            </Button>
          </div>
        </div>
      )}

      <div className={isSelectedVariant ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"}>
        {isSelectedVariant ? (
          <>
            <div className="space-y-1">
              <div className={fieldLabelClass}>杆件编号</div>
              <Input aria-label="杆件编号" value={member.id} onChange={(event) => onUpdate({ id: event.target.value })} className="h-10 min-w-0 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>杆件类型</div>
              <DropdownSelect value={member.kind ?? "generic"} onChange={(nextValue) => onUpdate({ kind: nextValue })} options={TRUSS_MEMBER_KIND_OPTIONS} className="text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel="杆件类型" />
            </div>
          </>
        ) : null}
        <MemberMaterialPresetField
          youngModulusGPa={member.E_GPa}
          onYoungModulusChange={(E_GPa) => onUpdate({ E_GPa })}
          fieldLabelClass={fieldLabelClass}
          memberLabel="杆件"
          mode="truss"
          label={isSelectedVariant ? undefined : "材料预设"}
          ariaLabel={isSelectedVariant ? undefined : `第 ${memberIndex + 1} 个杆件材料预设`}
          showHint={isSelectedVariant}
          className={isSelectedVariant ? "sm:col-span-2" : undefined}
        />
        {isSelectedVariant ? (
          <>
            <div className="space-y-1">
              <div className={fieldLabelClass}>起点节点</div>
              <DropdownSelect value={member.start} onChange={(nextValue) => onUpdate({ start: nextValue })} options={nodeOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel="起点节点" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>终点节点</div>
              <DropdownSelect value={member.end} onChange={(nextValue) => onUpdate({ end: nextValue })} options={nodeOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel="终点节点" />
            </div>
          </>
        ) : null}
        <div className="space-y-1">
          <div className={fieldLabelClass}>{propertyLabels.youngModulus}</div>
          <Input aria-label={memberPropertyAriaLabel(labelPrefix, propertyLabels.youngModulus)} type="number" value={member.E_GPa} onChange={(event) => onUpdate({ E_GPa: Number(event.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
        </div>
        <div className="space-y-1">
          <div className={fieldLabelClass}>{propertyLabels.sectionArea}</div>
          <Input aria-label={memberPropertyAriaLabel(labelPrefix, propertyLabels.sectionArea ?? "截面面积（cm²）")} type="number" value={member.A_cm2} onChange={(event) => onUpdate({ A_cm2: Number(event.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
        </div>
        {!isSelectedVariant ? (
          <div className="space-y-1">
            <div className={fieldLabelClass}>杆件类型</div>
            <DropdownSelect value={member.kind ?? "generic"} onChange={(nextValue) => onUpdate({ kind: nextValue })} options={TRUSS_MEMBER_KIND_OPTIONS} className="min-w-0 text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel={`第 ${memberIndex + 1} 个杆件类型`} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
