import { RotateCcw } from "lucide-react";

import type { MaterialDropdownOption } from "../lib/material-presets.ts";
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

interface BeamBasicSectionProps {
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
  onMaterialChange: (nextMaterialId: string) => void;
  onReset: () => void;
}

export function BeamBasicSection({
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
      actions={[
        { label: "重置梁系参数", icon: <RotateCcw className="h-3.5 w-3.5" />, onClick: onReset },
      ]}
      controls={
        <div className="max-w-md space-y-2">
          <label className={formLabelClass}>{defaultMaterialFieldLabel("beam")}</label>
          <DropdownSelect
            value={materialId}
            onChange={onMaterialChange}
            options={materialOptions}
            className={formControlClass}
            menuClassName={formSelectMenuClass}
            optionClassName={formSelectOptionClass}
            fallbackSelectedLabel="手动 E"
            menuMaxHeight={240}
            ariaLabel={defaultMaterialAriaLabel("beam")}
          />
          <div className="text-[10px] font-semibold leading-relaxed text-muted-foreground">
            {defaultMaterialControlHint("beam", materialId, materialLibrary)}
          </div>
        </div>
      }
    />
  );
}
