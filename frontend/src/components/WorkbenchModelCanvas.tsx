import { GlassCard } from "./ui/GlassCard";
import { createPortalFrameModelFromState, type WorkspaceState } from "../lib/workspace-state";
import type { AnalysisMode, FrameLoad, StructureNode } from "../types/structure";
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

function beamSupportLabel(type: string) {
  if (type === "fixed") return "固结";
  if (type === "roller") return "滚动";
  if (type === "free") return "自由";
  return "铰支";
}

function buildUniformLoadArrowXs(segments: Array<{ start: number; end: number }>) {
  if (!segments.length) return [];

  return segments.flatMap((segment) => {
    const width = segment.end - segment.start;
    if (width <= 0) return [];

    const innerRatios = width >= 180 ? [0.32, 0.68] : [0.5];
    return innerRatios.map((ratio) => segment.start + width * ratio);
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

function BeamSketch({ beam, selection, onSelect }: { beam: WorkspaceState["beam"]; selection?: WorkbenchSelection | null; onSelect?: (next: WorkbenchSelection) => void }) {
  const total = Math.max(1, beam.spans.reduce((sum, span) => sum + span.length, 0));
  const segments = beam.spans.reduce<Array<{ index: number; length: number; start: number; end: number }>>((items, span, index) => {
    const start = items[index - 1]?.end ?? 96;
    const end = start + (span.length / total) * 708;
    return [...items, { index, length: span.length, start, end }];
  }, []);
  const beamStart = segments[0]?.start ?? 96;
  const beamEnd = segments[segments.length - 1]?.end ?? 804;
  const linearRanges = activeBeamLinearLoads(beam).map((load) => ({
    load,
    ...buildLinearLoadRange(load, beamStart, beamEnd),
  }));
  const uniformArrows = buildUniformLoadArrowXs(segments);
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
  const visibleUniformArrows = uniformArrows.filter((x) => pointLoadXs.every((loadX) => Math.abs(loadX - x) >= loadArrowClearance));
  const visibleLinearArrows = linearArrows.map((arrows) => arrows.filter((x) => pointLoadXs.every((loadX) => Math.abs(loadX - x) >= loadArrowClearance)));
  const linearGuideBaseY = beam.uniformLoadEnabled ? 108 : 90;
  const linearGuideGap = hasMultipleLinearLoads ? 18 : 0;
  const linearLegendY = beam.uniformLoadEnabled ? 96 : 60;
  const pointLabelBaseY = beam.uniformLoadEnabled || linearRanges.length ? 116 : 74;

  return (
    <svg viewBox="0 0 900 300" className="h-full w-full">
      <line x1={beamStart} y1="150" x2={beamEnd} y2="150" stroke="var(--model-member)" strokeWidth="4.5" strokeLinecap="round" />
      {segments.map((segment) => {
        const selected = selection?.mode === "beam" && selection.type === "span" && selection.id === `span-${segment.index}`;
        return (
          <g key={segment.index} className="cursor-pointer" onClick={() => onSelect?.({ mode: "beam", type: "span", id: `span-${segment.index}` })}>
            <line x1={segment.start} y1="150" x2={segment.end} y2="150" stroke="transparent" strokeWidth="20" strokeLinecap="round" />
            {selected ? <line x1={segment.start} y1="150" x2={segment.end} y2="150" stroke="var(--model-load)" strokeWidth="7" strokeLinecap="round" opacity="0.55" /> : null}
            <line x1={segment.start} y1="184" x2={segment.end} y2="184" stroke="var(--model-guide)" strokeWidth="1.5" />
            <text x={(segment.start + segment.end) / 2} y="210" textAnchor="middle" fontSize="14" fill="var(--model-label)">
              第 {segment.index + 1} 跨 · {segment.length}m
            </text>
            <circle cx={segment.start} cy="150" r="5" fill="var(--model-node)" />
            {segment.index === segments.length - 1 ? (
              <>
                <circle cx={segment.end} cy="150" r="5" fill="var(--model-node)" />
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
            <rect x={x - 24} y="148" width="48" height="58" rx="12" fill={selected ? "var(--model-load)" : "transparent"} opacity={selected ? "0.1" : "0"} />
            {support.type === "fixed" ? (
              <rect x={x - 12} y="150" width="24" height="36" rx="2" fill="var(--model-support-fill)" stroke="var(--model-support-stroke)" strokeWidth="1.4" />
            ) : support.type === "free" ? (
              <circle cx={x} cy="150" r="9" fill="none" stroke="var(--model-support-stroke)" strokeWidth="1.6" strokeDasharray="3 3" />
            ) : (
              <>
                <polygon points={`${x - 15},180 ${x + 15},180 ${x},154`} fill="var(--model-support-fill)" stroke="var(--model-support-stroke)" strokeWidth="1.4" />
                <line x1={x - 18} y1="184" x2={x + 18} y2="184" stroke="var(--model-support-line)" strokeWidth="2.2" />
                {support.type === "roller" ? (
                  <>
                    <circle cx={x - 8} cy="190" r="3" fill="none" stroke="var(--model-support-stroke)" strokeWidth="1.4" />
                    <circle cx={x + 8} cy="190" r="3" fill="none" stroke="var(--model-support-stroke)" strokeWidth="1.4" />
                  </>
                ) : null}
              </>
            )}
            <text x={x} y="224" textAnchor="middle" fontSize="11" fontWeight="700" fill={selected ? "var(--model-load)" : "var(--model-label)"}>
              {support.id} · {beamSupportLabel(support.type)}
            </text>
          </g>
        );
      })}
      <g className="cursor-pointer" onClick={() => onSelect?.({ mode: "beam", type: "load", id: "primary" })}>
        <rect x={beamStart - 20} y="54" width={beamEnd - beamStart + 40} height="95" fill="transparent" />
        {selection?.mode === "beam" && selection.type === "load" ? <rect x={beamStart - 16} y="58" width={beamEnd - beamStart + 32} height="88" rx="14" fill="var(--model-load)" opacity="0.07" /> : null}
        {beam.uniformLoadEnabled ? (
          <text x={(beamStart + beamEnd) / 2} y="72" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--model-load)">
            q = {formatMagnitude(beam.q)} 千牛/米
          </text>
        ) : null}
        {linearRanges.length === 1 ? linearRanges.map((range) => {
          const linearLengthM = total * (range.endRatio - range.startRatio);
          const labelX = Math.min(beamEnd - 150, Math.max(beamStart + 150, (range.startX + range.endX) / 2));
          const titleY = beam.uniformLoadEnabled ? 95 : 58;
          const subtitleY = titleY + 17;
          const guideY = linearGuideBaseY;
          return (
            <g key={range.load.id}>
              <text x={labelX} y={titleY} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--model-load)">
                q = {formatMagnitude(range.startLoad)} → {formatMagnitude(range.endLoad)} 千牛/米
              </text>
              <text x={labelX} y={subtitleY} textAnchor="middle" fontSize="11" fill="var(--model-label)">
                作用区间 {range.startRatio.toFixed(2)}-{range.endRatio.toFixed(2)}，长度 {linearLengthM.toFixed(2)} 米
              </text>
              <line x1={range.startX} y1={guideY} x2={range.endX} y2={guideY} stroke="var(--model-load)" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.75" />
            </g>
          );
        }) : (
          <g fontFamily={svgTextFont}>
            {linearRanges.map((range, index) => {
              const linearLengthM = total * (range.endRatio - range.startRatio);
              const y = linearLegendY + index * 18;
              const guideY = linearGuideBaseY + index * linearGuideGap;
              return (
                <g key={range.load.id}>
                  <line x1={beamStart + 4} y1={y - 4} x2={beamStart + 32} y2={y - 4} stroke="var(--model-load)" strokeWidth="1.7" strokeDasharray="5 5" />
                  <text x={beamStart + 40} y={y} textAnchor="start" fontSize="11.5" fontWeight="700" fill="var(--model-load)">
                    {range.load.id}: {formatMagnitude(range.startLoad)} → {formatMagnitude(range.endLoad)} kN/m
                  </text>
                  <text x={beamStart + 190} y={y} textAnchor="start" fontSize="10.5" fill="var(--model-label)">
                    区间 {range.startRatio.toFixed(2)}-{range.endRatio.toFixed(2)} / {linearLengthM.toFixed(2)}m
                  </text>
                  <line x1={range.startX} y1={guideY} x2={range.endX} y2={guideY} stroke="var(--model-load)" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.75" />
                </g>
              );
            })}
          </g>
        )}
      </g>
      <g stroke="var(--model-load)" strokeWidth={selection?.mode === "beam" && selection.type === "load" ? "3" : "2.1"} className="cursor-pointer" onClick={() => onSelect?.({ mode: "beam", type: "load", id: "primary" })}>
        {beam.uniformLoadEnabled ? visibleUniformArrows.map((x, index) => (
          <path key={`uniform-${index}`} d={`M${x.toFixed(1)} 86 L${x.toFixed(1)} 132`} markerEnd="url(#modelArrow)" />
        )) : null}
        {visibleLinearArrows.flatMap((arrows, loadIndex) => {
          const guideY = linearGuideBaseY + loadIndex * linearGuideGap;
          const arrowEndY = 132;
          return arrows.map((x, arrowIndex) => {
            const top = guideY - 8 + (linearRanges.length === 1 ? arrowIndex * 4 : 0);
            return <path key={`linear-${loadIndex}-${arrowIndex}`} d={`M${x.toFixed(1)} ${top} L${x.toFixed(1)} ${arrowEndY}`} markerEnd="url(#modelArrow)" />;
          });
        })}
        {pointLoads.map((load, index) => {
          const x = beamStart + (beamEnd - beamStart) * clampRatio(load.positionRatio, 0.5);
          const labelY = pointLabelBaseY + (index % 2) * 16;
          const labelX = Math.min(beamEnd - 64, Math.max(beamStart + 64, x));
          return (
            <g key={load.id}>
              <path d={`M${x.toFixed(1)} ${labelY + 10} L${x.toFixed(1)} 132`} markerEnd="url(#modelArrow)" />
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                fontSize="11.5"
                fontWeight="700"
                fill="var(--model-load)"
                stroke="var(--model-load-halo)"
                strokeWidth="3"
                paintOrder="stroke"
                fontFamily={svgTextFont}
              >
                {load.id} = {formatMagnitude(load.magnitudeKn)} 千牛
              </text>
            </g>
          );
        })}
      </g>
      <g fill="var(--model-label)" stroke="var(--model-label-halo)" strokeWidth="4" paintOrder="stroke" fontSize="12" fontWeight="700" fontFamily={svgTextFont}>
        {nodeLabels.map((label) => (
          <text key={`node-label-${label.index}`} x={label.labelX} y="132" textAnchor={label.anchor}>
            节点 {label.index + 1}
          </text>
        ))}
      </g>
      <defs>
        <marker id="modelArrow" viewBox="0 0 8 8" markerWidth="6.5" markerHeight="6.5" refX="7" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8z" fill="var(--model-load)" />
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
          const q = getFrameLoadValue(load);
          if (!q) return [];
          const dx = endNode.x - startNode.x;
          const dy = endNode.y - startNode.y;
          const length = Math.hypot(dx, dy) || 1;
          const localY = { x: dy / length, y: -dx / length };
          const positiveDirection = load.direction === "global_y" ? { x: 0, y: -1 } : localY;
          const direction = q >= 0 ? positiveDirection : { x: -positiveDirection.x, y: -positiveDirection.y };
          return [0.22, 0.5, 0.78].map((ratio, arrowIndex) => {
            const x = startNode.x + (endNode.x - startNode.x) * ratio;
            const y = startNode.y + (endNode.y - startNode.y) * ratio;
            return (
              <path
                key={`${index}-dist-${arrowIndex}`}
                className="cursor-pointer"
                onClick={() => onSelect?.({ mode: "frame", type: "load", id: `load-${index}` })}
                d={`M${x - direction.x * 42} ${y - direction.y * 42} L${x - direction.x * 9} ${y - direction.y * 9}`}
                markerEnd="url(#frameArrow)"
                strokeWidth={selection?.mode === "frame" && selection.type === "load" && selection.id === `load-${index}` ? "3.2" : "2"}
              />
            );
          });
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
          const q = getFrameLoadValue(load);
          if (!q) return null;
          const dx = endNode.x - startNode.x;
          const dy = endNode.y - startNode.y;
          const length = Math.hypot(dx, dy) || 1;
          const localY = { x: dy / length, y: -dx / length };
          const positiveDirection = load.direction === "global_y" ? { x: 0, y: -1 } : localY;
          const direction = q >= 0 ? positiveDirection : { x: -positiveDirection.x, y: -positiveDirection.y };
          const memberMid = {
            x: (startNode.x + endNode.x) / 2,
            y: (startNode.y + endNode.y) / 2,
          };
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
              梁面均布荷载 {formatMagnitude(q)} 千牛/米
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
        return (
          <g key={member.id} className="cursor-pointer" onClick={() => onSelect?.({ mode: "truss", type: "member", id: member.id })}>
            <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth="18" strokeLinecap="round" />
            <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={selected ? "var(--model-load)" : "var(--model-member)"} strokeWidth={selected ? "7" : "4.5"} strokeLinecap="round" opacity={selected ? "0.85" : "1"} />
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
          if (load.type !== "nodal") return [];
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
