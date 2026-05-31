import type { BeamLoadMarker, BeamPreviewData, BeamSupport } from "../types/beam";
import { buildBeamSpanDimensionLegendRows, buildBeamSpanDimensionSegments, formatBeamDimensionLength } from "./beam-span-dimensions.ts";
import { formatEngineeringValue } from "./engineering-format.ts";
import { STRUCTURE_OBJECT_COLORS, STRUCTURE_STATE_COLORS, STRUCTURE_VISUAL_STROKES } from "./structure-visual-tokens.ts";

type BeamLoadArrow = BeamLoadMarker & {
  svgX: number;
  y1: number;
  y2: number;
  labelY: number;
};

type BeamDistributedLoadBand = {
  key: string;
  startX: number;
  endX: number;
  labelX: number;
  guideY: number;
  labelY: number;
  arrowStartY: number;
  arrowEndY: number;
  arrowXs: number[];
  label: string;
};

export const BEAM_PREVIEW_SVG_WIDTH = 1000;
export const BEAM_PREVIEW_SVG_HEIGHT = 300;

const BEAM_Y = 150;
const BEAM_LEFT = 80;
const BEAM_RIGHT = 920;
const BEAM_LEN = BEAM_RIGHT - BEAM_LEFT;
const PEAK_LABEL_Y = 46;
const SPAN_MEMBER_LABEL_Y = BEAM_Y + 22;
const NODE_BADGE_OFFSET_X = 10;
const NODE_BADGE_OFFSET_Y = -18;
const SVG_TEXT_FONT = "Inter, Microsoft YaHei, system-ui, sans-serif";

