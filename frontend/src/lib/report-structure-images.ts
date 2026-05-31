import type { FrameCalculationResults, TrussCalculationResults } from "../types/structure.ts";
import {
  buildFrameDimensionLegendRows,
  buildFrameGeometryDimensions,
  buildFrameLoadLabelMap,
  buildFrameLoadMarkers,
} from "../components/frame-preview-utils.ts";
import { buildTrussLoadMarkers, buildTrussMemberLengthDimensions, buildTrussMemberLengthLegendRows, buildTrussSupportMarkerGeometry } from "../components/truss-preview-utils.ts";
import {
  BASE_MEMBER_LIGHT_STROKE,
  BASE_MEMBER_STROKE,
  REPORT_IMAGE_BASE_SIZE,
  REPORT_BG,
  LOAD_STROKE,
  addArrow,
  addControlCallout,
  addDimensionLegend,
  addImageBackground,
  addLoadLabel,
  addMemberLabel,
  addNode,
  addReportHeader,
  buildReportStructureLayout,
  rotateReportPoint,
  type ReportCanvasSize,
  type ReportGraphic,
  type ReportMember,
  type ReportNode,
  type ReportPoint,
  type ReportStructureLayout,
} from "./report-structure-graphics.ts";
import {
  renderOption,
} from "./report-rendering.ts";
import { RESULT_PREVIEW_BASE_SIZE, resultPreviewCanvasSize } from "./result-preview-sizing.ts";

type ReportStructureLoadRenderer = (
  graphics: ReportGraphic[],
  context: {
    layout: ReportStructureLayout;
    nodeById: Map<string, ReportNode>;
    memberById: Map<string, ReportMember>;
  },
) => void;

type FrameReportPreview = NonNullable<FrameCalculationResults["frame"] | FrameCalculationResults["preview"]>;
type TrussReportPreview = NonNullable<TrussCalculationResults["truss"] | TrussCalculationResults["preview"]>;

export function reportStructureCanvasSize(
  nodes: Array<{ x: number; y: number }>,
  memberCount: number,
  extra: Array<{ x: number; y: number }> = [],
): ReportCanvasSize {
  const previewSize = resultPreviewCanvasSize([...nodes, ...extra], memberCount);
  return {
    width: Math.max(REPORT_IMAGE_BASE_SIZE.width, Math.round((previewSize.width / RESULT_PREVIEW_BASE_SIZE.width) * REPORT_IMAGE_BASE_SIZE.width)),
    height: Math.max(REPORT_IMAGE_BASE_SIZE.height, Math.round((previewSize.height / RESULT_PREVIEW_BASE_SIZE.height) * REPORT_IMAGE_BASE_SIZE.height)),
  };
}

function reportCalloutClampX(canvasSize: ReportCanvasSize): [number, number] {
  return [30, Math.max(30, canvasSize.width - 185)];
}

function reportCalloutClampY(canvasSize: ReportCanvasSize): [number, number] {
  return [74, Math.max(74, canvasSize.height - 65)];
}

function framePreviewExtraNodes(preview: FrameReportPreview) {
  return preview.deformedNodes.map((node) => ({ x: node.x, y: node.y }));
}

function trussPreviewExtraNodes(preview: TrussReportPreview) {
  return preview.deformedNodes.map((node) => ({ x: node.x, y: node.y }));
}

export function frameReportCanvasSize(preview: FrameReportPreview): ReportCanvasSize {
  return reportStructureCanvasSize(preview.nodes, preview.members.length, framePreviewExtraNodes(preview));
}

export function trussReportCanvasSize(preview: TrussReportPreview): ReportCanvasSize {
  return reportStructureCanvasSize(preview.nodes, preview.members.length, trussPreviewExtraNodes(preview));
}

export function trussReportNodesFromPreview(preview: TrussReportPreview): ReportNode[] {
  return (preview?.nodes ?? []).map((node) => ({
    id: node.id,
    x: node.x,
    y: node.y,
    supportType: node.supportType ?? (node.role === "support" ? "pinned" : "free"),
  }));
}

export function frameReportNodesFromPreview(preview: FrameReportPreview): ReportNode[] {
  return (preview?.nodes ?? []).map((node) => ({
    id: node.id,
    x: node.x,
    y: node.y,
    supportType: node.supportType,
    supportAngleDeg: node.supportAngleDeg,
  }));
}

