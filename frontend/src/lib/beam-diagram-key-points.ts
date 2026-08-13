export type BeamDiagramMetricKey = "momentKnM" | "shearKn" | "deflectionMm";

export type BeamDiagramKeyPointKind =
  | "global-extreme"
  | "local-extreme"
  | "jump-left"
  | "jump-right"
  | "zero-crossing"
  | "endpoint";

export interface BeamDiagramSample {
  x: number;
  value: number;
}

type BeamDiagramSamplePoint = BeamDiagramSample & {
  sampleIndex: number;
};

export interface BeamDiagramKeyPoint extends BeamDiagramSample {
  kind: BeamDiagramKeyPointKind;
  priority: number;
  sampleIndex?: number;
}

type Candidate = BeamDiagramKeyPoint;

function addCandidate(candidates: Map<string, Candidate>, candidate: Candidate) {
  const candidateKey =
    candidate.sampleIndex !== undefined
      ? `sample:${candidate.sampleIndex}`
      : candidate.kind === "jump-left" || candidate.kind === "jump-right"
        ? `point:${candidate.kind}:${candidate.x.toFixed(6)}:${candidate.value.toFixed(6)}`
        : `point:${candidate.x.toFixed(6)}:${candidate.value.toFixed(6)}`;
  const current = candidates.get(candidateKey);
  if (
    !current ||
    candidate.priority > current.priority ||
    (candidate.priority === current.priority && (Math.abs(candidate.value) > Math.abs(current.value) || candidate.x < current.x))
  ) {
    candidates.set(candidateKey, candidate);
  }
}

function keyPointPriority(kind: BeamDiagramKeyPointKind) {
  if (kind === "global-extreme") return 1000;
  if (kind === "jump-left" || kind === "jump-right") return 920;
  if (kind === "endpoint") return 920;
  if (kind === "zero-crossing") return 900;
  return 700;
}

function finiteSamples(samples: BeamDiagramSample[]) {
  return samples
    .map((sample, sampleIndex) => ({ ...sample, sampleIndex }))
    .filter((sample) => Number.isFinite(sample.x) && Number.isFinite(sample.value))
    .sort((a, b) => a.x - b.x || a.sampleIndex - b.sampleIndex) as BeamDiagramSamplePoint[];
}

function isLocalExtreme(prev: BeamDiagramSample, current: BeamDiagramSample, next: BeamDiagramSample, tolerance: number) {
  const risesIntoCurrent = current.value - prev.value > tolerance;
  const fallsIntoCurrent = current.value - prev.value < -tolerance;
  const risesAfterCurrent = next.value - current.value > tolerance;
  const fallsAfterCurrent = next.value - current.value < -tolerance;
  return (risesIntoCurrent && fallsAfterCurrent) || (fallsIntoCurrent && risesAfterCurrent);
}

function interpolateZeroCrossing(left: BeamDiagramSamplePoint, right: BeamDiagramSamplePoint) {
  if (Math.abs(left.value) <= 1e-12) {
    return { x: left.x, value: 0, sampleIndex: left.sampleIndex };
  }
  if (Math.abs(right.value) <= 1e-12) {
    return { x: right.x, value: 0, sampleIndex: right.sampleIndex };
  }
  const denominator = right.value - left.value;
  if (Math.abs(denominator) <= 1e-12) {
    return null;
  }
  const ratio = -left.value / denominator;
  if (ratio < 0 || ratio > 1) {
    return null;
  }
  return {
    x: left.x + (right.x - left.x) * ratio,
    value: 0,
  };
}

function orderKeyPoints(candidates: Candidate[]) {
  return candidates
    .slice()
    .sort((a, b) => a.x - b.x || (a.sampleIndex ?? -1) - (b.sampleIndex ?? -1) || b.priority - a.priority);
}

