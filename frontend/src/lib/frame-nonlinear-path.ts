import type {
  FrameNonlinearPathKeyPoint,
  FrameNonlinearPathStep,
  FrameNonlinearPathTrace,
  FrameStabilityIterationRecord,
} from "../types/structure.ts";

export type NonlinearPathKeyPointKind =
  | "start"
  | "preload_end"
  | "response_turning"
  | "minimum_stability"
  | "stability_change"
  | "residual_peak"
  | "cutback"
  | "last_converged"
  | "failure";

export interface NonlinearPathPlotPoint {
  step: number;
  pathProgress: number;
  loadFactor: number;
  fixedLoadFactor: number;
  displacementMm: number;
  stabilityEigenvalue: number;
  stabilityStatus: FrameNonlinearPathStep["stabilityStatus"];
  residualRelative?: number;
}

export interface NonlinearPathKeyPoint extends NonlinearPathPlotPoint {
  kind: NonlinearPathKeyPointKind;
  label: string;
  id?: string;
  source?: string;
  sourceIndex?: number;
  residualRelative?: number;
}

export interface NonlinearPathLabelCandidate {
  id: string;
  x: number;
  y: number;
  label: string;
}

export interface NonlinearPathLabelPlacement extends NonlinearPathLabelCandidate {
  labelX: number;
  labelY: number;
  leaderX: number;
  leaderY: number;
  textAnchor: "start" | "end";
  bounds: { left: number; right: number; top: number; bottom: number };
}

export function layoutNonlinearPathLabels(
  candidates: NonlinearPathLabelCandidate[],
  chartBounds: { left: number; right: number; top: number; bottom: number },
): NonlinearPathLabelPlacement[] {
  const labelHeight = 13;
  const collisionGap = 4;
  const pointGap = 8;
  const verticalStep = labelHeight + collisionGap;
  const verticalOffsets = [-12];
  for (let lane = 1; lane <= candidates.length + 4; lane += 1) {
    verticalOffsets.push(18 + (lane - 1) * verticalStep, -12 - lane * verticalStep);
  }

  const placements: NonlinearPathLabelPlacement[] = [];
  for (const candidate of candidates) {
    const estimatedWidth = Math.min(
      estimateSvgLabelWidth(candidate.label),
      chartBounds.right - chartBounds.left,
    );
    const textAnchor = candidate.x + pointGap + estimatedWidth <= chartBounds.right ? "start" : "end";
    const labelX = textAnchor === "start"
      ? clamp(candidate.x + pointGap, chartBounds.left, chartBounds.right - estimatedWidth)
      : clamp(candidate.x - pointGap, chartBounds.left + estimatedWidth, chartBounds.right);

    const buildPlacement = (offset: number): NonlinearPathLabelPlacement => {
      const labelY = clamp(candidate.y + offset, chartBounds.top + labelHeight - 3, chartBounds.bottom - 3);
      const left = textAnchor === "start" ? labelX : labelX - estimatedWidth;
      return {
        ...candidate,
        labelX,
        labelY,
        leaderX: textAnchor === "start" ? labelX - 3 : labelX + 3,
        leaderY: labelY < candidate.y ? labelY + 4 : labelY - labelHeight + 1,
        textAnchor,
        bounds: {
          left,
          right: left + estimatedWidth,
          top: labelY - labelHeight + 3,
          bottom: labelY + 3,
        },
      };
    };

    const placement = verticalOffsets
      .map(buildPlacement)
      .find((current) => placements.every((placed) => !labelBoundsOverlap(current.bounds, placed.bounds, collisionGap)))
      ?? buildPlacement(verticalOffsets.at(-1)!);
    placements.push(placement);
  }
  return placements;
}

export function nonlinearPathPlotPoints(trace: FrameNonlinearPathTrace): NonlinearPathPlotPoint[] {
  const hasFixedPreload = trace.steps.some((step) => (step.fixedLoadFactor ?? 0) > 0);
  return trace.steps.map((step) => ({
    step: step.step,
    pathProgress: pathProgress(step.pathPhase, step.fixedLoadFactor ?? 0, step.loadFactor, hasFixedPreload),
    loadFactor: step.loadFactor,
    fixedLoadFactor: step.fixedLoadFactor ?? 0,
    displacementMm: step.maxDisplacementMm,
    stabilityEigenvalue: step.minimumTangentEigenvalue,
    stabilityStatus: step.stabilityStatus,
  }));
}

