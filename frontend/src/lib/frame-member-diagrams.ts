import type { FrameMemberDiagram } from "../types/structure";
import { FRAME_REPORT_MEMBER_FIGURES } from "./report-figure-catalog.ts";
import { STRUCTURE_RESULT_COLORS } from "./structure-visual-tokens.ts";

export type FrameDiagramMetricKey = "axialKn" | "shearKn" | "momentKnM" | "deflectionMm";

export type FrameDiagramKeyPointKind =
  | "global-extreme"
  | "local-extreme"
  | "jump-left"
  | "jump-right"
  | "zero-crossing"
  | "endpoint";

export interface FrameDiagramMetric {
  key: FrameDiagramMetricKey;
  title: string;
  unit: string;
  color: string;
  fillColor: string;
  diagramType: "area" | "line";
}

export interface FrameDiagramPoint {
  memberId: string;
  x: number;
  y: number;
}

export interface FrameDiagramSeries {
  metric: FrameDiagramMetric;
  points: FrameDiagramPoint[];
}

export interface FrameDiagramExtreme {
  memberId: string;
  stationM: number;
  stationRatio: number;
  value: number;
  absValue: number;
}

export interface FrameDiagramKeyPoint {
  memberId: string;
  stationM: number;
  stationRatio: number;
  value: number;
  kind: FrameDiagramKeyPointKind;
  priority: number;
}

const FRAME_DIAGRAM_STYLES: Record<FrameDiagramMetricKey, Pick<FrameDiagramMetric, "color" | "fillColor" | "diagramType">> = {
  momentKnM: { color: STRUCTURE_RESULT_COLORS.frameMoment, fillColor: STRUCTURE_RESULT_COLORS.frameMomentFill, diagramType: "area" },
  shearKn: { color: STRUCTURE_RESULT_COLORS.frameShear, fillColor: STRUCTURE_RESULT_COLORS.frameShearFill, diagramType: "area" },
  deflectionMm: { color: STRUCTURE_RESULT_COLORS.frameDeflection, fillColor: STRUCTURE_RESULT_COLORS.frameDeflectionFill, diagramType: "line" },
  axialKn: { color: STRUCTURE_RESULT_COLORS.frameAxial, fillColor: STRUCTURE_RESULT_COLORS.frameAxialFill, diagramType: "area" },
};

export const FRAME_DIAGRAM_METRICS: FrameDiagramMetric[] = FRAME_REPORT_MEMBER_FIGURES.map((figure) => ({
  key: figure.metric,
  title: figure.title,
  unit: figure.unit,
  ...FRAME_DIAGRAM_STYLES[figure.metric],
}));

export const DEFAULT_FRAME_DIAGRAM_METRIC_KEY: FrameDiagramMetricKey = "momentKnM";

export function getFrameDiagramMetric(key: FrameDiagramMetricKey): FrameDiagramMetric {
  return FRAME_DIAGRAM_METRICS.find((metric) => metric.key === key) ?? FRAME_DIAGRAM_METRICS[0];
}

export function buildFrameDiagramSeries(diagrams: FrameMemberDiagram[], metric: FrameDiagramMetric): FrameDiagramSeries {
  return {
    metric,
    points: diagrams.flatMap((diagram) => {
      const values = diagram[metric.key];
      return diagram.stationsM.map((station, index) => ({
        memberId: diagram.memberId,
        x: station,
        y: values[index] ?? 0,
      }));
    }),
  };
}

function keyPointPriority(kind: FrameDiagramKeyPointKind) {
  if (kind === "global-extreme") return 1000;
  if (kind === "jump-left" || kind === "jump-right") return 920;
  if (kind === "endpoint") return 920;
  if (kind === "zero-crossing") return 900;
  return 700;
}

function finiteSamples(diagram: FrameMemberDiagram, metric: FrameDiagramMetric) {
  return diagram.stationsM
    .map((stationM, index) => ({
      index,
      stationM,
      stationRatio: diagram.stations[index] ?? 0,
      value: diagram[metric.key][index] ?? 0,
    }))
    .filter((sample) => Number.isFinite(sample.stationM) && Number.isFinite(sample.value))
    .sort((a, b) => a.stationM - b.stationM || a.index - b.index);
}

