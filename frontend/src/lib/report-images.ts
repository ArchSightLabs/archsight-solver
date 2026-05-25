import * as echarts from "echarts/core";
import type { EChartsCoreOption } from "echarts/core";
import { LineChart } from "echarts/charts";
import { GraphicComponent, GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { BeamCalculationResults, SensitivityResults } from "../types/beam";
import type { AnalysisMode, FrameCalculationResults, FrameMemberDiagram, TrussCalculationResults } from "../types/structure";
import { DEFAULT_REPORT_EXPORT_OPTIONS, type ReportExportOptions } from "./report-options";

echarts.use([LineChart, GridComponent, TooltipComponent, GraphicComponent, CanvasRenderer]);

export type ReportImages = Record<string, string>;

const REPORT_BG = "#ffffff";
const GRID = "rgba(100,116,139,0.18)";
const AXIS = "rgba(71,85,105,0.45)";
const TEXT = "#334155";
const MUTED_TEXT = "#64748b";
const MEMBER_COLORS = ["#38bdf8", "#22c55e", "#f59e0b", "#a78bfa", "#fb7185", "#14b8a6"];

type ReportInput = {
  analysisMode: AnalysisMode;
  beamResults: BeamCalculationResults | null;
  frameResults: FrameCalculationResults | null;
  trussResults: TrussCalculationResults | null;
  sensitivityData: SensitivityResults | null;
  reportOptions?: ReportExportOptions;
};

type LineSeries = {
  name: string;
  data: number[];
  color: string;
};

export async function buildReportImages(input: ReportInput): Promise<ReportImages> {
  const images: ReportImages = {};
  const reportOptions = input.reportOptions ?? DEFAULT_REPORT_EXPORT_OPTIONS;
  const includeFigures = reportOptions.figureScope !== "none";
  const includeOverlay = includeFigures && (reportOptions.figureMode === "overlay" || reportOptions.figureMode === "both");
  const includeTraditional = includeFigures && (reportOptions.figureMode === "traditional" || reportOptions.figureMode === "both");
  const includeAll = reportOptions.figureScope === "all";
  if (input.analysisMode === "beam" && input.beamResults) {
    const beam = input.beamResults;
    if (includeFigures) {
      images["beam.preview"] = await renderBeamPreview(beam);
    }
    if (includeOverlay) {
      images["beam.overlay.moment"] = await renderBeamOverlay(beam, "moment");
      if (includeAll) {
        images["beam.overlay.shear"] = await renderBeamOverlay(beam, "shear");
        images["beam.overlay.deflection"] = await renderBeamOverlay(beam, "deflection");
      }
    }
    if (includeTraditional) {
      if (includeAll) {
        images["beam.deflection"] = await renderLineChart({
          xLabels: beam.x_data.map((value) => value.toFixed(2)),
          yLabel: "挠度（毫米）",
          unit: "毫米",
          series: [{ name: "挠度", data: beam.v_data.map((value) => value * 1000), color: "#0ea5e9" }],
        });
      }
      images["beam.moment"] = await renderLineChart({
        xLabels: beam.x_data.map((value) => value.toFixed(2)),
        yLabel: "弯矩（千牛·米）",
        unit: "千牛·米",
        series: [{ name: "弯矩", data: beam.moment_data, color: "#16a34a" }],
      });
      if (includeAll) {
        images["beam.shear"] = await renderLineChart({
          xLabels: beam.x_data.map((value) => value.toFixed(2)),
          yLabel: "剪力（千牛）",
          unit: "千牛",
          series: [{ name: "剪力", data: beam.shear_data, color: "#f59e0b" }],
        });
      }
    }
  }

  if (input.analysisMode === "frame" && input.frameResults) {
    const frame = input.frameResults;
    if (includeFigures) {
      images["frame.preview"] = await renderFramePreview(frame);
    }
    const nodeLabels = frame.nodeIds;
    if (includeOverlay) {
      images["frame.overlay.moment"] = await renderFrameOverlay(frame, "momentKnM");
      if (includeAll) {
        images["frame.overlay.shear"] = await renderFrameOverlay(frame, "shearKn");
        images["frame.overlay.axial"] = await renderFrameOverlay(frame, "axialKn");
        images["frame.overlay.memberDeflection"] = await renderFrameOverlay(frame, "deflectionMm");
      }
    }
    if (includeTraditional) {
      if (includeAll) {
        images["frame.ux"] = await renderLineChart({
          xLabels: nodeLabels,
          yLabel: "水平位移（毫米）",
          unit: "毫米",
          series: [{ name: "节点 X 向水平位移", data: frame.ux_data, color: "#22c55e" }],
        });
        images["frame.uy"] = await renderLineChart({
          xLabels: nodeLabels,
          yLabel: "竖向位移（毫米）",
          unit: "毫米",
          series: [{ name: "节点 Y 向竖向位移", data: frame.uy_data, color: "#0ea5e9" }],
        });
      }
      await addFrameMemberDiagramImages(images, frame.memberDiagrams ?? [], includeAll);
    }
  }

  if (input.analysisMode === "truss" && input.trussResults) {
    const truss = input.trussResults;
    if (includeFigures) {
      images["truss.preview"] = await renderTrussPreview(truss);
    }
    if (includeOverlay) {
      images["truss.overlay.axial"] = await renderTrussOverlay(truss, "axial");
      if (includeAll) {
        images["truss.overlay.displacement"] = await renderTrussOverlay(truss, "displacement");
      }
    }
    if (includeTraditional) {
      if (includeAll) {
        images["truss.ux"] = await renderLineChart({
          xLabels: truss.nodeIds,
          yLabel: "水平位移（毫米）",
          unit: "毫米",
          series: [{ name: "节点 X 向水平位移", data: truss.ux_data, color: "#22c55e" }],
        });
        images["truss.uy"] = await renderLineChart({
          xLabels: truss.nodeIds,
          yLabel: "竖向位移（毫米）",
          unit: "毫米",
          series: [{ name: "节点 Y 向竖向位移", data: truss.uy_data, color: "#0ea5e9" }],
        });
      }
      images["truss.axial"] = await renderLineChart({
        xLabels: truss.memberIds,
        yLabel: "杆件轴力（千牛）",
        unit: "千牛",
        series: [{ name: "杆件轴力", data: truss.member_axial_data.map((item) => item.axialForceKn), color: "#f59e0b" }],
      });
    }
  }

  if (input.sensitivityData) {
    images["sensitivity.response"] = await renderLineChart({
      xLabels: input.sensitivityData.variations.map((value) => `${(value * 100).toFixed(0)}%`),
      yLabel: `${input.sensitivityData.responseLabel}（${input.sensitivityData.responseUnit}）`,
      unit: input.sensitivityData.responseUnit,
      series: input.sensitivityData.series.map((item, index) => ({
        name: item.label,
        data: item.values,
        color: item.color ?? MEMBER_COLORS[index % MEMBER_COLORS.length],
      })),
      showLegend: true,
    });
  }

  return images;
}

async function addFrameMemberDiagramImages(images: ReportImages, diagrams: FrameMemberDiagram[], includeAll: boolean) {
  const metrics = includeAll
    ? [
        { key: "axialKn" as const, label: "轴力", unit: "kN", imageKey: "frame.axial" },
        { key: "shearKn" as const, label: "剪力", unit: "kN", imageKey: "frame.shear" },
        { key: "momentKnM" as const, label: "弯矩", unit: "kN·m", imageKey: "frame.moment" },
        { key: "deflectionMm" as const, label: "局部 y 向位移", unit: "mm", imageKey: "frame.memberDeflection" },
      ]
    : [{ key: "momentKnM" as const, label: "弯矩", unit: "kN·m", imageKey: "frame.moment" }];
  for (const metric of metrics) {
    images[metric.imageKey] = await renderLineChart({
      xLabels: diagrams[0]?.stationsM.map((value) => value.toFixed(2)) ?? [],
      yLabel: `${metric.label}（${metric.unit}）`,
      unit: metric.unit,
      series: diagrams.map((diagram, index) => ({
        name: diagram.memberId,
        data: diagram[metric.key],
        color: MEMBER_COLORS[index % MEMBER_COLORS.length],
      })),
      showLegend: true,
    });
  }
}

async function renderLineChart({
  xLabels,
  yLabel,
  unit,
  series,
  showLegend = false,
}: {
  xLabels: string[];
  yLabel: string;
  unit: string;
  series: LineSeries[];
  showLegend?: boolean;
}) {
  const option: EChartsCoreOption = {
    backgroundColor: REPORT_BG,
    animation: false,
    tooltip: { show: false },
    legend: showLegend
      ? {
          top: 8,
          right: 20,
          textStyle: { color: TEXT, fontSize: 11 },
        }
      : undefined,
    grid: { left: "9%", right: "5%", top: showLegend ? "16%" : "12%", bottom: "14%", containLabel: true },
    xAxis: {
      type: "category",
      data: xLabels,
      boundaryGap: false,
      axisLine: { lineStyle: { color: AXIS } },
      axisTick: { show: false },
      axisLabel: { color: TEXT, fontSize: 10, fontFamily: "Fira Code", interval: Math.max(0, Math.floor(xLabels.length / 5)) },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      name: yLabel,
      nameGap: 10,
      nameTextStyle: { color: TEXT, fontSize: 11, fontFamily: "Fira Code" },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: TEXT, fontSize: 10, fontFamily: "Fira Code" },
      splitLine: { lineStyle: { color: GRID, type: "dashed" } },
    },
    series: series.map((item) => ({
      name: item.name,
      type: "line",
      data: item.data.map((value) => Number(value.toFixed(6))),
      smooth: 0.4,
      symbol: "none",
      lineStyle: { width: 2.8, color: item.color },
      areaStyle:
        series.length === 1
          ? {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: `${item.color}55` },
                { offset: 1, color: `${item.color}00` },
              ]),
            }
          : undefined,
    })),
    graphic: [{ type: "text", right: 24, bottom: 16, style: { text: unit, fill: MUTED_TEXT, fontSize: 10 } }],
  };
  return renderOption(option);
}

