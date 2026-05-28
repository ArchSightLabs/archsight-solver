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
  memberId: string;
  valueLabel: string;
  title: string;
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

function estimateLegendTextWidth(text: string, fontSize: number) {
  return text.length * fontSize * 0.62;
}

export function buildTrussMemberLengthLegendRows(dimensions: TrussMemberLengthDimension[], maxWidthPx: number, fontSize = 12) {
  const rows: string[] = [];
  let current = "";

  for (const dimension of dimensions) {
    const item = `${dimension.memberId} ${dimension.valueLabel}`;
    const next = current ? `${current}    ${item}` : item;
    if (current && estimateLegendTextWidth(next, fontSize) > maxWidthPx) {
      rows.push(current);
      current = item;
    } else {
      current = next;
    }
  }

  if (current) rows.push(current);
  return rows;
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

  const valueLabel = `l = ${lengthM.toFixed(2)} m`;

  return {
    memberId,
    valueLabel,
    title: `杆件 ${memberId}，长度 ${lengthM.toFixed(2)} m`,
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
