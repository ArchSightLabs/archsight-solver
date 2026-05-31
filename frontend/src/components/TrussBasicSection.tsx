import { Plus, RotateCw } from "lucide-react";

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

interface TrussBasicSectionProps {
  materialId: string;
  materialLibrary: Material[];
  materialOptions?: MaterialDropdownOption[];
  memberElasticitySummary: string;
  nodeCount: number;
  memberCount: number;
  supportCount: number;
  loadCount: number;
  modelWarnings: string[];
  onResetToBenchmark: () => void;
  onAddNode: () => void;
  onMaterialChange: (nextMaterialId: string) => void;
}

export function TrussBasicSection({
  materialId,
  materialLibrary,
  materialOptions = materialDropdownOptions(materialLibrary),
  memberElasticitySummary,
  nodeCount,
  memberCount,
  supportCount,
  loadCount,
  modelWarnings,
  onResetToBenchmark,
  onAddNode,
  onMaterialChange,
}: TrussBasicSectionProps) {
  const formLabelClass = "text-[10px] font-black tracking-widest text-muted-foreground";
  const objectVocabulary = modelObjectVocabulary("truss");

  return (
    <WorkbenchModelBasicSection
      id="truss-basic"
      title="自定义平面桁架建模"
      description={workbenchBasicDescription("truss")}
      metrics={[
        { label: objectVocabulary.nodeGroupLabel, value: nodeCount },
        { label: objectVocabulary.memberGroupLabel, value: memberCount },
        { label: objectVocabulary.supportGroupLabel, value: supportCount },
        { label: objectVocabulary.loadGroupLabel, value: loadCount },
      ]}
      modelWarnings={modelWarnings}
      successMessage={workbenchBasicSuccessMessage("truss")}
      detailRows={[
        { label: "支座自由度", value: supportSystemHint("truss") },
        { label: "默认材料", value: defaultMaterialBasicDetail("truss", materialId, materialLibrary) },
        { label: "弹性模量分布", value: memberElasticitySummary },
        { label: "材料与截面", value: materialSectionBasicDetail("truss") },
        { label: "主要结果", value: "节点位移、杆件轴力、杆件轴应力、支座反力" },
      ]}
      actions={[
        { label: "恢复默认屋架", icon: <RotateCw className="h-3.5 w-3.5" />, onClick: onResetToBenchmark },
        { label: "新增节点", icon: <Plus className="h-3.5 w-3.5" />, onClick: onAddNode, variant: "default" },
      ]}
      controls={
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <label className={formLabelClass}>{defaultMaterialFieldLabel("truss")}</label>
            <DropdownSelect
              value={materialId}
              onChange={onMaterialChange}
              options={materialOptions}
              className="h-10 text-xs font-mono"
              menuClassName="text-xs font-mono"
              ariaLabel={defaultMaterialAriaLabel("truss")}
            />
            <div className="text-[10px] font-semibold leading-relaxed text-muted-foreground">
              {defaultMaterialControlHint("truss", materialId, materialLibrary)}
            </div>
          </div>
        </div>
      }
    />
  );
}
