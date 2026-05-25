import type { CSSProperties } from "react";
import { GlassCard } from "./ui/GlassCard";
import { createPortalFrameModelFromState, type WorkspaceState } from "../lib/workspace-state";
import type { AnalysisMode, FrameLoad, FrameLoadDirection, StructureNode, TrussLoad } from "../types/structure";
import type { WorkbenchSelection } from "../types/workbench-selection";

interface WorkbenchModelCanvasProps {
  workspace: WorkspaceState;
  mode: AnalysisMode;
  compact?: boolean;
  selection?: WorkbenchSelection | null;
  onSelect?: (next: WorkbenchSelection) => void;
}

function buildMetrics(workspace: WorkspaceState, mode: AnalysisMode) {
  if (mode === "beam") {
    const length = workspace.beam.spans.reduce((sum, span) => sum + span.length, 0);
    return [
      { label: "跨段数量", value: `${workspace.beam.spans.length} 跨` },
      { label: "总长度", value: `${length.toFixed(2)} 米` },
      { label: "支座数量", value: `${workspace.beam.supports.length} 个` },
    ];
  }

  if (mode === "frame") {
    const nodeCount = workspace.frame.frameMode === "custom" ? workspace.frame.customNodes.length : 4;
    const memberCount = workspace.frame.frameMode === "custom" ? workspace.frame.customMembers.length : 3;
    const loadCount = workspace.frame.frameMode === "custom" ? workspace.frame.customLoads.length : 2;
    return [
      { label: "节点数量", value: `${nodeCount}` },
      { label: "构件数量", value: `${memberCount}` },
      { label: "荷载数量", value: `${loadCount}` },
    ];
  }

  return [
    { label: "节点数量", value: `${workspace.truss.customNodes.length}` },
    { label: "杆件数量", value: `${workspace.truss.customMembers.length}` },
    { label: "荷载数量", value: `${workspace.truss.customLoads.length}` },
  ];
}

function formatMagnitude(value: number) {
  return Math.abs(value).toFixed(Math.abs(value) >= 10 ? 1 : 2);
}

const svgTextFont = "Inter, Microsoft YaHei, system-ui, sans-serif";
const BEAM_SKETCH_AXIS_Y = 150;
const BEAM_LOAD_BOTTOM_GUIDE_Y = BEAM_SKETCH_AXIS_Y - 38;
const BEAM_LOAD_LANE_GAP_Y = 34;
const BEAM_DISTRIBUTED_LOAD_TIP_Y = BEAM_SKETCH_AXIS_Y - 18;
const BEAM_POINT_LOAD_TIP_Y = BEAM_SKETCH_AXIS_Y - 6;