function addCandidate(candidates: Map<string, FrameDiagramKeyPoint>, candidate: FrameDiagramKeyPoint) {
  const key =
    candidate.kind === "jump-left" || candidate.kind === "jump-right"
      ? `${candidate.memberId}:${candidate.kind}:${candidate.stationM.toFixed(6)}:${candidate.value.toFixed(6)}`
      : `${candidate.memberId}:${candidate.stationM.toFixed(6)}:${candidate.value.toFixed(6)}`;
  const current = candidates.get(key);
  if (
    !current ||
    candidate.priority > current.priority ||
    (candidate.priority === current.priority && (Math.abs(candidate.value) > Math.abs(current.value) || candidate.stationM < current.stationM))
  ) {
    candidates.set(key, candidate);
  }
}

function interpolateZeroCrossing(left: { stationM: number; stationRatio: number; value: number }, right: { stationM: number; stationRatio: number; value: number }) {
  if (Math.abs(left.value) <= 1e-12) {
    return { stationM: left.stationM, stationRatio: left.stationRatio, value: 0 };
  }
  if (Math.abs(right.value) <= 1e-12) {
    return { stationM: right.stationM, stationRatio: right.stationRatio, value: 0 };
  }
  const denominator = right.value - left.value;
  if (Math.abs(denominator) <= 1e-12) {
    return null;
  }
  const ratio = -left.value / denominator;
  if (ratio < 0 || ratio > 1) {
    return null;
  }
  return {
    stationM: left.stationM + (right.stationM - left.stationM) * ratio,
    stationRatio: left.stationRatio + (right.stationRatio - left.stationRatio) * ratio,
    value: 0,
  };
}

function isLocalExtreme(prev: { value: number }, current: { value: number }, next: { value: number }, tolerance: number) {
  const risesIntoCurrent = current.value - prev.value > tolerance;
  const fallsIntoCurrent = current.value - prev.value < -tolerance;
  const risesAfterCurrent = next.value - current.value > tolerance;
  const fallsAfterCurrent = next.value - current.value < -tolerance;
  return (risesIntoCurrent && fallsAfterCurrent) || (fallsIntoCurrent && risesAfterCurrent);
}

function orderKeyPoints(candidates: FrameDiagramKeyPoint[]) {
  return candidates
    .slice()
    .sort((a, b) => a.stationM - b.stationM || b.priority - a.priority || a.memberId.localeCompare(b.memberId));
}

function shouldTreatAsJump(current: { stationM: number; value: number }, next: { stationM: number; value: number }, jumpStationTolerance: number, jumpThreshold: number) {
  return Math.abs(next.stationM - current.stationM) <= jumpStationTolerance && Math.abs(next.value - current.value) >= jumpThreshold;
}

