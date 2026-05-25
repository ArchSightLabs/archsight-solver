import type { FrameLoad } from "../types/structure";

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
        label: `水平荷载 ${Math.abs(fxKn).toFixed(1)} 千牛（${horizontalDirectionLabel(fxKn)}）`,
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
        label: `竖向荷载 ${Math.abs(fyKn).toFixed(1)} 千牛（${verticalDirectionLabel(fyKn)}）`,
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
        label: `弯矩 ${Math.abs(mzKnM).toFixed(1)} 千牛·米`,
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

  const worldDx = end.x - start.x;
  const worldDy = -(end.y - start.y);
  const length = Math.hypot(worldDx, worldDy) || 1;
  const localYWorldX = -worldDy / length;
  const localYWorldY = worldDx / length;
  const loadSign = Math.sign(load.wyKnPerM ?? 0) || -1;
  const screenDirectionX = loadSign * localYWorldX;
  const screenDirectionY = -loadSign * localYWorldY;
  const arrowLength = 42;
  const markers: FrameLoadMarker[] = [];
  const guideOffset = 42;
  const guideStartT = 0.08;
  const guideEndT = 0.92;
  const guideStartX = start.x + (end.x - start.x) * guideStartT - screenDirectionX * guideOffset;
  const guideStartY = start.y + (end.y - start.y) * guideStartT - screenDirectionY * guideOffset;
  const guideEndX = start.x + (end.x - start.x) * guideEndT - screenDirectionX * guideOffset;
  const guideEndY = start.y + (end.y - start.y) * guideEndT - screenDirectionY * guideOffset;

  markers.push({
    type: "distributed-guide",
    x1: guideStartX,
    y1: guideStartY,
    x2: guideEndX,
    y2: guideEndY,
    label: `${distributedDirectionLabel(loadSign, start, end)}均布荷载 ${Math.abs(load.wyKnPerM ?? 0).toFixed(1)} 千牛/米`,
    labelX: (guideStartX + guideEndX) / 2,
    labelY: (guideStartY + guideEndY) / 2 - 8,
    textAnchor: "middle",
    key: `${index}-distributed-guide`,
  });

  for (let step = 0; step < 4; step += 1) {
    const t = (step + 0.5) / 4;
    const headX = start.x + (end.x - start.x) * t;
    const headY = start.y + (end.y - start.y) * t;
    const tailX = headX - screenDirectionX * arrowLength;
    const tailY = headY - screenDirectionY * arrowLength;
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
