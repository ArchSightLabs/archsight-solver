import { LineChart } from "echarts/charts";
import { GraphicComponent, GridComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import type { EChartsCoreOption } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([LineChart, GridComponent, TooltipComponent, GraphicComponent, CanvasRenderer]);

export const REPORT_BG = "#ffffff";
export const TEXT = "#334155";
export const MUTED_TEXT = "#64748b";
export const MEMBER_COLORS = ["#38bdf8", "#22c55e", "#f59e0b", "#a78bfa", "#fb7185", "#14b8a6"];

const GRID = "rgba(100,116,139,0.18)";
const AXIS = "rgba(71,85,105,0.45)";

export type ReportLineSeries = {
  name: string;
  data: number[];
  color: string;
};

export async function renderLineChart({
  xLabels,
  yLabel,
  unit,
  series,
  showLegend = false,
}: {
  xLabels: string[];
  yLabel: string;
  unit: string;
  series: ReportLineSeries[];
  showLegend?: boolean;
}) {
  const option: EChartsCoreOption = {
    backgroundColor: REPORT_BG,
    animation: false,
    tooltip: { show: false },
    legend: showLegend
      ? {
          top: 8,
          right: 20,
          textStyle: { color: TEXT, fontSize: 11 },
        }
      : undefined,
    grid: { left: "9%", right: "5%", top: showLegend ? "16%" : "12%", bottom: "14%", containLabel: true },
    xAxis: {
      type: "category",
      data: xLabels,
      boundaryGap: false,
      axisLine: { lineStyle: { color: AXIS } },
      axisTick: { show: false },
      axisLabel: { color: TEXT, fontSize: 10, fontFamily: "Fira Code", interval: Math.max(0, Math.floor(xLabels.length / 5)) },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      name: yLabel,
      nameGap: 10,
      nameTextStyle: { color: TEXT, fontSize: 11, fontFamily: "Fira Code" },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: TEXT, fontSize: 10, fontFamily: "Fira Code" },
      splitLine: { lineStyle: { color: GRID, type: "dashed" } },
    },
    series: series.map((item) => ({
      name: item.name,
      type: "line",
      data: item.data.map((value) => Number(value.toFixed(6))),
      smooth: 0.4,
      symbol: "none",
      lineStyle: { width: 2.8, color: item.color },
      areaStyle:
        series.length === 1
          ? {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: `${item.color}55` },
                { offset: 1, color: `${item.color}00` },
              ]),
            }
          : undefined,
    })),
    graphic: [{ type: "text", right: 24, bottom: 16, style: { text: unit, fill: MUTED_TEXT, fontSize: 10 } }],
  };
  return renderOption(option);
}

export function paddedDomain(values: number[]): [number, number] {
  if (!values.length) return [-1, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (Math.abs(max - min) < 1e-9) {
    const pad = Math.max(1, Math.abs(max) * 0.2);
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.12;
  return [min - pad, max + pad];
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function structureLayout(
  nodes: Array<{ x: number; y: number }>,
  extra: Array<{ x: number; y: number }>,
  width: number,
  height: number,
) {
  const all = [...nodes, ...extra];
  const xs = all.map((node) => node.x);
  const ys = all.map((node) => node.y);
  const [minX, maxX] = paddedDomain(xs);
  const [minY, maxY] = paddedDomain(ys);
  return {
    map: (point: { x: number; y: number }) => ({
      x: 70 + ((point.x - minX) / Math.max(maxX - minX, 1e-9)) * (width - 140),
      y: height - 70 - ((point.y - minY) / Math.max(maxY - minY, 1e-9)) * (height - 140),
    }),
  };
}

export async function renderOption(option: EChartsCoreOption, width = 900, height = 480): Promise<string> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  document.body.appendChild(host);
  try {
    const chart = echarts.init(host, undefined, { renderer: "canvas", width, height });
    chart.setOption(option, true);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const dataUrl = chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: REPORT_BG });
    chart.dispose();
    return dataUrl;
  } finally {
    host.remove();
  }
}

export async function renderSvgToPng(svg: string, width: number, height: number): Promise<string> {
  const blob = new globalThis.Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new globalThis.Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("计算书结构预览图渲染失败"));
      image.src = url;
    });

    const pixelRatio = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("浏览器不支持计算书图片渲染");
    }
    context.scale(pixelRatio, pixelRatio);
    context.fillStyle = REPORT_BG;
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
