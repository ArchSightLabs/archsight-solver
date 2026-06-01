import { materialDropdownOptions, type MaterialDropdownOption } from "../lib/material-presets.ts";
import { modelObjectVocabulary } from "../lib/model-object-vocabulary.ts";
import {
  defaultMaterialAriaLabel,
  defaultMaterialControlHint,
  defaultMaterialFieldLabel,
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
  onMaterialChange,
}: FrameBasicSectionProps) {
  const formLabelClass = "text-[10px] font-black tracking-widest text-muted-foreground";
  const objectVocabulary = modelObjectVocabulary("frame");

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
      actions={[]}
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
              optionClassName="py-2"
              fallbackSelectedLabel="手动 E"
              menuMaxHeight={240}
              ariaLabel={defaultMaterialAriaLabel("frame")}
            />
            <div className="text-[10px] font-semibold leading-relaxed text-muted-foreground">
              {defaultMaterialControlHint("frame", materialId, materialLibrary)}
              <span className="ml-2 text-muted-foreground/80">{memberElasticitySummary}</span>
            </div>
          </div>
        </div>
      }
    />
  );
}
