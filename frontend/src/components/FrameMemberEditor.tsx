import { Trash2 } from "lucide-react";
import { FRAME_MEMBER_KIND_OPTIONS } from "../lib/frame-editor-model.ts";
import { materialIdForYoungModulus } from "../lib/material-presets.ts";
import { memberPropertyAriaLabel, memberPropertyLabels } from "../lib/member-property-vocabulary.ts";
import { modelObjectMemberTerm } from "../lib/model-object-vocabulary.ts";
import type { StructureMember } from "../types/structure.ts";
import { DeferredIdInput } from "./ui/DeferredIdInput";
import { Button } from "./ui/button";
import { DropdownSelect } from "./ui/DropdownSelect";
import { Input } from "./ui/input";
import { FrameMemberReleaseField } from "./FrameMemberReleaseField";
import { MemberMaterialPresetField } from "./MemberMaterialPresetField";
import { PREDEFINED_MATERIALS, type Material } from "../types/material.ts";

interface FrameMemberEditorProps {
  member: StructureMember;
  memberIndex: number;
  nodeOptions: Array<{ value: string; label: string }>;
  materialLibrary?: Material[];
  fieldLabelClass: string;
  onUpdate: (patch: Partial<StructureMember>) => void;
  onRemove: () => void;
  variant: "selected" | "table";
}

