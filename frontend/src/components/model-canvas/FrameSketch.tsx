import { createPortalFrameModelFromState, type WorkspaceState } from "../../lib/workspace-state";
import { nodeSupportLabel } from "../../lib/support-vocabulary";
import { modelCanvasLabelPolicy, shouldShowSteppedLabel } from "../../lib/model-canvas-label-policy";
import { FRAME_MODEL_CANVAS_BASE_SIZE, type ModelCanvasSize } from "../../lib/model-canvas-sizing";
import { STRUCTURE_NODE_RADII, STRUCTURE_VISUAL_STROKES } from "../../lib/structure-visual-tokens";
import { buildFrameDimensionLegendRows, buildFrameLoadLabelMap, formatFrameDistributedLoadLabel, formatFrameForceLoadLabel, frameMemberDimensionValueLabel, type FrameGeometryDimension } from "../frame-preview-utils";
import type { FrameLoad, FrameLoadDirection, StructureNode, SupportType } from "../../types/structure";
import type { WorkbenchSelection } from "../../types/workbench-selection";
import { MODEL_DIMENSION_TEXT_WEIGHT, SVG_TEXT_FONT, clampRatio, svgInteractiveProps } from "./shared";

const FRAME_LOAD_STROKE_WIDTH = 1.55;
const FRAME_LOAD_SELECTED_STROKE_WIDTH = 2.35;
const FRAME_LOAD_GUIDE_STROKE_WIDTH = 1.2;
const FRAME_SKETCH_LEFT_PAD = 165;
const FRAME_SKETCH_RIGHT_PAD = 165;
const FRAME_SKETCH_TOP_PAD = 90;
const FRAME_SKETCH_BOTTOM_PAD = 75;

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
  const label = nodeSupportLabel(type);

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

