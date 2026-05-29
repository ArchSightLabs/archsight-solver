import { lazy, Suspense } from "react";
import { GlassCard } from "./ui/GlassCard";
import type { WorkspaceState } from "../lib/workspace-state";
import { defaultSensitivityMetricForMode, sensitivityOptionsForMode } from "../lib/sensitivity-options";
import type { WorkbenchOperationNotice as WorkbenchOperationNoticeModel } from "../lib/workbench-operation-status";
import type { AnalysisMode } from "../types/structure";
import type { SensitivityResults } from "../types/beam";
import { WorkbenchOperationNotice } from "./WorkbenchOperationNotice";

const SensitivityDashboard = lazy(() =>
  import("./ui/SensitivityDashboard").then((module) => ({ default: module.SensitivityDashboard }))
);

interface WorkbenchSensitivityPanelProps {
  analysisMode: AnalysisMode;
  workspace: WorkspaceState;
  sensitivityData: SensitivityResults | null;
  isScanning: boolean;
  operationNotice: WorkbenchOperationNoticeModel | null;
  compact?: boolean;
  onRunSensitivity: (config: { range: number; steps: number; targetSpanIndex: number; responseMetric: string }) => void;
}

function LoadingPanel({ compact = false }: { compact?: boolean }) {
  return (
    <GlassCard className={`flex items-center justify-center border-dashed border-primary/10 bg-primary/[0.01] ${compact ? "min-h-[220px]" : "min-h-[320px] sm:min-h-[460px]"}`}>
      <div className="text-center">
        <div className="mx-auto mb-4 h-14 w-14 animate-pulse rounded-lg border border-primary/10 bg-primary/10" />
        <h3 className="mb-2 text-xl font-black tracking-tight">敏感性图表加载中</h3>
        <p className="mx-auto max-w-sm text-xs text-muted-foreground">正在加载参数扰动扫描图表模块。</p>
      </div>
    </GlassCard>
  );
}

export function WorkbenchSensitivityPanel({
  analysisMode,
  workspace,
  sensitivityData,
  isScanning,
  operationNotice,
  compact = false,
  onRunSensitivity,
}: WorkbenchSensitivityPanelProps) {
  const responseOptions = sensitivityOptionsForMode(analysisMode);
  const targetOptions =
    analysisMode === "beam"
      ? workspace.beam.spans.map((_, index) => ({
          value: index,
          label: `第 ${index + 1} 跨梁段`,
        }))
      : undefined;

  return (
    <section className="space-y-4" aria-label="敏感性分析结果">
      <WorkbenchOperationNotice notice={operationNotice} compact={compact} />
      <Suspense fallback={<LoadingPanel compact={compact} />}>
        <SensitivityDashboard
          results={sensitivityData}
          isLoading={isScanning}
          onRun={onRunSensitivity}
          targetLabel="目标跨段"
          targetOptions={targetOptions}
          responseOptions={responseOptions}
          defaultResponseMetric={defaultSensitivityMetricForMode(analysisMode)}
          compact={compact}
        />
      </Suspense>
    </section>
  );
}
