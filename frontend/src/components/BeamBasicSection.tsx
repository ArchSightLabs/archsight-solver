import { CheckCircle2, RotateCcw } from "lucide-react";

import type { MaterialDropdownOption } from "../lib/material-presets.ts";
import { modelObjectVocabulary } from "../lib/model-object-vocabulary.ts";
import { supportSystemHint } from "../lib/support-vocabulary.ts";
import {
  defaultMaterialAriaLabel,
  defaultMaterialBasicDetail,
  defaultMaterialControlHint,
  defaultMaterialFieldLabel,
  materialSectionBasicDetail,
  workbenchBasicDescription,
  workbenchBasicSuccessMessage,
} from "../lib/workbench-basic-vocabulary.ts";
import type { BeamWorkspaceState } from "../types/beam.ts";
import type { Material } from "../types/material.ts";
import { Button } from "./ui/button";
import { DropdownSelect } from "./ui/DropdownSelect";
import { WorkbenchModelBasicSection } from "./WorkbenchModelBasicSection";

const BEAM_TYPE_OPTIONS: Array<{ label: string; value: BeamWorkspaceState["beamType"] }> = [
  { label: "简支梁", value: "simply_supported" },
  { label: "悬臂梁", value: "cantilever" },
  { label: "连续梁", value: "continuous" },
];

interface BeamBasicSectionProps {
  beamType: BeamWorkspaceState["beamType"];
  materialId: string;
  materialLibrary: Material[];
  materialOptions: MaterialDropdownOption[];
  spanCount: number;
  supportCount: number;
  totalLength: number;
  formLabelClass: string;
  formControlClass: string;
  formSelectMenuClass: string;
  formSelectOptionClass: string;
  onBeamTypeChange: (nextBeamType: BeamWorkspaceState["beamType"]) => void;
  onMaterialChange: (nextMaterialId: string) => void;
  onReset: () => void;
}

export function BeamBasicSection({
  beamType,
  materialId,
  materialLibrary,
  materialOptions,
  spanCount,
  supportCount,
  totalLength,
  formLabelClass,
  formControlClass,
  formSelectMenuClass,
  formSelectOptionClass,
  onBeamTypeChange,
  onMaterialChange,
  onReset,
}: BeamBasicSectionProps) {
  const objectVocabulary = modelObjectVocabulary("beam");

  return (
    <WorkbenchModelBasicSection
      id="beam-basic"
      title="参数化梁系建模"
      description={workbenchBasicDescription("beam")}
      metrics={[
        { label: objectVocabulary.memberGroupLabel, value: spanCount },
        { label: "总长", value: `${totalLength.toFixed(2)} m` },
        { label: objectVocabulary.supportGroupLabel, value: supportCount },
      ]}
      modelWarnings={supportCount === 0 ? ["尚未设置支座约束。"] : []}
      successMessage={workbenchBasicSuccessMessage("beam")}
      detailRows={[
        { label: "支座自由度", value: supportSystemHint("beam") },
        { label: "默认材料", value: defaultMaterialBasicDetail("beam", materialId, materialLibrary) },
        { label: "材料与截面", value: materialSectionBasicDetail("beam") },
        { label: "求解模型", value: "梁单元矩阵位移法；连续梁保留三弯矩方程校核口径。" },
        { label: "输入单位", value: "E:GPa · I:cm⁴ · q:kN/m · P:kN" },
        { label: "主要结果", value: "挠度、弯矩、剪力、支座反力" },
      ]}
      actions={[
        { label: "重置梁系参数", icon: <RotateCcw className="h-3.5 w-3.5" />, onClick: onReset },
      ]}
      controls={
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className={formLabelClass}>{defaultMaterialFieldLabel("beam")}</label>
              <DropdownSelect
                value={materialId}
                onChange={onMaterialChange}
                options={materialOptions}
                className={formControlClass}
                menuClassName={formSelectMenuClass}
                optionClassName={formSelectOptionClass}
                ariaLabel={defaultMaterialAriaLabel("beam")}
              />
              <div className="text-[10px] font-semibold leading-relaxed text-muted-foreground">
                {defaultMaterialControlHint("beam", materialId, materialLibrary)}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className={formLabelClass}>梁型</label>
            <div className="grid grid-cols-3 gap-2">
              {BEAM_TYPE_OPTIONS.map((option) => {
                const isActive = beamType === option.value;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant="outline"
                    aria-pressed={isActive}
                    className={`relative h-11 overflow-hidden rounded-md text-[12px] font-bold transition-all ${
                      isActive
                        ? "border-sky-300 bg-sky-400 text-slate-950 shadow-[0_0_0_1px_rgba(125,211,252,0.5),0_10px_24px_rgba(14,165,233,0.22)] hover:bg-sky-300"
                        : "border-white/10 bg-white/[0.03] text-foreground/70 hover:border-sky-400/40 hover:bg-sky-400/10 hover:text-foreground"
                    }`}
                    onClick={() => onBeamTypeChange(option.value)}
                  >
                    {isActive ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      }
    />
  );
}