export function buildFrameSupportMarkerGraphics(type: string | undefined, point: ReportPoint, supportAngleDeg?: number): ReportGraphic[] {
  if (!type || type === "free") return [];
  if (type === "fixed") {
    return [
      { type: "rect", shape: { x: point.x - 16, y: point.y + 7, width: 32, height: 8, r: 2 }, style: { fill: "#e2e8f0", stroke: "#475569", lineWidth: 1 } },
      ...[-12, -4, 4, 12].map((offset) => ({
        type: "line",
        shape: { x1: point.x + offset - 5, y1: point.y + 24, x2: point.x + offset + 5, y2: point.y + 14 },
        style: { stroke: "#64748b", lineWidth: 1.6 },
      })),
    ];
  }
  const rotationDeg = type === "roller" && Number.isFinite(supportAngleDeg) ? 90 - Number(supportAngleDeg) : 0;
  const rotate = (x: number, y: number) => rotateReportPoint({ x, y }, point, rotationDeg);
  const triangle = [
    rotate(point.x - 16, point.y + 24),
    rotate(point.x + 16, point.y + 24),
    rotate(point.x, point.y + 2),
  ];
  const baseStart = rotate(point.x - 18, point.y + 28);
  const baseEnd = rotate(point.x + 18, point.y + 28);
  const marker: ReportGraphic[] = [
    { type: "polygon", shape: { points: triangle.map((item) => [item.x, item.y]) }, style: { fill: "#e2e8f0", stroke: "#475569", lineWidth: 1 } },
    { type: "line", shape: { x1: baseStart.x, y1: baseStart.y, x2: baseEnd.x, y2: baseEnd.y }, style: { stroke: "#64748b", lineWidth: 2 } },
  ];
  if (type === "roller") {
    marker.push(
      ...[
        rotate(point.x - 8, point.y + 33),
        rotate(point.x + 8, point.y + 33),
      ].map((roller) => ({ type: "circle", shape: { cx: roller.x, cy: roller.y, r: 3 }, style: { fill: "#64748b" } })),
    );
  }
  return marker;
}

