import type { FrameCalculationResults, TrussCalculationResults } from "../types/structure";
import { buildFrameDimensionLegendRows, buildFrameGeometryDimensions, frameMemberLabelPlacement } from "../components/frame-preview-utils";
import { buildTrussMemberLengthDimensions, buildTrussMemberLengthLegendRows, buildTrussSupportMarkerGeometry } from "../components/truss-preview-utils";
import {
  MUTED_TEXT,
  REPORT_BG,
  TEXT,
  clamp,
  renderOption,
} from "./report-rendering";

const REPORT_IMAGE_W = 900;
const REPORT_IMAGE_H = 520;
const REPORT_PADDING_X = 86;
const REPORT_PADDING_TOP = 132;
const REPORT_PADDING_BOTTOM = 72;
const BASE_MEMBER_STROKE = "rgba(51,65,85,0.62)";
const BASE_MEMBER_LIGHT_STROKE = "rgba(51,65,85,0.48)";
const NODE_FILL = "#0f172a";
const LABEL_HALO = "#ffffff";
const DIMENSION_TEXT = "#475569";

type ReportNode = { id: string; x: number; y: number; supportType?: string };
type ReportMember = { id?: string; start: string; end: string };
type ReportGraphic = Record<string, unknown>;
type ReportPoint = { x: number; y: number };

