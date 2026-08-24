import { materialDropdownOptions, type MaterialDropdownOption } from "../lib/material-presets.ts";
import { modelObjectMemberTerm, modelObjectVocabulary } from "../lib/model-object-vocabulary.ts";
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

  const isCorotational = analysisOptions.pDeltaOptions.algorithm === "corotational_newton_v1";

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
                二阶分析（GNA）
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
            <label className="space-y-1">
              <span className={formLabelClass}>二阶分析方法</span>
              <DropdownSelect
                value={analysisOptions.pDeltaOptions.algorithm}
                onChange={(algorithm) => updateAnalysisOptions({
                  pDeltaOptions: {
                    algorithm: algorithm as FrameAnalysisOptions["pDeltaOptions"]["algorithm"],
                    maxIterations: algorithm === "corotational_newton_v1" ? 30 : analysisOptions.pDeltaOptions.maxIterations,
                  },
                })}
                options={[
                  { value: "initial_stress_v1", label: "兼容模式 · 初始应力迭代法" },
                  { value: "corotational_newton_v1", label: "专业模式 · 共回转 Newton 法" },
                ]}
                ariaLabel="选择二维框架二阶分析方法"
                compact={compact}
                className="font-mono text-xs"
              />
              <div className="text-[10px] leading-relaxed text-muted-foreground">
                {isCorotational
                  ? "更新后几何、全残差、一致切线、线搜索和自适应切步；平衡状态与稳定状态分别报告。"
                  : "保持既有结果可复算；采用固定初始几何的初始应力迭代。"}
              </div>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className={formLabelClass}>{isCorotational ? "初始荷载步" : "P-Delta 步数"}</span>
                <Input
                  compact={compact}
                  type="number"
                  min={isCorotational ? 0.0001 : 1}
                  max={isCorotational ? 1 : 20}
                  step={isCorotational ? 0.05 : 1}
                  value={isCorotational ? analysisOptions.pDeltaOptions.initialStep : analysisOptions.pDeltaOptions.loadSteps}
                  onChange={(event) => updateAnalysisOptions({
                    pDeltaOptions: isCorotational
                      ? { initialStep: Number(event.target.value) || 0.25 }
                      : { loadSteps: Number(event.target.value) || 1 },
                  })}
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
                  max={100}
                  step={1}
                  value={analysisOptions.pDeltaOptions.maxIterations}
                  onChange={(event) => updateAnalysisOptions({ pDeltaOptions: { maxIterations: Number(event.target.value) || 1 } })}
                  className="font-mono text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className={formLabelClass}>{isCorotational ? "相对平衡残差" : "残差阈值"}</span>
                <Input
                  compact={compact}
                  type="number"
                  min={1e-10}
                  max={1e-3}
                  step={1e-6}
                  value={isCorotational ? analysisOptions.pDeltaOptions.relativeResidualTolerance : analysisOptions.pDeltaOptions.tolerance}
                  onChange={(event) => updateAnalysisOptions({
                    pDeltaOptions: isCorotational
                      ? { relativeResidualTolerance: Number(event.target.value) || 1e-8 }
                      : { tolerance: Number(event.target.value) || 1e-6 },
                  })}
                  className="font-mono text-xs"
                />
              </label>
            </div>
            {isCorotational ? (
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-sky-400/20 bg-sky-500/[0.04] p-3">
                <label className="space-y-1">
                  <span className={formLabelClass}>{`单${modelObjectMemberTerm("frame")}细分`}</span>
                  <Input
                    compact={compact}
                    type="number"
                    min={1}
                    max={12}
                    step={1}
                    value={analysisOptions.pDeltaOptions.memberSubdivisions}
                    onChange={(event) => updateAnalysisOptions({ pDeltaOptions: { memberSubdivisions: Number(event.target.value) || 4 } })}
                    className="font-mono text-xs"
                  />
                </label>
                <label className="space-y-1">
                  <span className={formLabelClass}>初始缺陷</span>
                  <DropdownSelect
                    value={analysisOptions.pDeltaOptions.initialImperfection.type}
                    onChange={(type) => updateAnalysisOptions({
                      pDeltaOptions: {
                        initialImperfection: {
                          ...analysisOptions.pDeltaOptions.initialImperfection,
                          type: type as FrameAnalysisOptions["pDeltaOptions"]["initialImperfection"]["type"],
                          amplitudeMm: type === "buckling_mode" && analysisOptions.pDeltaOptions.initialImperfection.amplitudeMm <= 0
                            ? 5
                            : analysisOptions.pDeltaOptions.initialImperfection.amplitudeMm,
                        },
                      },
                    })}
                    options={[
                      { value: "none", label: "无初始缺陷（GNA）" },
                      { value: "buckling_mode", label: "屈曲模态缺陷（GNIA）" },
                    ]}
                    ariaLabel="选择几何非线性初始缺陷"
                    compact={compact}
                    className="font-mono text-xs"
                  />
                </label>
                {analysisOptions.pDeltaOptions.initialImperfection.type === "buckling_mode" ? (
                  <>
                    <label className="space-y-1">
                      <span className={formLabelClass}>缺陷模态</span>
                      <Input
                        compact={compact}
                        type="number"
                        min={1}
                        max={12}
                        step={1}
                        value={analysisOptions.pDeltaOptions.initialImperfection.modeNumber}
                        onChange={(event) => updateAnalysisOptions({
                          pDeltaOptions: {
                            initialImperfection: {
                              ...analysisOptions.pDeltaOptions.initialImperfection,
                              modeNumber: Number(event.target.value) || 1,
                            },
                          },
                        })}
                        className="font-mono text-xs"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className={formLabelClass}>缺陷幅值 mm</span>
                      <Input
                        compact={compact}
                        type="number"
                        min={0.001}
                        max={1000}
                        step={1}
                        value={analysisOptions.pDeltaOptions.initialImperfection.amplitudeMm}
                        onChange={(event) => updateAnalysisOptions({
                          pDeltaOptions: {
                            initialImperfection: {
                              ...analysisOptions.pDeltaOptions.initialImperfection,
                              amplitudeMm: Number(event.target.value) || 5,
                            },
                          },
                        })}
                        className="font-mono text-xs"
                      />
                    </label>
                  </>
                ) : null}
                <label className="col-span-2 flex items-center gap-2 text-[11px] font-semibold">
                  <input
                    type="checkbox"
                    checked={analysisOptions.pDeltaOptions.includeMethodComparison}
                    onChange={(event) => updateAnalysisOptions({ pDeltaOptions: { includeMethodComparison: event.target.checked } })}
                    className="h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-400"
                  />
                  输出首阶 / 共回转方法比较
                </label>
              </div>
            ) : null}
          </div>
        </div>
      }
    />
  );
}