function addFrameSupportMarker(graphics: ReportGraphic[], type: string | undefined, point: ReportPoint, supportAngleDeg?: number) {
  graphics.push(...buildFrameSupportMarkerGraphics(type, point, supportAngleDeg));
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

function addFrameLoadGraphics(
  graphics: ReportGraphic[],
  loads: FrameCalculationResults["structure"]["loads"],
  context: Parameters<ReportStructureLoadRenderer>[1],
) {
  const screenNodeMap = new Map(Array.from(context.nodeById.values()).map((node) => [node.id, context.layout.map(node)]));
  const memberMap = new Map(Array.from(context.memberById.values()).flatMap((member) => (member.id ? [[member.id, { start: member.start, end: member.end }]] : [])));
  const loadLabelMap = buildFrameLoadLabelMap(loads);
  loads.forEach((load, index) => {
    const markers = buildFrameLoadMarkers(load, index, {
      nodeMap: screenNodeMap,
      memberMap,
      loadLabel: loadLabelMap.get(index),
    });
    markers.forEach((marker) => {
      if (marker.type === "force") {
        addArrow(graphics, marker.x1, marker.y1, marker.x2, marker.y2);
        addLoadLabel(graphics, marker.label, marker.labelX, marker.labelY, marker.textAnchor);
      } else if (marker.type === "distributed-guide") {
        graphics.push({ type: "line", shape: marker, style: { stroke: LOAD_STROKE, lineWidth: 1.5, lineDash: [5, 4] } });
        addLoadLabel(graphics, marker.label, marker.labelX, marker.labelY, marker.textAnchor);
      } else {
        graphics.push({ type: "circle", shape: { cx: marker.cx, cy: marker.cy, r: marker.radius }, style: { stroke: LOAD_STROKE, lineWidth: 2, fill: "transparent" } });
        addLoadLabel(graphics, marker.label, marker.labelX, marker.labelY, marker.textAnchor);
      }
    });
  });
}

function addTrussLoadGraphics(
  graphics: ReportGraphic[],
  loads: TrussCalculationResults["structure"]["loads"],
  context: Parameters<ReportStructureLoadRenderer>[1],
) {
  const screenNodeMap = new Map(Array.from(context.nodeById.values()).map((node) => [node.id, context.layout.map(node)]));
  loads.forEach((load, index) => {
    if (load.type !== "nodal") return;
    const point = screenNodeMap.get(load.node);
    if (!point) return;
    buildTrussLoadMarkers(point, load, index).forEach((marker) => {
      addArrow(graphics, marker.x1, marker.y1, marker.x2, marker.y2);
      addLoadLabel(graphics, marker.label, marker.labelX, marker.labelY);
    });
  });
}

export async function renderFramePreview(results: FrameCalculationResults) {
  const preview = results.frame ?? results.preview;
  const canvasSize = preview ? frameReportCanvasSize(preview) : REPORT_IMAGE_BASE_SIZE;
  const graphics = buildFramePreviewGraphics(results, canvasSize);
  if (!graphics.length) return "";
  return renderReportGraphics(graphics, canvasSize);
}

export function buildFramePreviewGraphics(results: FrameCalculationResults, canvasSize?: ReportCanvasSize): ReportGraphic[] {
  const preview = results.frame ?? results.preview;
  if (!preview) return [];
  const effectiveCanvasSize = canvasSize ?? frameReportCanvasSize(preview);
  return buildStructurePreviewGraphics({
    systemLabel: "平面框架",
    memberTerm: "构件",
    nodes: frameReportNodesFromPreview(preview),
    members: preview.members,
    deformedNodes: preview.deformedNodes.map((node) => ({ id: node.nodeId, x: node.x, y: node.y })),
    canvasSize: effectiveCanvasSize,
    supportMarker: addFrameSupportMarker,
    dimensionRows: buildFrameDimensionLegendRows(buildFrameGeometryDimensions(preview.nodes, preview.members), 240, 12),
    renderLoads: (graphics, context) => addFrameLoadGraphics(graphics, preview.loads, context),
  });
}

export async function renderTrussPreview(results: TrussCalculationResults) {
  const preview = results.truss ?? results.preview;
  const canvasSize = preview ? trussReportCanvasSize(preview) : REPORT_IMAGE_BASE_SIZE;
  const graphics = buildTrussPreviewGraphics(results, canvasSize);
  if (!graphics.length) return "";
  return renderReportGraphics(graphics, canvasSize);
}

export function buildTrussPreviewGraphics(results: TrussCalculationResults, canvasSize?: ReportCanvasSize): ReportGraphic[] {
  const preview = results.truss ?? results.preview;
  if (!preview) return [];
  const effectiveCanvasSize = canvasSize ?? trussReportCanvasSize(preview);
  return buildStructurePreviewGraphics({
    systemLabel: "平面桁架",
    memberTerm: "杆件",
    nodes: trussReportNodesFromPreview(preview),
    members: preview.members,
    deformedNodes: preview.deformedNodes.map((node) => ({ id: node.id, x: node.x, y: node.y })),
    canvasSize: effectiveCanvasSize,
    supportMarker: addTrussSupportMarker,
    dimensionRows: buildTrussMemberLengthLegendRows(buildTrussMemberLengthDimensions(preview.nodes, preview.members), 240, 12),
    renderLoads: (graphics, context) => addTrussLoadGraphics(graphics, preview.loads, context),
  });
}

export async function renderFrameOverlay(results: FrameCalculationResults, metric: "momentKnM" | "shearKn" | "axialKn" | "deflectionMm") {
  const preview = results.frame ?? results.preview;
  const canvasSize = preview ? frameReportCanvasSize(preview) : REPORT_IMAGE_BASE_SIZE;
  const graphics = buildFrameOverlayGraphics(results, metric, canvasSize);
  if (!graphics.length) return "";
  return renderReportGraphics(graphics, canvasSize);
}

export function buildFrameOverlayGraphics(
  results: FrameCalculationResults,
  metric: "momentKnM" | "shearKn" | "axialKn" | "deflectionMm",
  canvasSize?: ReportCanvasSize,
): ReportGraphic[] {
  const preview = results.frame ?? results.preview;
  if (!preview) return [];
  const effectiveCanvasSize = canvasSize ?? frameReportCanvasSize(preview);
  const metricConfig =
    metric === "momentKnM"
      ? { label: "弯矩图", unit: "kN·m", color: "#dc2626" }
      : metric === "shearKn"
        ? { label: "剪力图", unit: "kN", color: "#2563eb" }
        : metric === "axialKn"
          ? { label: "轴力图", unit: "kN", color: "#059669" }
          : { label: "局部 y 向挠度图", unit: "mm", color: "#7c3aed" };
  const nodes = frameReportNodesFromPreview(preview);
  const members = preview.members;
  const diagrams = results.memberDiagrams ?? [];
  const allValues = diagrams.flatMap((diagram) => diagram[metric].map((value) => Math.abs(value)));
  const maxAbs = Math.max(...allValues, 1e-9);
  const layout = buildReportStructureLayout(nodes, [], effectiveCanvasSize.width, effectiveCanvasSize.height);
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
  addImageBackground(graphics, effectiveCanvasSize);
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
    addFrameSupportMarker(graphics, node.supportType, point, node.supportAngleDeg);
    addNode(graphics, node.id, point, layout.center);
  }
  if (extreme && extremePoint) {
    addControlCallout(graphics, {
      point: extremePoint,
      text: `${extreme.value.toFixed(2)} ${metricConfig.unit}\n${extreme.memberId} / ${extreme.stationM.toFixed(2)} m`,
      color: metricConfig.color,
      offsetY: -42,
      clampX: reportCalloutClampX(effectiveCanvasSize),
      clampY: reportCalloutClampY(effectiveCanvasSize),
    });
  }
  return graphics;
}

