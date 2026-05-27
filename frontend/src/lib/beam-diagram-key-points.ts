export type BeamDiagramMetricKey = "momentKnM" | "shearKn" | "deflectionMm";

export type BeamDiagramKeyPointKind = "global-extreme" | "local-extreme" | "jump" | "endpoint";

export interface BeamDiagramSample {
  x: number;
  value: number;
}

export interface BeamDiagramKeyPoint extends BeamDiagramSample {
  index: number;
  kind: BeamDiagramKeyPointKind;
  priority: number;
}

type Candidate = BeamDiagramKeyPoint;

const KEY_POINT_LIMITS: Record<BeamDiagramMetricKey, number> = {
  momentKnM: 5,
  shearKn: 6,
  deflectionMm: 3,
};

function addCandidate(candidates: Map<number, Candidate>, candidate: Candidate) {
  const current = candidates.get(candidate.index);
  if (!current || candidate.priority > current.priority || (candidate.priority === current.priority && Math.abs(candidate.value) > Math.abs(current.value))) {
    candidates.set(candidate.index, candidate);
  }
}

function keyPointPriority(kind: BeamDiagramKeyPointKind) {
  if (kind === "global-extreme") return 100;
  if (kind === "jump") return 86;
  if (kind === "local-extreme") return 82;
  return 60;
}

function finiteSamples(samples: BeamDiagramSample[]) {
  return samples
    .map((sample, index) => ({ ...sample, index }))
    .filter((sample) => Number.isFinite(sample.x) && Number.isFinite(sample.value));
}

function isLocalExtreme(prev: BeamDiagramSample, current: BeamDiagramSample, next: BeamDiagramSample, tolerance: number) {
  const risesIntoCurrent = current.value - prev.value > tolerance;
  const fallsIntoCurrent = current.value - prev.value < -tolerance;
  const risesAfterCurrent = next.value - current.value > tolerance;
  const fallsAfterCurrent = next.value - current.value < -tolerance;
  return (risesIntoCurrent && fallsAfterCurrent) || (fallsIntoCurrent && risesAfterCurrent);
}

function chooseKeyPoints(candidates: Candidate[], limit: number) {
  return candidates
    .slice()
    .sort((a, b) => b.priority - a.priority || Math.abs(b.value) - Math.abs(a.value) || a.x - b.x)
    .slice(0, limit)
    .sort((a, b) => a.x - b.x || a.index - b.index);
}

export function findBeamDiagramKeyPoints(samples: BeamDiagramSample[], metricKey: BeamDiagramMetricKey): BeamDiagramKeyPoint[] {
  const points = finiteSamples(samples);
  if (!points.length) return [];

  const maxAbs = Math.max(...points.map((point) => Math.abs(point.value)));
  if (maxAbs <= 1e-9) return [];

  const candidates = new Map<number, Candidate>();
  const valueTolerance = Math.max(maxAbs * 0.015, 1e-7);
  const smoothTurnTolerance = Math.max(maxAbs * 0.0001, 1e-7);
  const displayThreshold = Math.max(maxAbs * 0.055, 1e-7);
  const globalExtreme = points.reduce((current, point) => (Math.abs(point.value) > Math.abs(current.value) ? point : current), points[0]);
  addCandidate(candidates, {
    index: globalExtreme.index,
    x: globalExtreme.x,
    value: globalExtreme.value,
    kind: "global-extreme",
    priority: keyPointPriority("global-extreme"),
  });

  if (metricKey === "shearKn") {
    const endpointThreshold = Math.max(maxAbs * 0.12, 1e-7);
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.abs(first.value) >= endpointThreshold) {
      addCandidate(candidates, {
        index: first.index,
        x: first.x,
        value: first.value,
        kind: "endpoint",
        priority: keyPointPriority("endpoint"),
      });
    }
    if (Math.abs(last.value) >= endpointThreshold) {
      addCandidate(candidates, {
        index: last.index,
        x: last.x,
        value: last.value,
        kind: "endpoint",
        priority: keyPointPriority("endpoint"),
      });
    }

    const totalLength = Math.max(points[points.length - 1].x - points[0].x, 1e-9);
    const jumpStationTolerance = totalLength * 0.025;
    const jumpThreshold = maxAbs * 0.18;
    for (let index = 0; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      const stationGap = Math.abs(next.x - current.x);
      const valueJump = Math.abs(next.value - current.value);
      if (stationGap <= jumpStationTolerance && valueJump >= jumpThreshold) {
        for (const point of [current, next]) {
          if (Math.abs(point.value) >= displayThreshold) {
            addCandidate(candidates, {
              index: point.index,
              x: point.x,
              value: point.value,
              kind: "jump",
              priority: keyPointPriority("jump"),
            });
          }
        }
      }
    }
  }

  if (metricKey === "momentKnM" || metricKey === "deflectionMm" || metricKey === "shearKn") {
    for (let index = 1; index < points.length - 1; index += 1) {
      const prev = points[index - 1];
      const current = points[index];
      const next = points[index + 1];
      const turnTolerance = metricKey === "shearKn" ? valueTolerance : smoothTurnTolerance;
      if (!isLocalExtreme(prev, current, next, turnTolerance)) continue;

      const prominence = Math.min(Math.abs(current.value - prev.value), Math.abs(current.value - next.value));
      const prominenceThreshold = metricKey === "shearKn" ? maxAbs * 0.08 : smoothTurnTolerance;
      if (Math.abs(current.value) < displayThreshold || prominence < prominenceThreshold) continue;

      addCandidate(candidates, {
        index: current.index,
        x: current.x,
        value: current.value,
        kind: "local-extreme",
        priority: keyPointPriority("local-extreme"),
      });
    }
  }

  return chooseKeyPoints(Array.from(candidates.values()), KEY_POINT_LIMITS[metricKey]);
}
