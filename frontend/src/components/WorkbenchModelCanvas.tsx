import { useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type SVGProps } from "react";
import { Minus, Plus, RotateCcw, ZoomIn } from "lucide-react";
import { GlassCard } from "./ui/GlassCard";
import { Button } from "./ui/button";
import { createPortalFrameModelFromState, type WorkspaceState } from "../lib/workspace-state";
import { buildBeamSpanDimensionLegendRows, buildBeamSpanDimensionSegments, formatBeamDimensionLength } from "../lib/beam-span-dimensions";
import { buildFrameDimensionLegendRows, buildFrameLoadLabelMap, formatFrameDistributedLoadLabel, formatFrameForceLoadLabel, frameMemberDimensionValueLabel, type FrameGeometryDimension } from "./frame-preview-utils";
import { buildTrussMemberLengthDimension, buildTrussMemberLengthLegendRows, buildTrussSupportMarkerGeometry } from "./truss-preview-utils";
import type { AnalysisMode, FrameLoad, FrameLoadDirection, StructureNode, SupportType, TrussLoad } from "../types/structure";
import type { WorkbenchSelection } from "../types/workbench-selection";
import type { BeamPreviewStyle } from "../types/beam";

interface WorkbenchModelCanvasProps {
  workspace: WorkspaceState;
  mode: AnalysisMode;
  compact?: boolean;
  beamPreviewStyle?: BeamPreviewStyle;
  selection?: WorkbenchSelection | null;
  onSelect?: (next: WorkbenchSelection) => void;
}

