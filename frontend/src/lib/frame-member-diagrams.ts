import type { FrameMemberDiagram } from "../types/structure";
import { FRAME_REPORT_MEMBER_FIGURES } from "./report-figure-catalog.ts";
import { STRUCTURE_RESULT_COLORS } from "./structure-visual-tokens.ts";

export type FrameDiagramMetricKey = "axialKn" | "shearKn" | "momentKnM" | "deflectionMm";

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