async function renderBeamPreview(results: BeamCalculationResults) {
  const beam = results.beam;
  if (!beam) return "";
  const total = Math.max(beam.totalLength || 1, 1e-9);
  const mapX = (x: number) => 60 + (x / total) * 780;
  const y0 = 205;
  const graphics: Array<Record<string, unknown>> = [
    { type: "rect", shape: { x: 0, y: 0, width: 900, height: 420 }, style: { fill: REPORT_BG } },
    { type: "line", shape: { x1: 60, y1: y0, x2: 840, y2: y0 }, style: { stroke: "#0f172a", lineWidth: 4 } },
  ];
  for (const support of beam.supports) {
    const x = mapX(support.x);
    graphics.push({ type: "polygon", shape: { points: [[x, y0 + 4], [x - 18, y0 + 34], [x + 18, y0 + 34]] }, style: { fill: "#22c55e" } });
  }
  for (const load of beam.loads) {
    const x = mapX(load.x);
    graphics.push({ type: "line", shape: { x1: x, y1: y0 - 90, x2: x, y2: y0 - 16 }, style: { stroke: "#ef4444", lineWidth: 3 } });
  }
  if (beam.curve?.length) {
    const maxAbs = Math.max(...beam.curve.map((point) => Math.abs(point.vMm)), 1e-9);
    graphics.push({
      type: "polyline",
      shape: { points: beam.curve.map((point) => [mapX(point.x), y0 + (point.vMm / maxAbs) * 92]) },
      style: { stroke: "#38bdf8", lineWidth: 3, fill: "none" },
    });
  }
  return renderOption({ backgroundColor: REPORT_BG, animation: false, xAxis: { show: false }, yAxis: { show: false }, graphic: graphics }, 900, 420);
}