function clampRatio(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function activeBeamLinearLoads(beam: WorkspaceState["beam"]) {
  if (!beam.linearLoadEnabled) {
    return [];
  }
  if (beam.linearLoads.length) {
    return beam.linearLoads;
  }
  return [{
    id: "L1",
    qStartKnPerM: beam.distributedLoadStart,
    qEndKnPerM: beam.distributedLoadEnd,
    startRatio: beam.distributedLoadStartRatio,
    endRatio: beam.distributedLoadEndRatio,
  }];
}

function buildLinearLoadRange(load: ReturnType<typeof activeBeamLinearLoads>[number], beamStart: number, beamEnd: number) {
  let startRatio = clampRatio(load.startRatio, 0);
  let endRatio = clampRatio(load.endRatio, 1);
  let startLoad = load.qStartKnPerM;
  let endLoad = load.qEndKnPerM;
  if (endRatio < startRatio) {
    [startRatio, endRatio] = [endRatio, startRatio];
    [startLoad, endLoad] = [endLoad, startLoad];
  }
  const startX = beamStart + (beamEnd - beamStart) * startRatio;
  const endX = beamStart + (beamEnd - beamStart) * endRatio;
  return { startRatio, endRatio, startLoad, endLoad, startX, endX };
}

function buildUniformLoadRange(beam: WorkspaceState["beam"], beamStart: number, beamEnd: number) {
  let startRatio = clampRatio(beam.uniformLoadStartRatio, 0);
  let endRatio = clampRatio(beam.uniformLoadEndRatio, 1);
  if (endRatio < startRatio) {
    [startRatio, endRatio] = [endRatio, startRatio];
  }
  if (Math.abs(endRatio - startRatio) < 1e-9) {
    endRatio = Math.min(1, startRatio + 0.01);
    if (Math.abs(endRatio - startRatio) < 1e-9) {
      startRatio = Math.max(0, endRatio - 0.01);
    }
  }
  const startX = beamStart + (beamEnd - beamStart) * startRatio;
  const endX = beamStart + (beamEnd - beamStart) * endRatio;
  return { startRatio, endRatio, startX, endX, load: beam.q };
}

function beamSupportLabel(type: string) {
  if (type === "fixed") return "固结";
  if (type === "roller") return "滚动";
  if (type === "free") return "自由";
  return "铰支";
}

function buildLoadArrowXs(start: number, end: number, minSpacing = 30) {
  const width = end - start;
  if (width <= 0) return [];

  const arrowCount = Math.max(3, Math.min(28, Math.floor(width / minSpacing)));
  return Array.from({ length: arrowCount }, (_, index) => {
    const ratio = (index + 0.5) / arrowCount;
    return start + width * ratio;
  });
}

function shiftAwayFromLabels(x: number, blockedXs: number[], minGap = 34) {
  const closest = blockedXs.reduce<{ x: number; distance: number } | null>((current, blockedX) => {
    const distance = Math.abs(x - blockedX);
    if (!current || distance < current.distance) return { x: blockedX, distance };
    return current;
  }, null);

  if (!closest || closest.distance >= minGap) return x;
  return closest.x + (x >= closest.x ? minGap : -minGap);
}

function buildBeamNodeLabels(nodeXs: number[], pointLoadXs: number[], beamStart: number, beamEnd: number) {
  const centerX = (beamStart + beamEnd) / 2;

  return nodeXs.map((x, index) => {
    const hasPointLoad = pointLoadXs.some((loadX) => Math.abs(loadX - x) < 16);
    if (!hasPointLoad) {
      return { index, x, labelX: x, anchor: "middle" as const };
    }

    if (x <= beamStart + 16) {
      return { index, x, labelX: x + 42, anchor: "start" as const };
    }

    if (x >= beamEnd - 16) {
      return { index, x, labelX: x - 42, anchor: "end" as const };
    }

    const offset = x < centerX ? -42 : 42;
    return {
      index,
      x,
      labelX: x + offset,
      anchor: offset < 0 ? ("end" as const) : ("start" as const),
    };
  });
}

function shiftLoadLabelAwayFromPointLoads(labelX: number, pointLoadXs: number[], minX: number, maxX: number, preferredDirection: -1 | 1) {
  const clampedX = Math.min(maxX, Math.max(minX, labelX));
  if (!pointLoadXs.some((loadX) => Math.abs(loadX - clampedX) < 92)) {
    return clampedX;
  }

  const shiftedX = clampedX + preferredDirection * 132;
  if (shiftedX >= minX && shiftedX <= maxX) {
    return shiftedX;
  }

  return Math.min(maxX, Math.max(minX, clampedX - preferredDirection * 132));
}

function BeamSketch({ beam, selection, onSelect }: { beam: WorkspaceState["beam"]; selection?: WorkbenchSelection | null; onSelect?: (next: WorkbenchSelection) => void }) {
  const total = Math.max(1, beam.spans.reduce((sum, span) => sum + span.length, 0));
  const segments = beam.spans.reduce<Array<{ index: number; length: number; start: number; end: number }>>((items, span, index) => {
    const start = items[index - 1]?.end ?? 96;
    const end = start + (span.length / total) * 708;
    return [...items, { index, length: span.length, start, end }];
  }, []);
  const beamStart = segments[0]?.start ?? 96;
  const beamEnd = segments[segments.length - 1]?.end ?? 804;
  const uniformRange = beam.uniformLoadEnabled ? buildUniformLoadRange(beam, beamStart, beamEnd) : null;
  const linearRanges = activeBeamLinearLoads(beam).map((load) => ({
    load,
    ...buildLinearLoadRange(load, beamStart, beamEnd),
  }));
  const nodeLabelXs = segments.flatMap((segment) => (segment.index === segments.length - 1 ? [segment.start, segment.end] : [segment.start]));
  const pointLoads = beam.pointLoads ?? [];
  const pointLoadXs = pointLoads.map((load) => beamStart + (beamEnd - beamStart) * clampRatio(load.positionRatio, 0.5));
  const nodeLabels = buildBeamNodeLabels(nodeLabelXs, pointLoadXs, beamStart, beamEnd);
  const hasMultipleLinearLoads = linearRanges.length > 1;
  const linearArrows = linearRanges.map((range, rangeIndex) => {
    const arrowCount = hasMultipleLinearLoads
      ? Math.max(2, Math.min(3, Math.round((range.endX - range.startX) / 160) + 1))
      : Math.max(1, Math.min(5, Math.round((range.endX - range.startX) / 56) + 1));
    return Array.from({ length: arrowCount }, (_, index) => {
      const step = arrowCount === 1 ? 0.5 : index / (arrowCount - 1);
      const stagger = hasMultipleLinearLoads ? (rangeIndex % 2 === 0 ? -8 : 8) : 0;
      const rawX = range.startX + (range.endX - range.startX) * step + stagger;
      return Math.min(range.endX - 12, Math.max(range.startX + 12, shiftAwayFromLabels(rawX, nodeLabelXs)));
    });
  });
  const loadArrowClearance = 30;
  const visibleUniformArrows = uniformRange ? buildLoadArrowXs(uniformRange.startX, uniformRange.endX).filter((x) => pointLoadXs.every((loadX) => Math.abs(loadX - x) >= loadArrowClearance)) : [];
  const visibleLinearArrows = linearArrows.map((arrows) => arrows.filter((x) => pointLoadXs.every((loadX) => Math.abs(loadX - x) >= loadArrowClearance)));
  const hasLinearLoads = linearRanges.length > 0;
  const activeLoadFamilyCount = (uniformRange ? 1 : 0) + (hasLinearLoads ? 1 : 0) + (pointLoads.length ? 1 : 0);
  const compactLoadLabels = activeLoadFamilyCount >= 3;
  const loadLaneGapY = compactLoadLabels ? 42 : BEAM_LOAD_LANE_GAP_Y;
  const linearGuideBaseY = BEAM_LOAD_BOTTOM_GUIDE_Y;
  const linearGuideGap = hasMultipleLinearLoads ? -18 : 0;
  const linearTopGuideY = hasLinearLoads ? linearGuideBaseY + (linearRanges.length - 1) * linearGuideGap : linearGuideBaseY;
  const uniformGuideY = uniformRange ? (hasLinearLoads ? linearTopGuideY - loadLaneGapY : BEAM_LOAD_BOTTOM_GUIDE_Y) : BEAM_LOAD_BOTTOM_GUIDE_Y;
  const pointLaneBaseY = pointLoads.length && (uniformRange || hasLinearLoads) ? (uniformRange ? uniformGuideY : linearTopGuideY) - loadLaneGapY : 88;
  const pointLabelBaseY = pointLoads.length && (uniformRange || hasLinearLoads) ? Math.max(compactLoadLabels ? 24 : 34, pointLaneBaseY - 10) : 74;
  const uniformTitleY = uniformGuideY - (compactLoadLabels ? 12 : 18);
  const uniformSubtitleY = uniformGuideY - 4;
  const linearTitleY = linearGuideBaseY - (compactLoadLabels ? 12 : 19);
  const linearSubtitleY = linearGuideBaseY - 5;
  const uniformLabelX = uniformRange
    ? shiftLoadLabelAwayFromPointLoads((uniformRange.startX + uniformRange.endX) / 2, pointLoadXs, beamStart + 118, beamEnd - 118, -1)
    : beamStart;
  const beamSketchStyle: CSSProperties | undefined = (beam.previewStyle ?? "simple") === "color"
    ? ({
        "--beam-sketch-member": "var(--model-member)",
        "--beam-sketch-node": "var(--model-node)",
        "--beam-sketch-support-fill": "var(--model-support-fill)",
        "--beam-sketch-support-stroke": "var(--model-support-stroke)",
        "--beam-sketch-support-line": "var(--model-support-line)",
        "--beam-sketch-load": "var(--model-load)",
        "--beam-sketch-label": "var(--model-label)",
        "--beam-sketch-muted": "var(--model-label)",
        "--beam-sketch-badge-fill": "#fff7ed",
        "--beam-sketch-badge-stroke": "var(--model-load)",
        "--beam-sketch-selected": "var(--model-load)",
      } as CSSProperties)
    : undefined;

  return (
    <svg viewBox="0 0 900 300" className="h-full w-full" style={beamSketchStyle}>
      <line x1={beamStart} y1={BEAM_SKETCH_AXIS_Y} x2={beamEnd} y2={BEAM_SKETCH_AXIS_Y} stroke="var(--beam-sketch-member)" strokeWidth="3.2" strokeLinecap="square" />
      {segments.map((segment) => {
        const selected = selection?.mode === "beam" && selection.type === "span" && selection.id === `span-${segment.index}`;
        return (
          <g key={segment.index} className="cursor-pointer" onClick={() => onSelect?.({ mode: "beam", type: "span", id: `span-${segment.index}` })}>
            <line x1={segment.start} y1={BEAM_SKETCH_AXIS_Y} x2={segment.end} y2={BEAM_SKETCH_AXIS_Y} stroke="transparent" strokeWidth="20" strokeLinecap="round" />
            {selected ? <line x1={segment.start} y1={BEAM_SKETCH_AXIS_Y} x2={segment.end} y2={BEAM_SKETCH_AXIS_Y} stroke="var(--beam-sketch-selected)" strokeWidth="7" strokeLinecap="round" opacity="0.45" /> : null}
            <line x1={segment.start} y1="184" x2={segment.end} y2="184" stroke="var(--model-guide)" strokeWidth="1.5" />
            <text x={(segment.start + segment.end) / 2} y="176" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--beam-sketch-label)" stroke="var(--model-label-halo)" strokeWidth="3" paintOrder="stroke">
              ({segment.index + 1})
            </text>
            <circle cx={segment.start} cy={BEAM_SKETCH_AXIS_Y} r="4.5" fill="var(--beam-sketch-node)" />
            {segment.index === segments.length - 1 ? (
              <>
                <circle cx={segment.end} cy={BEAM_SKETCH_AXIS_Y} r="4.5" fill="var(--beam-sketch-node)" />
              </>
            ) : null}
          </g>
        );
      })}
      {beam.supports.map((support, index) => {
        const x = beamStart + (support.x / total) * (beamEnd - beamStart);
        const selected = selection?.mode === "beam" && selection.type === "support" && selection.id === `support-${index}`;
        return (
          <g key={support.id} className="cursor-pointer" onClick={() => onSelect?.({ mode: "beam", type: "support", id: `support-${index}` })}>
            <rect x={x - 24} y="148" width="48" height="58" rx="12" fill={selected ? "var(--beam-sketch-selected)" : "transparent"} opacity={selected ? "0.1" : "0"} />
            {support.type === "fixed" ? (
              <rect x={x - 12} y={BEAM_SKETCH_AXIS_Y} width="24" height="36" rx="2" fill="var(--beam-sketch-support-fill)" stroke="var(--beam-sketch-support-stroke)" strokeWidth="1.4" />
            ) : support.type === "free" ? (
              <circle cx={x} cy={BEAM_SKETCH_AXIS_Y} r="9" fill="none" stroke="var(--beam-sketch-support-stroke)" strokeWidth="1.6" strokeDasharray="3 3" />
            ) : (
              <>
                <polygon points={`${x - 15},180 ${x + 15},180 ${x},154`} fill="var(--beam-sketch-support-fill)" stroke="var(--beam-sketch-support-stroke)" strokeWidth="1.4" />
                <line x1={x - 18} y1="184" x2={x + 18} y2="184" stroke="var(--beam-sketch-support-line)" strokeWidth="2.2" />
                {support.type === "roller" ? (
                  <>
                    <circle cx={x - 8} cy="190" r="3" fill="none" stroke="var(--beam-sketch-support-stroke)" strokeWidth="1.4" />
                    <circle cx={x + 8} cy="190" r="3" fill="none" stroke="var(--beam-sketch-support-stroke)" strokeWidth="1.4" />
                  </>
                ) : null}
              </>
            )}
            <text x={x} y="224" textAnchor="middle" fontSize="11" fontWeight="700" fill={selected ? "var(--beam-sketch-selected)" : "var(--beam-sketch-label)"}>
              {support.id} · {beamSupportLabel(support.type)}
            </text>
          </g>
        );
      })}
      <g className="cursor-pointer" onClick={() => onSelect?.({ mode: "beam", type: "load", id: "primary" })}>
        <rect x={beamStart - 20} y="24" width={beamEnd - beamStart + 40} height="125" fill="transparent" />
        {selection?.mode === "beam" && selection.type === "load" ? <rect x={beamStart - 16} y="28" width={beamEnd - beamStart + 32} height="118" rx="14" fill="var(--beam-sketch-selected)" opacity="0.07" /> : null}
        {uniformRange ? (
          <g>
            <line x1={uniformRange.startX} y1={uniformGuideY} x2={uniformRange.endX} y2={uniformGuideY} stroke="var(--beam-sketch-load)" strokeWidth="1.5" opacity="0.9" />
          </g>
        ) : null}
        {linearRanges.length === 1 ? linearRanges.map((range) => {
          const guideY = linearGuideBaseY;
          return (
            <g key={range.load.id}>
              <line x1={range.startX} y1={guideY} x2={range.endX} y2={guideY} stroke="var(--beam-sketch-load)" strokeWidth="1.4" strokeDasharray="5 5" opacity="0.72" />
            </g>
          );
        }) : (
          <g fontFamily={svgTextFont}>
            {linearRanges.map((range, index) => {
              const guideY = linearGuideBaseY + index * linearGuideGap;
              return (
                <g key={range.load.id}>
                  <line x1={range.startX} y1={guideY} x2={range.endX} y2={guideY} stroke="var(--beam-sketch-load)" strokeWidth="1.4" strokeDasharray="5 5" opacity="0.72" />
                </g>
              );
            })}
          </g>
        )}
      </g>
      <g stroke="var(--beam-sketch-load)" strokeWidth={selection?.mode === "beam" && selection.type === "load" ? "2.8" : "1.9"} className="cursor-pointer" onClick={() => onSelect?.({ mode: "beam", type: "load", id: "primary" })}>
        {beam.uniformLoadEnabled ? visibleUniformArrows.map((x, index) => (
          <path key={`uniform-${index}`} d={`M${x.toFixed(1)} ${(uniformGuideY + 4).toFixed(1)} L${x.toFixed(1)} ${BEAM_DISTRIBUTED_LOAD_TIP_Y}`} markerEnd="url(#modelArrow)" />
        )) : null}
        {visibleLinearArrows.flatMap((arrows, loadIndex) => {
          const guideY = linearGuideBaseY + loadIndex * linearGuideGap;
          const arrowEndY = BEAM_DISTRIBUTED_LOAD_TIP_Y;
          return arrows.map((x, arrowIndex) => {
            const top = guideY + 4 + (linearRanges.length === 1 ? arrowIndex * 2 : 0);
            return <path key={`linear-${loadIndex}-${arrowIndex}`} d={`M${x.toFixed(1)} ${top} L${x.toFixed(1)} ${arrowEndY}`} markerEnd="url(#modelArrow)" />;
          });
        })}
        {pointLoads.map((load, index) => {
          const x = beamStart + (beamEnd - beamStart) * clampRatio(load.positionRatio, 0.5);
          const labelY = pointLabelBaseY + (index % 2) * 16;
          const arrowStartY = Math.min(labelY + 12, BEAM_POINT_LOAD_TIP_Y - 20);
          return (
            <g key={load.id}>
              <path d={`M${x.toFixed(1)} ${arrowStartY} L${x.toFixed(1)} ${BEAM_POINT_LOAD_TIP_Y}`} markerEnd="url(#modelArrow)" />
            </g>
          );
        })}
      </g>
      <g className="cursor-pointer" onClick={() => onSelect?.({ mode: "beam", type: "load", id: "primary" })} fontFamily={svgTextFont}>
        {uniformRange ? (
          <g>
            <text x={uniformLabelX} y={uniformTitleY} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--beam-sketch-load)" stroke="var(--model-label-halo)" strokeWidth="3" paintOrder="stroke">
              q={formatMagnitude(beam.q)} kN/m
            </text>
            {!compactLoadLabels ? (
              <text x={uniformLabelX} y={uniformSubtitleY} textAnchor="middle" fontSize="10.5" fill="var(--beam-sketch-muted)" stroke="var(--model-label-halo)" strokeWidth="3" paintOrder="stroke">
                作用区间 {uniformRange.startRatio.toFixed(2)}-{uniformRange.endRatio.toFixed(2)}，长度 {(total * (uniformRange.endRatio - uniformRange.startRatio)).toFixed(2)} 米
              </text>
            ) : null}
          </g>
        ) : null}
        {linearRanges.length === 1 ? linearRanges.map((range) => {
          const linearLengthM = total * (range.endRatio - range.startRatio);
          const labelX = shiftLoadLabelAwayFromPointLoads((range.startX + range.endX) / 2, pointLoadXs, beamStart + 150, beamEnd - 150, uniformRange ? 1 : -1);
          return (
            <g key={`linear-label-${range.load.id}`}>
              <text x={labelX} y={linearTitleY} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--beam-sketch-load)" stroke="var(--model-label-halo)" strokeWidth="3" paintOrder="stroke">
                q={formatMagnitude(range.startLoad)}→{formatMagnitude(range.endLoad)} kN/m
              </text>
              {!compactLoadLabels ? (
                <text x={labelX} y={linearSubtitleY} textAnchor="middle" fontSize="11" fill="var(--beam-sketch-muted)" stroke="var(--model-label-halo)" strokeWidth="3" paintOrder="stroke">
                  作用区间 {range.startRatio.toFixed(2)}-{range.endRatio.toFixed(2)}，长度 {linearLengthM.toFixed(2)} 米
                </text>
              ) : null}
            </g>
          );
        }) : linearRanges.map((range, index) => {
          const linearLengthM = total * (range.endRatio - range.startRatio);
          const guideY = linearGuideBaseY + index * linearGuideGap;
          const y = guideY - 4;
          return (
            <g key={`linear-label-${range.load.id}`}>
              <line x1={beamStart + 4} y1={y - 4} x2={beamStart + 32} y2={y - 4} stroke="var(--beam-sketch-load)" strokeWidth="1.5" strokeDasharray="5 5" />
              <text x={beamStart + 40} y={y} textAnchor="start" fontSize="11.5" fontWeight="700" fill="var(--beam-sketch-load)" stroke="var(--model-label-halo)" strokeWidth="3" paintOrder="stroke">
                {range.load.id}: {formatMagnitude(range.startLoad)} → {formatMagnitude(range.endLoad)} kN/m
              </text>
              <text x={beamStart + 190} y={y} textAnchor="start" fontSize="10.5" fill="var(--beam-sketch-muted)" stroke="var(--model-label-halo)" strokeWidth="3" paintOrder="stroke">
                区间 {range.startRatio.toFixed(2)}-{range.endRatio.toFixed(2)} / {linearLengthM.toFixed(2)}m
              </text>
            </g>
          );
        })}
        {pointLoads.map((load, index) => {
          const x = beamStart + (beamEnd - beamStart) * clampRatio(load.positionRatio, 0.5);
          const labelY = pointLabelBaseY + (index % 2) * 16;
          const labelX = Math.min(beamEnd - 64, Math.max(beamStart + 64, x));
          return (
            <text key={`point-label-${load.id}`} x={labelX} y={labelY} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="var(--beam-sketch-load)" stroke="var(--model-label-halo)" strokeWidth="3" paintOrder="stroke">
              {load.id}={formatMagnitude(load.magnitudeKn)} kN
            </text>
          );
        })}
      </g>
      <g fontFamily={svgTextFont}>
        {nodeLabels.map((label) => (
          <g key={`node-label-${label.index}`}>
            <circle cx={label.labelX} cy="132" r="8" fill="var(--beam-sketch-badge-fill)" stroke="var(--beam-sketch-badge-stroke)" strokeWidth="1.4" />
            <text x={label.labelX} y="136" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--beam-sketch-label)">
              {label.index + 1}
            </text>
          </g>
        ))}
      </g>
      <defs>
        <marker id="modelArrow" viewBox="0 0 8 8" markerWidth="6.5" markerHeight="6.5" refX="7" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8z" fill="var(--beam-sketch-load)" />
        </marker>
      </defs>
    </svg>
  );
}