export function buildNonlinearPathKeyPoints(trace: FrameNonlinearPathTrace): NonlinearPathKeyPoint[] {
  if (trace.keyPoints?.length) {
    return trace.keyPoints.map(mapCanonicalKeyPoint);
  }
  return buildDerivedNonlinearPathKeyPoints(trace);
}

function mapCanonicalKeyPoint(point: FrameNonlinearPathKeyPoint): NonlinearPathKeyPoint {
  const kind = normalizeKeyPointKind(point.kind);
  const loadFactor = finiteNumber(point.loadFactor);
  const fixedLoadFactor = finiteNumber(point.fixedLoadFactor);
  const displacementMm = finiteNumber(point.maxDisplacementMm);
  const stabilityEigenvalue = finiteNumber(point.minimumTangentEigenvalue);
  const residualRelative = finiteOptionalNumber(point.equilibriumResidualRelative);
  const stabilityStatus = normalizeStabilityStatus(point.stabilityStatus);
  return {
    id: point.id,
    source: point.source,
    sourceIndex: point.sourceIndex,
    kind,
    label: keyPointLabel(kind, {
      loadFactor,
      fixedLoadFactor,
      displacementMm,
      stabilityEigenvalue,
      stabilityStatus,
      residualRelative,
    }),
    step: point.step,
    pathProgress: point.pathProgress,
    loadFactor,
    fixedLoadFactor,
    displacementMm,
    stabilityEigenvalue,
    stabilityStatus,
    residualRelative,
  };
}

function buildDerivedNonlinearPathKeyPoints(trace: FrameNonlinearPathTrace): NonlinearPathKeyPoint[] {
  const points = nonlinearPathPlotPoints(trace);
  if (!points.length) return [];
  const selected: NonlinearPathKeyPoint[] = [];
  const add = (
    point: NonlinearPathPlotPoint,
    kind: NonlinearPathKeyPointKind,
    label: string,
    extras: Partial<Pick<NonlinearPathKeyPoint, "id" | "source" | "sourceIndex" | "residualRelative">> = {},
  ) => {
    if (selected.some((item) => item.step === point.step && item.kind === kind)) return;
    selected.push({ ...point, kind, label, ...extras });
  };

  add(points[0]!, "start", keyPointLabel("start", points[0]!));
  const preloadEnd = [...points].reverse().find((point) => point.fixedLoadFactor >= 1 - 1e-12 && point.loadFactor <= 1e-12);
  if (preloadEnd) add(preloadEnd, "preload_end", keyPointLabel("preload_end", preloadEnd));

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const incoming = current.displacementMm - previous.displacementMm;
    const outgoing = next.displacementMm - current.displacementMm;
    const tolerance = Math.max(1e-9, Math.max(Math.abs(previous.displacementMm), Math.abs(current.displacementMm), Math.abs(next.displacementMm)) * 1e-8);
    if (Math.abs(incoming) > tolerance && Math.abs(outgoing) > tolerance && incoming * outgoing < 0) {
      add(current, "response_turning", keyPointLabel("response_turning", current));
    }
    if (current.stabilityStatus !== previous.stabilityStatus) {
      add(current, "stability_change", keyPointLabel("stability_change", current));
    }
  }

  const minimumStability = points.reduce((current, point) =>
    point.stabilityEigenvalue < current.stabilityEigenvalue ? point : current,
  );
  add(minimumStability, "minimum_stability", `最小切线指标 ${formatNumber(minimumStability.stabilityEigenvalue)}`);

  const residualPeak = selectResidualPeak(trace.iterations, points);
  if (residualPeak) {
    add(
      residualPeak.point,
      "residual_peak",
      keyPointLabel("residual_peak", residualPeak.point),
      {
        id: `iteration:${residualPeak.index}`,
        source: "iteration",
        sourceIndex: residualPeak.index,
        residualRelative: residualPeak.residualRelative,
      },
    );
  }

  for (const attempt of trace.attempts) {
    if (attempt.status !== "cutback") continue;
    const attemptStep = Number(attempt.step);
    const prior = [...points].reverse().find((point) => point.step < attemptStep) ?? points[0]!;
    const failedLoadFactor = finiteNumber(attempt.loadFactor ?? prior.loadFactor);
    const failedFixedFactor = finiteNumber(attempt.fixedLoadFactor ?? prior.fixedLoadFactor);
    const hasFixedPreload = points.some((point) => point.fixedLoadFactor > 0);
    const pathPhase = attempt.pathPhase === "fixed_preload" ? "fixed_preload" : "variable";
    const attemptPoint: NonlinearPathPlotPoint = {
      ...prior,
      step: attemptStep,
      loadFactor: failedLoadFactor,
      fixedLoadFactor: failedFixedFactor,
      pathProgress: pathProgress(pathPhase, failedFixedFactor, failedLoadFactor, hasFixedPreload),
    };
    add(attemptPoint, "cutback", keyPointLabel("cutback", attemptPoint));
  }

  const last = points.at(-1)!;
  add(last, "last_converged", keyPointLabel("last_converged", last));
  if (trace.finalAttempt?.status === "failed") {
    const failure = trace.finalAttempt;
    const failedLoadFactor = finiteNumber(failure.loadFactor ?? last.loadFactor);
    const failedFixedFactor = finiteNumber(failure.fixedLoadFactor ?? last.fixedLoadFactor);
    const hasFixedPreload = points.some((point) => point.fixedLoadFactor > 0);
    add(
      {
        ...last,
        step: Number(failure.step ?? last.step + 1),
        loadFactor: failedLoadFactor,
        fixedLoadFactor: failedFixedFactor,
        pathProgress: pathProgress(
          failure.pathPhase === "fixed_preload" ? "fixed_preload" : "variable",
          failedFixedFactor,
          failedLoadFactor,
          hasFixedPreload,
        ),
      },
      "failure",
      keyPointLabel("failure", {
        ...last,
        loadFactor: failedLoadFactor,
        fixedLoadFactor: failedFixedFactor,
      }),
    );
  }

  return selected.sort((left, right) => left.pathProgress - right.pathProgress || left.step - right.step || left.kind.localeCompare(right.kind));
}