function buildReportStructureLayout(
  nodes: Array<{ id?: string; x: number; y: number }>,
  extra: Array<{ x: number; y: number }> = [],
  width = REPORT_IMAGE_W,
  height = REPORT_IMAGE_H,
) {
  const all = [...nodes, ...extra];
  const xs = all.map((node) => node.x);
  const ys = all.map((node) => node.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const modelWidth = Math.max(1, maxX - minX);
  const modelHeight = Math.max(1, maxY - minY);
  const availableWidth = width - REPORT_PADDING_X * 2;
  const availableHeight = height - REPORT_PADDING_TOP - REPORT_PADDING_BOTTOM;
  const scale = Math.min(availableWidth / modelWidth, availableHeight / modelHeight);
  const offsetX = (width - modelWidth * scale) / 2;
  const offsetY = REPORT_PADDING_TOP + Math.max(0, (availableHeight - modelHeight * scale) / 2);
  const map = (point: { x: number; y: number }) => ({
    x: offsetX + (point.x - minX) * scale,
    y: offsetY + (maxY - point.y) * scale,
  });
  const mappedNodes = nodes.map((node) => map(node));
  const mappedXs = mappedNodes.map((point) => point.x);
  const mappedYs = mappedNodes.map((point) => point.y);
  const bounds = {
    left: Math.min(...mappedXs),
    right: Math.max(...mappedXs),
    top: Math.min(...mappedYs),
    bottom: Math.max(...mappedYs),
  };
  return {
    map,
    scale,
    bounds,
    center: {
      x: (bounds.left + bounds.right) / 2,
      y: (bounds.top + bounds.bottom) / 2,
    },
  };
}

function addImageBackground(graphics: ReportGraphic[]) {
  graphics.push({ type: "rect", shape: { x: 0, y: 0, width: REPORT_IMAGE_W, height: REPORT_IMAGE_H }, style: { fill: REPORT_BG } });
}

function addReportHeader(graphics: ReportGraphic[], title: string, subtitle?: string) {
  graphics.push({ type: "text", left: 28, top: 22, style: { text: title, fill: TEXT, fontSize: 18, fontWeight: 700 } });
  if (subtitle) {
    graphics.push({ type: "text", left: 28, top: 50, style: { text: subtitle, fill: MUTED_TEXT, fontSize: 12 } });
  }
}

function addDimensionLegend(graphics: ReportGraphic[], rows: string[], top = 74) {
  rows.forEach((row, index) => {
    graphics.push({
      type: "text",
      left: 28,
      top: top + index * 17,
      style: {
        text: row,
        fill: DIMENSION_TEXT,
        fontSize: 12,
        fontWeight: 700,
        fontFamily: "Fira Code, Consolas, monospace",
        stroke: LABEL_HALO,
        lineWidth: 4,
      },
    });
  });
}

function addFrameSupportMarker(graphics: ReportGraphic[], type: string | undefined, point: ReportPoint) {
  if (!type || type === "free") return;
  if (type === "fixed") {
    graphics.push(
      { type: "rect", shape: { x: point.x - 16, y: point.y + 7, width: 32, height: 8, r: 2 }, style: { fill: "#e2e8f0", stroke: "#475569", lineWidth: 1 } },
      ...[-12, -4, 4, 12].map((offset) => ({
        type: "line",
        shape: { x1: point.x + offset - 5, y1: point.y + 24, x2: point.x + offset + 5, y2: point.y + 14 },
        style: { stroke: "#64748b", lineWidth: 1.6 },
      })),
    );
    return;
  }
  graphics.push(
    { type: "polygon", shape: { points: [[point.x - 16, point.y + 24], [point.x + 16, point.y + 24], [point.x, point.y + 2]] }, style: { fill: "#e2e8f0", stroke: "#475569", lineWidth: 1 } },
    { type: "line", shape: { x1: point.x - 18, y1: point.y + 28, x2: point.x + 18, y2: point.y + 28 }, style: { stroke: "#64748b", lineWidth: 2 } },
  );
  if (type === "roller") {
    graphics.push(
      { type: "circle", shape: { cx: point.x - 8, cy: point.y + 33, r: 3 }, style: { fill: "#64748b" } },
      { type: "circle", shape: { cx: point.x + 8, cy: point.y + 33, r: 3 }, style: { fill: "#64748b" } },
    );
  }
}

function addTrussSupportMarker(graphics: ReportGraphic[], type: string | undefined, point: ReportPoint) {
  const marker = buildTrussSupportMarkerGeometry(type, point.x, point.y);
  if (!marker) return;
  graphics.push(
    { type: "polygon", shape: { points: marker.trianglePoints.split(" ").map((pair) => pair.split(",").map(Number)) }, style: { fill: "#e2e8f0", stroke: "#475569", lineWidth: 1 } },
    { type: "line", shape: marker.baseLine, style: { stroke: "#64748b", lineWidth: 2 } },
    ...marker.rollers.map((roller) => ({ type: "circle", shape: roller, style: { fill: "#64748b" } })),
  );
}

function addNode(graphics: ReportGraphic[], id: string, point: ReportPoint, center: ReportPoint) {
  const side = point.x < center.x ? -1 : 1;
  graphics.push(
    { type: "circle", shape: { cx: point.x, cy: point.y, r: 5 }, style: { fill: NODE_FILL } },
    {
      type: "text",
      left: point.x + side * 14,
      top: point.y - 24,
      style: {
        text: id,
        fill: "#0f172a",
        fontSize: 11,
        fontWeight: 700,
        fontFamily: "Fira Code, Consolas, monospace",
        align: side < 0 ? "right" : "left",
        stroke: LABEL_HALO,
        lineWidth: 4,
      },
    },
  );
}

function addMemberLabel(graphics: ReportGraphic[], id: string | undefined, start: ReportPoint, end: ReportPoint, center: ReportPoint) {
  if (!id) return;
  const label = frameMemberLabelPlacement(start, end, center, 18);
  graphics.push({
    type: "text",
    left: label.x,
    top: label.y - 7,
    style: {
      text: id,
      fill: "#334155",
      fontSize: 11,
      fontWeight: 700,
      fontFamily: "Fira Code, Consolas, monospace",
      align: label.textAnchor === "middle" ? "center" : label.textAnchor === "end" ? "right" : "left",
      stroke: LABEL_HALO,
      lineWidth: 4,
    },
  });
}

export async function renderFramePreview(results: FrameCalculationResults) {
  const preview = results.frame ?? results.preview;
  if (!preview) return "";
  return renderStructurePreview({
    systemLabel: "平面框架",
    nodes: preview.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, supportType: node.supportType })),
    members: preview.members,
    deformedNodes: preview.deformedNodes.map((node) => ({ id: node.nodeId, x: node.x, y: node.y })),
    supportMarker: addFrameSupportMarker,
    dimensionRows: buildFrameDimensionLegendRows(buildFrameGeometryDimensions(preview.nodes, preview.members), 240, 12),
  });
}

