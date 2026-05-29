export type DiagramPoint = { x: number; y: number };

export type DiagramLabelRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type DiagramLabelBlocker = DiagramLabelRect & {
  weight: number;
};

export type DiagramTextAnchor = "start" | "middle" | "end";
export type DiagramVerticalAnchor = "top" | "middle" | "bottom";

export type DiagramLabelLine = {
  text: string;
  fontSize: number;
};

export type DiagramLabelCandidate = {
  dx: number;
  dy: number;
  textAnchor?: DiagramTextAnchor;
  verticalAnchor?: DiagramVerticalAnchor;
  penalty?: number;
};

export type DiagramPlacedLabelLine = DiagramLabelLine & {
  x: number;
  y: number;
};

export type DiagramPlacedLabel = {
  id?: string;
  anchor: DiagramPoint;
  rect: DiagramLabelRect;
  score: number;
  textAnchor: DiagramTextAnchor;
  lines: DiagramPlacedLabelLine[];
  connectorX: number;
  connectorY: number;
  textX: number;
  valueY: number;
  stationY: number;
};

export type DiagramLabelSpec = {
  id: string;
  anchor: DiagramPoint;
  lines: DiagramLabelLine[];
  candidates: DiagramLabelCandidate[];
  priority: number;
  occupiedWeight?: number;
  paddingX?: number;
  paddingY?: number;
  lineGap?: number;
  distanceWeight?: number;
  boundaryWeight?: number;
  extraScore?: (rect: DiagramLabelRect, candidate: DiagramLabelCandidate) => number;
};

export function clampDiagramValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function estimateDiagramTextWidth(text: string, fontSize: number) {
  return Array.from(text).reduce((width, character) => {
    if (/[\u2e80-\u9fff\uff00-\uffef]/u.test(character)) return width + fontSize;
    return width + fontSize * 0.62;
  }, 0);
}

export function overlapDiagramRects(a: DiagramLabelRect, b: DiagramLabelRect) {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return x * y;
}

export function rectCenter(rect: DiagramLabelRect): DiagramPoint {
  return {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
  };
}

export function pointBlocker(point: DiagramPoint, radius: number, weight: number): DiagramLabelBlocker {
  return {
    left: point.x - radius,
    right: point.x + radius,
    top: point.y - radius,
    bottom: point.y + radius,
    weight,
  };
}

export function lineBlocker(start: DiagramPoint, end: DiagramPoint, padding: number, weight: number): DiagramLabelBlocker {
  return {
    left: Math.min(start.x, end.x) - padding,
    right: Math.max(start.x, end.x) + padding,
    top: Math.min(start.y, end.y) - padding,
    bottom: Math.max(start.y, end.y) + padding,
    weight,
  };
}

export function polylineBlockers(points: DiagramPoint[], padding: number, weight: number): DiagramLabelBlocker[] {
  const blockers: DiagramLabelBlocker[] = [];
  for (let index = 1; index < points.length; index += 1) {
    blockers.push(lineBlocker(points[index - 1], points[index], padding, weight));
  }
  return blockers;
}

export function samplePointBlockers(points: DiagramPoint[], radius: number, weight: number, maxSamples = 80): DiagramLabelBlocker[] {
  const stride = Math.max(1, Math.floor(points.length / maxSamples));
  return points.filter((_, index) => index % stride === 0).map((point) => pointBlocker(point, radius, weight));
}

export function labelCandidatesAroundPoint(gap: number, extendedGap = gap + 18): DiagramLabelCandidate[] {
  return [
    { dx: gap, dy: -gap, textAnchor: "start", verticalAnchor: "bottom", penalty: 0 },
    { dx: gap, dy: gap, textAnchor: "start", verticalAnchor: "top", penalty: 8 },
    { dx: -gap, dy: -gap, textAnchor: "end", verticalAnchor: "bottom", penalty: 12 },
    { dx: -gap, dy: gap, textAnchor: "end", verticalAnchor: "top", penalty: 16 },
    { dx: 0, dy: -extendedGap, textAnchor: "middle", verticalAnchor: "bottom", penalty: 22 },
    { dx: 0, dy: extendedGap, textAnchor: "middle", verticalAnchor: "top", penalty: 26 },
    { dx: extendedGap, dy: 0, textAnchor: "start", verticalAnchor: "middle", penalty: 30 },
    { dx: -extendedGap, dy: 0, textAnchor: "end", verticalAnchor: "middle", penalty: 34 },
  ];
}