export async function renderTrussOverlay(results: TrussCalculationResults, metric: "axial" | "displacement") {
  const preview = results.truss ?? results.preview;
  const canvasSize = preview ? trussReportCanvasSize(preview) : REPORT_IMAGE_BASE_SIZE;
  const graphics = buildTrussOverlayGraphics(results, metric, canvasSize);
  if (!graphics.length) return "";
  return renderReportGraphics(graphics, canvasSize);
}

export function buildTrussOverlayGraphics(results: TrussCalculationResults, metric: "axial" | "displacement", canvasSize?: ReportCanvasSize): ReportGraphic[] {
  const preview = results.truss ?? results.preview;
  if (!preview) return [];
  const nodes = trussReportNodesFromPreview(preview);
  const effectiveCanvasSize = canvasSize ?? trussReportCanvasSize(preview);
  const layout = buildReportStructureLayout(nodes, metric === "displacement" ? preview.deformedNodes : [], effectiveCanvasSize.width, effectiveCanvasSize.height);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const memberResultById = new Map(results.memberResults.map((member) => [member.memberId, member]));
  const maxAbsAxial = Math.max(...results.memberResults.map((member) => Math.abs(member.axialForceKn)), 1e-9);
  const controlAxial = results.memberResults.reduce((current, member) => (Math.abs(member.axialForceKn) > Math.abs(current.axialForceKn) ? member : current), results.memberResults[0]);
  const controlNode = results.nodeResults.reduce((current, node) => (node.displacementMm > current.displacementMm ? node : current), results.nodeResults[0]);
  const deformedById = new Map(preview.deformedNodes.map((node) => [node.id, node]));
  let controlPoint: { x: number; y: number } | null = null;
  let controlText = "";
  const graphics: ReportGraphic[] = [];
  addImageBackground(graphics, effectiveCanvasSize);
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
    addControlCallout(graphics, {
      point: controlPoint,
      text: controlText,
      color: metric === "axial" ? "#dc2626" : "#22c55e",
      clampX: reportCalloutClampX(effectiveCanvasSize),
      clampY: reportCalloutClampY(effectiveCanvasSize),
    });
  }
  return graphics;
}

function buildStructurePreviewGraphics(
  {
    systemLabel,
    memberTerm,
    nodes,
    members,
    deformedNodes,
    canvasSize,
    supportMarker,
    dimensionRows,
    renderLoads,
  }: {
    systemLabel: string;
    memberTerm: string;
    nodes: ReportNode[];
    members: ReportMember[];
    deformedNodes: Array<{ id: string; x: number; y: number }>;
    canvasSize: ReportCanvasSize;
    supportMarker: (graphics: ReportGraphic[], type: string | undefined, point: ReportPoint, supportAngleDeg?: number) => void;
    dimensionRows: string[];
    renderLoads?: ReportStructureLoadRenderer;
  },
) {
  const layout = buildReportStructureLayout(nodes, deformedNodes, canvasSize.width, canvasSize.height);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const memberById = new Map(members.flatMap((member) => (member.id ? [[member.id, member]] : [])));
  const deformedById = new Map(deformedNodes.map((node) => [node.id, node]));
  const graphics: ReportGraphic[] = [];
  addImageBackground(graphics, canvasSize);
  addReportHeader(graphics, `${systemLabel}结构预览与变形示意`, `蓝色为放大后的变形线；节点、${memberTerm}编号、尺寸与荷载标注同图显示`);
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
    supportMarker(graphics, node.supportType, point, node.supportAngleDeg);
    addNode(graphics, node.id, point, layout.center);
  }
  renderLoads?.(graphics, { layout, nodeById: byId, memberById });
  return graphics;
}

function renderReportGraphics(graphics: ReportGraphic[], canvasSize: ReportCanvasSize) {
  return renderOption({ backgroundColor: REPORT_BG, animation: false, xAxis: { show: false }, yAxis: { show: false }, graphic: graphics }, canvasSize.width, canvasSize.height);
}