async function renderBeamOverlay(results: BeamCalculationResults, metric: "moment" | "shear" | "deflection") {
  const beam = results.beam;
  if (!beam) return "";
  const metricConfig =
    metric === "moment"
      ? { label: "弯矩图", unit: "kN·m", color: "#dc2626", values: results.moment_data }
      : metric === "shear"
        ? { label: "剪力图", unit: "kN", color: "#2563eb", values: results.shear_data }
        : { label: "挠度图", unit: "mm", color: "#7c3aed", values: results.v_data.map((value) => value * 1000) };
  const total = Math.max(beam.totalLength || 1, 1e-9);
  const xValues = results.x_data?.length ? results.x_data : beam.curve.map((point) => point.x);
  const samples = xValues.map((x, index) => ({ x, value: metricConfig.values[index] ?? 0 })).sort((a, b) => a.x - b.x);
  const maxAbs = Math.max(...samples.map((point) => Math.abs(point.value)), 1e-9);
  const mapX = (x: number) => 70 + (x / total) * 760;
  const y0 = 270;
  const mapY = (value: number) => y0 - (value / maxAbs) * 105;
  const basePoints = samples.map((point) => [mapX(point.x), y0]);
  const resultPoints = samples.map((point) => [mapX(point.x), mapY(point.value)]);
  const areaPoints = [...resultPoints, ...basePoints.slice().reverse()];
  const extreme = samples.reduce((current, point) => (Math.abs(point.value) > Math.abs(current.value) ? point : current), samples[0] ?? { x: 0, value: 0 });
  const extremeX = mapX(extreme.x);
  const extremeY = mapY(extreme.value);
  const labelX = clamp(extremeX + 18, 30, 715);
  const labelY = clamp(extremeY - 38, 74, 405);
  const graphics: Array<Record<string, unknown>> = [
    { type: "rect", shape: { x: 0, y: 0, width: 900, height: 460 }, style: { fill: REPORT_BG } },
    { type: "text", left: 28, top: 22, style: { text: `梁系 ${metricConfig.label}（模型叠加）`, fill: TEXT, fontSize: 18, fontWeight: 700 } },
    { type: "text", left: 28, top: 50, style: { text: `梁长 ${total.toFixed(2)} m，控制值 ${extreme.value.toFixed(3)} ${metricConfig.unit} @ x=${extreme.x.toFixed(2)} m`, fill: MUTED_TEXT, fontSize: 12 } },
    { type: "line", shape: { x1: 70, y1: y0, x2: 830, y2: y0 }, style: { stroke: "#334155", lineWidth: 5 } },
    ...(metric !== "deflection" ? [{ type: "polygon", shape: { points: areaPoints }, style: { fill: `${metricConfig.color}28` } }] : []),
    { type: "polyline", shape: { points: resultPoints }, style: { stroke: metricConfig.color, lineWidth: 4, fill: "none" } },
    { type: "line", shape: { x1: extremeX, y1: extremeY, x2: labelX - 6, y2: labelY + 12 }, style: { stroke: metricConfig.color, lineWidth: 1.5, lineDash: [4, 4] } },
    { type: "circle", shape: { cx: extremeX, cy: extremeY, r: 6 }, style: { fill: metricConfig.color, stroke: "#ffffff", lineWidth: 2 } },
    {
      type: "text",
      left: labelX,
      top: labelY,
      style: {
        text: `${extreme.value.toFixed(2)} ${metricConfig.unit}\nx=${extreme.x.toFixed(2)} m`,
        fill: metricConfig.color,
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 17,
        stroke: "#ffffff",
        lineWidth: 4,
      },
    },
  ];
  for (const support of beam.supports ?? []) {
    const x = mapX(support.x);
    graphics.push({ type: "polygon", shape: { points: [[x, y0 + 6], [x - 18, y0 + 36], [x + 18, y0 + 36]] }, style: { fill: "#64748b" } });
    graphics.push({ type: "text", left: x - 18, top: y0 + 42, style: { text: support.label ?? "", fill: TEXT, fontSize: 11 } });
  }
  return renderOption({ backgroundColor: REPORT_BG, animation: false, xAxis: { show: false }, yAxis: { show: false }, graphic: graphics }, 900, 460);
}