function buildMetrics(workspace: WorkspaceState, mode: AnalysisMode) {
  if (mode === "beam") {
    const length = workspace.beam.spans.reduce((sum, span) => sum + span.length, 0);
    return [
      { label: "杆件数量", value: `${workspace.beam.spans.length}` },
      { label: "总长度", value: `${length.toFixed(2)} m` },
      { label: "节点数量", value: `${workspace.beam.supports.length}` },
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
const MODEL_DIMENSION_TEXT_WEIGHT = 600;
const MODEL_CANVAS_MIN_ZOOM_PERCENT = 70;
const MODEL_CANVAS_MAX_ZOOM_PERCENT = 400;
const MODEL_CANVAS_BUTTON_ZOOM_STEP_PERCENT = 10;
const MODEL_CANVAS_INPUT_ZOOM_STEP_PERCENT = 5;
const MODEL_CANVAS_DEFAULT_ZOOM_PERCENT = 100;
const MODEL_CANVAS_DRAG_THRESHOLD_PX = 8;
const BEAM_SKETCH_AXIS_Y = 150;
const BEAM_LOAD_BOTTOM_GUIDE_Y = BEAM_SKETCH_AXIS_Y - 38;
const BEAM_LOAD_LANE_GAP_Y = 34;
const BEAM_DISTRIBUTED_LOAD_TIP_Y = BEAM_SKETCH_AXIS_Y;
const BEAM_POINT_LOAD_TIP_Y = BEAM_SKETCH_AXIS_Y - 6;
const BEAM_NODE_BADGE_OFFSET_X = 10;
const BEAM_NODE_BADGE_Y = BEAM_SKETCH_AXIS_Y - 14;

function svgInteractiveProps<T extends SVGElement = SVGGElement>(label: string, onActivate: () => void): SVGProps<T> {
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    className: "model-canvas-interactive cursor-pointer",
    onClick: onActivate,
    onKeyDown: (event: ReactKeyboardEvent<T>) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      onActivate();
    },
  };
}

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

function beamSpanMemberId(span: WorkspaceState["beam"]["spans"][number] | undefined, index: number) {
  return span?.id?.trim() || `(${index + 1})`;
}

function beamBoundaryNodeId(_beam: WorkspaceState["beam"], index: number) {
  return `${index + 1}`;
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

function buildLoadArrowXs(start: number, end: number, minSpacing = 30) {
  const width = end - start;
  if (width <= 0) return [];

  const arrowCount = Math.max(3, Math.min(28, Math.floor(width / minSpacing) + 1));
  return Array.from({ length: arrowCount }, (_, index) => {
    const ratio = index / (arrowCount - 1);
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
  const defaultLabelX = (x: number) => Math.min(beamEnd + BEAM_NODE_BADGE_OFFSET_X, Math.max(beamStart + BEAM_NODE_BADGE_OFFSET_X, x + BEAM_NODE_BADGE_OFFSET_X));

  return nodeXs.map((x, index) => {
    const hasPointLoad = pointLoadXs.some((loadX) => Math.abs(loadX - x) < 16);
    if (!hasPointLoad) {
      return { index, x, labelX: defaultLabelX(x), anchor: "middle" as const };
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

function BeamSketch({
  beam,
  beamPreviewStyle = "simple",
  selection,
  onSelect,
}: {
  beam: WorkspaceState["beam"];
  beamPreviewStyle?: BeamPreviewStyle;
  selection?: WorkbenchSelection | null;
  onSelect?: (next: WorkbenchSelection) => void;
}) {
  const total = Math.max(1, beam.spans.reduce((sum, span) => sum + span.length, 0));
  const segments = beam.spans.reduce<Array<{ index: number; length: number; start: number; end: number }>>((items, span, index) => {
    const start = items[index - 1]?.end ?? 96;
    const end = start + (span.length / total) * 708;
    return [...items, { index, length: span.length, start, end }];
  }, []);
  const beamStart = segments[0]?.start ?? 96;
  const beamEnd = segments[segments.length - 1]?.end ?? 804;
  const beamMemberIds = beam.spans.map((span, index) => beamSpanMemberId(span, index));
  const beamNodeIds = Array.from({ length: beam.spans.length + 1 }, (_, index) => beamBoundaryNodeId(beam, index));
  const spanDimensions = buildBeamSpanDimensionSegments(beam.spans.map((span) => span.length), total, beamStart, beamEnd, {
    memberIds: beamMemberIds,
    nodeIds: beamNodeIds,
  });
  const spanDimensionLegendRows = buildBeamSpanDimensionLegendRows(spanDimensions, 440, 12);
  const beamDimensionLegendRows = [`梁长=${formatBeamDimensionLength(total)}`, ...spanDimensionLegendRows];
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
  const linearTitleY = linearGuideBaseY - (compactLoadLabels ? 12 : 19);
  const uniformLabelX = uniformRange
    ? shiftLoadLabelAwayFromPointLoads((uniformRange.startX + uniformRange.endX) / 2, pointLoadXs, beamStart + 118, beamEnd - 118, -1)
    : beamStart;
  const beamSketchStyle: CSSProperties | undefined = beamPreviewStyle === "color"
    ? ({
        "--beam-sketch-member": "var(--model-member)",
        "--beam-sketch-node": "var(--model-node)",
        "--beam-sketch-support-fill": "var(--model-support-fill)",
        "--beam-sketch-support-stroke": "var(--model-support-stroke)",
        "--beam-sketch-support-line": "var(--model-support-line)",
        "--beam-sketch-load": "var(--model-load)",
        "--beam-sketch-label": "var(--model-label)",
        "--beam-sketch-muted": "var(--model-label)",
        "--beam-sketch-badge-fill": "var(--model-badge-fill)",
        "--beam-sketch-badge-stroke": "var(--model-badge-stroke)",
        "--beam-sketch-badge-text": "var(--model-badge-text)",
        "--beam-sketch-selected": "var(--model-load)",
      } as CSSProperties)
    : undefined;

  return (
    <svg viewBox="0 0 900 300" className="h-full w-full" style={beamSketchStyle}>
      <g fontFamily={svgTextFont} fill="var(--beam-sketch-label)" stroke="var(--model-label-halo)" strokeWidth="3" paintOrder="stroke">
        {beamDimensionLegendRows.map((row, index) => (
          <text key={`span-dimension-legend-${index}`} x={beamStart} y={34 + index * 16} fontSize="12" fontWeight={MODEL_DIMENSION_TEXT_WEIGHT}>
            {row}
          </text>
        ))}
      </g>
      <line x1={beamStart} y1={BEAM_SKETCH_AXIS_Y} x2={beamEnd} y2={BEAM_SKETCH_AXIS_Y} stroke="var(--beam-sketch-member)" strokeWidth="3.2" strokeLinecap="square" />
      {segments.map((segment) => {
        const selected = selection?.mode === "beam" && selection.type === "span" && selection.id === `span-${segment.index}`;
        const dimension = spanDimensions[segment.index];
        return (
          <g key={segment.index} {...svgInteractiveProps(`选择梁系杆件 ${beamMemberIds[segment.index]}`, () => onSelect?.({ mode: "beam", type: "span", id: `span-${segment.index}` }))}>
            {dimension ? <title>{dimension.title}</title> : null}
            <line x1={segment.start} y1={BEAM_SKETCH_AXIS_Y} x2={segment.end} y2={BEAM_SKETCH_AXIS_Y} stroke="transparent" strokeWidth="20" strokeLinecap="round" />
            {selected ? <line x1={segment.start} y1={BEAM_SKETCH_AXIS_Y} x2={segment.end} y2={BEAM_SKETCH_AXIS_Y} stroke="var(--beam-sketch-selected)" strokeWidth="7" strokeLinecap="round" opacity="0.45" /> : null}
            {dimension?.label ? (
              <text x={(segment.start + segment.end) / 2} y="176" textAnchor="middle" fontSize="13" fontWeight={MODEL_DIMENSION_TEXT_WEIGHT} fill="var(--beam-sketch-label)" stroke="var(--model-label-halo)" strokeWidth="3" paintOrder="stroke">
                {dimension.label}
              </text>
            ) : null}
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
          <g key={support.id} {...svgInteractiveProps(`选择梁系支座 ${support.id}`, () => onSelect?.({ mode: "beam", type: "support", id: `support-${index}` }))}>
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
          </g>
        );
      })}
      <g {...svgInteractiveProps("选择梁系荷载", () => onSelect?.({ mode: "beam", type: "load", id: "primary" }))}>
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
        <g>
        <g stroke="var(--beam-sketch-load)" strokeWidth={selection?.mode === "beam" && selection.type === "load" ? "1.55" : "1.15"}>
          {beam.uniformLoadEnabled ? visibleUniformArrows.map((x, index) => (
            <path key={`uniform-${index}`} d={`M${x.toFixed(1)} ${(uniformGuideY + 4).toFixed(1)} L${x.toFixed(1)} ${BEAM_DISTRIBUTED_LOAD_TIP_Y}`} markerEnd="url(#modelDistributedArrow)" />
          )) : null}
          {visibleLinearArrows.flatMap((arrows, loadIndex) => {
            const guideY = linearGuideBaseY + loadIndex * linearGuideGap;
            const arrowEndY = BEAM_DISTRIBUTED_LOAD_TIP_Y;
            return arrows.map((x, arrowIndex) => {
              const top = guideY + 4 + (linearRanges.length === 1 ? arrowIndex * 2 : 0);
              return <path key={`linear-${loadIndex}-${arrowIndex}`} d={`M${x.toFixed(1)} ${top} L${x.toFixed(1)} ${arrowEndY}`} markerEnd="url(#modelDistributedArrow)" />;
            });
          })}
        </g>
        <g stroke="var(--beam-sketch-load)" strokeWidth={selection?.mode === "beam" && selection.type === "load" ? "2.8" : "1.9"}>
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
      </g>
        <g fontFamily={svgTextFont}>
        {uniformRange ? (
          <g>
            <text x={uniformLabelX} y={uniformTitleY} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--beam-sketch-load)" stroke="var(--model-label-halo)" strokeWidth="3" paintOrder="stroke">
              q={formatMagnitude(beam.q)} kN/m
            </text>
          </g>
        ) : null}
        {linearRanges.length === 1 ? linearRanges.map((range) => {
          const labelX = shiftLoadLabelAwayFromPointLoads((range.startX + range.endX) / 2, pointLoadXs, beamStart + 150, beamEnd - 150, uniformRange ? 1 : -1);
          return (
            <g key={`linear-label-${range.load.id}`}>
              <text x={labelX} y={linearTitleY} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--beam-sketch-load)" stroke="var(--model-label-halo)" strokeWidth="3" paintOrder="stroke">
                q={formatMagnitude(range.startLoad)}→{formatMagnitude(range.endLoad)} kN/m
              </text>
            </g>
          );
        }) : linearRanges.map((range, index) => {
          const guideY = linearGuideBaseY + index * linearGuideGap;
          const y = guideY - 4;
          return (
            <g key={`linear-label-${range.load.id}`}>
              <line x1={beamStart + 4} y1={y - 4} x2={beamStart + 32} y2={y - 4} stroke="var(--beam-sketch-load)" strokeWidth="1.5" strokeDasharray="5 5" />
              <text x={beamStart + 40} y={y} textAnchor="start" fontSize="11.5" fontWeight="700" fill="var(--beam-sketch-load)" stroke="var(--model-label-halo)" strokeWidth="3" paintOrder="stroke">
                {range.load.id}: {formatMagnitude(range.startLoad)} → {formatMagnitude(range.endLoad)} kN/m
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
      </g>
      <g fontFamily={svgTextFont}>
        {nodeLabels.map((label) => (
          <g key={`node-label-${label.index}`}>
            <circle cx={label.labelX} cy={BEAM_NODE_BADGE_Y} r="8.5" fill="var(--beam-sketch-badge-fill)" stroke="var(--beam-sketch-badge-stroke)" strokeWidth="1.5" />
            <text x={label.labelX} y={BEAM_NODE_BADGE_Y + 0.5} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="800" fill="var(--beam-sketch-badge-text)">
              {beamNodeIds[label.index] ?? `${label.index + 1}`}
            </text>
          </g>
        ))}
      </g>
      <defs>
        <marker id="modelDistributedArrow" viewBox="0 0 8 8" markerWidth="4.4" markerHeight="4.4" refX="7" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8z" fill="var(--beam-sketch-load)" />
        </marker>
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

function frameForceComponentLabel(baseLabel: string, hasFx: boolean, hasFy: boolean, component: "x" | "y") {
  return hasFx && hasFy ? `${baseLabel}${component}` : baseLabel;
}

function frameMemberLabelPlacement(
  start: { x: number; y: number },
  end: { x: number; y: number },
  center: { x: number; y: number },
) {
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;

  if (Math.abs(dy) < 1e-6) {
    return { x: midX, y: midY + 14, anchor: "middle" as const };
  }

  if (Math.abs(dx) < 1e-6) {
    const side = midX < center.x ? -1 : 1;
    return { x: midX + side * 14, y: midY, anchor: side < 0 ? ("end" as const) : ("start" as const) };
  }

  const normal = { x: -dy / length, y: dx / length };
  const outward = (midX - center.x) * normal.x + (midY - center.y) * normal.y >= 0 ? 1 : -1;
  return { x: midX + normal.x * outward * 16, y: midY + normal.y * outward * 16, anchor: "middle" as const };
}

function FrameSupportMarker({ type, x, y, selected, angleDeg }: { type?: SupportType; x: number; y: number; selected: boolean; angleDeg?: number }) {
  if (!type || type === "free") return null;

  const stroke = selected ? "var(--model-load)" : "var(--model-support-stroke)";
  const line = selected ? "var(--model-load)" : "var(--model-support-line)";
  const fill = selected ? "var(--model-badge-fill)" : "var(--model-support-fill)";
  const label = type === "fixed" ? "固结支座" : type === "roller" ? "滚动支座" : "铰支座";

  if (type === "fixed") {
    return (
      <g aria-label={label}>
        <title>{label}</title>
        <rect x={x - 16} y={y + 7} width="32" height="8" rx="2" fill={fill} stroke={stroke} strokeWidth="1.4" />
        {[-12, -4, 4, 12].map((offset) => (
          <line key={offset} x1={x + offset - 5} y1={y + 24} x2={x + offset + 5} y2={y + 14} stroke={line} strokeWidth="1.8" />
        ))}
      </g>
    );
  }

  return (
    <g aria-label={label} transform={angleDeg === undefined ? undefined : `rotate(${90 - angleDeg} ${x} ${y})`}>
      <title>{label}</title>
      <polygon points={`${x - 16},${y + 24} ${x + 16},${y + 24} ${x},${y + 2}`} fill={fill} stroke={stroke} strokeWidth="1.4" />
      <line x1={x - 18} y1={y + 28} x2={x + 18} y2={y + 28} stroke={line} strokeWidth="2.2" />
      {type === "roller" ? (
        <>
          <circle cx={x - 8} cy={y + 33} r="3" fill="none" stroke={line} strokeWidth="1.5" />
          <circle cx={x + 8} cy={y + 33} r="3" fill="none" stroke={line} strokeWidth="1.5" />
        </>
      ) : null}
    </g>
  );
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
  const rawNodeMap = new Map(nodes.map((node) => [node.id, node]));
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const topY = Math.min(...nodes.map((node) => map(node).y), 90);
  const bottomY = Math.max(...nodes.map((node) => map(node).y), 285);
  const leftX = Math.min(...nodes.map((node) => map(node).x), 165);
  const rightX = Math.max(...nodes.map((node) => map(node).x), 735);
  const frameCenter = { x: (leftX + rightX) / 2, y: (topY + bottomY) / 2 };
  const frameDimensionLegendX = Math.max(20, leftX - 112);
  const frameLoadLabelMap = buildFrameLoadLabelMap(loads);
  const frameDimensions: FrameGeometryDimension[] = members.flatMap((member) => {
    const start = rawNodeMap.get(member.start);
    const end = rawNodeMap.get(member.end);
    if (!start || !end) return [];
    return [{
      memberId: member.id,
      valueLabel: frameMemberDimensionValueLabel(start, end),
    }];
  });
  const frameDimensionLegendRows = buildFrameDimensionLegendRows(frameDimensions, 220, 12);
  const nodeLabel = (node: StructureNode) => {
    const point = nodeMap.get(node.id);
    if (!point) return null;
    const isLeft = point.x < (leftX + rightX) / 2;
    return {
      x: point.x + (isLeft ? -22 : 22),
      y: point.y - 12,
      anchor: isLeft ? ("end" as const) : ("start" as const),
    };
  };

  return (
    <svg viewBox="0 0 900 360" className="h-full w-full">
      <g fontFamily={svgTextFont} fill="var(--model-label)" stroke="var(--model-label-halo)" strokeWidth="3" paintOrder="stroke">
        {frameDimensionLegendRows.map((row, index) => (
          <text key={`frame-dimension-legend-${index}`} x={frameDimensionLegendX} y={22 + index * 16} fontSize="12" fontWeight={MODEL_DIMENSION_TEXT_WEIGHT}>
            {row}
          </text>
        ))}
      </g>
      <g stroke="var(--model-member)" strokeLinecap="round" strokeLinejoin="round">
        {members.map((member) => {
          const start = nodeMap.get(member.start);
          const end = nodeMap.get(member.end);
          if (!start || !end) return null;
          const selected = selection?.mode === "frame" && selection.type === "member" && selection.id === member.id;
          const label = frameMemberLabelPlacement(start, end, frameCenter);
          return (
            <g key={member.id} {...svgInteractiveProps(`选择框架构件 ${member.id}`, () => onSelect?.({ mode: "frame", type: "member", id: member.id }))}>
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth="18" />
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} strokeWidth={selected ? "7" : "4.5"} stroke={selected ? "var(--model-load)" : "var(--model-member)"} opacity={selected ? "0.85" : "1"} />
              <text
                x={label.x}
                y={label.y}
                textAnchor={label.anchor}
                dominantBaseline="middle"
                fill={selected ? "var(--model-load)" : "var(--model-label)"}
                stroke="var(--model-label-halo)"
                strokeWidth="4"
                paintOrder="stroke"
                fontSize="11"
                fontWeight="800"
                fontFamily={svgTextFont}
              >
                {member.id}
              </text>
            </g>
          );
        })}
      </g>
      <g fill="var(--model-node)">
        {nodes.map((node) => {
          const point = nodeMap.get(node.id);
          const selected = selection?.mode === "frame" && selection.type === "node" && selection.id === node.id;
          return point ? (
            <g key={node.id} {...svgInteractiveProps(`选择框架节点 ${node.id}`, () => onSelect?.({ mode: "frame", type: "node", id: node.id }))}>
              <FrameSupportMarker type={node.supportType} x={point.x} y={point.y} selected={Boolean(selected)} angleDeg={node.supportAngleDeg} />
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
              items.push(<path key={`${index}-fx`} {...svgInteractiveProps<SVGPathElement>(`选择框架荷载 ${index + 1}`, () => onSelect?.({ mode: "frame", type: "load", id: `load-${index}` }))} d={`M${x1} ${point.y} L${x2} ${point.y}`} markerEnd="url(#frameArrow)" strokeWidth={selection?.mode === "frame" && selection.type === "load" && selection.id === `load-${index}` ? "3.2" : "2"} />);
            }
            if (load.fyKn) {
              const sign = load.fyKn >= 0 ? -1 : 1;
              const y1 = point.y - sign * 54;
              const y2 = point.y - sign * 12;
              items.push(<path key={`${index}-fy`} {...svgInteractiveProps<SVGPathElement>(`选择框架荷载 ${index + 1}`, () => onSelect?.({ mode: "frame", type: "load", id: `load-${index}` }))} d={`M${point.x} ${y1} L${point.x} ${y2}`} markerEnd="url(#frameArrow)" strokeWidth={selection?.mode === "frame" && selection.type === "load" && selection.id === `load-${index}` ? "3.2" : "2"} />);
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
                {...svgInteractiveProps<SVGPathElement>(`选择框架荷载 ${index + 1}`, () => onSelect?.({ mode: "frame", type: "load", id: `load-${index}` }))}
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
              {...svgInteractiveProps<SVGLineElement>(`选择框架荷载 ${index + 1}`, () => onSelect?.({ mode: "frame", type: "load", id: `load-${index}` }))}
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
                {...svgInteractiveProps<SVGPathElement>(`选择框架荷载 ${index + 1}`, () => onSelect?.({ mode: "frame", type: "load", id: `load-${index}` }))}
                d={`M${x - direction.x * arrowLength} ${y - direction.y * arrowLength} L${x - direction.x * 9} ${y - direction.y * 9}`}
                markerEnd="url(#frameArrow)"
                strokeWidth={selectedStroke}
              />
            );
          }
          return items;
        })}
      </g>
      <g fill="var(--model-label)" fontSize="11.5" fontWeight="600" fontFamily={svgTextFont}>
        {nodes.map((node) => {
          const label = nodeLabel(node);
          return label ? (
            <text key={node.id} x={label.x} y={label.y} textAnchor={label.anchor}>
              {node.id}
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
            const hasFx = Math.abs(load.fxKn ?? 0) > 1e-9;
            const hasFy = Math.abs(load.fyKn ?? 0) > 1e-9;
            const forceLabel = frameLoadLabelMap.get(index)?.force ?? `F${index + 1}`;
            if (load.fxKn) {
              const sign = load.fxKn >= 0 ? 1 : -1;
              labels.push(
                <text key={`${index}-fx-label`} x={point.x + sign * 18} y={point.y - 14} textAnchor={sign > 0 ? "start" : "end"}>
                  {formatFrameForceLoadLabel(frameForceComponentLabel(forceLabel, hasFx, hasFy, "x"), load.fxKn)}
                </text>
              );
            }
            if (load.fyKn) {
              const sign = load.fyKn >= 0 ? -1 : 1;
              const labelY = point.y - sign * 70;
              labels.push(
                <text key={`${index}-fy-label`} x={point.x} y={labelY} textAnchor="middle">
                  {formatFrameForceLoadLabel(frameForceComponentLabel(forceLabel, hasFx, hasFy, "y"), load.fyKn)}
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
                {formatFrameForceLoadLabel(frameLoadLabelMap.get(index)?.memberPoint ?? `P${index + 1}`, force)}
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
              {formatFrameDistributedLoadLabel(frameLoadLabelMap.get(index)?.distributed ?? `q${index + 1}`, qStart, qEnd, startRatio, endRatio)}
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
  return {
    x: midX + normal.x * outward * 16,
    y: midY + normal.y * outward * 16,
    angle: readableSegmentAngle(start, end),
  };
}

function readableSegmentAngle(start: { x: number; y: number }, end: { x: number; y: number }) {
  let angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
  if (angle > 90 || angle < -90) angle += 180;
  return angle;
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

function TrussSupportMarker({ type, x, y, selected }: { type?: string; x: number; y: number; selected: boolean }) {
  const marker = buildTrussSupportMarkerGeometry(type, x, y);
  if (!marker) return null;

  const stroke = selected ? "var(--model-load)" : "var(--model-support-stroke)";
  const line = selected ? "var(--model-load)" : "var(--model-support-line)";
  const fill = selected ? "var(--model-badge-fill)" : "var(--model-support-fill)";

  return (
    <g aria-label={marker.label}>
      <title>{marker.label}</title>
      <polygon points={marker.trianglePoints} fill={fill} stroke={stroke} strokeWidth="1.4" />
      <line x1={marker.baseLine.x1} y1={marker.baseLine.y1} x2={marker.baseLine.x2} y2={marker.baseLine.y2} stroke={line} strokeWidth="2.2" />
      {marker.rollers.map((roller, index) => (
        <circle key={`${marker.supportType}-roller-${index}`} cx={roller.cx} cy={roller.cy} r={roller.r} fill="none" stroke={line} strokeWidth="1.5" />
      ))}
    </g>
  );
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
  const trussLeftX = Math.min(...nodes.map((node) => nodeMap.get(node.id)?.x ?? 110), 110);
  const memberLengthLegendX = Math.max(20, trussLeftX - 86);
  const memberLengthDimensions = members.flatMap((member) => {
    const start = nodeMap.get(member.start);
    const end = nodeMap.get(member.end);
    const rawStart = rawNodeMap.get(member.start);
    const rawEnd = rawNodeMap.get(member.end);
    if (!start || !end || !rawStart || !rawEnd) return [];

    const lengthM = Math.hypot(rawEnd.x - rawStart.x, rawEnd.y - rawStart.y);
    const dimension = buildTrussMemberLengthDimension(member.id, start, end, lengthM);
    return dimension ? [dimension] : [];
  });
  const memberLengthDimensionById = new Map(memberLengthDimensions.map((dimension) => [dimension.memberId, dimension]));
  const memberLengthLegendRows = buildTrussMemberLengthLegendRows(memberLengthDimensions, 190, 12);

  const getNodeLabel = (point: { x: number; y: number }) => {
    const isLeftSide = point.x < trussCenterX;
    return {
      x: point.x + (isLeftSide ? -22 : 22),
      y: point.y - 12,
      anchor: isLeftSide ? ("end" as const) : ("start" as const),
    };
  };

  return (
    <svg viewBox="0 0 900 360" className="h-full w-full">
      <g fontFamily={svgTextFont} fill="var(--model-label)" stroke="var(--model-label-halo)" strokeWidth="3" paintOrder="stroke">
        {memberLengthLegendRows.map((row, index) => (
          <text key={`truss-member-length-legend-${index}`} x={memberLengthLegendX} y={34 + index * 16} fontSize="12" fontWeight={MODEL_DIMENSION_TEXT_WEIGHT}>
            {row}
          </text>
        ))}
      </g>
      {members.map((member) => {
        const start = nodeMap.get(member.start);
        const end = nodeMap.get(member.end);
        if (!start || !end) return null;
        const selected = selection?.mode === "truss" && selection.type === "member" && selection.id === member.id;
        const label = trussMemberLabelPlacement(start, end, { x: trussCenterX, y: trussMidY });
        const dimension = memberLengthDimensionById.get(member.id);
        return (
          <g key={member.id} {...svgInteractiveProps(`选择桁架杆件 ${member.id}`, () => onSelect?.({ mode: "truss", type: "member", id: member.id }))}>
            {dimension ? <title>{dimension.title}</title> : null}
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
        const selected = selection?.mode === "truss" && selection.type === "node" && selection.id === node.id;
        return (
          <g key={node.id} {...svgInteractiveProps(`选择桁架节点 ${node.id}`, () => onSelect?.({ mode: "truss", type: "node", id: node.id }))}>
            <TrussSupportMarker type={node.supportType} x={point.x} y={point.y} selected={selected} />
            <circle cx={point.x} cy={point.y} r={selected ? "7.5" : "5.5"} fill={selected ? "var(--model-load)" : "var(--model-node)"} />
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
            const labelGuide = trussOffsetSegment(start, end, { x: trussCenterX, y: trussMidY }, 32);
            const labelMid = pointOnSegment(labelGuide.start, labelGuide.end, 0.5);
            const labelAngle = readableSegmentAngle(guide.start, guide.end);
            const equivalentArrows = [
              { key: "start", force: startForce, anchor: pointOnSegment(start, end, 0.08) },
              { key: "end", force: endForce, anchor: pointOnSegment(start, end, 0.92) },
            ];
            const items = [
              <g key={`${index}-member-load`} {...svgInteractiveProps(`选择桁架荷载 ${index + 1}`, () => onSelect?.({ mode: "truss", type: "load", id: `load-${index}` }))}>
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
                  y={labelMid.y}
                  transform={`rotate(${labelAngle} ${labelMid.x} ${labelMid.y})`}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="var(--model-load)"
                  stroke="var(--model-load-halo)"
                  strokeWidth="3"
                  paintOrder="stroke"
                  fontSize="11"
                  fontWeight="700"
                  fontFamily={svgTextFont}
                >
                  杆件荷载 {formatSignedMagnitude(qStart)}{Math.abs(qStart - qEnd) > 1e-9 ? `→${formatSignedMagnitude(qEnd)}` : ""} kN/m
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
              <g key={`${index}-fx`} {...svgInteractiveProps(`选择桁架荷载 ${index + 1}`, () => onSelect?.({ mode: "truss", type: "load", id: `load-${index}` }))}>
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
                  水平荷载 {formatMagnitude(load.fxKn)} kN
                </text>
              </g>
            );
          }
          if (load.fyKn) {
            const sign = load.fyKn >= 0 ? -1 : 1;
            const y1 = point.y - sign * 54;
            const y2 = point.y - sign * 12;
            items.push(
              <g key={`${index}-fy`} {...svgInteractiveProps(`选择桁架荷载 ${index + 1}`, () => onSelect?.({ mode: "truss", type: "load", id: `load-${index}` }))}>
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
                  竖向荷载 {formatMagnitude(load.fyKn)} kN
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

export function WorkbenchModelCanvas({ workspace, mode, compact = false, beamPreviewStyle = "simple", selection, onSelect }: WorkbenchModelCanvasProps) {
  const [zoomPercent, setZoomPercent] = useState(MODEL_CANVAS_DEFAULT_ZOOM_PERCENT);
  const [zoomDraft, setZoomDraft] = useState(String(MODEL_CANVAS_DEFAULT_ZOOM_PERCENT));
  const [showZoomControls, setShowZoomControls] = useState(false);
  const [isCanvasDragging, setIsCanvasDragging] = useState(false);
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  const canvasDragRef = useRef<{ pointerId: number; startX: number; startY: number; lastX: number; lastY: number; active: boolean } | null>(null);
  const suppressCanvasClickRef = useRef(false);
  const metrics = buildMetrics(workspace, mode);
  const zoomedBoardStyle: CSSProperties = {
    width: `${zoomPercent}%`,
    height: `${zoomPercent}%`,
    minWidth: zoomPercent >= MODEL_CANVAS_DEFAULT_ZOOM_PERCENT ? "100%" : undefined,
    minHeight: zoomPercent >= MODEL_CANVAS_DEFAULT_ZOOM_PERCENT ? "100%" : undefined,
  };
  const commitZoomPercent = (nextPercent: number) => {
    if (!Number.isFinite(nextPercent)) {
      setZoomDraft(String(zoomPercent));
      return;
    }
    const clamped = Math.min(MODEL_CANVAS_MAX_ZOOM_PERCENT, Math.max(MODEL_CANVAS_MIN_ZOOM_PERCENT, Math.round(nextPercent)));
    setZoomPercent(clamped);
    setZoomDraft(String(clamped));
  };
  const commitZoomDraft = (rawValue: string) => {
    if (!rawValue.trim()) {
      setZoomDraft(String(zoomPercent));
      return;
    }
    commitZoomPercent(Number(rawValue));
  };
  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || zoomPercent <= MODEL_CANVAS_DEFAULT_ZOOM_PERCENT) return;
    canvasDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      active: false,
    };
  };
  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = canvasDragRef.current;
    const scrollArea = canvasScrollRef.current;
    if (!drag || !scrollArea || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < MODEL_CANVAS_DRAG_THRESHOLD_PX) {
      return;
    }
    if (!drag.active) {
      drag.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsCanvasDragging(true);
    }
    scrollArea.scrollLeft -= dx;
    scrollArea.scrollTop -= dy;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    event.preventDefault();
  };
  const finishCanvasDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = canvasDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressCanvasClickRef.current = drag.active;
    canvasDragRef.current = null;
    setIsCanvasDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <GlassCard className="overflow-hidden">
      <div className={`model-canvas-surface relative flex flex-col gap-3 px-4 py-4 ${compact ? "h-[260px]" : "h-[360px]"}`}>
        <div className="flex h-8 items-center justify-end">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/[0.88] p-1 shadow-sm backdrop-blur dark:border-slate-700/80 dark:bg-slate-950/[0.82]">
            {showZoomControls ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg"
                  aria-label="缩小工作台"
                  title="缩小工作台"
                  onClick={() => commitZoomPercent(zoomPercent - MODEL_CANVAS_BUTTON_ZOOM_STEP_PERCENT)}
                  disabled={zoomPercent <= MODEL_CANVAS_MIN_ZOOM_PERCENT}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <div className="flex items-center">
                  <input
                    aria-label="工作台缩放百分比"
                    type="number"
                    min={MODEL_CANVAS_MIN_ZOOM_PERCENT}
                    max={MODEL_CANVAS_MAX_ZOOM_PERCENT}
                    step={MODEL_CANVAS_INPUT_ZOOM_STEP_PERCENT}
                    value={zoomDraft}
                    onChange={(event) => setZoomDraft(event.target.value)}
                    onFocus={(event) => event.currentTarget.select()}
                    onBlur={(event) => commitZoomDraft(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        commitZoomDraft(event.currentTarget.value);
                        event.currentTarget.blur();
                      }
                      if (event.key === "Escape") {
                        setZoomDraft(String(zoomPercent));
                        event.currentTarget.blur();
                      }
                    }}
                    className="h-7 w-12 rounded-md border border-transparent bg-transparent px-1 text-center font-mono text-[11px] font-bold text-slate-700 outline-none focus:border-sky-400/50 focus:bg-white/80 dark:text-slate-200 dark:focus:bg-slate-900/80"
                  />
                  <span className="pr-1 font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200">%</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg"
                  aria-label="放大工作台"
                  title="放大工作台"
                  onClick={() => commitZoomPercent(zoomPercent + MODEL_CANVAS_BUTTON_ZOOM_STEP_PERCENT)}
                  disabled={zoomPercent >= MODEL_CANVAS_MAX_ZOOM_PERCENT}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg"
                  aria-label="重置工作台缩放"
                  title="重置工作台缩放"
                  onClick={() => commitZoomPercent(MODEL_CANVAS_DEFAULT_ZOOM_PERCENT)}
                  disabled={zoomPercent === MODEL_CANVAS_DEFAULT_ZOOM_PERCENT}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={`h-7 w-7 rounded-lg ${showZoomControls ? "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-100" : ""}`}
              aria-label={showZoomControls ? "隐藏工作台缩放" : "显示工作台缩放"}
              aria-pressed={showZoomControls}
              title={`${showZoomControls ? "隐藏" : "显示"}工作台缩放（${zoomPercent}%）`}
              onClick={() => setShowZoomControls((current) => !current)}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div
          ref={canvasScrollRef}
          className={`min-h-0 flex-1 overflow-auto ${zoomPercent > MODEL_CANVAS_DEFAULT_ZOOM_PERCENT ? (isCanvasDragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={finishCanvasDrag}
          onPointerCancel={finishCanvasDrag}
          onClickCapture={(event) => {
            if (!suppressCanvasClickRef.current) return;
            suppressCanvasClickRef.current = false;
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div className="model-canvas-board" style={zoomedBoardStyle}>
            {mode === "beam" ? (
              <BeamSketch beam={workspace.beam} beamPreviewStyle={beamPreviewStyle} selection={selection} onSelect={onSelect} />
            ) : mode === "frame" ? (
              <FrameSketch workspace={workspace} selection={selection} onSelect={onSelect} />
            ) : (
              <TrussSketch workspace={workspace} selection={selection} onSelect={onSelect} />
            )}
          </div>
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