export function FrameMemberEditor({
  member,
  memberIndex,
  nodeOptions,
  materialLibrary = PREDEFINED_MATERIALS,
  fieldLabelClass,
  onUpdate,
  onRemove,
  variant,
}: FrameMemberEditorProps) {
  const isSelectedVariant = variant === "selected";
  const memberTerm = modelObjectMemberTerm("frame");
  const labelPrefix = isSelectedVariant ? memberTerm : `第 ${memberIndex + 1} 个${memberTerm}`;
  const propertyLabels = memberPropertyLabels("frame");

  return (
    <div className={`space-y-3 border border-white/8 bg-slate-950/20 p-3 ${isSelectedVariant ? "rounded-xl" : "rounded-2xl"}`}>
      {isSelectedVariant ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-foreground">{memberTerm} {member.id}</span>
            <span>{member.start}-{member.end}</span>
            <span>{member.kind ?? "generic"}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onRemove} aria-label={`删除当前${memberTerm}`}>
            <Trash2 className="h-4 w-4 text-rose-300" />
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="space-y-1">
            <div className={fieldLabelClass}>{memberTerm}编号</div>
            <DeferredIdInput
              ariaLabel={`第 ${memberIndex + 1} 个${memberTerm}编号`}
              value={member.id}
              onCommit={(nextId) => onUpdate({ id: nextId })}
              className="h-10 min-w-0 font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>起点节点</div>
            <DropdownSelect
              value={member.start}
              onChange={(nextValue) => onUpdate({ start: nextValue })}
              options={nodeOptions}
              className="text-xs font-mono"
              menuClassName="text-xs font-mono"
              ariaLabel={`第 ${memberIndex + 1} 个${memberTerm}起点节点`}
            />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>终点节点</div>
            <DropdownSelect
              value={member.end}
              onChange={(nextValue) => onUpdate({ end: nextValue })}
              options={nodeOptions}
              className="text-xs font-mono"
              menuClassName="text-xs font-mono"
              ariaLabel={`第 ${memberIndex + 1} 个${memberTerm}终点节点`}
            />
          </div>
          <div className="flex items-end">
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onRemove} aria-label={`删除第 ${memberIndex + 1} 个${memberTerm}`}>
              <Trash2 className="h-4 w-4 text-rose-300" />
            </Button>
          </div>
        </div>
      )}

      <div className={isSelectedVariant ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"}>
        {isSelectedVariant ? (
          <>
            <div className="space-y-1">
              <div className={fieldLabelClass}>{memberTerm}编号</div>
              <DeferredIdInput
                key={`selected-member-id-${member.id}`}
                ariaLabel={`${memberTerm}编号`}
                value={member.id}
                onCommit={(nextId) => onUpdate({ id: nextId })}
                className="h-10 min-w-0 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>{memberTerm}类型</div>
              <DropdownSelect
                value={member.kind ?? "generic"}
                onChange={(nextValue) => onUpdate({ kind: nextValue })}
                options={FRAME_MEMBER_KIND_OPTIONS}
                className="text-xs font-mono"
                menuClassName="text-xs font-mono"
                ariaLabel={`${memberTerm}类型`}
              />
            </div>
          </>
        ) : null}
        <MemberMaterialPresetField
          materialId={member.materialId}
          materialLibrary={materialLibrary}
          youngModulusGPa={member.E_GPa}
          onYoungModulusChange={(E_GPa) => onUpdate({ E_GPa })}
          onMaterialChange={(materialId, E_GPa, sectionDefaults) => onUpdate({
            materialId,
            E_GPa,
            ...(Number.isFinite(sectionDefaults.sectionAreaCm2) && Number(sectionDefaults.sectionAreaCm2) > 0 ? { A_cm2: Number(sectionDefaults.sectionAreaCm2) } : {}),
            ...(Number.isFinite(sectionDefaults.momentOfInertiaCm4) && Number(sectionDefaults.momentOfInertiaCm4) > 0 ? { I_cm4: Number(sectionDefaults.momentOfInertiaCm4) } : {}),
          })}
          fieldLabelClass={fieldLabelClass}
          memberLabel={memberTerm}
          mode="frame"
          label={isSelectedVariant ? "材料" : "材料预设"}
          ariaLabel={isSelectedVariant ? `${memberTerm}材料` : `第 ${memberIndex + 1} 个${memberTerm}材料预设`}
          showHint={false}
          className={isSelectedVariant ? "sm:col-span-2" : undefined}
        />
        {isSelectedVariant ? (
          <>
            <div className="space-y-1">
              <div className={fieldLabelClass}>起点节点</div>
              <DropdownSelect
                value={member.start}
                onChange={(nextValue) => onUpdate({ start: nextValue })}
                options={nodeOptions}
                className="text-xs font-mono"
                menuClassName="text-xs font-mono"
                ariaLabel="起点节点"
              />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>终点节点</div>
              <DropdownSelect
                value={member.end}
                onChange={(nextValue) => onUpdate({ end: nextValue })}
                options={nodeOptions}
                className="text-xs font-mono"
                menuClassName="text-xs font-mono"
                ariaLabel="终点节点"
              />
            </div>
          </>
        ) : null}
        <div className="space-y-1">
          <div className={fieldLabelClass}>{propertyLabels.youngModulus}</div>
          <Input
            aria-label={memberPropertyAriaLabel(labelPrefix, propertyLabels.youngModulus)}
            name={`${member.id}-E-GPa`}
            type="number"
            value={member.E_GPa}
            onChange={(event) => {
              const E_GPa = Number(event.target.value) || 0;
              onUpdate({ E_GPa, materialId: materialIdForYoungModulus(E_GPa, materialLibrary) });
            }}
            className="h-10 min-w-0 font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <div className={fieldLabelClass}>{propertyLabels.sectionArea}</div>
          <Input
            aria-label={memberPropertyAriaLabel(labelPrefix, propertyLabels.sectionArea ?? "截面面积（cm²）")}
            name={`${member.id}-A-cm2`}
            type="number"
            value={member.A_cm2}
            onChange={(event) => onUpdate({ A_cm2: Number(event.target.value) || 0 })}
            className="h-10 min-w-0 font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <div className={fieldLabelClass}>{propertyLabels.momentOfInertia}</div>
          <Input
            aria-label={memberPropertyAriaLabel(labelPrefix, propertyLabels.momentOfInertia ?? "截面惯性矩（cm⁴）")}
            name={`${member.id}-I-cm4`}
            type="number"
            value={member.I_cm4}
            onChange={(event) => onUpdate({ I_cm4: Number(event.target.value) || 0 })}
            className="h-10 min-w-0 font-mono text-xs"
          />
        </div>
        {!isSelectedVariant ? (
          <div className="space-y-1">
            <div className={fieldLabelClass}>{memberTerm}类型</div>
            <DropdownSelect
              value={member.kind ?? "generic"}
              onChange={(nextValue) => onUpdate({ kind: nextValue })}
              options={FRAME_MEMBER_KIND_OPTIONS}
              className="text-xs font-mono"
              menuClassName="text-xs font-mono"
              ariaLabel={`第 ${memberIndex + 1} 个${memberTerm}类型`}
            />
          </div>
        ) : null}
      </div>

      <FrameMemberReleaseField
        member={member}
        memberLabel={isSelectedVariant ? `${memberTerm} ${member.id}` : `第 ${memberIndex + 1} 个${memberTerm}`}
        fieldLabelClass={fieldLabelClass}
        onChange={onUpdate}
        showHint={false}
      />
    </div>
  );
}
