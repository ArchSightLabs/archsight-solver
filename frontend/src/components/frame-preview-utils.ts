import { formatDimensionLegendGroupRows } from "../lib/dimension-legend-rows.ts";
import type { FrameLoad, FrameLoadDirection } from "../types/structure";

export interface FramePreviewPoint {
  x: number;
  y: number;
}

export type FrameLoadMarker =
  | {
      type: "force";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      label?: string;
      labelX: number;
      labelY: number;
      textAnchor?: "start" | "middle" | "end";
      key: string;
    }
  | {
      type: "distributed-guide";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      label: string;
      labelX: number;
      labelY: number;
      textAnchor?: "start" | "middle" | "end";
      key: string;
    }
  | {
      type: "moment";
      cx: number;
      cy: number;
      radius: number;
      label: string;
      labelX: number;
      labelY: number;
      textAnchor?: "start" | "middle" | "end";
      clockwise: boolean;
      key: string;
    };

interface FrameLoadMarkerContext {
  nodeMap: Map<string, FramePreviewPoint>;
  memberMap: Map<string, { start: string; end: string }>;
  loadLabel?: FrameLoadLabelSet;
  reservedLoadPoints?: FramePreviewPoint[];
}

export interface FrameLoadLabelSet {
  force?: string;
  moment?: string;
  memberPoint?: string;
  distributed?: string;
  thermal?: string;
}

export interface FrameGeometryDimension {
  memberId: string;
  valueLabel: string;
}

export function buildFrameGeometryDimensions(
  nodes: Array<{ id: string; x: number; y: number }>,
  members: Array<{ id: string; start: string; end: string }>,
) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return members.flatMap<FrameGeometryDimension>((member) => {
    const start = nodeMap.get(member.start);
    const end = nodeMap.get(member.end);
    if (!start || !end) return [];
    return [{
      memberId: member.id,
      valueLabel: frameMemberDimensionValueLabel(start, end),
    }];
  });
}

function formatFrameDimensionLength(length: number) {
  return `${length.toFixed(2).replace(/\.?0+$/u, "")} m`;
}

export function frameMemberDimensionValueLabel(start: Pick<FramePreviewPoint, "x" | "y">, end: Pick<FramePreviewPoint, "x" | "y">) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (Math.abs(dx) <= 1e-6 && Math.abs(dy) > 1e-6) {
    return formatFrameDimensionLength(Math.abs(dy));
  }
  return formatFrameDimensionLength(length);
}