function getFrameLoadValue(load: Extract<FrameLoad, { type: "distributed" }>) {
  const start = Number.isFinite(load.qStartKnPerM) ? Number(load.qStartKnPerM) : Number(load.wyKnPerM ?? 0);
  const end = Number.isFinite(load.qEndKnPerM) ? Number(load.qEndKnPerM) : start;
  return (start + end) / 2;
}

function getFrameDistributedLoadRange(load: Extract<FrameLoad, { type: "distributed" }>) {
  let startRatio = clampRatio(load.startRatio ?? 0, 0);
  let endRatio = clampRatio(load.endRatio ?? 1, 1);
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

function frameMemberPoint(
  startNode: { x: number; y: number },
  endNode: { x: number; y: number },
  ratio: number,
) {
  const positionRatio = clampRatio(ratio, 0.5);
  return {
    x: startNode.x + (endNode.x - startNode.x) * positionRatio,
    y: startNode.y + (endNode.y - startNode.y) * positionRatio,
  };
}

function frameMemberLoadDirection(
  startNode: { x: number; y: number },
  endNode: { x: number; y: number },
  direction: FrameLoadDirection | undefined,
  value: number,
) {
  const dx = endNode.x - startNode.x;
  const dy = endNode.y - startNode.y;
  const length = Math.hypot(dx, dy) || 1;
  const localY = { x: dy / length, y: -dx / length };
  const positiveDirection = direction === "global_y" ? { x: 0, y: -1 } : localY;
  return value >= 0 ? positiveDirection : { x: -positiveDirection.x, y: -positiveDirection.y };
}

function FrameSketch({ workspace, selection, onSelect }: { workspace: WorkspaceState; selection?: WorkbenchSelection | null; onSelect?: (next: WorkbenchSelection) => void }) {
  const model =
    workspace.frame.frameMode === "custom"
      ? {
          nodes: workspace.frame.customNodes,
          members: workspace.frame.customMembers,
          loads: workspace.frame.customLoads,
        }
      : createPortalFrameModelFromState(workspace.frame);
  const nodes = model.nodes;
  const members = model.members;
  const loads = model.loads;
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const map = (point: Pick<StructureNode, "x" | "y">) => ({
    x: 165 + ((point.x - minX) / Math.max(1, maxX - minX)) * 570,
    y: 285 - ((point.y - minY) / Math.max(1, maxY - minY)) * 195,
  });
  const nodeMap = new Map(nodes.map((node) => [node.id, map(node)]));
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const span = maxX - minX;
  const height = maxY - minY;
  const topY = Math.min(...nodes.map((node) => map(node).y), 90);
  const bottomY = Math.max(...nodes.map((node) => map(node).y), 285);
  const leftX = Math.min(...nodes.map((node) => map(node).x), 165);
  const rightX = Math.max(...nodes.map((node) => map(node).x), 735);
  const nodeLabel = (node: StructureNode) => {
    const point = nodeMap.get(node.id);
    if (!point) return null;
    const isLeft = point.x < (leftX + rightX) / 2;
    const isTop = point.y < (topY + bottomY) / 2;
    return {
      x: point.x + (isLeft ? -16 : 16),
      y: point.y + (isTop ? -10 : 20),
      anchor: isLeft ? ("end" as const) : ("start" as const),
    };
  };

  return (
    <svg viewBox="0 0 900 360" className="h-full w-full">
      <g stroke="var(--model-member)" strokeLinecap="round" strokeLinejoin="round">
        {members.map((member) => {
          const start = nodeMap.get(member.start);
          const end = nodeMap.get(member.end);
          if (!start || !end) return null;
          const selected = selection?.mode === "frame" && selection.type === "member" && selection.id === member.id;
          return (
            <g key={member.id} className="cursor-pointer" onClick={() => onSelect?.({ mode: "frame", type: "member", id: member.id })}>
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth="18" />
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} strokeWidth={selected ? "7" : "4.5"} stroke={selected ? "var(--model-load)" : "var(--model-member)"} opacity={selected ? "0.85" : "1"} />
            </g>
          );
        })}
      </g>
      <g fill="var(--model-node)">
        {nodes.map((node) => {
          const point = nodeMap.get(node.id);
          const selected = selection?.mode === "frame" && selection.type === "node" && selection.id === node.id;
          return point ? (
            <g key={node.id} className="cursor-pointer" onClick={() => onSelect?.({ mode: "frame", type: "node", id: node.id })}>
              <circle cx={point.x} cy={point.y} r={selected ? "11" : "8"} fill="transparent" />
              <circle cx={point.x} cy={point.y} r={selected ? "7.5" : "5.5"} fill={selected ? "var(--model-load)" : "var(--model-node)"} />
            </g>
          ) : null;
        })}
      </g>
      <g stroke="var(--model-load)" strokeWidth="2">
        {loads.flatMap((load, index) => {
          if (load.type === "nodal") {
            const point = nodeMap.get(load.node);
            if (!point) return [];
            const items = [];
            if (load.fxKn) {
              const sign = load.fxKn >= 0 ? 1 : -1;
              const x1 = point.x - sign * 48;
              const x2 = point.x - sign * 11;
              items.push(<path key={`${index}-fx`} className="cursor-pointer" onClick={() => onSelect?.({ mode: "frame", type: "load", id: `load-${index}` })} d={`M${x1} ${point.y} L${x2} ${point.y}`} markerEnd="url(#frameArrow)" strokeWidth={selection?.mode === "frame" && selection.type === "load" && selection.id === `load-${index}` ? "3.2" : "2"} />);
            }
            if (load.fyKn) {
              const sign = load.fyKn >= 0 ? -1 : 1;
              const y1 = point.y - sign * 54;
              const y2 = point.y - sign * 12;
              items.push(<path key={`${index}-fy`} className="cursor-pointer" onClick={() => onSelect?.({ mode: "frame", type: "load", id: `load-${index}` })} d={`M${point.x} ${y1} L${point.x} ${y2}`} markerEnd="url(#frameArrow)" strokeWidth={selection?.mode === "frame" && selection.type === "load" && selection.id === `load-${index}` ? "3.2" : "2"} />);
            }
            return items;
          }

          const member = memberMap.get(load.member);
          const startNode = member ? nodeMap.get(member.start) : null;
          const endNode = member ? nodeMap.get(member.end) : null;
          if (!startNode || !endNode) return [];
          if (load.type === "member_point") {
            const force = load.forceKn ?? 0;
            if (!force) return [];
            const point = frameMemberPoint(startNode, endNode, load.positionRatio ?? 0.5);
            const direction = frameMemberLoadDirection(startNode, endNode, load.direction, force);
            return [
              <path
                key={`${index}-member-point`}
                className="cursor-pointer"
                onClick={() => onSelect?.({ mode: "frame", type: "load", id: `load-${index}` })}
                d={`M${point.x - direction.x * 54} ${point.y - direction.y * 54} L${point.x - direction.x * 10} ${point.y - direction.y * 10}`}
                markerEnd="url(#frameArrow)"
                strokeWidth={selection?.mode === "frame" && selection.type === "load" && selection.id === `load-${index}` ? "3.2" : "2"}
              />,
            ];
          }
          const q = getFrameLoadValue(load);
          if (!q) return [];
          const { startRatio, endRatio, qStart, qEnd } = getFrameDistributedLoadRange(load);
          const representative = Math.abs(qStart) >= Math.abs(qEnd) ? qStart : qEnd;
          const guideDirection = frameMemberLoadDirection(startNode, endNode, load.direction, representative || q);
          const selectedStroke = selection?.mode === "frame" && selection.type === "load" && selection.id === `load-${index}` ? "3.2" : "2";
          const guideOffset = 45;
          const guideStart = frameMemberPoint(startNode, endNode, startRatio);
          const guideEnd = frameMemberPoint(startNode, endNode, endRatio);
          const maxQ = Math.max(Math.abs(qStart), Math.abs(qEnd), 1e-9);
          const arrowCount = Math.max(5, Math.min(12, Math.round((endRatio - startRatio) * 12)));
          const items = [
            <line
              key={`${index}-dist-guide`}
              className="cursor-pointer"
              onClick={() => onSelect?.({ mode: "frame", type: "load", id: `load-${index}` })}
              x1={guideStart.x - guideDirection.x * guideOffset}
              y1={guideStart.y - guideDirection.y * guideOffset}
              x2={guideEnd.x - guideDirection.x * guideOffset}
              y2={guideEnd.y - guideDirection.y * guideOffset}
              strokeWidth="1.5"
              strokeDasharray="5 4"
              opacity="0.85"
            />,
          ];
          for (let arrowIndex = 0; arrowIndex < arrowCount; arrowIndex += 1) {
            const ratio = startRatio + (endRatio - startRatio) * (arrowIndex + 0.5) / arrowCount;
            const loadRatio = (ratio - startRatio) / Math.max(endRatio - startRatio, 1e-9);
            const qAtRatio = qStart + (qEnd - qStart) * loadRatio;
            if (Math.abs(qAtRatio) <= 1e-9) continue;
            const direction = frameMemberLoadDirection(startNode, endNode, load.direction, qAtRatio);
            const x = startNode.x + (endNode.x - startNode.x) * ratio;
            const y = startNode.y + (endNode.y - startNode.y) * ratio;
            const arrowLength = 30 + 14 * Math.abs(qAtRatio) / maxQ;
            items.push(
              <path
                key={`${index}-dist-${arrowIndex}`}
                className="cursor-pointer"
                onClick={() => onSelect?.({ mode: "frame", type: "load", id: `load-${index}` })}
                d={`M${x - direction.x * arrowLength} ${y - direction.y * arrowLength} L${x - direction.x * 9} ${y - direction.y * 9}`}
                markerEnd="url(#frameArrow)"
                strokeWidth={selectedStroke}
              />
            );
          }
          return items;
        })}
      </g>
      <g fill="var(--model-label)" fontSize="13" fontWeight="400">
        {span > 0 ? <text x={(leftX + rightX) / 2} y={topY + 36} textAnchor="middle">跨长 {span} 米</text> : null}
        {height > 0 ? <text x={leftX - 36} y={(topY + bottomY) / 2} textAnchor="middle">层高 {height} 米</text> : null}
      </g>
      <g fill="var(--model-label)" fontSize="11.5" fontWeight="600" fontFamily={svgTextFont}>
        {nodes.map((node) => {
          const label = nodeLabel(node);
          return label ? (
            <text key={node.id} x={label.x} y={label.y} textAnchor={label.anchor}>
              节点 {node.id}
            </text>
          ) : null;
        })}
      </g>
      <g fill="var(--model-load)" fontSize="10.5" fontWeight="600" fontFamily={svgTextFont}>
        {loads.map((load, index) => {
          if (load.type === "nodal") {
            const point = nodeMap.get(load.node);
            if (!point) return null;
            const labels = [];
            if (load.fxKn) {
              const sign = load.fxKn >= 0 ? 1 : -1;
              labels.push(
                <text key={`${index}-fx-label`} x={point.x + sign * 18} y={point.y - 14} textAnchor={sign > 0 ? "start" : "end"}>
                  X向力 {formatMagnitude(load.fxKn)} 千牛
                </text>
              );
            }
            if (load.fyKn) {
              const sign = load.fyKn >= 0 ? -1 : 1;
              const labelY = point.y - sign * 70;
              labels.push(
                <text key={`${index}-fy-label`} x={point.x} y={labelY} textAnchor="middle">
                  Y向力 {formatMagnitude(load.fyKn)} 千牛
                </text>
              );
            }
            return labels;
          }
          const member = memberMap.get(load.member);
          const startNode = member ? nodeMap.get(member.start) : null;
          const endNode = member ? nodeMap.get(member.end) : null;
          if (!startNode || !endNode) return null;
          if (load.type === "member_point") {
            const force = load.forceKn ?? 0;
            if (!force) return null;
            const point = frameMemberPoint(startNode, endNode, load.positionRatio ?? 0.5);
            const direction = frameMemberLoadDirection(startNode, endNode, load.direction, force);
            const label = {
              x: point.x - direction.x * 70,
              y: point.y - direction.y * 70,
            };
            return (
              <text key={`${index}-member-point-label`} x={label.x} y={label.y} textAnchor="middle">
                构件集中荷载 {formatMagnitude(force)} 千牛
              </text>
            );
          }
          const q = getFrameLoadValue(load);
          if (!q) return null;
          const { startRatio, endRatio, qStart, qEnd } = getFrameDistributedLoadRange(load);
          const representative = Math.abs(qStart) >= Math.abs(qEnd) ? qStart : qEnd;
          const direction = frameMemberLoadDirection(startNode, endNode, load.direction, representative || q);
          const memberMid = frameMemberPoint(startNode, endNode, (startRatio + endRatio) / 2);
          const arrowTail = {
            x: memberMid.x - direction.x * 42,
            y: memberMid.y - direction.y * 42,
          };
          const label = {
            x: arrowTail.x - direction.x * 14,
            y: arrowTail.y - direction.y * 14,
          };
          return (
            <text key={`${index}-dist-label`} x={label.x} y={label.y} textAnchor="middle">
              {Math.abs(qStart - qEnd) < 1e-9 ? "梁面均布荷载" : "梁面线性分布荷载"} {formatMagnitude(q)} 千牛/米
            </text>
          );
        })}
      </g>
      <defs>
        <marker id="frameArrow" viewBox="0 0 8 8" markerWidth="6.5" markerHeight="6.5" refX="7" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8z" fill="var(--model-load)" />
        </marker>
      </defs>
    </svg>
  );
}

