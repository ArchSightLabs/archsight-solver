import { Minus } from "lucide-react";
import type { BeamSpanConfig } from "../types/beam.ts";
import { memberMaterialPresetHint, memberPropertyAriaLabel, memberPropertyLabels } from "../lib/member-property-vocabulary.ts";
import { modelObjectMemberTerm } from "../lib/model-object-vocabulary.ts";
import { Button } from "./ui/button";
import { DeferredIdInput } from "./ui/DeferredIdInput";
import { DropdownSelect } from "./ui/DropdownSelect";
import { Input } from "./ui/input";

interface BeamSpanEditorProps {
  span: BeamSpanConfig;
  spanIndex: number;
  spanCount: number;
  memberId: string;
  semanticLabel: string;
  materialLabel: string;
  materialNote: string;
  materialOptions: Array<{ value: string; label: string }>;
  fieldLabelClass: string;
  formControlClass: string;
  formSelectMenuClass: string;
  formSelectOptionClass: string;
  onUpdateId: (nextId: string) => void;
  onUpdateMaterial: (nextMaterialId: string) => void;
  onUpdateNumber: (field: "length" | "E" | "I", nextValue: number) => void;
  onRemove: () => void;
}

export function BeamSpanEditor({
  span,
  spanIndex,
  spanCount,
  memberId,
  semanticLabel,
  materialLabel,
  materialNote,
  materialOptions,
  fieldLabelClass,
  formControlClass,
  formSelectMenuClass,
  formSelectOptionClass,
  onUpdateId,
  onUpdateMaterial,
  onUpdateNumber,
  onRemove,
}: BeamSpanEditorProps) {
  const propertyLabels = memberPropertyLabels("beam");
  const memberTerm = modelObjectMemberTerm("beam");
  const spanLabel = `第 ${spanIndex + 1} 跨`;

  return (
    <div className="space-y-3 rounded-xl border border-white/8 bg-slate-950/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={fieldLabelClass}>当前{memberTerm}</div>
          <div className="mt-1 text-sm font-bold">{memberId}</div>
          <div className="mt-1 font-mono text-[10px] text-muted-foreground">
            {semanticLabel} · 材料 {materialLabel} · E = {span.E} GPa
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onRemove} disabled={spanCount <= 1} aria-label={`删除 ${memberId}`}>
          <Minus className="h-4 w-4 text-rose-300" />
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <div className={fieldLabelClass}>{memberTerm}编号</div>
          <DeferredIdInput
            key={`beam-member-id-${memberId}`}
            ariaLabel={`${spanLabel}编号`}
            value={memberId}
            onCommit={onUpdateId}
            className="h-10 min-w-0 font-mono text-xs"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <div className={fieldLabelClass}>{memberTerm}材料编号</div>
          <DropdownSelect
            value={span.materialId ?? ""}
            onChange={onUpdateMaterial}
            options={materialOptions}
            placeholder="手动输入 E"
            ariaLabel={`${spanLabel}材料编号`}
            className={formControlClass}
            menuClassName={formSelectMenuClass}
            optionClassName={formSelectOptionClass}
          />
          <div className="text-[10px] font-semibold leading-relaxed text-muted-foreground">
            {memberMaterialPresetHint("beam", memberTerm)} {materialNote}
          </div>
        </div>
        <div className="space-y-1">
          <div className={fieldLabelClass}>{memberTerm}长度（m）</div>
          <Input
            aria-label={`${spanLabel}长度（m）`}
            name={`${memberId}-length`}
            type="number"
            step="0.1"
            value={span.length}
            onChange={(event) => onUpdateNumber("length", Number(event.target.value) || 0)}
            className="h-10 min-w-0 font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <div className={fieldLabelClass}>{propertyLabels.youngModulus}</div>
          <Input
            aria-label={memberPropertyAriaLabel(spanLabel, propertyLabels.youngModulus)}
            name={`${memberId}-E-GPa`}
            type="number"
            value={span.E}
            onChange={(event) => onUpdateNumber("E", Number(event.target.value) || 0)}
            className="h-10 min-w-0 font-mono text-xs"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <div className={fieldLabelClass}>{propertyLabels.momentOfInertia}</div>
          <Input
            aria-label={memberPropertyAriaLabel(spanLabel, propertyLabels.momentOfInertia ?? "截面惯性矩（cm⁴）")}
            name={`${memberId}-I-cm4`}
            type="number"
            value={span.I}
            onChange={(event) => onUpdateNumber("I", Number(event.target.value) || 0)}
            className="h-10 min-w-0 font-mono text-xs"
          />
        </div>
      </div>
    </div>
  );
}
