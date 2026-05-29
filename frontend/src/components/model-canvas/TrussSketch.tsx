import { buildTrussMemberLengthDimension, buildTrussMemberLengthLegendRows, buildTrussSupportMarkerGeometry } from "../truss-preview-utils";
import type { WorkspaceState } from "../../lib/workspace-state";
import type { TrussLoad } from "../../types/structure";
import type { WorkbenchSelection } from "../../types/workbench-selection";
import { MODEL_DIMENSION_TEXT_WEIGHT, SVG_TEXT_FONT, formatMagnitude, formatSignedMagnitude, svgInteractiveProps } from "./shared";

type TrussMemberLoad = Extract<TrussLoad, { type: "distributed" | "member_load" | "member" }>;

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

export function TrussSketch({ workspace, selection, onSelect }: { workspace: WorkspaceState; selection?: WorkbenchSelection | null; onSelect?: (next: WorkbenchSelection) => void }) {
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
      x: point.x + (isLeftSide ? -14 : 14),
      y: point.y - 10,
      anchor: isLeftSide ? ("end" as const) : ("start" as const),
    };
  };

  return (
    <svg viewBox="0 0 900 360" className="h-full w-full">
      <g fontFamily={SVG_TEXT_FONT} fill="var(--model-label)" stroke="var(--model-label-halo)" strokeWidth="3" paintOrder="stroke">
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
              fontFamily={SVG_TEXT_FONT}
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
              { key: "start", force: startForce, anchor: pointOnSegment(start, end, 0) },
              { key: "end", force: endForce, anchor: pointOnSegment(start, end, 1) },
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
                  fontFamily={SVG_TEXT_FONT}
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
                  fontFamily={SVG_TEXT_FONT}
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
                  fontFamily={SVG_TEXT_FONT}
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