export function findFrameDiagramKeyPoints(diagram: FrameMemberDiagram, metric: FrameDiagramMetric): FrameDiagramKeyPoint[] {
  const points = finiteSamples(diagram, metric);
  if (!points.length) return [];

  const maxAbs = Math.max(...points.map((point) => Math.abs(point.value)));
  if (maxAbs <= 1e-9) return [];

  const candidates = new Map<string, FrameDiagramKeyPoint>();
  const valueTolerance = Math.max(maxAbs * 0.015, 1e-7);
  const smoothTurnTolerance = Math.max(maxAbs * 0.0001, 1e-7);
  const zeroCrossingTolerance = Math.max(maxAbs * 1e-9, 1e-10);
  const totalLength = Math.max(points[points.length - 1].stationM - points[0].stationM, 1e-9);
  const jumpStationTolerance = totalLength * 0.025;
  const jumpThreshold = maxAbs * 0.18;
  const jumpBoundaries = new Set<number>();

  const globalExtreme = points.reduce((current, point) => (Math.abs(point.value) > Math.abs(current.value) ? point : current), points[0]);
  addCandidate(candidates, {
    memberId: diagram.memberId,
    stationM: globalExtreme.stationM,
    stationRatio: globalExtreme.stationRatio,
    value: globalExtreme.value,
    kind: "global-extreme",
    priority: keyPointPriority("global-extreme"),
  });

  const first = points[0];
  const last = points[points.length - 1];
  addCandidate(candidates, {
    memberId: diagram.memberId,
    stationM: first.stationM,
    stationRatio: first.stationRatio,
    value: first.value,
    kind: "endpoint",
    priority: keyPointPriority("endpoint"),
  });
  if (last !== first) {
    addCandidate(candidates, {
      memberId: diagram.memberId,
      stationM: last.stationM,
      stationRatio: last.stationRatio,
      value: last.value,
      kind: "endpoint",
      priority: keyPointPriority("endpoint"),
    });
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const jump = shouldTreatAsJump(current, next, jumpStationTolerance, jumpThreshold);

    if (jump) {
      jumpBoundaries.add(index);
      addCandidate(candidates, {
        memberId: diagram.memberId,
        stationM: current.stationM,
        stationRatio: current.stationRatio,
        value: current.value,
        kind: "jump-left",
        priority: keyPointPriority("jump-left"),
      });
      addCandidate(candidates, {
        memberId: diagram.memberId,
        stationM: next.stationM,
        stationRatio: next.stationRatio,
        value: next.value,
        kind: "jump-right",
        priority: keyPointPriority("jump-right"),
      });
    }

    const signChange = current.value * next.value < 0;
    if (signChange && !jump) {
      const zeroCrossing = interpolateZeroCrossing(current, next);
      if (zeroCrossing) {
        addCandidate(candidates, {
          memberId: diagram.memberId,
          ...zeroCrossing,
          kind: "zero-crossing",
          priority: keyPointPriority("zero-crossing"),
        });
      }
    }
  }


  for (let index = 1; index < points.length - 1; index += 1) {
    if (Math.abs(points[index].value) > zeroCrossingTolerance) continue;
    if (Math.abs(points[index - 1].value) <= zeroCrossingTolerance) continue;

    let zeroRunEnd = index;
    while (zeroRunEnd + 1 < points.length && Math.abs(points[zeroRunEnd + 1].value) <= zeroCrossingTolerance) {
      zeroRunEnd += 1;
    }
    if (zeroRunEnd >= points.length - 1) continue;
    if (jumpBoundaries.has(index - 1) || jumpBoundaries.has(zeroRunEnd)) continue;

    const left = points[index - 1];
    const right = points[zeroRunEnd + 1];
    if (left.value * right.value >= 0) continue;
    const representative = points
      .slice(index, zeroRunEnd + 1)
      .reduce((best, point) => (Math.abs(point.value) < Math.abs(best.value) ? point : best), points[index]);
    addCandidate(candidates, {
      memberId: diagram.memberId,
      stationM: representative.stationM,
      stationRatio: representative.stationRatio,
      value: 0,
      kind: "zero-crossing",
      priority: keyPointPriority("zero-crossing"),
    });
  }

  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const turnTolerance = metric.key === "shearKn" ? valueTolerance : smoothTurnTolerance;
    if (!isLocalExtreme(prev, current, next, turnTolerance)) continue;

    addCandidate(candidates, {
      memberId: diagram.memberId,
      stationM: current.stationM,
      stationRatio: current.stationRatio,
      value: current.value,
      kind: "local-extreme",
      priority: keyPointPriority("local-extreme"),
    });
  }

  return orderKeyPoints(Array.from(candidates.values()));
}

export function numericDomain(values: number[], paddingRatio = 0.08): [number, number] {
  if (!values.length) {
    return [-1, 1];
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (Math.abs(max - min) < 1e-9) {
    const pad = Math.max(1, Math.abs(max) * paddingRatio);
    return [min - pad, max + pad];
  }
  const pad = (max - min) * paddingRatio;
  return [min - pad, max + pad];
}

export function findFrameDiagramExtreme(diagrams: FrameMemberDiagram[], metric: FrameDiagramMetric): FrameDiagramExtreme | null {
  let extreme: FrameDiagramExtreme | null = null;
  for (const diagram of diagrams) {
    const values = diagram[metric.key];
    values.forEach((value, index) => {
      const candidate = {
        memberId: diagram.memberId,
        stationM: diagram.stationsM[index] ?? 0,
        stationRatio: diagram.stations[index] ?? 0,
        value,
        absValue: Math.abs(value),
      };
      if (!extreme || candidate.absValue > extreme.absValue) {
        extreme = candidate;
      }
    });
  }
  return extreme;
}
