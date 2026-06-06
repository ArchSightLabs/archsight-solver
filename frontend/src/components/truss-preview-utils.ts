import { outwardLabelCandidates, type DiagramLabelCandidate, type DiagramLabelRect } from "../lib/diagram-label-layout.ts";
import { formatDimensionLegendGroupRows } from "../lib/dimension-legend-rows.ts";
import { modelObjectMemberTerm } from "../lib/model-object-vocabulary.ts";
import { trussSupportLabel } from "../lib/support-vocabulary.ts";
import type { TrussSupportType } from "../types/supports.ts";

export interface TrussPreviewPoint {
  x: number;
  y: number;
}

export interface TrussPreviewLoad {
  fxKn?: number;
  fyKn?: number;
}

export type { TrussSupportType } from "../types/supports.ts";

export interface TrussLoadMarker {
  type: "force";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  labelX: number;
  labelY: number;
  key: string;
}

export interface TrussSupportMarkerGeometry {
  supportType: Exclude<TrussSupportType, "free">;
  trianglePoints: string;
  baseLine: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  rollers: Array<{
    cx: number;
    cy: number;
    r: number;
  }>;
  label: string;
}

export interface TrussMemberLengthDimension {
  memberId: string;
  valueLabel: string;
  title: string;
}

export function trussSupportTypeLabel(type: TrussSupportType) {
  return trussSupportLabel(type);
}

export function buildTrussSupportMarkerGeometry(type: string | undefined, x: number, y: number): TrussSupportMarkerGeometry | null {
  if (type !== "pinned" && type !== "roller") {
    return null;
  }

  return {
    supportType: type,
    trianglePoints: `${x - 16},${y + 24} ${x + 16},${y + 24} ${x},${y + 2}`,
    baseLine: {
      x1: x - 18,
      y1: y + 28,
      x2: x + 18,
      y2: y + 28,
    },
    rollers: type === "roller"
      ? [
          { cx: x - 8, cy: y + 33, r: 3 },
          { cx: x + 8, cy: y + 33, r: 3 },
        ]
      : [],
    label: trussSupportTypeLabel(type),
  };
}

export function buildTrussNodeLabelCandidates(
  point: TrussPreviewPoint,
  center: TrussPreviewPoint,
  supportType: string | undefined,
  gap: number,
  extendedGap = gap + 18,
): DiagramLabelCandidate[] {
  const baseCandidates = outwardLabelCandidates(point, center, gap, extendedGap);
  if (supportType !== "pinned" && supportType !== "roller") {
    return baseCandidates;
  }

  const side = point.x < center.x ? -1 : 1;
  const textAnchor = side < 0 ? "end" : "start";
  const lift = gap + 4;

  return [
    { dx: side * (gap + 2), dy: -lift, textAnchor, verticalAnchor: "bottom", penalty: -16 },
    { dx: side * (gap + 10), dy: -(lift + 10), textAnchor, verticalAnchor: "bottom", penalty: -4 },
    { dx: 0, dy: -extendedGap, textAnchor: "middle", verticalAnchor: "bottom", penalty: 6 },
    ...baseCandidates.map((candidate) => ({
      ...candidate,
      penalty: (candidate.penalty ?? 0) + (candidate.dy > 0 || candidate.verticalAnchor === "top" ? 180 : 24),
    })),
  ];
}

export function scoreTrussSupportedNodeLabelClearance(rect: Pick<DiagramLabelRect, "bottom">, nodeY: number, minClearance = 8) {
  return Math.max(0, rect.bottom - (nodeY - minClearance)) * 120;
}

function formatTrussMemberLength(value: number) {
  return `${value.toFixed(2).replace(/\.?0+$/u, "")} m`;
}

export function buildTrussMemberLengthLegendRows(dimensions: TrussMemberLengthDimension[], maxWidthPx: number, fontSize = 12) {
  const groupedDimensions = Array.from(
    dimensions.reduce((groups, dimension) => {
      const group = groups.get(dimension.valueLabel) ?? { memberIds: [] as string[], valueLabel: dimension.valueLabel };
      group.memberIds.push(dimension.memberId);
      groups.set(dimension.valueLabel, group);
      return groups;
    }, new Map<string, { memberIds: string[]; valueLabel: string }>())
      .values(),
  );

  return groupedDimensions.flatMap((dimension) => formatDimensionLegendGroupRows({ itemIds: dimension.memberIds, valueLabel: dimension.valueLabel }, maxWidthPx, fontSize, "根"));
}

export function buildTrussMemberLengthDimensions(
  nodes: Array<{ id: string; x: number; y: number }>,
  members: Array<{ id: string; start: string; end: string }>,
) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return members.flatMap<TrussMemberLengthDimension>((member) => {
    const start = nodeMap.get(member.start);
    const end = nodeMap.get(member.end);
    if (!start || !end) return [];
    return buildTrussMemberLengthDimension(
      member.id,
      start,
      end,
      Math.hypot(end.x - start.x, end.y - start.y),
    ) ?? [];
  });
}

export function buildTrussMemberLengthDimension(
  memberId: string,
  start: TrussPreviewPoint,
  end: TrussPreviewPoint,
  lengthM: number,
): TrussMemberLengthDimension | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const screenLength = Math.hypot(dx, dy);
  if (screenLength <= 1e-9 || !Number.isFinite(lengthM)) {
    return null;
  }

  const valueLabel = formatTrussMemberLength(lengthM);

  return {
    memberId,
    valueLabel,
    title: `${modelObjectMemberTerm("truss")} ${memberId}，长度 ${lengthM.toFixed(2)} m`,
  };
}

export function buildTrussLoadMarkers(node: TrussPreviewPoint, load: TrussPreviewLoad, index: number): TrussLoadMarker[] {
  const markers: TrussLoadMarker[] = [];

  const fxKn = load.fxKn ?? 0;
  const fyKn = load.fyKn ?? 0;

  if (Math.abs(fxKn) > 1e-9) {
    const direction = Math.sign(fxKn);
    const headX = node.x - direction * 8;
    const tailX = node.x - direction * 56;
    markers.push({
      type: "force",
      x1: tailX,
      y1: node.y,
      x2: headX,
      y2: node.y,
      label: `水平荷载 ${Math.abs(fxKn).toFixed(1)} kN`,
      labelX: (tailX + headX) / 2 - 12,
      labelY: node.y - 10,
      key: `${index}-fx`,
    });
  }

  if (Math.abs(fyKn) > 1e-9) {
    const direction = Math.sign(fyKn);
    const screenDirectionY = -direction;
    const headY = node.y - screenDirectionY * 8;
    const tailY = node.y - screenDirectionY * 56;
    markers.push({
      type: "force",
      x1: node.x,
      y1: tailY,
      x2: node.x,
      y2: headY,
      label: `竖向荷载 ${Math.abs(fyKn).toFixed(1)} kN`,
      labelX: node.x + 14,
      labelY: (tailY + headY) / 2,
      key: `${index}-fy`,
    });
  }

  return markers;
}
