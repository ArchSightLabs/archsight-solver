import { DropdownSelect } from "./ui/DropdownSelect";
import { materialDropdownOptions, materialIdForYoungModulus, youngModulusForMaterial } from "../lib/material-presets.ts";
import { memberMaterialPresetHint } from "../lib/member-property-vocabulary.ts";
import { PREDEFINED_MATERIALS, type Material } from "../types/material.ts";
import { cn } from "@/lib/utils";

type MemberMaterialMode = "frame" | "truss";

interface MemberMaterialPresetFieldProps {
  materialId?: string;
  materialLibrary?: Material[];
  youngModulusGPa: number;
  onYoungModulusChange: (nextYoungModulusGPa: number) => void;
  onMaterialChange?: (nextMaterialId: string, nextYoungModulusGPa: number, sectionDefaults: Pick<Material, "sectionAreaCm2" | "momentOfInertiaCm4">) => void;
  fieldLabelClass: string;
  memberLabel: "跨段" | "构件" | "杆件";
  mode: MemberMaterialMode;
  className?: string;
  label?: string;
  ariaLabel?: string;
  showHint?: boolean;
}

export function MemberMaterialPresetField({
  materialId,
  materialLibrary = PREDEFINED_MATERIALS,
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
  const selectedMaterialId = materialId ?? materialIdForYoungModulus(youngModulusGPa, materialLibrary);
  const materialOptions = materialDropdownOptions(materialLibrary);
  const engineeringHint = memberMaterialPresetHint(mode, memberLabel);
  return (
    <div className={cn("space-y-1", className)}>
      <div className={fieldLabelClass}>{label}</div>
      <DropdownSelect
        value={selectedMaterialId}
        onChange={(nextValue) => {
          const material = materialLibrary.find((item) => item.id === nextValue);
          const nextYoungModulusGPa = youngModulusForMaterial(nextValue, youngModulusGPa, materialLibrary);
          if (onMaterialChange) {
            onMaterialChange(nextValue, nextYoungModulusGPa, {
              sectionAreaCm2: material?.sectionAreaCm2,
              momentOfInertiaCm4: material?.momentOfInertiaCm4,
            });
          } else {
            onYoungModulusChange(nextYoungModulusGPa);
          }
        }}
        options={materialOptions}
        className="text-xs font-mono"
        menuClassName="text-xs font-mono"
        optionClassName="py-2"
        fallbackSelectedLabel="手动 E"
        menuMaxHeight={240}
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