export async function renderTrussPreview(results: TrussCalculationResults) {
  const preview = results.truss ?? results.preview;
  if (!preview) return "";
  return renderStructurePreview({
    systemLabel: "平面桁架",
    nodes: preview.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, supportType: node.role === "support" ? "pinned" : "free" })),
    members: preview.members,
    deformedNodes: preview.deformedNodes.map((node) => ({ id: node.id, x: node.x, y: node.y })),
    supportMarker: addTrussSupportMarker,
    dimensionRows: buildTrussMemberLengthLegendRows(buildTrussMemberLengthDimensions(preview.nodes, preview.members), 240, 12),
  });
}

export async function renderFrameOverlay(results: FrameCalculationResults, metric: "momentKnM" | "shearKn" | "axialKn" | "deflectionMm") {
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
  const layout = buildReportStructureLayout(nodes);
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
  const graphics: ReportGraphic[] = [];
  addImageBackground(graphics);
  addReportHeader(
    graphics,
    `平面框架 ${metricConfig.label}（模型叠加）`,
    extreme ? `控制值 ${extreme.value.toFixed(3)} ${metricConfig.unit}，构件 ${extreme.memberId}，s=${extreme.stationM.toFixed(2)} m` : "无构件测站数据",
  );
  addDimensionLegend(graphics, buildFrameDimensionLegendRows(buildFrameGeometryDimensions(nodes, members), 240, 12));
  for (const member of members) {
    const startNode = byId.get(member.start);
    const endNode = byId.get(member.end);
    if (!startNode || !endNode) continue;
    const start = layout.map(startNode);
    const end = layout.map(endNode);
    graphics.push({ type: "line", shape: { x1: start.x, y1: start.y, x2: end.x, y2: end.y }, style: { stroke: BASE_MEMBER_STROKE, lineWidth: 5 } });
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
  for (const member of members) {
    const startNode = byId.get(member.start);
    const endNode = byId.get(member.end);
    if (!startNode || !endNode) continue;
    addMemberLabel(graphics, member.id, layout.map(startNode), layout.map(endNode), layout.center);
  }
  for (const node of nodes) {
    const point = layout.map(node);
    addFrameSupportMarker(graphics, node.supportType, point);
    addNode(graphics, node.id, point, layout.center);
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
  return renderOption({ backgroundColor: REPORT_BG, animation: false, xAxis: { show: false }, yAxis: { show: false }, graphic: graphics }, REPORT_IMAGE_W, REPORT_IMAGE_H);
}

export async function renderTrussOverlay(results: TrussCalculationResults, metric: "axial" | "displacement") {
  const preview = results.truss ?? results.preview;
  if (!preview) return "";
  const nodes = preview.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, supportType: node.role === "support" ? "pinned" : "free" }));
  const layout = buildReportStructureLayout(nodes, metric === "displacement" ? preview.deformedNodes : []);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const memberResultById = new Map(results.memberResults.map((member) => [member.memberId, member]));
  const maxAbsAxial = Math.max(...results.memberResults.map((member) => Math.abs(member.axialForceKn)), 1e-9);
  const controlAxial = results.memberResults.reduce((current, member) => (Math.abs(member.axialForceKn) > Math.abs(current.axialForceKn) ? member : current), results.memberResults[0]);
  const controlNode = results.nodeResults.reduce((current, node) => (node.displacementMm > current.displacementMm ? node : current), results.nodeResults[0]);
  const deformedById = new Map(preview.deformedNodes.map((node) => [node.id, node]));
  let controlPoint: { x: number; y: number } | null = null;
  let controlText = "";
  const graphics: ReportGraphic[] = [];
  addImageBackground(graphics);
  addReportHeader(
    graphics,
    metric === "axial" ? "平面桁架 杆件轴力图（模型叠加）" : "平面桁架 节点位移图（模型叠加）",
    metric === "axial" && controlAxial ? `控制轴力 ${controlAxial.axialForceKn.toFixed(3)} kN，杆件 ${controlAxial.memberId}` : controlNode ? `控制位移 ${controlNode.displacementMm.toFixed(3)} mm，节点 ${controlNode.nodeId}` : "",
  );
  addDimensionLegend(graphics, buildTrussMemberLengthLegendRows(buildTrussMemberLengthDimensions(preview.nodes, preview.members), 240, 12));
  for (const member of preview.members) {
    const startNode = byId.get(member.start);
    const endNode = byId.get(member.end);
    if (!startNode || !endNode) continue;
    const start = layout.map(startNode);
    const end = layout.map(endNode);
    graphics.push({ type: "line", shape: { x1: start.x, y1: start.y, x2: end.x, y2: end.y }, style: { stroke: BASE_MEMBER_LIGHT_STROKE, lineWidth: 5 } });
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
  for (const member of preview.members) {
    const startNode = byId.get(member.start);
    const endNode = byId.get(member.end);
    if (!startNode || !endNode) continue;
    addMemberLabel(graphics, member.id, layout.map(startNode), layout.map(endNode), layout.center);
  }
  for (const node of nodes) {
    const point = layout.map(node);
    addTrussSupportMarker(graphics, node.supportType, point);
    addNode(graphics, node.id, point, layout.center);
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
  return renderOption({ backgroundColor: REPORT_BG, animation: false, xAxis: { show: false }, yAxis: { show: false }, graphic: graphics }, REPORT_IMAGE_W, REPORT_IMAGE_H);
}

async function renderStructurePreview(
  {
    systemLabel,
    nodes,
    members,
    deformedNodes,
    supportMarker,
    dimensionRows,
  }: {
    systemLabel: string;
    nodes: ReportNode[];
    members: ReportMember[];
    deformedNodes: Array<{ id: string; x: number; y: number }>;
    supportMarker: (graphics: ReportGraphic[], type: string | undefined, point: ReportPoint) => void;
    dimensionRows: string[];
  },
) {
  const layout = buildReportStructureLayout(nodes, deformedNodes);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const deformedById = new Map(deformedNodes.map((node) => [node.id, node]));
  const graphics: ReportGraphic[] = [];
  addImageBackground(graphics);
  addReportHeader(graphics, `${systemLabel}结构预览与变形示意`, "蓝色为放大后的变形线；节点、构件/杆件编号与尺寸标注同图显示");
  addDimensionLegend(graphics, dimensionRows);
  for (const member of members) {
    const start = byId.get(member.start);
    const end = byId.get(member.end);
    if (start && end) {
      const startPoint = layout.map(start);
      const endPoint = layout.map(end);
      graphics.push({ type: "line", shape: { x1: startPoint.x, y1: startPoint.y, x2: endPoint.x, y2: endPoint.y }, style: { stroke: BASE_MEMBER_STROKE, lineWidth: 5 } });
      addMemberLabel(graphics, member.id, startPoint, endPoint, layout.center);
    }
    const d0 = deformedById.get(member.start);
    const d1 = deformedById.get(member.end);
    if (d0 && d1) {
      const startDeformed = layout.map(d0);
      const endDeformed = layout.map(d1);
      graphics.push({ type: "line", shape: { x1: startDeformed.x, y1: startDeformed.y, x2: endDeformed.x, y2: endDeformed.y }, style: { stroke: "#38bdf8", lineWidth: 3.5 } });
    }
  }
  for (const node of nodes) {
    const point = layout.map(node);
    supportMarker(graphics, node.supportType, point);
    addNode(graphics, node.id, point, layout.center);
  }
  return renderOption({ backgroundColor: REPORT_BG, animation: false, xAxis: { show: false }, yAxis: { show: false }, graphic: graphics }, REPORT_IMAGE_W, REPORT_IMAGE_H);
}