function keyPointLabel(kind: NonlinearPathKeyPointKind, point: Pick<NonlinearPathKeyPoint, "loadFactor" | "fixedLoadFactor" | "displacementMm" | "stabilityEigenvalue" | "stabilityStatus" | "residualRelative">) {
  if (kind === "minimum_stability") return `最小切线指标 ${formatNumber(point.stabilityEigenvalue)}`;
  if (kind === "residual_peak") {
    return `残差峰值 · r ${formatNumber(point.residualRelative)} / ${formatNumber(point.displacementMm)} mm`;
  }
  if (kind === "stability_change") return `${stabilityLabel(point.stabilityStatus)} · ${formatPathValue(point)}`;
  if (kind === "response_turning") return `响应拐点 · ${formatPathValue(point)}`;
  if (kind === "preload_end") return `预荷载完成 · ${formatPathValue(point)}`;
  if (kind === "last_converged") return `最后收敛 · ${formatPathValue(point)}`;
  if (kind === "failure") return `终止 · λ ${formatNumber(point.loadFactor)}`;
  if (kind === "cutback") return `切步回退 · λ ${formatNumber(point.loadFactor)}`;
  return `起始 · ${formatPathValue(point)}`;
}

function selectResidualPeak(
  iterations: FrameStabilityIterationRecord[],
  points: NonlinearPathPlotPoint[],
): { index: number; residualRelative: number; point: NonlinearPathPlotPoint & { residualRelative: number } } | null {
  let best: { index: number; residualRelative: number; point: NonlinearPathPlotPoint & { residualRelative: number } } | null = null;
  iterations.forEach((iteration, index) => {
    const residualRelative = iterationResidualRelative(iteration);
    if (residualRelative == null) return;
    const matchingStep = [...points].reverse().find((point) => point.step === Number(iteration.step)) ?? points[0]!;
    const loadFactor = finiteNumber(iteration.loadFactor ?? matchingStep.loadFactor);
    const fixedLoadFactor = finiteNumber(iteration.fixedLoadFactor ?? matchingStep.fixedLoadFactor);
    const pathPhase = iteration.pathPhase === "fixed_preload" ? "fixed_preload" : (matchingStep.fixedLoadFactor > 0 && matchingStep.loadFactor <= 0 ? "fixed_preload" : "variable");
    const point: NonlinearPathPlotPoint & { residualRelative: number } = {
      ...matchingStep,
      step: Number(iteration.step ?? matchingStep.step),
      loadFactor,
      fixedLoadFactor,
      displacementMm: finiteNumber(iteration.displacementMm ?? matchingStep.displacementMm),
      stabilityEigenvalue: finiteNumber(iteration.minimumTangentEigenvalue ?? matchingStep.stabilityEigenvalue),
      stabilityStatus: normalizeStabilityStatus(iteration.stabilityStatus ?? matchingStep.stabilityStatus),
      residualRelative,
      pathProgress: pathProgress(pathPhase, fixedLoadFactor, loadFactor, points.some((candidate) => candidate.fixedLoadFactor > 0)),
    };
    if (!best || residualRelative > best.residualRelative) {
      best = { index, residualRelative, point };
    }
  });
  return best;
}