async function renderFramePreview(results: FrameCalculationResults) {
  const preview = results.frame ?? results.preview;
  if (!preview) return "";
  return renderStructurePreview(
    preview.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, supportType: node.supportType })),
    preview.members,
    preview.deformedNodes.map((node) => ({ id: node.nodeId, x: node.x, y: node.y })),
  );
}

async function renderTrussPreview(results: TrussCalculationResults) {
  const preview = results.truss ?? results.preview;
  if (!preview) return "";
  return renderStructurePreview(
    preview.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, supportType: node.role === "support" ? "pinned" : "free" })),
    preview.members,
    preview.deformedNodes.map((node) => ({ id: node.id, x: node.x, y: node.y })),
  );
}

async function renderFrameOverlay(results: FrameCalculationResults, metric: "momentKnM" | "shearKn" | "axialKn" | "deflectionMm") {
  const preview = results.frame ?? results.preview;
  if (!preview) return "";
  const metricConfig =
    metric === "momentKnM"
      ? { label: "弯矩图", unit: "kN·m", color: "#dc2626" }
      : metric === "shearKn"
        ? { label: "剪力图", unit: "kN", color: "#2563eb" }
        : metric === "axialKn"
          ? { label: "轴力图", unit: "kN", color: "#059669" }
          : { label: "局部 y 向挠度图", unit: "mm", color: "#7c3aed" };
  const nodes = preview.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, supportType: node.supportType }));
  const members = preview.members;
  const diagrams = results.memberDiagrams ?? [];
  const allValues = diagrams.flatMap((diagram) => diagram[metric].map((value) => Math.abs(value)));
  const maxAbs = Math.max(...allValues, 1e-9);
  const layout = structureLayout(nodes, [], 900, 520);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const diagramById = new Map(diagrams.map((diagram) => [diagram.memberId, diagram]));
  const extreme = diagrams.reduce<{ memberId: string; stationM: number; stationRatio: number; value: number } | null>((current, diagram) => {
    diagram[metric].forEach((value, index) => {
      if (!current || Math.abs(value) > Math.abs(current.value)) {
        current = { memberId: diagram.memberId, stationM: diagram.stationsM[index] ?? 0, stationRatio: diagram.stations[index] ?? 0, value };
      }
    });
    return current;
  }, null);
  let extremePoint: { x: number; y: number } | null = null;
  const graphics: Array<Record<string, unknown>> = [
    { type: "rect", shape: { x: 0, y: 0, width: 900, height: 520 }, style: { fill: REPORT_BG } },
    { type: "text", left: 28, top: 22, style: { text: `平面框架 ${metricConfig.label}（模型叠加）`, fill: TEXT, fontSize: 18, fontWeight: 700 } },
    { type: "text", left: 28, top: 50, style: { text: extreme ? `控制值 ${extreme.value.toFixed(3)} ${metricConfig.unit}，构件 ${extreme.memberId}，s=${extreme.stationM.toFixed(2)} m` : "无构件测站数据", fill: MUTED_TEXT, fontSize: 12 } },
  ];
  for (const member of members) {
    const startNode = byId.get(member.start);
    const endNode = byId.get(member.end);
    if (!startNode || !endNode) continue;
    const start = layout.map(startNode);
    const end = layout.map(endNode);
    graphics.push({ type: "line", shape: { x1: start.x, y1: start.y, x2: end.x, y2: end.y }, style: { stroke: "rgba(51,65,85,0.55)", lineWidth: 5 } });
    const diagram = diagramById.get(member.id);
    if (!diagram) continue;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthPx = Math.hypot(dx, dy) || 1;
    const nx = -dy / lengthPx;
    const ny = dx / lengthPx;
    const basePoints = diagram[metric].map((_, index) => {
      const ratio = diagram.stations[index] ?? 0;
      return { x: start.x + dx * ratio, y: start.y + dy * ratio };
    });
    const resultPoints = diagram[metric].map((value, index) => ({
      x: basePoints[index].x + nx * (value / maxAbs) * 54,
      y: basePoints[index].y + ny * (value / maxAbs) * 54,
    }));
    if (extreme?.memberId === member.id) {
      const base = {
        x: start.x + dx * extreme.stationRatio,
        y: start.y + dy * extreme.stationRatio,
      };
      extremePoint = {
        x: base.x + nx * (extreme.value / maxAbs) * 54,
        y: base.y + ny * (extreme.value / maxAbs) * 54,
      };
    }
    if (metric !== "deflectionMm") {
      graphics.push({ type: "polygon", shape: { points: [...resultPoints, ...basePoints.slice().reverse()].map((point) => [point.x, point.y]) }, style: { fill: `${metricConfig.color}24` } });
    }
    graphics.push({ type: "polyline", shape: { points: resultPoints.map((point) => [point.x, point.y]) }, style: { stroke: metricConfig.color, lineWidth: 3, fill: "none" } });
  }
  for (const node of nodes) {
    const point = layout.map(node);
    if (node.supportType && node.supportType !== "free") {
      graphics.push({ type: "rect", shape: { x: point.x - 10, y: point.y + 10, width: 20, height: 14 }, style: { fill: "#64748b" } });
    }
    graphics.push({ type: "circle", shape: { cx: point.x, cy: point.y, r: 5 }, style: { fill: "#0f172a" } });
  }
  if (extreme && extremePoint) {
    const labelX = clamp(extremePoint.x + 16, 30, 710);
    const labelY = clamp(extremePoint.y - 42, 76, 455);
    graphics.push(
      { type: "line", shape: { x1: extremePoint.x, y1: extremePoint.y, x2: labelX - 6, y2: labelY + 12 }, style: { stroke: metricConfig.color, lineWidth: 1.5, lineDash: [4, 4] } },
      { type: "circle", shape: { cx: extremePoint.x, cy: extremePoint.y, r: 5.5 }, style: { fill: metricConfig.color, stroke: "#ffffff", lineWidth: 2 } },
      {
        type: "text",
        left: labelX,
        top: labelY,
        style: {
          text: `${extreme.value.toFixed(2)} ${metricConfig.unit}\n${extreme.memberId} / ${extreme.stationM.toFixed(2)} m`,
          fill: metricConfig.color,
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 17,
          stroke: "#ffffff",
          lineWidth: 4,
        },
      },
    );
  }
  return renderOption({ backgroundColor: REPORT_BG, animation: false, xAxis: { show: false }, yAxis: { show: false }, graphic: graphics }, 900, 520);
}

