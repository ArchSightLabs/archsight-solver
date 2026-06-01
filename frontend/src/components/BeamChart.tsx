import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import type { ECharts, EChartsCoreOption } from "echarts/core";
import { LineChart } from "echarts/charts";
import { GraphicComponent, GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { GlassCard } from "./ui/GlassCard";
import { escapeHtml, safeCssHexColor } from "../lib/html-escape";

echarts.use([LineChart, GridComponent, TooltipComponent, GraphicComponent, CanvasRenderer]);

interface BeamChartProps {
  xData?: number[];   // 后端 x_data，例如 [0, 0.1, 0.2, ...]
  yData?: number[];   // 后端 v_data / moment_data / shear_data
  xLabels?: string[];
  title: string;
  yLabel: string;
  unit: string;
  color: string;
  xAxisLabel?: string;
  tooltipXLabel?: string;
  valueScale?: number;
  compact?: boolean;
}

type AxisTooltipParam = {
  axisValue?: string | number;
  value?: string | number;
};

const LIGHT_CHART_COLORS: Record<string, string> = {
  "#0ea5e9": "#2563eb",
  "#22c55e": "#16a34a",
  "#16a34a": "#15803d",
  "#f59e0b": "#b45309",
};

function chartColorForTheme(color: string, isDark: boolean) {
  return isDark ? color : LIGHT_CHART_COLORS[color.toLowerCase()] ?? color;
}

export function BeamChart({ xData, yData, xLabels, title, yLabel, unit, color, xAxisLabel = "m", tooltipXLabel = "位置", valueScale = 1000, compact = false }: BeamChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // 初始化或复用实例
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const isDark = document.documentElement.classList.contains("dark");
    const textColor = isDark ? "#94a3b8" : "#475569";
    const gridColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(100,116,139,0.14)";
    const axisColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(100,116,139,0.22)";
    const displayColor = safeCssHexColor(chartColorForTheme(color, isDark));

    // 没有数据时显示空状态
    if (!xData || !yData || xData.length === 0 || yData.length === 0) {
      chartInstance.current.setOption({
        backgroundColor: "transparent",
        graphic: [{
          type: "text",
          left: "center", top: "middle",
          style: { text: "运行计算后图表将显示", fill: textColor, fontSize: 12, fontFamily: "Fira Code" }
        }]
      });
      return;
    }

    const axisLabels = xLabels?.length ? xLabels : xData.map(v => v.toFixed(2));
    // 后端位移数据单位为米，显示时换算为毫米
    const seriesData = yData.map(v => parseFloat((v * valueScale).toFixed(6)));

    const option: EChartsCoreOption = {
      backgroundColor: "transparent",
      animation: true,
      animationDuration: 800,
      animationEasing: "cubicOut",
      tooltip: {
        trigger: "axis",
        backgroundColor: isDark ? "rgba(15,23,42,0.92)" : "rgba(255,255,255,0.95)",
        borderColor: `${displayColor}55`,
        borderWidth: 1,
        textStyle: { color: isDark ? "#f1f5f9" : "#1e293b", fontSize: 12 },
        formatter: (params: AxisTooltipParam | AxisTooltipParam[]) => {
          const p = Array.isArray(params) ? params[0] : params;
          const safeTooltipXLabel = escapeHtml(tooltipXLabel);
          const safeAxisValue = escapeHtml(p?.axisValue);
          const safeXAxisLabel = xAxisLabel ? ` ${escapeHtml(xAxisLabel)}` : "";
          const safeValue = escapeHtml(p?.value);
          const safeUnit = escapeHtml(unit);
          return `<div style="padding:6px 10px">
            <div style="font-size:10px;opacity:0.5;margin-bottom:4px">${safeTooltipXLabel} = ${safeAxisValue}${safeXAxisLabel}</div>
            <div style="font-weight:bold;color:${displayColor}">${safeValue} ${safeUnit}</div>
          </div>`;
        }
      },
      grid: { left: "12%", right: "4%", top: "14%", bottom: "12%", containLabel: true },
        xAxis: {
          type: "category",
        data: axisLabels,
          boundaryGap: false,
          axisLine: { lineStyle: { color: axisColor } },
          axisTick: { show: false },
          axisLabel: {
            color: textColor, fontSize: 10, fontFamily: "Fira Code",
          interval: Math.max(0, Math.floor(axisLabels.length / 5))
          },
          splitLine: { show: false }
        },
      yAxis: {
        type: "value",
        name: yLabel,
        nameGap: 8,
        nameTextStyle: { color: textColor, fontSize: 10, fontFamily: "Fira Code" },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: textColor, fontSize: 10, fontFamily: "Fira Code" },
        splitLine: { lineStyle: { color: gridColor, type: "dashed" } }
      },
      series: [{
        type: "line",
        data: seriesData,
        smooth: 0.4,
        symbol: "none",
        lineStyle: { width: 1.5, color: displayColor },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: `${displayColor}${isDark ? "55" : "30"}` },
            { offset: 1, color: `${displayColor}00` }
          ])
        }
      }]
    };

    chartInstance.current.setOption(option, true);
  }, [xData, yData, xLabels, color, unit, xAxisLabel, tooltipXLabel, valueScale, yLabel]);

  // 响应式自适应
  useEffect(() => {
    const onResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <GlassCard className="group h-full transition-all hover:bg-white/[0.05] dark:hover:bg-primary/[0.03]">
      <div className={`border-b border-white/10 ${compact ? "px-4 py-3" : "px-5 py-4"}`}>
        <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>{title}</h3>
      </div>
      <div ref={chartRef} className={`w-full px-1 pb-2 sm:px-2 ${compact ? "h-48 sm:h-56 md:h-72" : "h-56 sm:h-64 md:h-80"}`} />
    </GlassCard>
  );
}