type TrussMemberLoad = Extract<TrussLoad, { type: "distributed" | "member_load" | "member" }>;

function formatSignedMagnitude(value: number) {
  const magnitude = formatMagnitude(value);
  if (Math.abs(value) < 1e-9) return magnitude;
  return value < 0 ? `-${magnitude}` : magnitude;
}

function trussMemberLabelPlacement(start: { x: number; y: number }, end: { x: number; y: number }, center: { x: number; y: number }) {
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / length, y: dx / length };
  const outward = (midX - center.x) * normal.x + (midY - center.y) * normal.y >= 0 ? 1 : -1;
  let angle = Math.atan2(dy, dx) * 180 / Math.PI;
  if (angle > 90 || angle < -90) angle += 180;
  return {
    x: midX + normal.x * outward * 16,
    y: midY + normal.y * outward * 16,
    angle,
  };
}

function trussMemberLoadValues(load: TrussMemberLoad) {
  const selfWeight = Number(load.selfWeightKnPerM);
  if (Number.isFinite(selfWeight)) {
    const q = -Math.abs(selfWeight);
    return { qStart: q, qEnd: q };
  }
  const fallback = Number(load.wyKnPerM);
  const qStart = Number(load.qStartKnPerM);
  const qEnd = Number(load.qEndKnPerM);
  return {
    qStart: Number.isFinite(qStart) ? qStart : Number.isFinite(fallback) ? fallback : 0,
    qEnd: Number.isFinite(qEnd) ? qEnd : Number.isFinite(qStart) ? qStart : Number.isFinite(fallback) ? fallback : 0,
  };
}