async function renderTrussOverlay(results: TrussCalculationResults, metric: "axial" | "displacement") {
  const preview = results.truss ?? results.preview;
  if (!preview) return "";
  const nodes = preview.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, supportType: node.role === "support" ? "pinned" : "free" }));
  const layout = structureLayout(nodes, metric === "displacement" ? preview.deformedNodes : [], 900, 520);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const memberResultById = new Map(results.memberResults.map((member) => [member.memberId, member]));
  const maxAbsAxial = Math.max(...results.memberResults.map((member) => Math.abs(member.axialForceKn)), 1e-9);
  const controlAxial = results.memberResults.reduce((current, member) => (Math.abs(member.axialForceKn) > Math.abs(current.axialForceKn) ? member : current), results.memberResults[0]);
  const controlNode = results.nodeResults.reduce((current, node) => (node.displacementMm > current.displacementMm ? node : current), results.nodeResults[0]);
  const deformedById = new Map(preview.deformedNodes.map((node) => [node.id, node]));
  let controlPoint: { x: number; y: number } | null = null;
  let controlText = "";
  const graphics: Array<Record<string, unknown>> = [
    { type: "rect", shape: { x: 0, y: 0, width: 900, height: 520 }, style: { fill: REPORT_BG } },
    { type: "text", left: 28, top: 22, style: { text: metric === "axial" ? "平面桁架 杆件轴力图（模型叠加）" : "平面桁架 节点位移图（模型叠加）", fill: TEXT, fontSize: 18, fontWeight: 700 } },
    { type: "text", left: 28, top: 50, style: { text: metric === "axial" && controlAxial ? `控制轴力 ${controlAxial.axialForceKn.toFixed(3)} kN，杆件 ${controlAxial.memberId}` : controlNode ? `控制位移 ${controlNode.displacementMm.toFixed(3)} mm，节点 ${controlNode.nodeId}` : "", fill: MUTED_TEXT, fontSize: 12 } },
  ];
  for (const member of preview.members) {
    const startNode = byId.get(member.start);
    const endNode = byId.get(member.end);
    if (!startNode || !endNode) continue;
    const start = layout.map(startNode);
    const end = layout.map(endNode);
    graphics.push({ type: "line", shape: { x1: start.x, y1: start.y, x2: end.x, y2: end.y }, style: { stroke: "rgba(51,65,85,0.45)", lineWidth: 5 } });
    if (metric === "axial") {
      const axial = memberResultById.get(member.id)?.axialForceKn ?? 0;
      graphics.push({
        type: "line",
        shape: { x1: start.x, y1: start.y, x2: end.x, y2: end.y },
        style: { stroke: axial >= 0 ? "#dc2626" : "#2563eb", lineWidth: 3 + (Math.abs(axial) / maxAbsAxial) * 6 },
      });
      if (controlAxial?.memberId === member.id) {
        controlPoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        controlText = `${controlAxial.axialForceKn.toFixed(2)} kN\n${controlAxial.memberId}`;
      }
    }
    if (metric === "displacement") {
      const d0 = deformedById.get(member.start);
      const d1 = deformedById.get(member.end);
      if (d0 && d1) {
        const startD = layout.map(d0);
        const endD = layout.map(d1);
        graphics.push({ type: "line", shape: { x1: startD.x, y1: startD.y, x2: endD.x, y2: endD.y }, style: { stroke: "#22c55e", lineWidth: 4, lineDash: [8, 6] } });
      }
    }
  }
  for (const node of nodes) {
    const point = layout.map(node);
    if (node.supportType !== "free") {
      graphics.push({ type: "rect", shape: { x: point.x - 10, y: point.y + 10, width: 20, height: 14 }, style: { fill: "#64748b" } });
    }
    graphics.push({ type: "circle", shape: { cx: point.x, cy: point.y, r: 5 }, style: { fill: "#0f172a" } });
    if (metric === "displacement" && controlNode?.nodeId === node.id) {
      const deformed = deformedById.get(node.id);
      controlPoint = deformed ? layout.map(deformed) : point;
      controlText = `${controlNode.displacementMm.toFixed(2)} mm\n${controlNode.nodeId}`;
    }
  }
  if (controlPoint && controlText) {
    const color = metric === "axial" ? "#dc2626" : "#22c55e";
    const labelX = clamp(controlPoint.x + 16, 30, 715);
    const labelY = clamp(controlPoint.y - 38, 74, 455);
    graphics.push(
      { type: "line", shape: { x1: controlPoint.x, y1: controlPoint.y, x2: labelX - 6, y2: labelY + 12 }, style: { stroke: color, lineWidth: 1.5, lineDash: [4, 4] } },
      { type: "circle", shape: { cx: controlPoint.x, cy: controlPoint.y, r: 5.5 }, style: { fill: color, stroke: "#ffffff", lineWidth: 2 } },
      {
        type: "text",
        left: labelX,
        top: labelY,
        style: {
          text: controlText,
          fill: color,
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 17,
          stroke: "#ffffff",
          lineWidth: 4,
        },
      },
    );
  }
  return renderOption({ backgroundColor: REPORT_BG, animation: false, xAxis: { show: false }, yAxis: { show: false }, graphic: graphics }, 900, 520);
}