export function legendLabelCandidates(width: number, height: number): DiagramLabelCandidate[] {
  return [
    { dx: 0, dy: 0, textAnchor: "start", verticalAnchor: "top", penalty: 0 },
    { dx: 0, dy: 42, textAnchor: "start", verticalAnchor: "top", penalty: 38 },
    { dx: width, dy: 0, textAnchor: "end", verticalAnchor: "top", penalty: 70 },
    { dx: width, dy: height, textAnchor: "end", verticalAnchor: "bottom", penalty: 95 },
  ];
}

export function outwardLabelCandidates(anchor: DiagramPoint, center: DiagramPoint, gap: number, extendedGap = gap + 18): DiagramLabelCandidate[] {
  const horizontal = anchor.x < center.x ? "left" : "right";
  const vertical = anchor.y < center.y ? "top" : "bottom";
  const candidates = labelCandidatesAroundPoint(gap, extendedGap);
  return candidates
    .map((candidate) => {
      const pointsOutward =
        (horizontal === "left" && candidate.textAnchor === "end") ||
        (horizontal === "right" && candidate.textAnchor === "start") ||
        (vertical === "top" && candidate.verticalAnchor === "bottom") ||
        (vertical === "bottom" && candidate.verticalAnchor === "top");
      return {
        ...candidate,
        penalty: (candidate.penalty ?? 0) + (pointsOutward ? 0 : 28),
      };
    })
    .sort((a, b) => (a.penalty ?? 0) - (b.penalty ?? 0));
}

function labelSize(lines: DiagramLabelLine[], paddingX: number, paddingY: number, lineGap: number) {
  const width = Math.max(...lines.map((line) => estimateDiagramTextWidth(line.text, line.fontSize)), 0) + paddingX * 2;
  const height = lines.reduce((sum, line) => sum + line.fontSize, 0) + Math.max(0, lines.length - 1) * lineGap + paddingY * 2;
  return { width, height };
}

function labelRectForCandidate(params: {
  anchor: DiagramPoint;
  candidate: DiagramLabelCandidate;
  width: number;
  height: number;
  bounds: DiagramLabelRect;
}) {
  const textAnchor = params.candidate.textAnchor ?? "start";
  const verticalAnchor = params.candidate.verticalAnchor ?? "top";
  const targetX = params.anchor.x + params.candidate.dx;
  const targetY = params.anchor.y + params.candidate.dy;
  const rawLeft = textAnchor === "middle" ? targetX - params.width / 2 : textAnchor === "end" ? targetX - params.width : targetX;
  const rawTop = verticalAnchor === "middle" ? targetY - params.height / 2 : verticalAnchor === "bottom" ? targetY - params.height : targetY;
  const left = clampDiagramValue(rawLeft, params.bounds.left, params.bounds.right - params.width);
  const top = clampDiagramValue(rawTop, params.bounds.top, params.bounds.bottom - params.height);
  return {
    rect: {
      left,
      top,
      right: left + params.width,
      bottom: top + params.height,
    },
    rawLeft,
    rawTop,
    textAnchor,
  };
}

function connectorPoint(anchor: DiagramPoint, rect: DiagramLabelRect): DiagramPoint {
  const insideX = anchor.x >= rect.left && anchor.x <= rect.right;
  const insideY = anchor.y >= rect.top && anchor.y <= rect.bottom;
  if (!insideX || !insideY) {
    return {
      x: clampDiagramValue(anchor.x, rect.left, rect.right),
      y: clampDiagramValue(anchor.y, rect.top, rect.bottom),
    };
  }

  const distances = [
    { x: rect.left, y: anchor.y, distance: anchor.x - rect.left },
    { x: rect.right, y: anchor.y, distance: rect.right - anchor.x },
    { x: anchor.x, y: rect.top, distance: anchor.y - rect.top },
    { x: anchor.x, y: rect.bottom, distance: rect.bottom - anchor.y },
  ];
  return distances.reduce((best, current) => (current.distance < best.distance ? current : best), distances[0]);
}

