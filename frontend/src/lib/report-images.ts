import type { BeamCalculationResults } from "../types/beam";
import { BEAM_PREVIEW_SVG_HEIGHT, BEAM_PREVIEW_SVG_WIDTH, buildBeamPreviewSvg } from "./beam-preview-svg";
import { BEAM_RESULT_DIAGRAM_SVG_HEIGHT, BEAM_RESULT_DIAGRAM_SVG_WIDTH, beamReportMetricToDiagramMetric, buildBeamResultDiagramSvg } from "./beam-result-diagram-svg";
import { assertReportImagesReady } from "./report-image-requirements";
import { buildReportImagePlan, type ReportImagePlanInput } from "./report-image-plan";
import type { BeamReportFigure } from "./report-figure-catalog";
import {
  MEMBER_COLORS,
  renderLineChart,
  renderSvgToPng,
  type ReportLineSeries,
} from "./report-rendering";
import { renderFrameOverlay, renderFramePreview, renderTrussOverlay, renderTrussPreview } from "./report-structure-images";

export type ReportImages = Record<string, string>;

type ReportInput = ReportImagePlanInput;

export async function buildReportImages(input: ReportInput): Promise<ReportImages> {
  const images: ReportImages = {};

  for (const item of buildReportImagePlan(input)) {
    switch (item.kind) {
      case "beamPreview":
        if (input.beamResults) images[item.key] = await renderBeamPreview(input.beamResults, item.viewSettings);
        break;
      case "beamOverlay":
        if (input.beamResults) images[item.key] = await renderBeamOverlay(input.beamResults, item.figure.metric, item.viewSettings);
        break;
      case "beamTraditional":
        if (input.beamResults) images[item.key] = await renderBeamTraditionalImage(input.beamResults, item.figure, item.viewSettings);
        break;
      case "framePreview":
        if (input.frameResults) images[item.key] = await renderFramePreview(input.frameResults, item.viewSettings);
        break;
      case "frameOverlay":
        if (input.frameResults) images[item.key] = await renderFrameOverlay(input.frameResults, item.figure.metric, item.viewSettings);
        break;
      case "trussPreview":
        if (input.trussResults) images[item.key] = await renderTrussPreview(input.trussResults, item.viewSettings);
        break;
      case "trussOverlay":
        if (input.trussResults) images[item.key] = await renderTrussOverlay(input.trussResults, item.figure.metric, item.viewSettings);
        break;
      case "sensitivity":
        if (input.sensitivityData) images[item.key] = await renderSensitivityImage(input.sensitivityData);
        break;
      default:
        assertNever(item);
    }
  }

  assertReportImagesReady(images, input);
  return images;
}

async function renderBeamTraditionalImage(beam: BeamCalculationResults, figure: BeamReportFigure, _viewSettings?: import("../types/structure").ResultViewSettings | null) {
  const series = beamTraditionalSeries(beam, figure);
  return renderLineChart({
    xLabels: beam.x_data.map((value) => value.toFixed(2)),
    yLabel: `${series.name}（${figure.unit}）`,
    unit: figure.unit,
    series: [series],
  });
}

async function renderSensitivityImage(sensitivityData: ReportInput["sensitivityData"]) {
  if (!sensitivityData) return "";
  return renderLineChart({
    xLabels: sensitivityData.variations.map((value) => `${(value * 100).toFixed(0)}%`),
    yLabel: `${sensitivityData.responseLabel}（${sensitivityData.responseUnit}）`,
    unit: sensitivityData.responseUnit,
    series: sensitivityData.series.map((item, index) => ({
      name: item.label,
      data: item.values,
      color: item.color ?? MEMBER_COLORS[index % MEMBER_COLORS.length],
    })),
    showLegend: true,
  });
}

function assertNever(value: never): never {
  throw new Error(`未知计算书图形计划项：${JSON.stringify(value)}`);
}

function beamTraditionalSeries(results: BeamCalculationResults, figure: BeamReportFigure): ReportLineSeries {
  if (figure.metric === "deflection") {
    return { name: "挠度", data: results.v_data.map((value) => value * 1000), color: "#0ea5e9" };
  }
  if (figure.metric === "shear") {
    return { name: "剪力", data: results.shear_data, color: "#f59e0b" };
  }
  return { name: "弯矩", data: results.moment_data, color: "#16a34a" };
}

async function renderBeamPreview(results: BeamCalculationResults, _viewSettings?: import("../types/structure").ResultViewSettings | null) {
  const beam = results.beam;
  if (!beam) return "";
  return renderSvgToPng(buildBeamPreviewSvg(beam, _viewSettings), BEAM_PREVIEW_SVG_WIDTH, BEAM_PREVIEW_SVG_HEIGHT);
}

async function renderBeamOverlay(results: BeamCalculationResults, metric: "moment" | "shear" | "deflection", _viewSettings?: import("../types/structure").ResultViewSettings | null) {
  const svg = buildBeamResultDiagramSvg(results, beamReportMetricToDiagramMetric(metric), false, _viewSettings);
  if (!svg) return "";
  return renderSvgToPng(svg, BEAM_RESULT_DIAGRAM_SVG_WIDTH, BEAM_RESULT_DIAGRAM_SVG_HEIGHT);
}

