export interface TrussPreviewPoint {
  x: number;
  y: number;
}

export interface TrussPreviewLoad {
  fxKn?: number;
  fyKn?: number;
}

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
      label: `水平荷载 ${Math.abs(fxKn).toFixed(1)} 千牛`,
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
      label: `竖向荷载 ${Math.abs(fyKn).toFixed(1)} 千牛`,
      labelX: node.x + 14,
      labelY: (tailY + headY) / 2,
      key: `${index}-fy`,
    });
  }

  return markers;
}
