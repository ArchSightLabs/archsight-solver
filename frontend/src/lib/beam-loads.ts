import type { BeamWorkspaceState } from "../types/beam.ts";

export function normalizedBeamRatioRange(startValue: number, endValue: number) {
  let startRatio = Number.isFinite(startValue) ? Math.min(Math.max(startValue, 0), 1) : 0;
  let endRatio = Number.isFinite(endValue) ? Math.min(Math.max(endValue, 0), 1) : 1;
  if (endRatio < startRatio) {
    [startRatio, endRatio] = [endRatio, startRatio];
  }
  if (Math.abs(endRatio - startRatio) < 1e-9) {
    if (endRatio < 1) {
      endRatio = Math.min(1, endRatio + 0.01);
    } else {
      startRatio = Math.max(0, startRatio - 0.01);
    }
  }
  return { startRatio, endRatio };
}

export function activeBeamLinearLoads(value: BeamWorkspaceState): BeamWorkspaceState["linearLoads"] {
  if (!value.linearLoadEnabled) {
    return [];
  }
  if (value.linearLoads.length) {
    return value.linearLoads;
  }
  return [{
    id: "L1",
    qStartKnPerM: value.distributedLoadStart,
    qEndKnPerM: value.distributedLoadEnd,
    startRatio: value.distributedLoadStartRatio,
    endRatio: value.distributedLoadEndRatio,
  }];
}

export function beamLoadTypeAfterPatch(
  value: BeamWorkspaceState,
  patch: Partial<BeamWorkspaceState>
): BeamWorkspaceState["loadType"] {
  const next = { ...value, ...patch };
  const activeTypeCount = (next.uniformLoadEnabled ? 1 : 0) + activeBeamLinearLoads(next).length + next.pointLoads.length;
  if (activeTypeCount === 0) return "none";
  if (activeTypeCount > 1) return "combined";
  if (next.uniformLoadEnabled) return "uniform";
  if (activeBeamLinearLoads(next).length) return "linear";
  return "point";
}

export function formatBeamLoadSummary(value: BeamWorkspaceState) {
  const linearLoads = activeBeamLinearLoads(value);
  const uniformRange = normalizedBeamRatioRange(value.uniformLoadStartRatio, value.uniformLoadEndRatio);
  const uniformRangeLabel = uniformRange.startRatio <= 1e-9 && uniformRange.endRatio >= 1 - 1e-9
    ? "全跨"
    : `${uniformRange.startRatio.toFixed(2)}-${uniformRange.endRatio.toFixed(2)}`;
  const parts = [
    value.uniformLoadEnabled ? `q=${value.q.toFixed(1)} kN/m · ${uniformRangeLabel}` : null,
    linearLoads.length === 1 ? `线性 q=${linearLoads[0].qStartKnPerM.toFixed(1)}→${linearLoads[0].qEndKnPerM.toFixed(1)} kN/m` : null,
    linearLoads.length > 1 ? `线性荷载 ${linearLoads.length} 条` : null,
    value.pointLoads.length ? `集中力 ${value.pointLoads.length} 个` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" + ") : "无荷载";
}