export function placeDiagramLabel(params: {
  id?: string;
  anchor: DiagramPoint;
  lines: DiagramLabelLine[];
  candidates: DiagramLabelCandidate[];
  blockers?: DiagramLabelBlocker[];
  bounds: DiagramLabelRect;
  paddingX?: number;
  paddingY?: number;
  lineGap?: number;
  distanceWeight?: number;
  boundaryWeight?: number;
  extraScore?: (rect: DiagramLabelRect, candidate: DiagramLabelCandidate) => number;
}): DiagramPlacedLabel {
  const paddingX = params.paddingX ?? 4;
  const paddingY = params.paddingY ?? 3;
  const lineGap = params.lineGap ?? 3;
  const distanceWeight = params.distanceWeight ?? 0.35;
  const boundaryWeight = params.boundaryWeight ?? 3;
  const { width, height } = labelSize(params.lines, paddingX, paddingY, lineGap);
  const candidates = params.candidates.length ? params.candidates : [{ dx: 0, dy: 0 }];
  const scored = candidates.map((candidate) => {
    const placement = labelRectForCandidate({
      anchor: params.anchor,
      candidate,
      width,
      height,
      bounds: params.bounds,
    });
    const center = rectCenter(placement.rect);
    const overlapPenalty = (params.blockers ?? []).reduce((score, blocker) => score + overlapDiagramRects(placement.rect, blocker) * blocker.weight, 0);
    const distancePenalty = Math.hypot(center.x - params.anchor.x, center.y - params.anchor.y) * distanceWeight;
    const boundaryPenalty = (Math.abs(placement.rect.left - placement.rawLeft) + Math.abs(placement.rect.top - placement.rawTop)) * boundaryWeight;
    return {
      rect: placement.rect,
      textAnchor: placement.textAnchor,
      score: overlapPenalty + distancePenalty + boundaryPenalty + (candidate.penalty ?? 0) + (params.extraScore?.(placement.rect, candidate) ?? 0),
    };
  });
  const best = scored.reduce((current, candidate) => (candidate.score < current.score ? candidate : current), scored[0]);
  const textX = best.textAnchor === "middle" ? (best.rect.left + best.rect.right) / 2 : best.textAnchor === "end" ? best.rect.right - paddingX : best.rect.left + paddingX;
  let cursorY = best.rect.top + paddingY;
  const lines = params.lines.map((line) => {
    cursorY += line.fontSize;
    const placed = { ...line, x: textX, y: cursorY };
    cursorY += lineGap;
    return placed;
  });
  const connector = connectorPoint(params.anchor, best.rect);
  return {
    id: params.id,
    anchor: params.anchor,
    rect: best.rect,
    score: best.score,
    textAnchor: best.textAnchor,
    lines,
    connectorX: connector.x,
    connectorY: connector.y,
    textX,
    valueY: lines[0]?.y ?? best.rect.top,
    stationY: lines[1]?.y ?? lines[0]?.y ?? best.rect.top,
  };
}

export function placeDiagramLabels(labels: DiagramLabelSpec[], params: { baseBlockers?: DiagramLabelBlocker[]; bounds: DiagramLabelRect }) {
  const occupied = [...(params.baseBlockers ?? [])];
  const placedByIndex = new Array<DiagramPlacedLabel>(labels.length);
  labels
    .map((label, index) => ({ label, index }))
    .sort((a, b) => b.label.priority - a.label.priority || a.index - b.index)
    .forEach(({ label, index }) => {
      const placed = placeDiagramLabel({
        id: label.id,
        anchor: label.anchor,
        lines: label.lines,
        candidates: label.candidates,
        blockers: occupied,
        bounds: params.bounds,
        paddingX: label.paddingX,
        paddingY: label.paddingY,
        lineGap: label.lineGap,
        distanceWeight: label.distanceWeight,
        boundaryWeight: label.boundaryWeight,
        extraScore: label.extraScore,
      });
      occupied.push({ ...placed.rect, weight: label.occupiedWeight ?? 10 });
      placedByIndex[index] = placed;
    });
  return placedByIndex;
}