const PREVIEW_COLORS = {
  background: "#ffffff",
  supportFill: STRUCTURE_OBJECT_COLORS.supportFill,
  supportStroke: STRUCTURE_OBJECT_COLORS.supportStroke,
  supportLine: STRUCTURE_OBJECT_COLORS.supportLine,
  label: STRUCTURE_OBJECT_COLORS.label,
  load: STRUCTURE_OBJECT_COLORS.load,
  guide: STRUCTURE_OBJECT_COLORS.supportLine,
  baseStart: STRUCTURE_OBJECT_COLORS.member,
  baseEnd: STRUCTURE_OBJECT_COLORS.member,
  deformed: STRUCTURE_STATE_COLORS.deformedStart,
  node: STRUCTURE_OBJECT_COLORS.node,
  peak: STRUCTURE_STATE_COLORS.peakLabel,
  peakDot: STRUCTURE_STATE_COLORS.peakDot,
  peakDotStroke: STRUCTURE_STATE_COLORS.peakDotStroke,
  badgeFill: STRUCTURE_OBJECT_COLORS.badgeFill,
  badgeStroke: STRUCTURE_OBJECT_COLORS.badgeStroke,
  badgeText: STRUCTURE_OBJECT_COLORS.badgeText,
  textHalo: STRUCTURE_OBJECT_COLORS.textHalo,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function escapeSvg(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function n(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : "0.0";
}

function distributedArrowXs(startX: number, endX: number) {
  const width = Math.max(0, endX - startX);
  const arrowCount = Math.max(3, Math.min(30, Math.floor(width / 28) + 1));
  return Array.from({ length: arrowCount }, (_, index) => startX + width * (index / (arrowCount - 1)));
}

function buildDistributedLoadBands(beam: BeamPreviewData, mapX: (x: number) => number): BeamDistributedLoadBand[] {
  const loads = beam.loads ?? [];
  const totalLength = beam.totalLength || 1;
  const bands: BeamDistributedLoadBand[] = [];
  const uniformLoads = loads.filter((load) => load.type === "uniform");
  const linearLoads = loads.filter((load) => load.type === "linear");

  uniformLoads.forEach((load, index) => {
    const startX = mapX(load.startX ?? Math.max(0, load.x - (load.length ?? totalLength) / 2));
    const endX = mapX(load.endX ?? Math.min(totalLength, load.x + (load.length ?? totalLength) / 2));
    const intensity = load.intensityKnPerM ?? 0;
    const downward = intensity >= 0;
    const guideY = downward ? BEAM_Y - 70 : BEAM_Y + 70;
    bands.push({
      key: `uniform-${index}`,
      startX,
      endX,
      labelX: (startX + endX) / 2,
      guideY,
      labelY: downward ? guideY - 10 : guideY + 18,
      arrowStartY: downward ? guideY + 5 : guideY - 5,
      arrowEndY: downward ? BEAM_Y - 8 : BEAM_Y + 8,
      arrowXs: distributedArrowXs(startX, endX),
      label: `q=${Math.abs(intensity).toFixed(1)} kN/m`,
    });
  });

  if (linearLoads.length) {
    const grouped = new Map<string, BeamLoadMarker[]>();
    linearLoads.forEach((load) => {
      const key = `${load.startX ?? load.x}:${load.endX ?? load.x}`;
      grouped.set(key, [...(grouped.get(key) ?? []), load]);
    });

    Array.from(grouped.values()).forEach((group, index) => {
      const sortedGroup = group.slice().sort((a, b) => a.x - b.x);
      const first = sortedGroup[0];
      const last = sortedGroup[sortedGroup.length - 1] ?? first;
      if (!first) return;
      const startX = mapX(first.startX ?? first.x ?? 0);
      const endX = mapX(first.endX ?? last?.x ?? totalLength);
      const averageIntensity = sortedGroup.reduce((sum, load) => sum + (load.intensityKnPerM ?? 0), 0) / Math.max(1, sortedGroup.length);
      const downward = averageIntensity >= 0;
      const guideY = downward ? BEAM_Y - (uniformLoads.length ? 52 : 70) : BEAM_Y + (uniformLoads.length ? 52 : 70);
      bands.push({
        key: `linear-${index}`,
        startX,
        endX,
        labelX: (startX + endX) / 2,
        guideY,
        labelY: downward ? guideY - 10 : guideY + 18,
        arrowStartY: downward ? guideY + 5 : guideY - 5,
        arrowEndY: downward ? BEAM_Y - 8 : BEAM_Y + 8,
        arrowXs: distributedArrowXs(startX, endX),
        label: `q=${Math.abs(first.intensityKnPerM ?? 0).toFixed(1)}->${Math.abs(last?.intensityKnPerM ?? 0).toFixed(1)} kN/m`,
      });
    });
  }

  return bands;
}

function buildPointLoadArrows(beam: BeamPreviewData, mapX: (x: number) => number): BeamLoadArrow[] {
  return (beam.loads ?? [])
    .filter((load) => load.type === "point")
    .map((load): BeamLoadArrow => {
      const x = mapX(load.x);
      const magnitude = load.intensityKnPerM ?? load.intensityKn ?? 1;
      const length = 30 + Math.min(44, Math.abs(magnitude) * 1.5);
      const isUpward = magnitude < 0;
      return {
        ...load,
        svgX: x,
        y1: isUpward ? BEAM_Y + length : BEAM_Y - length,
        y2: BEAM_Y,
        labelY: isUpward ? BEAM_Y + length + 16 : BEAM_Y - length - 8,
      };
    });
}

function supportSvg(support: BeamSupport, x: number) {
  if (support.type === "fixed") {
    return `
      <g>
        <rect x="${n(x - 14)}" y="${n(BEAM_Y - 5)}" width="28" height="44" rx="3" fill="${PREVIEW_COLORS.supportFill}" stroke="${PREVIEW_COLORS.supportStroke}" stroke-width="1" />
      </g>`;
  }
  if (support.type === "free") {
    return `
      <g>
        <circle cx="${n(x)}" cy="${n(BEAM_Y)}" r="7" fill="none" stroke="${PREVIEW_COLORS.supportStroke}" stroke-dasharray="3 3" />
      </g>`;
  }

  const rollers =
    support.type === "roller"
      ? `
        <circle cx="${n(x - 9)}" cy="${n(BEAM_Y + 36)}" r="3" fill="none" stroke="${PREVIEW_COLORS.supportStroke}" stroke-width="1" />
        <circle cx="${n(x + 9)}" cy="${n(BEAM_Y + 36)}" r="3" fill="none" stroke="${PREVIEW_COLORS.supportStroke}" stroke-width="1" />`
      : "";
  return `
    <g>
      <polygon points="${n(x - 16)},${n(BEAM_Y + 26)} ${n(x + 16)},${n(BEAM_Y + 26)} ${n(x)},${n(BEAM_Y + 2)}" fill="${PREVIEW_COLORS.supportFill}" stroke="${PREVIEW_COLORS.supportStroke}" stroke-width="1" />
      <line x1="${n(x - 18)}" y1="${n(BEAM_Y + 30)}" x2="${n(x + 18)}" y2="${n(BEAM_Y + 30)}" stroke="${PREVIEW_COLORS.supportLine}" stroke-width="2" />
      ${rollers}
    </g>`;
}

export function buildBeamPreviewSvg(beam: BeamPreviewData) {
  const totalLength = beam.totalLength || 1;
  const mapX = (x: number) => BEAM_LEFT + (x / totalLength) * BEAM_LEN;
  const maxDeflectionMm = Math.max(1, ...(beam.curve ?? []).map((point) => Math.abs(point.vMm)));
  const mapY = (vMm: number) => BEAM_Y - (vMm / maxDeflectionMm) * 80;
  const curvePoints = (beam.curve ?? []).map((point) => `${n(mapX(point.x))},${n(mapY(point.vMm))}`).join(" ");
  const spanDimensions = buildBeamSpanDimensionSegments(beam.spans ?? [], totalLength, BEAM_LEFT, BEAM_RIGHT, {
    memberIds: beam.spanIds,
    nodeIds: beam.nodes?.map((node, index) => node.id ?? `${index + 1}`),
  });
  const dimensionLegendRows = [`梁长=${formatBeamDimensionLength(totalLength)}`, ...buildBeamSpanDimensionLegendRows(spanDimensions, 420, 12)];
  const loadBands = buildDistributedLoadBands(beam, mapX);
  const pointLoads = buildPointLoadArrows(beam, mapX);
  const peakPoint = beam.maxDeflection
    ? {
        x: mapX(beam.maxDeflection.xM),
        y: mapY(beam.maxDeflection.valueMm),
      }
    : null;
  const peakLabel = peakPoint
    ? {
        x: clamp(peakPoint.x, BEAM_LEFT + 92, BEAM_RIGHT - 92),
        y: PEAK_LABEL_Y,
        anchor: peakPoint.x < BEAM_LEFT + 120 ? "start" : peakPoint.x > BEAM_RIGHT - 120 ? "end" : "middle",
      }
    : null;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BEAM_PREVIEW_SVG_WIDTH} ${BEAM_PREVIEW_SVG_HEIGHT}" width="${BEAM_PREVIEW_SVG_WIDTH}" height="${BEAM_PREVIEW_SVG_HEIGHT}">
  <defs>
    <linearGradient id="beamReportGrad" x1="0%" x2="100%">
      <stop offset="0%" stop-color="${PREVIEW_COLORS.baseStart}" stop-opacity="0.95" />
      <stop offset="100%" stop-color="${PREVIEW_COLORS.baseEnd}" stop-opacity="0.95" />
    </linearGradient>
    <marker id="beamReportArrowLoad" viewBox="0 0 8 8" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 z" fill="${PREVIEW_COLORS.load}" />
    </marker>
  </defs>
  <rect x="0" y="0" width="${BEAM_PREVIEW_SVG_WIDTH}" height="${BEAM_PREVIEW_SVG_HEIGHT}" fill="${PREVIEW_COLORS.background}" />
  <g fill="${PREVIEW_COLORS.label}" stroke="${PREVIEW_COLORS.textHalo}" stroke-width="3" paint-order="stroke" font-family="${SVG_TEXT_FONT}">
    ${dimensionLegendRows.map((row, index) => `<text x="32" y="${28 + index * 15}" font-size="12" font-weight="600">${escapeSvg(row)}</text>`).join("")}
  </g>
  <line x1="${BEAM_LEFT}" y1="${BEAM_Y}" x2="${BEAM_RIGHT}" y2="${BEAM_Y}" stroke="url(#beamReportGrad)" stroke-width="${STRUCTURE_VISUAL_STROKES.previewMember}" stroke-linecap="round" />
  <g fill="${PREVIEW_COLORS.label}" stroke="${PREVIEW_COLORS.textHalo}" stroke-width="3" paint-order="stroke" font-family="${SVG_TEXT_FONT}">
    ${spanDimensions.map((dimension) => {
      if (!dimension.label) return "";
      const midX = (dimension.start + dimension.end) / 2;
      return `<text x="${n(midX)}" y="${SPAN_MEMBER_LABEL_Y}" text-anchor="middle" font-size="12" font-weight="700">${escapeSvg(dimension.label)}</text>`;
    }).join("")}
  </g>
  ${(beam.supports ?? []).map((support) => supportSvg(support, mapX(support.x))).join("")}
  ${(beam.nodes ?? [])
    .map((node, index) => {
      const x = mapX(node.x);
      const badgeX = x + NODE_BADGE_OFFSET_X;
      const badgeY = BEAM_Y + NODE_BADGE_OFFSET_Y;
      return `<g><circle cx="${n(x)}" cy="${BEAM_Y}" r="4" fill="${node.support ? PREVIEW_COLORS.node : PREVIEW_COLORS.guide}" /><circle cx="${n(badgeX)}" cy="${n(badgeY)}" r="8" fill="${PREVIEW_COLORS.badgeFill}" stroke="${PREVIEW_COLORS.badgeStroke}" stroke-width="1.3" /><text x="${n(badgeX)}" y="${n(badgeY)}" fill="${PREVIEW_COLORS.badgeText}" text-anchor="middle" dominant-baseline="middle" font-size="9" font-weight="700" font-family="${SVG_TEXT_FONT}">${escapeSvg(node.id ?? `${index + 1}`)}</text></g>`;
    })
    .join("")}
  ${loadBands
    .map(
      (band) => `
      <g>
        <line x1="${n(band.startX)}" y1="${n(band.guideY)}" x2="${n(band.endX)}" y2="${n(band.guideY)}" stroke="${PREVIEW_COLORS.load}" stroke-width="1.7" opacity="0.86" />
        ${band.arrowXs.map((x) => `<line x1="${n(x)}" y1="${n(band.arrowStartY)}" x2="${n(x)}" y2="${n(band.arrowEndY)}" stroke="${PREVIEW_COLORS.load}" stroke-width="1.8" marker-end="url(#beamReportArrowLoad)" />`).join("")}
        <text x="${n(band.labelX)}" y="${n(band.labelY)}" fill="${PREVIEW_COLORS.label}" text-anchor="middle" font-size="11" stroke="${PREVIEW_COLORS.textHalo}" stroke-width="4" paint-order="stroke" font-weight="500" font-family="${SVG_TEXT_FONT}">${escapeSvg(band.label)}</text>
      </g>`,
    )
    .join("")}
  ${pointLoads
    .map(
      (load, index) => `
      <g>
        <line x1="${n(load.svgX)}" y1="${n(load.y1)}" x2="${n(load.svgX)}" y2="${n(load.y2)}" stroke="${PREVIEW_COLORS.load}" stroke-width="2" marker-end="url(#beamReportArrowLoad)" />
        <text x="${n(load.svgX + (index % 2 === 0 ? -8 : 8))}" y="${n(load.labelY)}" fill="${PREVIEW_COLORS.label}" text-anchor="${index % 2 === 0 ? "end" : "start"}" font-size="11" stroke="${PREVIEW_COLORS.textHalo}" stroke-width="4" paint-order="stroke" font-family="${SVG_TEXT_FONT}">P=${escapeSvg(Math.abs(load.intensityKn ?? 0).toFixed(1))}kN</text>
      </g>`,
    )
    .join("")}
  ${curvePoints ? `<polyline points="${curvePoints}" fill="none" stroke="${PREVIEW_COLORS.deformed}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />` : ""}
  ${
    beam.maxDeflection && peakPoint && peakLabel
      ? `
      <g>
        <line x1="${n(peakPoint.x)}" y1="${n(peakPoint.y)}" x2="${n(peakLabel.x)}" y2="${n(peakLabel.y + 22)}" stroke="${PREVIEW_COLORS.peak}" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="4 4" />
        <circle cx="${n(peakPoint.x)}" cy="${n(peakPoint.y)}" r="5" fill="${PREVIEW_COLORS.peakDot}" stroke="${PREVIEW_COLORS.peakDotStroke}" stroke-width="1.5" />
        <text x="${n(peakLabel.x)}" y="${n(peakLabel.y)}" fill="${PREVIEW_COLORS.peak}" stroke="${PREVIEW_COLORS.textHalo}" stroke-width="4" paint-order="stroke" text-anchor="${peakLabel.anchor}" font-size="11" font-weight="600" font-family="${SVG_TEXT_FONT}">
          <tspan x="${n(peakLabel.x)}" dy="0">最大挠度 ${escapeSvg(formatEngineeringValue(Math.abs(beam.maxDeflection.valueMm), "mm"))}</tspan>
          <tspan x="${n(peakLabel.x)}" dy="15">距左端 ${escapeSvg(beam.maxDeflection.xM.toFixed(2))} m</tspan>
        </text>
      </g>`
      : ""
  }
  <line x1="${BEAM_LEFT}" y1="${BEAM_Y + 80}" x2="${BEAM_RIGHT}" y2="${BEAM_Y + 80}" stroke="${PREVIEW_COLORS.guide}" stroke-opacity="0.45" stroke-dasharray="6 6" />
</svg>`.trim();
}