async function renderStructurePreview(
  nodes: Array<{ id: string; x: number; y: number; supportType?: string }>,
  members: Array<{ start: string; end: string }>,
  deformedNodes: Array<{ id: string; x: number; y: number }>,
) {
  const all = [...nodes, ...deformedNodes];
  const xs = all.map((node) => node.x);
  const ys = all.map((node) => node.y);
  const [minX, maxX] = paddedDomain(xs);
  const [minY, maxY] = paddedDomain(ys);
  const mapX = (x: number) => 70 + ((x - minX) / Math.max(maxX - minX, 1e-9)) * 760;
  const mapY = (y: number) => 430 - ((y - minY) / Math.max(maxY - minY, 1e-9)) * 360;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const deformedById = new Map(deformedNodes.map((node) => [node.id, node]));
  const graphics: Array<Record<string, unknown>> = [{ type: "rect", shape: { x: 0, y: 0, width: 900, height: 520 }, style: { fill: REPORT_BG } }];
  for (const member of members) {
    const start = byId.get(member.start);
    const end = byId.get(member.end);
    if (start && end) {
      graphics.push({ type: "line", shape: { x1: mapX(start.x), y1: mapY(start.y), x2: mapX(end.x), y2: mapY(end.y) }, style: { stroke: "rgba(71,85,105,0.52)", lineWidth: 4 } });
    }
    const d0 = deformedById.get(member.start);
    const d1 = deformedById.get(member.end);
    if (d0 && d1) {
      graphics.push({ type: "line", shape: { x1: mapX(d0.x), y1: mapY(d0.y), x2: mapX(d1.x), y2: mapY(d1.y) }, style: { stroke: "#38bdf8", lineWidth: 4 } });
    }
  }
  for (const node of nodes) {
    const x = mapX(node.x);
    const y = mapY(node.y);
    if (node.supportType && node.supportType !== "free") {
      graphics.push({ type: "rect", shape: { x: x - 11, y: y + 10, width: 22, height: 14 }, style: { fill: "#22c55e" } });
    }
    graphics.push({ type: "circle", shape: { cx: x, cy: y, r: 6 }, style: { fill: "#0f172a" } });
  }
  return renderOption({ backgroundColor: REPORT_BG, animation: false, xAxis: { show: false }, yAxis: { show: false }, graphic: graphics }, 900, 520);
}

