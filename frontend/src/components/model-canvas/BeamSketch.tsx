import { type CSSProperties } from "react";
import { buildBeamSpanDimensionLegendRows, buildBeamSpanDimensionSegments, formatBeamDimensionLength } from "../../lib/beam-span-dimensions";
import { modelCanvasLabelPolicy, shouldShowSteppedLabel } from "../../lib/model-canvas-label-policy";
import { BEAM_MODEL_CANVAS_BASE_SIZE, type ModelCanvasSize } from "../../lib/model-canvas-sizing";
import { modelObjectMemberTerm } from "../../lib/model-object-vocabulary";
import { STRUCTURE_NODE_RADII, STRUCTURE_VISUAL_STROKES } from "../../lib/structure-visual-tokens";
import type { WorkspaceState } from "../../lib/workspace-state";
import type { ModelPreviewStyle } from "../../types/beam";
import type { WorkbenchSelection, WorkbenchSelectionOptions } from "../../types/workbench-selection";
import { sameWorkbenchSelection, selectionSetContains } from "../../lib/workbench-selection-utils";
import { MODEL_DIMENSION_TEXT_WEIGHT, SVG_TEXT_FONT, clampRatio, formatMagnitude, isAdditiveSelectionEvent, svgCanvasSelectionProps, svgInteractiveProps } from "./shared";

const BEAM_SKETCH_AXIS_Y = 150;
const BEAM_LOAD_BOTTOM_GUIDE_Y = BEAM_SKETCH_AXIS_Y - 38;
const BEAM_LOAD_LANE_GAP_Y = 34;
const BEAM_DISTRIBUTED_LOAD_TIP_Y = BEAM_SKETCH_AXIS_Y;
const BEAM_POINT_LOAD_TIP_Y = BEAM_SKETCH_AXIS_Y - 6;
const BEAM_NODE_BADGE_OFFSET_X = 10;
const BEAM_NODE_BADGE_Y = BEAM_SKETCH_AXIS_Y - 14;
const BEAM_SKETCH_SIDE_PAD = 96;

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