export function buildFrameDimensionLegendRows(dimensions: FrameGeometryDimension[], maxWidthPx: number, fontSize = 12) {
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

function memberLoadDirection(
  direction: FrameLoadDirection | undefined,
  loadSign: number,
  start: FramePreviewPoint,
  end: FramePreviewPoint
) {
  const worldDx = end.x - start.x;
  const worldDy = -(end.y - start.y);
  const length = Math.hypot(worldDx, worldDy) || 1;
  const localYWorldX = -worldDy / length;
  const localYWorldY = worldDx / length;
  const base = direction === "global_y"
    ? { x: 0, y: -1 }
    : { x: localYWorldX, y: -localYWorldY };
  return {
    x: loadSign * base.x,
    y: loadSign * base.y,
  };
}

function distributedRange(load: Extract<FrameLoad, { type: "distributed" }>) {
  let startRatio = Math.min(1, Math.max(0, load.startRatio ?? 0));
  let endRatio = Math.min(1, Math.max(0, load.endRatio ?? 1));
  let qStart = Number.isFinite(load.qStartKnPerM) ? Number(load.qStartKnPerM) : Number(load.wyKnPerM ?? 0);
  let qEnd = Number.isFinite(load.qEndKnPerM) ? Number(load.qEndKnPerM) : qStart;
  if (endRatio < startRatio) {
    [startRatio, endRatio] = [endRatio, startRatio];
    [qStart, qEnd] = [qEnd, qStart];
  }
  if (Math.abs(endRatio - startRatio) < 1e-9) {
    endRatio = Math.min(1, startRatio + 0.01);
    if (Math.abs(endRatio - startRatio) < 1e-9) {
      startRatio = Math.max(0, endRatio - 0.01);
    }
  }
  return { startRatio, endRatio, qStart, qEnd };
}

export function frameLoadMagnitude(value: number) {
  return Math.abs(value).toFixed(1);
}

export function formatFrameForceLoadLabel(label: string, value: number, unit = "kN") {
  return `${label}=${frameLoadMagnitude(value)} ${unit}`;
}

export function formatFrameDistributedLoadLabel(
  label: string,
  qStart: number,
  qEnd: number,
  startRatio = 0,
  endRatio = 1,
) {
  const valueLabel = Math.abs(qStart - qEnd) < 1e-9
    ? frameLoadMagnitude(qStart)
    : `${frameLoadMagnitude(qStart)}-${frameLoadMagnitude(qEnd)}`;
  const rangeLabel = startRatio <= 1e-9 && endRatio >= 1 - 1e-9
    ? ""
    : `@${startRatio.toFixed(2)}-${endRatio.toFixed(2)}L`;
  return `${label}=${valueLabel} kN/m${rangeLabel}`;
}

export function formatFrameTemperatureLoadLabel(label: string, deltaTempC: number) {
  return `${label}=${frameLoadMagnitude(deltaTempC)} °C`;
}

export function buildFrameLoadLabelMap(loads: FrameLoad[]) {
  const labels = new Map<number, FrameLoadLabelSet>();
  let forceCount = 0;
  let momentCount = 0;
  let memberPointCount = 0;
  let distributedCount = 0;
  let thermalCount = 0;

  loads.forEach((load, index) => {
    const label: FrameLoadLabelSet = {};
    if (load.type === "nodal") {
      const hasForce = Math.abs(load.fxKn ?? 0) > 1e-9 || Math.abs(load.fyKn ?? 0) > 1e-9;
      if (hasForce) {
        forceCount += 1;
        label.force = `F${forceCount}`;
      }
      if (Math.abs(load.mzKnM ?? 0) > 1e-9) {
        momentCount += 1;
        label.moment = `M${momentCount}`;
      }
    } else if (load.type === "member_point") {
      memberPointCount += 1;
      label.memberPoint = `P${memberPointCount}`;
    } else if (load.type === "temperature") {
      thermalCount += 1;
      label.thermal = `T${thermalCount}`;
    } else {
      distributedCount += 1;
      label.distributed = `q${distributedCount}`;
    }
    labels.set(index, label);
  });

  return labels;
}

function forceComponentLabel(baseLabel: string, hasFx: boolean, hasFy: boolean, component: "x" | "y") {
  return hasFx && hasFy ? `${baseLabel}${component}` : baseLabel;
}

function isNearReservedLoadPoint(point: FramePreviewPoint, reservedLoadPoints: FramePreviewPoint[] | undefined, minDistance = 16) {
  return Boolean(reservedLoadPoints?.some((reserved) => Math.hypot(point.x - reserved.x, point.y - reserved.y) <= minDistance));
}

export function frameMemberLabelPlacement(
  start: FramePreviewPoint,
  end: FramePreviewPoint,
  center: FramePreviewPoint,
  offset = 18,
) {
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;

  if (Math.abs(dy) < 1e-6) {
    return { x: midX, y: midY + offset, textAnchor: "middle" as const };
  }

  if (Math.abs(dx) < 1e-6) {
    const side = midX < center.x ? -1 : 1;
    return {
      x: midX + side * offset,
      y: midY,
      textAnchor: side < 0 ? ("end" as const) : ("start" as const),
    };
  }

  const normal = { x: -dy / length, y: dx / length };
  const outward = (midX - center.x) * normal.x + (midY - center.y) * normal.y >= 0 ? 1 : -1;
  return {
    x: midX + normal.x * outward * offset,
    y: midY + normal.y * outward * offset,
    textAnchor: "middle" as const,
  };
}

export function buildFrameLoadMarkers(load: FrameLoad, index: number, context: FrameLoadMarkerContext): FrameLoadMarker[] {
  if (load.type === "nodal") {
    const node = context.nodeMap.get(load.node);
    if (!node) return [];

    const markers: FrameLoadMarker[] = [];
    const fxKn = load.fxKn ?? 0;
    const fyKn = load.fyKn ?? 0;
    const mzKnM = load.mzKnM ?? 0;
    const hasFx = Math.abs(fxKn) > 1e-9;
    const hasFy = Math.abs(fyKn) > 1e-9;
    const forceLabel = context.loadLabel?.force ?? `F${index + 1}`;

    if (hasFx) {
      const direction = Math.sign(fxKn);
      const headX = node.x - direction * 8;
      const tailX = node.x - direction * 56;
      markers.push({
        type: "force",
        x1: tailX,
        y1: node.y,
        x2: headX,
        y2: node.y,
        label: formatFrameForceLoadLabel(forceComponentLabel(forceLabel, hasFx, hasFy, "x"), fxKn),
        labelX: direction >= 0 ? tailX - 8 : tailX + 8,
        labelY: node.y - 12,
        textAnchor: direction >= 0 ? "end" : "start",
        key: `${index}-fx`,
      });
    }

    if (hasFy) {
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
        label: formatFrameForceLoadLabel(forceComponentLabel(forceLabel, hasFx, hasFy, "y"), fyKn),
        labelX: node.x + 14,
        labelY: (tailY + headY) / 2,
        key: `${index}-fy`,
      });
    }

    if (Math.abs(mzKnM) > 1e-9) {
      markers.push({
        type: "moment",
        cx: node.x + 34,
        cy: node.y - 10,
        radius: 18,
        label: formatFrameForceLoadLabel(context.loadLabel?.moment ?? `M${index + 1}`, mzKnM, "kN·m"),
        labelX: node.x + 56,
        labelY: node.y - 18,
        clockwise: mzKnM < 0,
        key: `${index}-mz`,
      });
    }

    return markers;
  }

  const member = context.memberMap.get(load.member);
  if (!member) return [];

  const start = context.nodeMap.get(member.start);
  const end = context.nodeMap.get(member.end);
  if (!start || !end) return [];

  if (load.type === "member_point") {
    const forceKn = load.forceKn ?? 0;
    if (Math.abs(forceKn) <= 1e-9) return [];
    const ratio = Math.min(1, Math.max(0, load.positionRatio ?? 0.5));
    const headX = start.x + (end.x - start.x) * ratio;
    const headY = start.y + (end.y - start.y) * ratio;
    const screenDirection = memberLoadDirection(load.direction, Math.sign(forceKn), start, end);
    const arrowLength = 56;
    return [
      {
        type: "force",
        x1: headX - screenDirection.x * arrowLength,
        y1: headY - screenDirection.y * arrowLength,
        x2: headX,
        y2: headY,
        label: formatFrameForceLoadLabel(context.loadLabel?.memberPoint ?? `P${index + 1}`, forceKn),
        labelX: headX - screenDirection.x * (arrowLength + 10),
        labelY: headY - screenDirection.y * (arrowLength + 10),
        textAnchor: "middle",
        key: `${index}-member-point`,
      },
    ];
  }

  if (load.type === "temperature") {
    const deltaTempC = Number(load.deltaTempC ?? 0);
    const offsetDirection = memberLoadDirection("local_y", -1, start, end);
    const guideOffset = 30;
    const guideStartX = start.x - offsetDirection.x * guideOffset;
    const guideStartY = start.y - offsetDirection.y * guideOffset;
    const guideEndX = end.x - offsetDirection.x * guideOffset;
    const guideEndY = end.y - offsetDirection.y * guideOffset;
    return [
      {
        type: "distributed-guide",
        x1: guideStartX,
        y1: guideStartY,
        x2: guideEndX,
        y2: guideEndY,
        label: formatFrameTemperatureLoadLabel(context.loadLabel?.thermal ?? `T${index + 1}`, deltaTempC),
        labelX: (guideStartX + guideEndX) / 2,
        labelY: (guideStartY + guideEndY) / 2 - 8,
        textAnchor: "middle",
        key: `${index}-temperature-guide`,
      },
    ];
  }

  const { startRatio, endRatio, qStart, qEnd } = distributedRange(load);
  const distributedValue = (qStart + qEnd) / 2;
  const representative = Math.abs(qStart) >= Math.abs(qEnd) ? qStart : qEnd;
  const loadSign = Math.sign(representative || distributedValue) || -1;
  const screenDirection = memberLoadDirection(load.direction, loadSign, start, end);
  const markers: FrameLoadMarker[] = [];
  const guideOffset = 42;
  const guideStartT = startRatio;
  const guideEndT = endRatio;
  const guideStartX = start.x + (end.x - start.x) * guideStartT - screenDirection.x * guideOffset;
  const guideStartY = start.y + (end.y - start.y) * guideStartT - screenDirection.y * guideOffset;
  const guideEndX = start.x + (end.x - start.x) * guideEndT - screenDirection.x * guideOffset;
  const guideEndY = start.y + (end.y - start.y) * guideEndT - screenDirection.y * guideOffset;

  markers.push({
    type: "distributed-guide",
    x1: guideStartX,
    y1: guideStartY,
    x2: guideEndX,
    y2: guideEndY,
    label: formatFrameDistributedLoadLabel(context.loadLabel?.distributed ?? `q${index + 1}`, qStart, qEnd, startRatio, endRatio),
    labelX: (guideStartX + guideEndX) / 2,
    labelY: (guideStartY + guideEndY) / 2 - 8,
    textAnchor: "middle",
    key: `${index}-distributed-guide`,
  });

  const arrowCount = Math.max(5, Math.min(12, Math.round((endRatio - startRatio) * 12)));
  const maxQ = Math.max(Math.abs(qStart), Math.abs(qEnd), 1e-9);
  for (let step = 0; step < arrowCount; step += 1) {
    const t = startRatio + (endRatio - startRatio) * (step / (arrowCount - 1));
    const localRatio = (t - startRatio) / Math.max(endRatio - startRatio, 1e-9);
    const qAt = qStart + (qEnd - qStart) * localRatio;
    if (Math.abs(qAt) <= 1e-9) continue;
    const arrowDirection = memberLoadDirection(load.direction, Math.sign(qAt), start, end);
    const currentArrowLength = 30 + 14 * Math.abs(qAt) / maxQ;
    const headX = start.x + (end.x - start.x) * t;
    const headY = start.y + (end.y - start.y) * t;
    if (isNearReservedLoadPoint({ x: headX, y: headY }, context.reservedLoadPoints)) continue;
    const tailX = headX - arrowDirection.x * currentArrowLength;
    const tailY = headY - arrowDirection.y * currentArrowLength;
    markers.push({
      type: "force",
      x1: tailX,
      y1: tailY,
      x2: headX,
      y2: headY,
      label: undefined,
      labelX: (tailX + headX) / 2 + 8,
      labelY: (tailY + headY) / 2,
      key: `${index}-distributed-${step}`,
    });
  }

  return markers;
}
