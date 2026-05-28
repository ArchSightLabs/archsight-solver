export interface TrussPreviewPoint {
  x: number;
  y: number;
}

export interface TrussPreviewLoad {
  fxKn?: number;
  fyKn?: number;
}

export type TrussSupportType = "pinned" | "roller" | "free";

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
  lineStart: TrussPreviewPoint;
  lineEnd: TrussPreviewPoint;
  startTickStart: TrussPreviewPoint;
  startTickEnd: TrussPreviewPoint;
  endTickStart: TrussPreviewPoint;
  endTickEnd: TrussPreviewPoint;
  label: string;
  labelX: number;
  labelY: number;
  labelAngle: number;
}

export function trussSupportTypeLabel(type: TrussSupportType) {
  if (type === "pinned") return "铰支座";
  if (type === "roller") return "滚动支座";
  return "自由节点";
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

function readableSegmentAngle(start: TrussPreviewPoint, end: TrussPreviewPoint) {
  let angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
  if (angle > 90 || angle < -90) angle += 180;
  return angle;
}

export function buildTrussMemberLengthDimension(
  start: TrussPreviewPoint,
  end: TrussPreviewPoint,
  center: TrussPreviewPoint,
  lengthM: number,
  offset = 24,
): TrussMemberLengthDimension | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const screenLength = Math.hypot(dx, dy);
  if (screenLength <= 1e-9 || !Number.isFinite(lengthM)) {
    return null;
  }

  const normal = { x: -dy / screenLength, y: dx / screenLength };
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const outward = (mid.x - center.x) * normal.x + (mid.y - center.y) * normal.y >= 0 ? 1 : -1;
  const inward = -outward;
  const offsetVector = { x: normal.x * inward * offset, y: normal.y * inward * offset };
  const tickHalfLength = 5;
  const labelOffset = 10;
  const lineStart = { x: start.x + offsetVector.x, y: start.y + offsetVector.y };
  const lineEnd = { x: end.x + offsetVector.x, y: end.y + offsetVector.y };

  return {
    lineStart,
    lineEnd,
    startTickStart: { x: lineStart.x - normal.x * tickHalfLength, y: lineStart.y - normal.y * tickHalfLength },
    startTickEnd: { x: lineStart.x + normal.x * tickHalfLength, y: lineStart.y + normal.y * tickHalfLength },
    endTickStart: { x: lineEnd.x - normal.x * tickHalfLength, y: lineEnd.y - normal.y * tickHalfLength },
    endTickEnd: { x: lineEnd.x + normal.x * tickHalfLength, y: lineEnd.y + normal.y * tickHalfLength },
    label: `l = ${lengthM.toFixed(2)} m`,
    labelX: mid.x + normal.x * inward * (offset + labelOffset),
    labelY: mid.y + normal.y * inward * (offset + labelOffset),
    labelAngle: readableSegmentAngle(start, end),
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