export function BeamSketch({
  beam,
  canvasSize = BEAM_MODEL_CANVAS_BASE_SIZE,
  modelPreviewStyle = "simple",
  selection,
  selectionSet = [],
  onSelect,
}: {
  beam: WorkspaceState["beam"];
  canvasSize?: ModelCanvasSize;
  modelPreviewStyle?: ModelPreviewStyle;
  selection?: WorkbenchSelection | null;
  selectionSet?: WorkbenchSelection[];
  onSelect?: (next: WorkbenchSelection, options?: WorkbenchSelectionOptions) => void;
}) {
  const total = Math.max(1, beam.spans.reduce((sum, span) => sum + span.length, 0));
  const memberTerm = modelObjectMemberTerm("beam");
  const beamDrawableWidth = Math.max(220, canvasSize.width - BEAM_SKETCH_SIDE_PAD * 2);
  const segments = beam.spans.reduce<Array<{ index: number; length: number; start: number; end: number }>>((items, span, index) => {
    const start = items[index - 1]?.end ?? BEAM_SKETCH_SIDE_PAD;
    const end = start + (span.length / total) * beamDrawableWidth;
    return [...items, { index, length: span.length, start, end }];
  }, []);
  const beamStart = segments[0]?.start ?? BEAM_SKETCH_SIDE_PAD;
  const beamEnd = segments[segments.length - 1]?.end ?? canvasSize.width - BEAM_SKETCH_SIDE_PAD;
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
  const labelPolicy = modelCanvasLabelPolicy({
    nodeCount: nodeLabels.length,
    memberCount: segments.length,
    nodeVisibleTarget: Math.max(14, Math.floor(beamDrawableWidth / 72)),
    memberVisibleTarget: Math.max(14, Math.floor(beamDrawableWidth / 80)),
  });
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
  const beamSketchStyle: CSSProperties | undefined = modelPreviewStyle === "color"
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
  const isSelected = (item: WorkbenchSelection) => selectionSetContains(selectionSet, item) || sameWorkbenchSelection(selection, item);
  const activateSelection = (item: WorkbenchSelection, event?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => {
    onSelect?.(item, { additive: isAdditiveSelectionEvent(event) });
  };
  const loadSelection = { mode: "beam", type: "load", id: "primary" } as const;
  const loadSelected = isSelected(loadSelection);

  return (
    <svg viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} className="h-full w-full" style={beamSketchStyle} data-model-canvas="beam" data-label-density={labelPolicy.density}>
      <g fontFamily={SVG_TEXT_FONT} fill="var(--beam-sketch-label)" stroke="var(--model-label-halo)" strokeWidth="3" paintOrder="stroke">
        {beamDimensionLegendRows.map((row, index) => (
          <text key={`span-dimension-legend-${index}`} x={beamStart} y={34 + index * 16} fontSize="12" fontWeight={MODEL_DIMENSION_TEXT_WEIGHT}>
            {row}
          </text>
        ))}
      </g>
      <line x1={beamStart} y1={BEAM_SKETCH_AXIS_Y} x2={beamEnd} y2={BEAM_SKETCH_AXIS_Y} stroke="var(--beam-sketch-member)" strokeWidth={STRUCTURE_VISUAL_STROKES.modelBeamMember} strokeLinecap="square" />
      {segments.map((segment) => {
        const spanSelection = { mode: "beam", type: "span", id: `span-${segment.index}` } as const;
        const selected = isSelected(spanSelection);
        const dimension = spanDimensions[segment.index];
        const showLabel = shouldShowSteppedLabel({
          index: segment.index,
          total: segments.length,
          step: labelPolicy.memberLabelStep,
          selected,
        });
        return (
          <g
            key={segment.index}
            {...svgInteractiveProps(`选择梁系${memberTerm} ${beamMemberIds[segment.index]}`, (event) => activateSelection(spanSelection, event))}
            {...svgCanvasSelectionProps(spanSelection)}
          >
            {dimension ? <title>{dimension.title}</title> : null}
            <line x1={segment.start} y1={BEAM_SKETCH_AXIS_Y} x2={segment.end} y2={BEAM_SKETCH_AXIS_Y} stroke="transparent" strokeWidth="20" strokeLinecap="round" />
            {selected ? <line x1={segment.start} y1={BEAM_SKETCH_AXIS_Y} x2={segment.end} y2={BEAM_SKETCH_AXIS_Y} stroke="var(--beam-sketch-selected)" strokeWidth={STRUCTURE_VISUAL_STROKES.modelSelectedMember} strokeLinecap="round" opacity="0.45" /> : null}
            {dimension?.label && showLabel ? (
              <text x={(segment.start + segment.end) / 2} y="176" textAnchor="middle" fontSize="13" fontWeight={MODEL_DIMENSION_TEXT_WEIGHT} fill="var(--beam-sketch-label)" stroke="var(--model-label-halo)" strokeWidth="3" paintOrder="stroke" data-model-label="member">
                {dimension.label}
              </text>
            ) : null}
            <circle cx={segment.start} cy={BEAM_SKETCH_AXIS_Y} r={STRUCTURE_NODE_RADII.preview} fill="var(--beam-sketch-node)" />
            {segment.index === segments.length - 1 ? (
              <>
                <circle cx={segment.end} cy={BEAM_SKETCH_AXIS_Y} r={STRUCTURE_NODE_RADII.preview} fill="var(--beam-sketch-node)" />
              </>
            ) : null}
          </g>
        );
      })}
      {beam.supports.map((support, index) => {
        const x = beamStart + (support.x / total) * (beamEnd - beamStart);
        const supportSelection = { mode: "beam", type: "support", id: `support-${index}` } as const;
        const selected = isSelected(supportSelection);
        return (
          <g
            key={support.id}
            {...svgInteractiveProps(`选择梁系支座 ${support.id}`, (event) => activateSelection(supportSelection, event))}
            {...svgCanvasSelectionProps(supportSelection)}
          >
            <title>{`梁系支座 ${support.id}`}</title>
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
      <g
        {...svgInteractiveProps("选择梁系荷载", (event) => activateSelection(loadSelection, event))}
        {...svgCanvasSelectionProps(loadSelection)}
      >
        <rect x={beamStart - 20} y="24" width={beamEnd - beamStart + 40} height="125" fill="transparent" />
        {loadSelected ? <rect x={beamStart - 16} y="28" width={beamEnd - beamStart + 32} height="118" rx="14" fill="var(--beam-sketch-selected)" opacity="0.07" /> : null}
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
          <g fontFamily={SVG_TEXT_FONT}>
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
        <g stroke="var(--beam-sketch-load)" strokeWidth={loadSelected ? "1.55" : "1.15"}>
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
        <g stroke="var(--beam-sketch-load)" strokeWidth={loadSelected ? "2.8" : "1.9"}>
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
        <g fontFamily={SVG_TEXT_FONT}>
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
      <g fontFamily={SVG_TEXT_FONT}>
        {nodeLabels.map((label) => (
          shouldShowSteppedLabel({
            index: label.index,
            total: nodeLabels.length,
            step: labelPolicy.nodeLabelStep,
            selected: isSelected({ mode: "beam", type: "support", id: `support-${label.index}` }),
          }) ? (
            <g key={`node-label-${label.index}`}>
              <circle cx={label.labelX} cy={BEAM_NODE_BADGE_Y} r="8.5" fill="var(--beam-sketch-badge-fill)" stroke="var(--beam-sketch-badge-stroke)" strokeWidth="1.5" />
              <text x={label.labelX} y={BEAM_NODE_BADGE_Y + 0.5} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="800" fill="var(--beam-sketch-badge-text)" data-model-label="node">
                {beamNodeIds[label.index] ?? `${label.index + 1}`}
              </text>
            </g>
          ) : null
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
