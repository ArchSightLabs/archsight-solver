import { materialDropdownOptions, type MaterialDropdownOption } from "../lib/material-presets.ts";
import { modelObjectVocabulary } from "../lib/model-object-vocabulary.ts";
import {
  defaultMaterialAriaLabel,
  defaultMaterialControlHint,
  defaultMaterialFieldLabel,
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
  onMaterialChange: (nextMaterialId: string) => void;
  compact?: boolean;
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
  onMaterialChange,
  compact = false }: TrussBasicSectionProps) {
  const formLabelClass = "text-[10px] font-black tracking-widest text-muted-foreground";
  const objectVocabulary = modelObjectVocabulary("truss");

  return (
    <WorkbenchModelBasicSection
      id="truss-basic"
      metrics={[
        { label: objectVocabulary.nodeGroupLabel, value: nodeCount },
        { label: objectVocabulary.memberGroupLabel, value: memberCount },
        { label: objectVocabulary.supportGroupLabel, value: supportCount },
        { label: objectVocabulary.loadGroupLabel, value: loadCount },
      ]}
      modelWarnings={modelWarnings}
      successMessage={workbenchBasicSuccessMessage("truss")}
      actions={[]}
      controls={
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <label className={formLabelClass}>{defaultMaterialFieldLabel("truss")}</label>
            <DropdownSelect
              value={materialId}
              onChange={onMaterialChange}
              options={materialOptions}
              className="text-xs font-mono"
              menuClassName="text-xs font-mono"
              optionClassName="py-2"
              fallbackSelectedLabel="手动 E"
              menuMaxHeight={240}
              ariaLabel={defaultMaterialAriaLabel("truss")}
            compact={compact} />
            <div className="text-[10px] font-semibold leading-relaxed text-muted-foreground">
              {defaultMaterialControlHint("truss", materialId, materialLibrary)}
              {memberElasticitySummary ? <span className="ml-2 text-muted-foreground/80">{memberElasticitySummary}</span> : null}
            </div>
          </div>
        </div>
      }
    />
  );
}
