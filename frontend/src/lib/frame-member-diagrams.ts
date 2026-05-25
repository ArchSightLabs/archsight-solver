import type { FrameMemberDiagram } from "../types/structure";

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

export const FRAME_DIAGRAM_METRICS: FrameDiagramMetric[] = [
  { key: "momentKnM", title: "弯矩图", unit: "kN·m", color: "#dc2626", fillColor: "rgba(220, 38, 38, 0.18)", diagramType: "area" },
  { key: "shearKn", title: "剪力图", unit: "kN", color: "#2563eb", fillColor: "rgba(37, 99, 235, 0.16)", diagramType: "area" },
  { key: "deflectionMm", title: "局部 y 向挠度图", unit: "mm", color: "#7c3aed", fillColor: "rgba(124, 58, 237, 0.14)", diagramType: "line" },
  { key: "axialKn", title: "轴力图", unit: "kN", color: "#059669", fillColor: "rgba(5, 150, 105, 0.14)", diagramType: "area" },
];

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
