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
}

function horizontalDirectionLabel(value: number): string {
  return value >= 0 ? "向右" : "向左";
}

function verticalDirectionLabel(value: number): string {
  return value >= 0 ? "向上" : "向下";
}

function distributedDirectionLabel(loadSign: number, start: FramePreviewPoint, end: FramePreviewPoint): string {
  if (Math.abs(end.y - start.y) <= Math.abs(end.x - start.x) * 0.2) {
    return loadSign >= 0 ? "向上" : "向下";
  }
  return loadSign >= 0 ? "局部 +y" : "局部 -y";
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

export function buildFrameLoadMarkers(load: FrameLoad, index: number, context: FrameLoadMarkerContext): FrameLoadMarker[] {
  if (load.type === "nodal") {
    const node = context.nodeMap.get(load.node);
    if (!node) return [];

    const markers: FrameLoadMarker[] = [];
    const fxKn = load.fxKn ?? 0;
    const fyKn = load.fyKn ?? 0;
    const mzKnM = load.mzKnM ?? 0;

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
        label: `水平荷载 ${Math.abs(fxKn).toFixed(1)} kN（${horizontalDirectionLabel(fxKn)}）`,
        labelX: direction >= 0 ? tailX - 8 : tailX + 8,
        labelY: node.y - 12,
        textAnchor: direction >= 0 ? "end" : "start",
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
        label: `竖向荷载 ${Math.abs(fyKn).toFixed(1)} kN（${verticalDirectionLabel(fyKn)}）`,
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
        label: `弯矩 ${Math.abs(mzKnM).toFixed(1)} kN·m`,
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
        label: `构件集中荷载 ${Math.abs(forceKn).toFixed(1)} kN`,
        labelX: headX - screenDirection.x * (arrowLength + 10),
        labelY: headY - screenDirection.y * (arrowLength + 10),
        textAnchor: "middle",
        key: `${index}-member-point`,
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
  const labelKind = Math.abs(qStart - qEnd) < 1e-9 ? "均布荷载" : "线性分布荷载";
  const rangeLabel = startRatio <= 1e-9 && endRatio >= 1 - 1e-9 ? "" : ` · 区间 ${startRatio.toFixed(2)}-${endRatio.toFixed(2)}`;

  markers.push({
    type: "distributed-guide",
    x1: guideStartX,
    y1: guideStartY,
    x2: guideEndX,
    y2: guideEndY,
    label: `${distributedDirectionLabel(loadSign, start, end)}${labelKind} ${Math.abs(distributedValue).toFixed(1)} kN/m${rangeLabel}`,
    labelX: (guideStartX + guideEndX) / 2,
    labelY: (guideStartY + guideEndY) / 2 - 8,
    textAnchor: "middle",
    key: `${index}-distributed-guide`,
  });

  const arrowCount = Math.max(5, Math.min(12, Math.round((endRatio - startRatio) * 12)));
  const maxQ = Math.max(Math.abs(qStart), Math.abs(qEnd), 1e-9);
  for (let step = 0; step < arrowCount; step += 1) {
    const t = startRatio + (endRatio - startRatio) * (step + 0.5) / arrowCount;
    const localRatio = (t - startRatio) / Math.max(endRatio - startRatio, 1e-9);
    const qAt = qStart + (qEnd - qStart) * localRatio;
    if (Math.abs(qAt) <= 1e-9) continue;
    const arrowDirection = memberLoadDirection(load.direction, Math.sign(qAt), start, end);
    const currentArrowLength = 30 + 14 * Math.abs(qAt) / maxQ;
    const headX = start.x + (end.x - start.x) * t;
    const headY = start.y + (end.y - start.y) * t;
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