function paddedDomain(values: number[]): [number, number] {
  if (!values.length) return [-1, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (Math.abs(max - min) < 1e-9) {
    const pad = Math.max(1, Math.abs(max) * 0.2);
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.12;
  return [min - pad, max + pad];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function structureLayout(
  nodes: Array<{ x: number; y: number }>,
  extra: Array<{ x: number; y: number }>,
  width: number,
  height: number,
) {
  const all = [...nodes, ...extra];
  const xs = all.map((node) => node.x);
  const ys = all.map((node) => node.y);
  const [minX, maxX] = paddedDomain(xs);
  const [minY, maxY] = paddedDomain(ys);
  return {
    map: (point: { x: number; y: number }) => ({
      x: 70 + ((point.x - minX) / Math.max(maxX - minX, 1e-9)) * (width - 140),
      y: height - 70 - ((point.y - minY) / Math.max(maxY - minY, 1e-9)) * (height - 140),
    }),
  };
}

async function renderOption(option: EChartsCoreOption, width = 900, height = 480): Promise<string> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  document.body.appendChild(host);
  try {
    const chart = echarts.init(host, undefined, { renderer: "canvas", width, height });
    chart.setOption(option, true);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const dataUrl = chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: REPORT_BG });
    chart.dispose();
    return dataUrl;
  } finally {
    host.remove();
  }
}