export function findBeamDiagramKeyPoints(samples: BeamDiagramSample[], metricKey: BeamDiagramMetricKey): BeamDiagramKeyPoint[] {
  const points = finiteSamples(samples);
  if (!points.length) return [];

  const maxAbs = Math.max(...points.map((point) => Math.abs(point.value)));
  if (maxAbs <= 1e-9) return [];

  const candidates = new Map<string, Candidate>();
  const valueTolerance = Math.max(maxAbs * 0.015, 1e-7);
  const smoothTurnTolerance = Math.max(maxAbs * 0.0001, 1e-7);
  const globalExtreme = points.reduce((current, point) => (Math.abs(point.value) > Math.abs(current.value) ? point : current), points[0]);
  addCandidate(candidates, {
    x: globalExtreme.x,
    value: globalExtreme.value,
    kind: "global-extreme",
    priority: keyPointPriority("global-extreme"),
    sampleIndex: globalExtreme.sampleIndex,
  });

  const first = points[0];
  const last = points[points.length - 1];
  addCandidate(candidates, {
    x: first.x,
    value: first.value,
    kind: "endpoint",
    priority: keyPointPriority("endpoint"),
    sampleIndex: first.sampleIndex,
  });
  if (last !== first) {
    addCandidate(candidates, {
      x: last.x,
      value: last.value,
      kind: "endpoint",
      priority: keyPointPriority("endpoint"),
      sampleIndex: last.sampleIndex,
    });
  }

  const totalLength = Math.max(points[points.length - 1].x - points[0].x, 1e-9);
  const jumpStationTolerance = totalLength * 0.025;
  const jumpThreshold = maxAbs * 0.18;
  const zeroCrossingTolerance = Math.max(maxAbs * 1e-9, 1e-10);
  const jumpBoundaries = new Set<number>();
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const stationGap = Math.abs(next.x - current.x);
    const valueJump = Math.abs(next.value - current.value);

    const jump = stationGap <= jumpStationTolerance && valueJump >= jumpThreshold;
    if (jump) {
      jumpBoundaries.add(index);
      addCandidate(candidates, {
        x: current.x,
        value: current.value,
        kind: "jump-left",
        priority: keyPointPriority("jump-left"),
        sampleIndex: current.sampleIndex,
      });
      addCandidate(candidates, {
        x: next.x,
        value: next.value,
        kind: "jump-right",
        priority: keyPointPriority("jump-right"),
        sampleIndex: next.sampleIndex,
      });
    }

    const signChange = current.value * next.value < 0;
    if (!jump && signChange) {
      const zeroCrossing = interpolateZeroCrossing(current, next);
      if (zeroCrossing) {
        addCandidate(candidates, {
          ...zeroCrossing,
          kind: "zero-crossing",
          priority: keyPointPriority("zero-crossing"),
        });
      }
    }
  }

  for (let index = 1; index < points.length - 1; index += 1) {
    if (Math.abs(points[index].value) > zeroCrossingTolerance) continue;
    if (Math.abs(points[index - 1].value) <= zeroCrossingTolerance) continue;

    let zeroRunEnd = index;
    while (zeroRunEnd + 1 < points.length && Math.abs(points[zeroRunEnd + 1].value) <= zeroCrossingTolerance) {
      zeroRunEnd += 1;
    }
    if (zeroRunEnd >= points.length - 1) continue;
    if (jumpBoundaries.has(index - 1) || jumpBoundaries.has(zeroRunEnd)) continue;

    const left = points[index - 1];
    const right = points[zeroRunEnd + 1];
    if (left.value * right.value >= 0) continue;
    const representative = points
      .slice(index, zeroRunEnd + 1)
      .reduce((best, point) => (Math.abs(point.value) < Math.abs(best.value) ? point : best), points[index]);
    addCandidate(candidates, {
      x: representative.x,
      value: 0,
      kind: "zero-crossing",
      priority: keyPointPriority("zero-crossing"),
      sampleIndex: representative.sampleIndex,
    });
  }

  if (metricKey === "momentKnM" || metricKey === "deflectionMm" || metricKey === "shearKn") {
    for (let index = 1; index < points.length - 1; index += 1) {
      const prev = points[index - 1];
      const current = points[index];
      const next = points[index + 1];
      const turnTolerance = metricKey === "shearKn" ? valueTolerance : smoothTurnTolerance;
      if (!isLocalExtreme(prev, current, next, turnTolerance)) continue;

      addCandidate(candidates, {
        x: current.x,
        value: current.value,
        kind: "local-extreme",
        priority: keyPointPriority("local-extreme"),
        sampleIndex: current.sampleIndex,
      });
    }
  }

  return orderKeyPoints(Array.from(candidates.values()));
}