export function FrameSketch({
  workspace,
  canvasSize = FRAME_MODEL_CANVAS_BASE_SIZE,
  selection,
  onSelect,
}: {
  workspace: WorkspaceState;
  canvasSize?: ModelCanvasSize;
  selection?: WorkbenchSelection | null;
  onSelect?: (next: WorkbenchSelection) => void;
}) {
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
  const drawableWidth = Math.max(240, canvasSize.width - FRAME_SKETCH_LEFT_PAD - FRAME_SKETCH_RIGHT_PAD);
  const drawableHeight = Math.max(150, canvasSize.height - FRAME_SKETCH_TOP_PAD - FRAME_SKETCH_BOTTOM_PAD);
  const map = (point: Pick<StructureNode, "x" | "y">) => ({
    x: FRAME_SKETCH_LEFT_PAD + ((point.x - minX) / Math.max(1, maxX - minX)) * drawableWidth,
    y: canvasSize.height - FRAME_SKETCH_BOTTOM_PAD - ((point.y - minY) / Math.max(1, maxY - minY)) * drawableHeight,
  });
  const nodeMap = new Map(nodes.map((node) => [node.id, map(node)]));
  const rawNodeMap = new Map(nodes.map((node) => [node.id, node]));
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const topY = Math.min(...nodes.map((node) => map(node).y), FRAME_SKETCH_TOP_PAD);
  const bottomY = Math.max(...nodes.map((node) => map(node).y), canvasSize.height - FRAME_SKETCH_BOTTOM_PAD);
  const leftX = Math.min(...nodes.map((node) => map(node).x), FRAME_SKETCH_LEFT_PAD);
  const rightX = Math.max(...nodes.map((node) => map(node).x), canvasSize.width - FRAME_SKETCH_RIGHT_PAD);
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
  const labelPolicy = modelCanvasLabelPolicy({
    nodeCount: nodes.length,
    memberCount: members.length,
    nodeVisibleTarget: 12,
    memberVisibleTarget: 14,
  });
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
  const reservedLoadPoints = loads.flatMap((load) => {
    if (load.type === "nodal") {
      const hasForce = Math.abs(load.fxKn ?? 0) > 1e-9 || Math.abs(load.fyKn ?? 0) > 1e-9;
      const point = nodeMap.get(load.node);
      return hasForce && point ? [point] : [];
    }
    if (load.type !== "member_point") return [];
    const member = memberMap.get(load.member);
    const startNode = member ? nodeMap.get(member.start) : null;
    const endNode = member ? nodeMap.get(member.end) : null;
    const force = load.forceKn ?? 0;
    if (Math.abs(force) <= 1e-9 || !startNode || !endNode) return [];
    return [frameMemberPoint(startNode, endNode, load.positionRatio ?? 0.5)];
  });

  return (
    <svg viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} className="h-full w-full" data-model-canvas="frame" data-label-density={labelPolicy.density}>
      <g fontFamily={SVG_TEXT_FONT} fill="var(--model-label)" stroke="var(--model-label-halo)" strokeWidth="3" paintOrder="stroke">
        {frameDimensionLegendRows.map((row, index) => (
          <text key={`frame-dimension-legend-${index}`} x={frameDimensionLegendX} y={22 + index * 16} fontSize="12" fontWeight={MODEL_DIMENSION_TEXT_WEIGHT}>
            {row}
          </text>
        ))}
      </g>
      <g stroke="var(--model-member)" strokeLinecap="round" strokeLinejoin="round">
        {members.map((member, index) => {
          const start = nodeMap.get(member.start);
          const end = nodeMap.get(member.end);
          if (!start || !end) return null;
          const selected = selection?.mode === "frame" && selection.type === "member" && selection.id === member.id;
          const label = frameMemberLabelPlacement(start, end, frameCenter);
          const showLabel = shouldShowSteppedLabel({
            index,
            total: members.length,
            step: labelPolicy.memberLabelStep,
            selected,
          });
          return (
            <g key={member.id} {...svgInteractiveProps(`选择框架构件 ${member.id}`, () => onSelect?.({ mode: "frame", type: "member", id: member.id }))}>
              <title>{`框架构件 ${member.id}`}</title>
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth="18" />
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} strokeWidth={selected ? STRUCTURE_VISUAL_STROKES.modelSelectedMember : STRUCTURE_VISUAL_STROKES.modelMember} stroke={selected ? "var(--model-load)" : "var(--model-member)"} opacity={selected ? "0.85" : "1"} />
              {showLabel ? (
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
                  fontFamily={SVG_TEXT_FONT}
                  data-model-label="member"
                >
                  {member.id}
                </text>
              ) : null}
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
              <title>{`框架节点 ${node.id}`}</title>
              <FrameSupportMarker type={node.supportType} x={point.x} y={point.y} selected={Boolean(selected)} angleDeg={node.supportAngleDeg} />
              <circle cx={point.x} cy={point.y} r={selected ? "11" : "8"} fill="transparent" />
              <circle cx={point.x} cy={point.y} r={selected ? STRUCTURE_NODE_RADII.modelSelected : STRUCTURE_NODE_RADII.model} fill={selected ? "var(--model-load)" : "var(--model-node)"} />
            </g>
          ) : null;
        })}
      </g>
      <g stroke="var(--model-load)" strokeWidth={FRAME_LOAD_STROKE_WIDTH}>
        {loads.flatMap((load, index) => {
          if (load.type === "nodal") {
            const point = nodeMap.get(load.node);
            if (!point) return [];
            const items = [];
            const selectedStroke = selection?.mode === "frame" && selection.type === "load" && selection.id === `load-${index}` ? FRAME_LOAD_SELECTED_STROKE_WIDTH : FRAME_LOAD_STROKE_WIDTH;
            if (load.fxKn) {
              const sign = load.fxKn >= 0 ? 1 : -1;
              const x1 = point.x - sign * 48;
              const x2 = point.x - sign * 11;
              items.push(<path key={`${index}-fx`} d={`M${x1} ${point.y} L${x2} ${point.y}`} markerEnd="url(#frameArrow)" strokeWidth={selectedStroke} />);
            }
            if (load.fyKn) {
              const sign = load.fyKn >= 0 ? -1 : 1;
              const y1 = point.y - sign * 54;
              const y2 = point.y - sign * 12;
              items.push(<path key={`${index}-fy`} d={`M${point.x} ${y1} L${point.x} ${y2}`} markerEnd="url(#frameArrow)" strokeWidth={selectedStroke} />);
            }
            return items.length
              ? [
                  <g key={`${index}-nodal-load`} {...svgInteractiveProps(`选择框架荷载 ${index + 1}`, () => onSelect?.({ mode: "frame", type: "load", id: `load-${index}` }))}>
                    {items}
                  </g>,
                ]
              : [];
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
                strokeWidth={selection?.mode === "frame" && selection.type === "load" && selection.id === `load-${index}` ? FRAME_LOAD_SELECTED_STROKE_WIDTH : FRAME_LOAD_STROKE_WIDTH}
              />,
            ];
          }
          const q = getFrameLoadValue(load);
          if (!q) return [];
          const { startRatio, endRatio, qStart, qEnd } = getFrameDistributedLoadRange(load);
          const representative = Math.abs(qStart) >= Math.abs(qEnd) ? qStart : qEnd;
          const guideDirection = frameMemberLoadDirection(startNode, endNode, load.direction, representative || q);
          const selectedStroke = selection?.mode === "frame" && selection.type === "load" && selection.id === `load-${index}` ? FRAME_LOAD_SELECTED_STROKE_WIDTH : FRAME_LOAD_STROKE_WIDTH;
          const guideOffset = 45;
          const guideStart = frameMemberPoint(startNode, endNode, startRatio);
          const guideEnd = frameMemberPoint(startNode, endNode, endRatio);
          const maxQ = Math.max(Math.abs(qStart), Math.abs(qEnd), 1e-9);
          const arrowCount = Math.max(5, Math.min(12, Math.round((endRatio - startRatio) * 12)));
          const items = [
            <line
              key={`${index}-dist-guide`}
              x1={guideStart.x - guideDirection.x * guideOffset}
              y1={guideStart.y - guideDirection.y * guideOffset}
              x2={guideEnd.x - guideDirection.x * guideOffset}
              y2={guideEnd.y - guideDirection.y * guideOffset}
              strokeWidth={FRAME_LOAD_GUIDE_STROKE_WIDTH}
              strokeDasharray="5 4"
              opacity="0.85"
            />,
          ];
          for (let arrowIndex = 0; arrowIndex < arrowCount; arrowIndex += 1) {
            const ratio = startRatio + (endRatio - startRatio) * (arrowIndex / (arrowCount - 1));
            const loadRatio = (ratio - startRatio) / Math.max(endRatio - startRatio, 1e-9);
            const qAtRatio = qStart + (qEnd - qStart) * loadRatio;
            if (Math.abs(qAtRatio) <= 1e-9) continue;
            const direction = frameMemberLoadDirection(startNode, endNode, load.direction, qAtRatio);
            const x = startNode.x + (endNode.x - startNode.x) * ratio;
            const y = startNode.y + (endNode.y - startNode.y) * ratio;
            if (reservedLoadPoints.some((point) => Math.hypot(point.x - x, point.y - y) <= 16)) continue;
            const arrowLength = 30 + 14 * Math.abs(qAtRatio) / maxQ;
            items.push(
              <path
                key={`${index}-dist-${arrowIndex}`}
                d={`M${x - direction.x * arrowLength} ${y - direction.y * arrowLength} L${x - direction.x * 9} ${y - direction.y * 9}`}
                markerEnd="url(#frameArrow)"
                strokeWidth={selectedStroke}
              />
            );
          }
          return [
            <g key={`${index}-dist-load`} {...svgInteractiveProps(`选择框架荷载 ${index + 1}`, () => onSelect?.({ mode: "frame", type: "load", id: `load-${index}` }))}>
              {items}
            </g>,
          ];
        })}
      </g>
      <g fill="var(--model-label)" fontSize="11.5" fontWeight="600" fontFamily={SVG_TEXT_FONT}>
        {nodes.map((node, index) => {
          const label = nodeLabel(node);
          const selected = selection?.mode === "frame" && selection.type === "node" && selection.id === node.id;
          const pinned = Boolean(node.supportType && node.supportType !== "free");
          const showLabel = shouldShowSteppedLabel({
            index,
            total: nodes.length,
            step: labelPolicy.nodeLabelStep,
            selected,
            pinned,
          });
          return label && showLabel ? (
            <text key={node.id} x={label.x} y={label.y} textAnchor={label.anchor} data-model-label="node">
              {node.id}
            </text>
          ) : null;
        })}
      </g>
      <g fill="var(--model-load)" fontSize="10.5" fontWeight="600" fontFamily={SVG_TEXT_FONT}>
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
        <marker id="frameArrow" viewBox="0 0 8 8" markerWidth="7" markerHeight="7" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0 0 L8 4 L0 8z" fill="var(--model-load)" />
        </marker>
      </defs>
    </svg>
  );
}
