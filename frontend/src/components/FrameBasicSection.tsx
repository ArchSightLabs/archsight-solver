import { materialDropdownOptions, type MaterialDropdownOption } from "../lib/material-presets.ts";
import { modelObjectVocabulary } from "../lib/model-object-vocabulary.ts";
import {
  defaultMaterialAriaLabel,
  defaultMaterialControlHint,
  defaultMaterialFieldLabel,
  workbenchBasicSuccessMessage,
} from "../lib/workbench-basic-vocabulary.ts";
import type { Material } from "../types/material.ts";
import type { FrameAnalysisOptions } from "../types/structure.ts";
import { DropdownSelect } from "./ui/DropdownSelect";
import { Input } from "./ui/input";
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
  analysisOptions: FrameAnalysisOptions;
  onAnalysisOptionsChange: (nextAnalysisOptions: FrameAnalysisOptions) => void;
  compact?: boolean;
}

type FrameAnalysisOptionsPatch = {
  pDelta?: boolean;
  buckling?: boolean;
  pDeltaOptions?: Partial<FrameAnalysisOptions["pDeltaOptions"]>;
  bucklingOptions?: Partial<FrameAnalysisOptions["bucklingOptions"]>;
};

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
  analysisOptions,
  onAnalysisOptionsChange,
  compact = false,
}: FrameBasicSectionProps) {
  const formLabelClass = "text-[10px] font-black tracking-widest text-muted-foreground";
  const objectVocabulary = modelObjectVocabulary("frame");

  const updateAnalysisOptions = (patch: FrameAnalysisOptionsPatch) => {
    onAnalysisOptionsChange({
      ...analysisOptions,
      ...patch,
      pDeltaOptions: patch.pDeltaOptions ? { ...analysisOptions.pDeltaOptions, ...patch.pDeltaOptions } : analysisOptions.pDeltaOptions,
      bucklingOptions: patch.bucklingOptions ? { ...analysisOptions.bucklingOptions, ...patch.bucklingOptions } : analysisOptions.bucklingOptions,
    });
  };

  return (
    <WorkbenchModelBasicSection
      id="frame-basic"
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(0,1.2fr)]">
          <div className="space-y-2">
            <label className={formLabelClass}>{defaultMaterialFieldLabel("frame")}</label>
            <DropdownSelect
              value={materialId}
              onChange={onMaterialChange}
              options={materialOptions}
              className="text-xs font-mono"
              menuClassName="text-xs font-mono"
              optionClassName="py-2"
              fallbackSelectedLabel="手动 E"
              menuMaxHeight={240}
              ariaLabel={defaultMaterialAriaLabel("frame")}
              compact={compact}
            />
            <div className="text-[10px] font-semibold leading-relaxed text-muted-foreground">
              {defaultMaterialControlHint("frame", materialId, materialLibrary)}
              {memberElasticitySummary ? <span className="ml-2 text-muted-foreground/80">{memberElasticitySummary}</span> : null}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-foreground">
                <input
                  type="checkbox"
                  checked={analysisOptions.pDelta}
                  onChange={(event) => updateAnalysisOptions({ pDelta: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-400"
                />
                P-Delta
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-foreground">
                <input
                  type="checkbox"
                  checked={analysisOptions.buckling}
                  onChange={(event) => updateAnalysisOptions({ buckling: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-400"
                />
                屈曲
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className={formLabelClass}>P-Delta 步数</span>
                <Input
                  compact={compact}
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={analysisOptions.pDeltaOptions.loadSteps}
                  onChange={(event) => updateAnalysisOptions({ pDeltaOptions: { loadSteps: Number(event.target.value) || 1 } })}
                  className="font-mono text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className={formLabelClass}>屈曲模态数</span>
                <Input
                  compact={compact}
                  type="number"
                  min={1}
                  max={12}
                  step={1}
                  value={analysisOptions.bucklingOptions.modeCount}
                  onChange={(event) => updateAnalysisOptions({ bucklingOptions: { modeCount: Number(event.target.value) || 1 } })}
                  className="font-mono text-xs"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className={formLabelClass}>最大迭代</span>
                <Input
                  compact={compact}
                  type="number"
                  min={1}
                  max={50}
                  step={1}
                  value={analysisOptions.pDeltaOptions.maxIterations}
                  onChange={(event) => updateAnalysisOptions({ pDeltaOptions: { maxIterations: Number(event.target.value) || 1 } })}
                  className="font-mono text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className={formLabelClass}>残差阈值</span>
                <Input
                  compact={compact}
                  type="number"
                  min={1e-10}
                  max={1e-3}
                  step={1e-6}
                  value={analysisOptions.pDeltaOptions.tolerance}
                  onChange={(event) => updateAnalysisOptions({ pDeltaOptions: { tolerance: Number(event.target.value) || 1e-6 } })}
                  className="font-mono text-xs"
                />
              </label>
            </div>
          </div>
        </div>
      }
    />
  );
}