function trussLoadDirection(direction: TrussMemberLoad["direction"], value: number) {
  if (direction === "global_x") {
    return value >= 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  }
  return value >= 0 ? { x: 0, y: -1 } : { x: 0, y: 1 };
}

function trussEquivalentNodalForces(qStart: number, qEnd: number, memberLength: number) {
  return {
    startForce: memberLength * (2 * qStart + qEnd) / 6,
    endForce: memberLength * (qStart + 2 * qEnd) / 6,
  };
}

function trussOffsetSegment(start: { x: number; y: number }, end: { x: number; y: number }, center: { x: number; y: number }, offset: number) {
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / length, y: dx / length };
  const outward = (midX - center.x) * normal.x + (midY - center.y) * normal.y >= 0 ? 1 : -1;
  const offsetX = normal.x * outward * offset;
  const offsetY = normal.y * outward * offset;
  return {
    start: { x: start.x + offsetX, y: start.y + offsetY },
    end: { x: end.x + offsetX, y: end.y + offsetY },
  };
}

function pointOnSegment(start: { x: number; y: number }, end: { x: number; y: number }, ratio: number) {
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
  };
}

function TrussSketch({ workspace, selection, onSelect }: { workspace: WorkspaceState; selection?: WorkbenchSelection | null; onSelect?: (next: WorkbenchSelection) => void }) {
  const nodes = workspace.truss.customNodes;
  const members = workspace.truss.customMembers;
  const loads = workspace.truss.customLoads;
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const map = (point: { x: number; y: number }) => ({
    x: 110 + ((point.x - minX) / Math.max(1, maxX - minX)) * 680,
    y: 280 - ((point.y - minY) / Math.max(1, maxY - minY)) * 190,
  });
  const nodeMap = new Map(nodes.map((node) => [node.id, map(node)]));
  const rawNodeMap = new Map(nodes.map((node) => [node.id, node]));
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const trussCenterX = 110 + 680 / 2;
  const trussMidY = 280 - 190 / 2;

  const getNodeLabel = (point: { x: number; y: number }) => {
    const isTopChord = point.y < trussMidY;
    const isLeftSide = point.x < trussCenterX;
    if (isTopChord) {
      return {
        x: point.x + (isLeftSide ? -18 : 18),
        y: point.y - 12,
        anchor: isLeftSide ? ("end" as const) : ("start" as const),
      };
    }

    return {
      x: point.x + (isLeftSide ? 14 : 18),
      y: point.y + 18,
      anchor: "start" as const,
    };
  };

  return (
    <svg viewBox="0 0 900 360" className="h-full w-full">
      {members.map((member) => {
        const start = nodeMap.get(member.start);
        const end = nodeMap.get(member.end);
        if (!start || !end) return null;
        const selected = selection?.mode === "truss" && selection.type === "member" && selection.id === member.id;
        const label = trussMemberLabelPlacement(start, end, { x: trussCenterX, y: trussMidY });
        return (
          <g key={member.id} className="cursor-pointer" onClick={() => onSelect?.({ mode: "truss", type: "member", id: member.id })}>
            <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth="18" strokeLinecap="round" />
            <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={selected ? "var(--model-load)" : "var(--model-member)"} strokeWidth={selected ? "7" : "4.5"} strokeLinecap="round" opacity={selected ? "0.85" : "1"} />
            <text
              x={label.x}
              y={label.y}
              transform={`rotate(${label.angle} ${label.x} ${label.y})`}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={selected ? "var(--model-load)" : "var(--model-label)"}
              stroke="var(--model-label-halo)"
              strokeWidth="4"
              paintOrder="stroke"
              fontSize="10.5"
              fontWeight="700"
              fontFamily={svgTextFont}
            >
              {member.id}
            </text>
          </g>
        );
      })}
      {nodes.map((node) => {
        const point = nodeMap.get(node.id);
        if (!point) return null;
        const label = getNodeLabel(point);
        return (
          <g key={node.id} className="cursor-pointer" onClick={() => onSelect?.({ mode: "truss", type: "node", id: node.id })}>
            <circle cx={point.x} cy={point.y} r={selection?.mode === "truss" && selection.type === "node" && selection.id === node.id ? "7.5" : "5.5"} fill={selection?.mode === "truss" && selection.type === "node" && selection.id === node.id ? "var(--model-load)" : "var(--model-node)"} />
            <text x={label.x} y={label.y} textAnchor={label.anchor} fill="var(--model-label)" fontSize="10.5" fontWeight="400">
              {node.id}
            </text>
          </g>
        );
      })}
      <g stroke="var(--model-load)" strokeWidth="1.9">
        {loads.flatMap((load, index) => {
          if (load.type !== "nodal") {
            const member = memberMap.get(load.member);
            const start = member ? nodeMap.get(member.start) : null;
            const end = member ? nodeMap.get(member.end) : null;
            const rawStart = member ? rawNodeMap.get(member.start) : null;
            const rawEnd = member ? rawNodeMap.get(member.end) : null;
            if (!start || !end || !rawStart || !rawEnd) return [];
            const { qStart, qEnd } = trussMemberLoadValues(load);
            const maxQ = Math.max(Math.abs(qStart), Math.abs(qEnd));
            if (maxQ <= 1e-9) return [];
            const memberLength = Math.hypot(rawEnd.x - rawStart.x, rawEnd.y - rawStart.y);
            const { startForce, endForce } = trussEquivalentNodalForces(qStart, qEnd, memberLength);
            const maxForce = Math.max(Math.abs(startForce), Math.abs(endForce), 1e-9);
            const guide = trussOffsetSegment(start, end, { x: trussCenterX, y: trussMidY }, 18);
            const selected = selection?.mode === "truss" && selection.type === "load" && selection.id === `load-${index}`;
            const labelMid = pointOnSegment(guide.start, guide.end, 0.5);
            const equivalentArrows = [
              { key: "start", force: startForce, anchor: pointOnSegment(start, end, 0.08) },
              { key: "end", force: endForce, anchor: pointOnSegment(start, end, 0.92) },
            ];
            const items = [
              <g key={`${index}-member-load`} className="cursor-pointer" onClick={() => onSelect?.({ mode: "truss", type: "load", id: `load-${index}` })}>
                <line x1={guide.start.x} y1={guide.start.y} x2={guide.end.x} y2={guide.end.y} strokeWidth={selected ? "2.8" : "1.6"} strokeDasharray="5 4" opacity="0.85" />
                {equivalentArrows.map((arrow) => {
                  if (Math.abs(arrow.force) <= 1e-9) return null;
                  const direction = trussLoadDirection(load.direction, arrow.force);
                  const arrowLength = 30 + 16 * Math.abs(arrow.force) / maxForce;
                  return (
                    <path
                      key={arrow.key}
                      d={`M${arrow.anchor.x - direction.x * arrowLength} ${arrow.anchor.y - direction.y * arrowLength} L${arrow.anchor.x - direction.x * 8} ${arrow.anchor.y - direction.y * 8}`}
                      markerEnd="url(#trussArrow)"
                      strokeWidth={selected ? "3.2" : "1.9"}
                    />
                  );
                })}
                <text
                  x={labelMid.x}
                  y={labelMid.y - 8}
                  textAnchor="middle"
                  fill="var(--model-load)"
                  stroke="var(--model-load-halo)"
                  strokeWidth="3"
                  paintOrder="stroke"
                  fontSize="11"
                  fontWeight="700"
                  fontFamily={svgTextFont}
                >
                  杆件等效荷载 {formatSignedMagnitude(qStart)}{Math.abs(qStart - qEnd) > 1e-9 ? `→${formatSignedMagnitude(qEnd)}` : ""} kN/m
                </text>
              </g>,
            ];
            return items;
          }
          const point = nodeMap.get(load.node);
          if (!point) return [];
          const items = [];
          if (load.fxKn) {
            const sign = load.fxKn >= 0 ? 1 : -1;
            const x1 = point.x - sign * 48;
            const x2 = point.x - sign * 10;
            items.push(
              <g key={`${index}-fx`} className="cursor-pointer" onClick={() => onSelect?.({ mode: "truss", type: "load", id: `load-${index}` })}>
                <path d={`M${x1} ${point.y} L${x2} ${point.y}`} markerEnd="url(#trussArrow)" strokeWidth={selection?.mode === "truss" && selection.type === "load" && selection.id === `load-${index}` ? "3.2" : "1.9"} />
                <text
                  x={x1}
                  y={point.y - 13}
                  textAnchor={sign > 0 ? "end" : "start"}
                  fill="var(--model-load)"
                  stroke="var(--model-load-halo)"
                  strokeWidth="3"
                  paintOrder="stroke"
                  fontSize="11.5"
                  fontWeight="600"
                  fontFamily={svgTextFont}
                >
                  水平荷载 {formatMagnitude(load.fxKn)} 千牛
                </text>
              </g>
            );
          }
          if (load.fyKn) {
            const sign = load.fyKn >= 0 ? -1 : 1;
            const y1 = point.y - sign * 54;
            const y2 = point.y - sign * 12;
            items.push(
              <g key={`${index}-fy`} className="cursor-pointer" onClick={() => onSelect?.({ mode: "truss", type: "load", id: `load-${index}` })}>
                <path d={`M${point.x} ${y1} L${point.x} ${y2}`} markerEnd="url(#trussArrow)" strokeWidth={selection?.mode === "truss" && selection.type === "load" && selection.id === `load-${index}` ? "3.2" : "1.9"} />
                <text
                  x={point.x}
                  y={y1 + (sign > 0 ? -12 : 20)}
                  textAnchor="middle"
                  fill="var(--model-load)"
                  stroke="var(--model-load-halo)"
                  strokeWidth="3"
                  paintOrder="stroke"
                  fontSize="11.5"
                  fontWeight="600"
                  fontFamily={svgTextFont}
                >
                  竖向荷载 {formatMagnitude(load.fyKn)} 千牛
                </text>
              </g>
            );
          }
          return items;
        })}
      </g>
      <defs>
        <marker id="trussArrow" viewBox="0 0 8 8" markerWidth="6.5" markerHeight="6.5" refX="7" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8z" fill="var(--model-load)" />
        </marker>
      </defs>
    </svg>
  );
}

