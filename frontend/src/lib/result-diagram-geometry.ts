export type ResultDiagramPoint = { x: number; y: number };

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function svgPathFromPoints(points: ResultDiagramPoint[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

export function svgAreaPath(basePoints: ResultDiagramPoint[], resultPoints: ResultDiagramPoint[]) {
  if (basePoints.length < 2 || resultPoints.length < 2) return "";
  return `${svgPathFromPoints(resultPoints)} L ${basePoints
    .slice()
    .reverse()
    .map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" L ")} Z`;
}
