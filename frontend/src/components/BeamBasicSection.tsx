import { CheckCircle2, RotateCcw } from "lucide-react";

import { materialEngineeringNote, type MaterialDropdownOption } from "../lib/material-presets.ts";
import { supportSystemHint } from "../lib/support-vocabulary.ts";
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
  nodeCount: number;
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
  nodeCount,
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
  return (
    <WorkbenchModelBasicSection
      id="beam-basic"
      title="参数化梁系建模"
      description="先选择梁型和默认材料，再在对象页维护跨段、支座、荷载及单跨材料截面；连续梁按跨段和支座节点组织模型。"
      metrics={[
        { label: "节点", value: nodeCount },
        { label: "杆件", value: spanCount },
        { label: "支座", value: supportCount },
        { label: "总长", value: `${totalLength.toFixed(2)} m` },
      ]}
      modelWarnings={supportCount === 0 ? ["尚未设置支座约束。"] : []}
      successMessage="当前梁系跨段、支座与荷载参数完整，可继续复核挠度、弯矩、剪力和支座反力。"
      detailRows={[
        { label: "支座自由度", value: supportSystemHint("beam") },
        {
          label: "材料与截面",
          value: "默认材料用于新增杆件；各跨可在对象页单独引用材料编号。材料预设只回填弹性模量 E，截面惯性矩 I 仍按跨段维护。",
        },
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
              <label className={formLabelClass}>默认材料编号（新增杆件）</label>
              <DropdownSelect
                value={materialId}
                onChange={onMaterialChange}
                options={materialOptions}
                className={formControlClass}
                menuClassName={formSelectMenuClass}
                optionClassName={formSelectOptionClass}
                ariaLabel="默认材料编号（新增杆件）"
              />
              <div className="text-[10px] font-semibold leading-relaxed text-muted-foreground">
                {materialEngineeringNote(materialId, materialLibrary)} 每一跨可在“对象”页单独引用材料编号。
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
