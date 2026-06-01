import { lazy, Suspense } from "react";
import type { BeamCalculationResults } from "../types/beam";
import type {
  AnalysisMode,
  FrameCalculationResults,
  TrussCalculationResults,
} from "../types/structure";
import {
  AssumptionsPanel,
  BeamBenchmarkPanel,
  DataCurvePanel,
  EmptyResult,
  LoadingPanel,
  SummaryGrid,
} from "./workbench-result-panels";
import {
  beamDataCurveOptions,
  beamSummaryRows,
  frameDataCurveOptions,
  frameSummaryRows,
  trussDataCurveOptions,
  trussSummaryRows,
} from "./workbench-result-metrics";

const BeamPreview = lazy(() => import("./BeamPreview").then((module) => ({ default: module.BeamPreview })));
const BeamResultDiagrams = lazy(() => import("./BeamResultDiagrams").then((module) => ({ default: module.BeamResultDiagrams })));
const FramePreview = lazy(() => import("./FramePreview").then((module) => ({ default: module.FramePreview })));
const FrameMemberDiagrams = lazy(() => import("./FrameMemberDiagrams").then((module) => ({ default: module.FrameMemberDiagrams })));
const TrussPreview = lazy(() => import("./TrussPreview").then((module) => ({ default: module.TrussPreview })));
const TrussResultDiagrams = lazy(() => import("./TrussResultDiagrams").then((module) => ({ default: module.TrussResultDiagrams })));

interface WorkbenchResultContentProps {
  analysisMode: AnalysisMode;
  activeTabId: string;
  compact?: boolean;
  hasResults: boolean;
  beamResults: BeamCalculationResults | null;
  trussResults: TrussCalculationResults | null;
  displayedFrameResults: FrameCalculationResults | null;
}

export function WorkbenchResultContent({
  analysisMode,
  activeTabId,
  compact = false,
  hasResults,
  beamResults,
  trussResults,
  displayedFrameResults,
}: WorkbenchResultContentProps) {
  if (!hasResults) {
    return <EmptyResult mode={analysisMode} compact={compact} />;
  }

  if (analysisMode === "beam" && beamResults) {
    if (activeTabId === "overview") {
      return (
        <div className={`space-y-3 ${compact ? "" : "sm:space-y-4"}`}>
          {beamResults.beam ? (
            <Suspense fallback={<LoadingPanel compact={compact} />}>
              <BeamPreview beam={beamResults.beam} compact={compact} />
            </Suspense>
          ) : null}
          <Suspense fallback={<LoadingPanel compact={compact} />}>
            <BeamResultDiagrams results={beamResults} compact={compact} />
          </Suspense>
          <SummaryGrid compact={compact} rows={beamSummaryRows(beamResults)} />
          <DataCurvePanel options={beamDataCurveOptions(beamResults)} compact={compact} />
          <BeamBenchmarkPanel results={beamResults} compact={compact} />
          <AssumptionsPanel mode="beam" compact={compact} />
        </div>
      );
    }
    if (activeTabId === "preview") {
      return beamResults.beam ? (
        <Suspense fallback={<LoadingPanel compact={compact} />}>
          <BeamPreview beam={beamResults.beam} compact={compact} />
        </Suspense>
      ) : (
        <EmptyResult mode="beam" compact={compact} />
      );
    }
    if (activeTabId === "diagrams") {
      return (
        <Suspense fallback={<LoadingPanel compact={compact} />}>
          <BeamResultDiagrams results={beamResults} compact={compact} />
        </Suspense>
      );
    }
    if (activeTabId === "curves") {
      return <DataCurvePanel options={beamDataCurveOptions(beamResults)} compact={compact} />;
    }
    return (
      <div className="space-y-3">
        <SummaryGrid compact={compact} rows={beamSummaryRows(beamResults)} />
        <BeamBenchmarkPanel results={beamResults} compact={compact} />
        <AssumptionsPanel mode="beam" compact={compact} />
      </div>
    );
  }

  if (analysisMode === "truss") {
    if (!trussResults) {
      return <EmptyResult mode="truss" compact={compact} />;
    }

    if (activeTabId === "overview") {
      return (
        <div className={`space-y-3 ${compact ? "" : "sm:space-y-4"}`}>
          <Suspense fallback={<LoadingPanel compact={compact} />}>
            <TrussPreview truss={trussResults.truss ?? null} compact={compact} />
          </Suspense>
          <Suspense fallback={<LoadingPanel compact={compact} />}>
            <TrussResultDiagrams truss={trussResults.truss ?? null} compact={compact} />
          </Suspense>
          <SummaryGrid compact={compact} rows={trussSummaryRows(trussResults)} />
          <DataCurvePanel options={trussDataCurveOptions(trussResults)} compact={compact} />
          <AssumptionsPanel mode="truss" compact={compact} />
        </div>
      );
    }
    if (activeTabId === "preview") {
      return (
        <Suspense fallback={<LoadingPanel compact={compact} />}>
          <TrussPreview truss={trussResults.truss ?? null} compact={compact} />
        </Suspense>
      );
    }
    if (activeTabId === "diagrams") {
      return (
        <Suspense fallback={<LoadingPanel compact={compact} />}>
          <TrussResultDiagrams truss={trussResults.truss ?? null} compact={compact} />
        </Suspense>
      );
    }
    if (activeTabId === "curves") {
      return <DataCurvePanel options={trussDataCurveOptions(trussResults)} compact={compact} />;
    }
    return (
      <div className="space-y-3">
        <SummaryGrid compact={compact} rows={trussSummaryRows(trussResults)} />
        <AssumptionsPanel mode="truss" compact={compact} />
      </div>
    );
  }

  if (!displayedFrameResults) {
    return <EmptyResult mode="frame" compact={compact} />;
  }

  if (activeTabId === "overview") {
    return (
      <div className={`space-y-3 ${compact ? "" : "sm:space-y-4"}`}>
        <Suspense fallback={<LoadingPanel compact={compact} />}>
          <FramePreview frame={displayedFrameResults.frame ?? null} compact={compact} />
        </Suspense>
        <Suspense fallback={<LoadingPanel compact={compact} />}>
          <FrameMemberDiagrams frame={displayedFrameResults.frame ?? null} diagrams={displayedFrameResults.memberDiagrams ?? []} compact={compact} />
        </Suspense>
        <SummaryGrid compact={compact} rows={frameSummaryRows(displayedFrameResults)} />
        <DataCurvePanel options={frameDataCurveOptions(displayedFrameResults)} compact={compact} />
        <AssumptionsPanel mode="frame" compact={compact} />
      </div>
    );
  }
  if (activeTabId === "preview") {
    return (
      <Suspense fallback={<LoadingPanel compact={compact} />}>
        <FramePreview frame={displayedFrameResults.frame ?? null} compact={compact} />
      </Suspense>
    );
  }
  if (activeTabId === "diagrams") {
    return (
      <Suspense fallback={<LoadingPanel compact={compact} />}>
        <FrameMemberDiagrams frame={displayedFrameResults.frame ?? null} diagrams={displayedFrameResults.memberDiagrams ?? []} compact={compact} />
      </Suspense>
    );
  }
  if (activeTabId === "curves") {
    return <DataCurvePanel options={frameDataCurveOptions(displayedFrameResults)} compact={compact} />;
  }
  return (
    <div className="space-y-3">
      <SummaryGrid compact={compact} rows={frameSummaryRows(displayedFrameResults)} />
      <AssumptionsPanel mode="frame" compact={compact} />
    </div>
  );
}
