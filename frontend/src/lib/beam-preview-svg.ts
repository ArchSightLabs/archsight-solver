import type { BeamLoadMarker, BeamPreviewData, BeamSupport } from "../types/beam";
import { formatEngineeringValue } from "./engineering-format.ts";

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
const SVG_TEXT_FONT = "Inter, Microsoft YaHei, system-ui, sans-serif";
const MONO_TEXT_FONT = "Fira Code, ui-monospace, SFMono-Regular, Consolas, monospace";

const PREVIEW_COLORS = {
  background: "#ffffff",
  supportFill: "#d6dee8",
  supportStroke: "#718096",
  supportLine: "#64748b",
  label: "#475569",
  load: "#334155",
  guide: "#64748b",
  baseStart: "#2f5f8f",
  baseEnd: "#285778",
  deformed: "#0f766e",
  node: "#2f5f8f",
  peak: "#92400e",
  peakDot: "#d97706",
  peakDotStroke: "#ffedd5",
  textHalo: "#f8fafc",
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

function supportTypeLabel(type: string) {
  if (type === "fixed") return "固结";
  if (type === "roller") return "滚动";
  if (type === "free") return "自由端";
  return "铰支";
}

function distributedArrowXs(startX: number, endX: number) {
  const width = Math.max(0, endX - startX);
  const arrowCount = Math.max(3, Math.min(30, Math.floor(width / 28)));
  return Array.from({ length: arrowCount }, (_, index) => startX + width * ((index + 0.5) / arrowCount));
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
      label: `q = ${Math.abs(intensity).toFixed(1)} kN/m`,
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
        label: `q = ${Math.abs(first.intensityKnPerM ?? 0).toFixed(1)} -> ${Math.abs(last?.intensityKnPerM ?? 0).toFixed(1)} kN/m`,
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

function supportSvg(support: BeamSupport, index: number, x: number) {
  const label = `${support.label ?? `S${index + 1}`} ${supportTypeLabel(support.type)}`;
  if (support.type === "fixed") {
    return `
      <g>
        <rect x="${n(x - 14)}" y="${n(BEAM_Y - 5)}" width="28" height="44" rx="3" fill="${PREVIEW_COLORS.supportFill}" stroke="${PREVIEW_COLORS.supportStroke}" stroke-width="1" />
        <text x="${n(x)}" y="${n(BEAM_Y + 56)}" fill="${PREVIEW_COLORS.label}" text-anchor="middle" font-size="11" font-family="${SVG_TEXT_FONT}">${escapeSvg(label)}</text>
      </g>`;
  }
  if (support.type === "free") {
    return `
      <g>
        <circle cx="${n(x)}" cy="${n(BEAM_Y)}" r="7" fill="none" stroke="${PREVIEW_COLORS.supportStroke}" stroke-dasharray="3 3" />
        <text x="${n(x)}" y="${n(BEAM_Y + 34)}" fill="${PREVIEW_COLORS.label}" text-anchor="middle" font-size="11" font-family="${SVG_TEXT_FONT}">${escapeSvg(label)}</text>
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
      <text x="${n(x)}" y="${n(BEAM_Y + (support.type === "roller" ? 58 : 44))}" fill="${PREVIEW_COLORS.label}" text-anchor="middle" font-size="11" font-family="${SVG_TEXT_FONT}">${escapeSvg(label)}</text>
    </g>`;
}

export function buildBeamPreviewSvg(beam: BeamPreviewData) {
  const totalLength = beam.totalLength || 1;
  const mapX = (x: number) => BEAM_LEFT + (x / totalLength) * BEAM_LEN;
  const maxDeflectionMm = Math.max(1, ...(beam.curve ?? []).map((point) => Math.abs(point.vMm)));
  const mapY = (vMm: number) => BEAM_Y - (vMm / maxDeflectionMm) * 80;
  const curvePoints = (beam.curve ?? []).map((point) => `${n(mapX(point.x))},${n(mapY(point.vMm))}`).join(" ");
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
  <text x="32" y="28" fill="${PREVIEW_COLORS.label}" font-size="12" font-family="${MONO_TEXT_FONT}">梁长 = ${escapeSvg(totalLength.toFixed(2))} m</text>
  <line x1="${BEAM_LEFT}" y1="${BEAM_Y}" x2="${BEAM_RIGHT}" y2="${BEAM_Y}" stroke="url(#beamReportGrad)" stroke-width="7" stroke-linecap="round" />
  ${(beam.supports ?? []).map((support, index) => supportSvg(support, index, mapX(support.x))).join("")}
  ${(beam.nodes ?? [])
    .map((node) => `<circle cx="${n(mapX(node.x))}" cy="${BEAM_Y}" r="4" fill="${node.support ? PREVIEW_COLORS.node : PREVIEW_COLORS.guide}" />`)
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
        <text x="${n(load.svgX + (index % 2 === 0 ? -8 : 8))}" y="${n(load.labelY)}" fill="${PREVIEW_COLORS.label}" text-anchor="${index % 2 === 0 ? "end" : "start"}" font-size="11" stroke="${PREVIEW_COLORS.textHalo}" stroke-width="4" paint-order="stroke" font-family="${SVG_TEXT_FONT}">P = ${escapeSvg(Math.abs(load.intensityKn ?? 0).toFixed(1))} kN</text>
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