export function WorkbenchModelCanvas({ workspace, mode, compact = false, selection, onSelect }: WorkbenchModelCanvasProps) {
  const metrics = buildMetrics(workspace, mode);
  return (
    <GlassCard className="overflow-hidden">
      <div className={`model-canvas-surface relative flex items-center justify-center px-4 py-5 ${compact ? "h-[260px]" : "h-[360px]"}`}>
        <div className="model-canvas-board h-full w-full">
          {mode === "beam" ? (
            <BeamSketch beam={workspace.beam} selection={selection} onSelect={onSelect} />
          ) : mode === "frame" ? (
            <FrameSketch workspace={workspace} selection={selection} onSelect={onSelect} />
          ) : (
            <TrussSketch workspace={workspace} selection={selection} onSelect={onSelect} />
          )}
        </div>
      </div>
      <div className="grid gap-px border-t border-slate-200/70 bg-slate-200/70 dark:border-slate-700/70 dark:bg-slate-700/70 sm:grid-cols-3">
        {metrics.map((item) => (
          <div key={item.label} className="bg-white/[0.82] px-4 py-3 sm:px-5 sm:py-4 dark:bg-slate-900/[0.62]">
            <div className="eyebrow mb-1 text-slate-500 dark:text-slate-400">{item.label}</div>
            <div className="font-mono text-sm font-bold text-slate-950 dark:text-slate-100">{item.value}</div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
