import { DropdownSelect } from "./ui/DropdownSelect";
import { materialDropdownOptions, materialIdForYoungModulus, memberMaterialEngineeringNote, youngModulusForMaterial } from "../lib/material-presets.ts";
import { memberMaterialPresetHint } from "../lib/member-property-vocabulary.ts";
import { cn } from "@/lib/utils";

type MemberMaterialMode = "frame" | "truss";

interface MemberMaterialPresetFieldProps {
  materialId?: string;
  youngModulusGPa: number;
  onYoungModulusChange: (nextYoungModulusGPa: number) => void;
  onMaterialChange?: (nextMaterialId: string, nextYoungModulusGPa: number) => void;
  fieldLabelClass: string;
  memberLabel: "构件" | "杆件";
  mode: MemberMaterialMode;
  className?: string;
  label?: string;
  ariaLabel?: string;
  showHint?: boolean;
}

const MATERIAL_OPTIONS = materialDropdownOptions();

export function MemberMaterialPresetField({
  materialId,
  youngModulusGPa,
  onYoungModulusChange,
  onMaterialChange,
  fieldLabelClass,
  memberLabel,
  mode,
  className,
  label = "材料预设（回填 E）",
  ariaLabel = `${memberLabel}材料预设（回填弹性模量 E）`,
  showHint = true,
}: MemberMaterialPresetFieldProps) {
  const selectedMaterialId = materialId ?? materialIdForYoungModulus(youngModulusGPa);
  const engineeringHint = [
    memberMaterialPresetHint(mode, memberLabel),
    memberMaterialEngineeringNote(selectedMaterialId, youngModulusGPa, memberLabel),
  ].join(" ");
  return (
    <div className={cn("space-y-1", className)}>
      <div className={fieldLabelClass}>{label}</div>
      <DropdownSelect
        value={selectedMaterialId}
        onChange={(nextValue) => {
          const nextYoungModulusGPa = youngModulusForMaterial(nextValue, youngModulusGPa);
          if (onMaterialChange) {
            onMaterialChange(nextValue, nextYoungModulusGPa);
          } else {
            onYoungModulusChange(nextYoungModulusGPa);
          }
        }}
        options={MATERIAL_OPTIONS}
        className="text-xs font-mono"
        menuClassName="text-xs font-mono"
        ariaLabel={ariaLabel}
      />
      {showHint ? (
        <div className="text-[10px] font-semibold text-muted-foreground">
          {engineeringHint}
        </div>
      ) : null}
    </div>
  );
}