function iterationResidualRelative(iteration: FrameStabilityIterationRecord) {
  const value = (
    finiteOptionalNumber(iteration.equilibriumResidualRelative)
    ?? finiteOptionalNumber(iteration.equilibriumResidualNormN)
    ?? finiteOptionalNumber(iteration.equilibriumResidual)
    ?? finiteOptionalNumber(iteration.equilibriumRmsRelativeError)
    ?? finiteOptionalNumber(iteration.residualNorm)
  );
  return value == null ? null : Math.abs(value);
}

function normalizeKeyPointKind(kind: FrameNonlinearPathKeyPoint["kind"] | "turning_point"): NonlinearPathKeyPointKind {
  if (kind === "turning_point") return "response_turning";
  return kind;
}

function normalizeStabilityStatus(
  status: FrameNonlinearPathStep["stabilityStatus"] | FrameNonlinearPathKeyPoint["stabilityStatus"] | null | undefined,
): FrameNonlinearPathStep["stabilityStatus"] {
  if (status === "unstable" || status === "near_critical" || status === "stable") return status;
  return "stable";
}

function pathProgress(
  phase: string | undefined,
  fixedLoadFactor: number,
  loadFactor: number,
  hasFixedPreload: boolean,
) {
  if (phase === "fixed_preload") return fixedLoadFactor;
  return (hasFixedPreload ? 1 : 0) + loadFactor;
}

function stabilityLabel(status: FrameNonlinearPathStep["stabilityStatus"] | NonlinearPathKeyPoint["stabilityStatus"]) {
  if (status === "unstable") return "切线不稳定";
  if (status === "near_critical") return "接近临界";
  return "切线稳定";
}

function formatPathValue(point: Pick<NonlinearPathPlotPoint, "loadFactor" | "displacementMm">) {
  return `λ ${formatNumber(point.loadFactor)} / ${formatNumber(point.displacementMm)} mm`;
}

function finiteNumber(value: unknown) {
  if (!Number.isFinite(Number(value))) return 0;
  return Number(value);
}

function finiteOptionalNumber(value: unknown) {
  if (!Number.isFinite(Number(value))) return undefined;
  return Number(value);
}

function formatNumber(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return "—";
  const numeric = Number(value);
  const absolute = Math.abs(numeric);
  if (absolute !== 0 && (absolute >= 1e5 || absolute < 1e-3)) return numeric.toExponential(3);
  return numeric.toFixed(3).replace(/\.?0+$/, "");
}

function estimateSvgLabelWidth(label: string) {
  return Array.from(label).reduce((width, character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    if (character === " ") return width + 3.5;
    return width + (codePoint > 0xff ? 10 : 6.2);
  }, 6);
}

function labelBoundsOverlap(
  left: NonlinearPathLabelPlacement["bounds"],
  right: NonlinearPathLabelPlacement["bounds"],
  gap: number,
) {
  return !(
    left.right + gap <= right.left
    || right.right + gap <= left.left
    || left.bottom + gap <= right.top
    || right.bottom + gap <= left.top
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
