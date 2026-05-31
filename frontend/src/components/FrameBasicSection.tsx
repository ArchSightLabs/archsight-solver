import { Plus, RotateCw, Wand2 } from "lucide-react";

import { materialDropdownOptions, type MaterialDropdownOption } from "../lib/material-presets.ts";
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
import type { Material } from "../types/material.ts";
import { DropdownSelect } from "./ui/DropdownSelect";
import { WorkbenchModelBasicSection } from "./WorkbenchModelBasicSection";

interface FrameBasicSectionProps {
  materialId: string;
  materialLibrary: Material[];
  materialOptions?: MaterialDropdownOption[];
  memberElasticitySummary: string;
  nodeCount: number;
  memberCount: number;
  supportCount: number;
  loadCount: number;
  modelWarnings: string[];
  onResetToPortal: () => void;
  onCompleteAxisMembers: () => void;
  onAddNode: () => void;
  onMaterialChange: (nextMaterialId: string) => void;
}

export function FrameBasicSection({
  materialId,
  materialLibrary,
  materialOptions = materialDropdownOptions(materialLibrary),
  memberElasticitySummary,
  nodeCount,
  memberCount,
  supportCount,
  loadCount,
  modelWarnings,
  onResetToPortal,
  onCompleteAxisMembers,
  onAddNode,
  onMaterialChange,
}: FrameBasicSectionProps) {
  const formLabelClass = "text-[10px] font-black tracking-widest text-muted-foreground";
  const objectVocabulary = modelObjectVocabulary("frame");
  const memberTerm = objectVocabulary.memberGroupLabel;

  return (
    <WorkbenchModelBasicSection
      id="frame-basic"
      title="自定义平面框架建模"
      description={workbenchBasicDescription("frame")}
      metrics={[
        { label: objectVocabulary.nodeGroupLabel, value: nodeCount },
        { label: objectVocabulary.memberGroupLabel, value: memberCount },
        { label: objectVocabulary.supportGroupLabel, value: supportCount },
        { label: objectVocabulary.loadGroupLabel, value: loadCount },
      ]}
      modelWarnings={modelWarnings}
      successMessage={workbenchBasicSuccessMessage("frame")}
      detailRows={[
        { label: "支座自由度", value: supportSystemHint("frame") },
        { label: "默认材料", value: defaultMaterialBasicDetail("frame", materialId, materialLibrary) },
        { label: "弹性模量分布", value: memberElasticitySummary },
        { label: "材料与截面", value: materialSectionBasicDetail("frame") },
        { label: "主要结果", value: `节点位移、${memberTerm}轴力 / 剪力 / 弯矩、支座反力` },
      ]}
      actions={[
        { label: "恢复单跨刚架", icon: <RotateCw className="h-3.5 w-3.5" />, onClick: onResetToPortal },
        { label: `补全同轴${memberTerm}`, icon: <Wand2 className="h-3.5 w-3.5" />, onClick: onCompleteAxisMembers },
        { label: "新增节点并连接", icon: <Plus className="h-3.5 w-3.5" />, onClick: onAddNode, variant: "default" },
      ]}
      controls={
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <label className={formLabelClass}>{defaultMaterialFieldLabel("frame")}</label>
            <DropdownSelect
              value={materialId}
              onChange={onMaterialChange}
              options={materialOptions}
              className="h-10 text-xs font-mono"
              menuClassName="text-xs font-mono"
              ariaLabel={defaultMaterialAriaLabel("frame")}
            />
            <div className="text-[10px] font-semibold leading-relaxed text-muted-foreground">
              {defaultMaterialControlHint("frame", materialId, materialLibrary)}
            </div>
          </div>
        </div>
      }
    />
  );
}
