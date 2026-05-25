import { useEffect, useRef, useState, useMemo } from 'react';
import * as echarts from 'echarts/core';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { GlassCard } from './GlassCard';
import { DropdownSelect } from './DropdownSelect';
import { Info, RefreshCw, Settings2, BarChart3 } from 'lucide-react';
import type { SensitivityResponseOption, SensitivityResults } from '../../types/beam';

echarts.use([LineChart, BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

interface SensitivityDashboardProps {
  results: SensitivityResults | null;
  isLoading: boolean;
  onRun: (config: { range: number; steps: number; targetSpanIndex: number; responseMetric: string }) => void;
  targetOptions?: Array<{ value: number; label: string }>;
  targetLabel?: string;
  responseOptions: SensitivityResponseOption[];
  defaultResponseMetric: string;
  compact?: boolean;
  className?: string;
}

const DEFAULT_SERIES_COLORS = ['#2563eb', '#0f766e', '#475569', '#0369a1'];
const LIGHT_SERIES_COLORS: Record<string, string> = {
  '#0ea5e9': '#2563eb',
  '#38bdf8': '#2563eb',
  '#f59e0b': '#0f766e',
  '#d97706': '#0f766e',
  '#a78bfa': '#475569',
  '#7c3aed': '#475569',
  '#ef4444': '#0369a1',
  '#dc2626': '#0369a1',
  '#22c55e': '#0f766e',
};
const DARK_SERIES_COLORS: Record<string, string> = {
  '#2563eb': '#60a5fa',
  '#0f766e': '#2dd4bf',
  '#475569': '#94a3b8',
  '#0369a1': '#38bdf8',
  '#0ea5e9': '#60a5fa',
  '#38bdf8': '#60a5fa',
  '#f59e0b': '#2dd4bf',
  '#d97706': '#2dd4bf',
  '#a78bfa': '#94a3b8',
  '#7c3aed': '#94a3b8',
  '#ef4444': '#38bdf8',
  '#dc2626': '#38bdf8',
  '#22c55e': '#2dd4bf',
};

function resolveSeriesColor(color: string, isDark: boolean) {
  const normalized = color.toLowerCase();
  return isDark ? DARK_SERIES_COLORS[normalized] ?? color : LIGHT_SERIES_COLORS[normalized] ?? color;
}

function formatSensitivityValue(value: number) {
  const absValue = Math.abs(value);
  if (absValue >= 100) return value.toFixed(1);
  if (absValue >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

type ChartTooltipParam = {
  axisValue?: string | number;
  color?: string;
  seriesName?: string;
  data?: unknown;
  value?: unknown;
};

function chartTooltipParams(params: ChartTooltipParam | ChartTooltipParam[]): ChartTooltipParam[] {
  return Array.isArray(params) ? params : [params];
}

function chartNumericValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (value && typeof value === 'object' && 'value' in value) {
    return Number((value as { value?: unknown }).value);
  }
  return 0;
}

export function SensitivityDashboard({
  results,
  isLoading,
  onRun,
  targetOptions,
  targetLabel = '目标对象',
  responseOptions,
  defaultResponseMetric,
  compact = false,
  className,
}: SensitivityDashboardProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const tornadoRef = useRef<HTMLDivElement>(null);
  const chartInst = useRef<ECharts | null>(null);
  const tornadoInst = useRef<ECharts | null>(null);

  // 控制状态
  const [range, setRange] = useState(20);
  const [steps, setSteps] = useState(10);
  const [spanIndex, setSpanIndex] = useState(0);
  const [responseMetric, setResponseMetric] = useState(defaultResponseMetric);
  const resolvedResponseMetric = responseOptions.some((option) => option.value === responseMetric)
    ? responseMetric
    : defaultResponseMetric;
  const hasTargetSelector = Boolean(targetOptions && targetOptions.length > 1);
  const seriesList = useMemo(() => results?.series ?? [], [results]);
  const activeTargetLabel = targetOptions?.find((option) => option.value === spanIndex)?.label ?? targetOptions?.[0]?.label ?? targetLabel;

  // 计算敏感性排名
  const impactData = useMemo(() => {
    if (!results || seriesList.length === 0) return [];
    const calcImpact = (arr: number[]) => Math.max(...arr) - Math.min(...arr);
    return seriesList
      .map((series, index) => ({
        name: series.label,
        value: calcImpact(series.values),
        color: series.color ?? DEFAULT_SERIES_COLORS[index % DEFAULT_SERIES_COLORS.length],
      }))
      .sort((a, b) => a.value - b.value);
  }, [results, seriesList]);

  // 工具函数：确保图表实例已初始化
  const ensureInstances = () => {
    if (chartRef.current && !chartInst.current) {
      chartInst.current = echarts.init(chartRef.current);
    }
    if (tornadoRef.current && !tornadoInst.current) {
      tornadoInst.current = echarts.init(tornadoRef.current);
    }
  };

  // 响应式调整
  useEffect(() => {
    const onResize = () => {
      chartInst.current?.resize();
      tornadoInst.current?.resize();
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chartInst.current?.dispose();
      tornadoInst.current?.dispose();
      chartInst.current = null;
      tornadoInst.current = null;
    };
  }, []);

  // 数据渲染逻辑
  useEffect(() => {
    if (!results) return;
    
    // 关键修复：确保在设置 Option 前，DOM 节点已挂载且实例已初始化
    // 使用 requestAnimationFrame 确保在 React 渲染完成后的下一帧执行
    requestAnimationFrame(() => {
      ensureInstances();
      if (!chartInst.current || !tornadoInst.current) return;

      const isDark = document.documentElement.classList.contains('dark');
      const textColor = isDark ? '#cbd5e1' : '#334155';
      const mutedColor = isDark ? '#94a3b8' : '#64748b';
      const gridColor = isDark ? 'rgba(148,163,184,0.16)' : 'rgba(100,116,139,0.22)';
      const axisColor = isDark ? 'rgba(148,163,184,0.28)' : 'rgba(100,116,139,0.36)';
      const tooltipBg = isDark ? 'rgba(8, 18, 36, 0.95)' : 'rgba(255, 255, 255, 0.98)';
      const tooltipBorder = isDark ? 'rgba(148,163,184,0.24)' : 'rgba(100,116,139,0.2)';
      const tooltipText = isDark ? '#e2e8f0' : '#334155';
      const xLabels = results.variations.map(v => `${(v * 100).toFixed(0)}%`);
      const resolvedSeries = seriesList.map((series, index) => ({
        ...series,
        color: resolveSeriesColor(series.color ?? DEFAULT_SERIES_COLORS[index % DEFAULT_SERIES_COLORS.length], isDark),
      }));
      
      const chartOption: EChartsCoreOption = {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis',
          backgroundColor: tooltipBg,
          borderColor: tooltipBorder,
          borderWidth: 1,
          textStyle: { color: tooltipText, fontSize: 11, fontFamily: 'Fira Code' },
          formatter: (params: ChartTooltipParam | ChartTooltipParam[]) => {
            const items = chartTooltipParams(params);
            let res = `<div style="font-weight:700;margin-bottom:6px;color:#94a3b8">变动幅度：${items[0]?.axisValue ?? ''}</div>`;
            items.forEach((p) => {
              res += `<div style="display:flex;justify-content:space-between;gap:20px;margin:2px 0">
                <span style="display:flex;align-items:center;gap:6px">
                  <span style="width:8px;height:8px;border-radius:50%;background:${p.color ?? '#64748b'};display:inline-block"></span>
                  ${p.seriesName ?? ''}
                </span>
                <span style="font-family:monospace;font-weight:bold">${formatSensitivityValue(chartNumericValue(p.data))} ${results.responseUnit}</span>
              </div>`;
            });
            return res;
          }
        },
        legend: {
          top: 2, right: 8,
          itemWidth: 22,
          itemHeight: 8,
          itemGap: 14,
          textStyle: { color: mutedColor, fontSize: 11, fontWeight: 700 },
          data: resolvedSeries.map((series) => series.label)
        },
        grid: { top: 70, left: 54, right: 28, bottom: 42, containLabel: true },
        xAxis: {
          type: 'category', data: xLabels, boundaryGap: false,
          axisLabel: { color: textColor, fontSize: 11, fontWeight: 600 },
          axisLine: { lineStyle: { color: axisColor } },
          axisTick: { lineStyle: { color: axisColor } }
        },
        yAxis: {
          type: 'value', name: `${results.responseLabel}（${results.responseUnit}）`,
          nameLocation: 'end',
          nameGap: 18,
          nameTextStyle: { color: textColor, fontSize: 12, fontWeight: 700, align: 'left', padding: [0, 0, 4, 0] },
          axisLabel: { color: textColor, fontSize: 11, fontWeight: 600 },
          splitLine: { lineStyle: { type: 'dashed', color: gridColor } }
        },
        series: resolvedSeries.map((series, index) => ({
          name: series.label,
          type: 'line',
          data: series.values,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: { color: series.color },
          lineStyle: {
            width: 2.5,
            color: series.color,
            ...(index === resolvedSeries.length - 1 ? { type: 'dashed' as const } : {}),
          },
          areaStyle:
            index === 0
              ? { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: `${series.color}${isDark ? '24' : '18'}` }, { offset: 1, color: 'transparent' }]) }
              : undefined,
        })),
      };

      chartInst.current.setOption(chartOption, true);

      const tornadoOption: EChartsCoreOption = {
        backgroundColor: 'transparent',
        grid: { top: 8, left: 84, right: 72, bottom: 8, containLabel: false },
        xAxis: { type: 'value', show: false },
        yAxis: {
          type: 'category',
          data: impactData.map(d => d.name),
          axisLine: { show: false }, axisTick: { show: false },
          axisLabel: {
            color: textColor,
            fontSize: 10,
            fontWeight: 700,
            width: 78,
            overflow: 'truncate',
          }
        },
          series: [{
            type: 'bar',
            data: impactData.map(d => ({ value: d.value, itemStyle: { color: resolveSeriesColor(d.color, isDark), borderRadius: [0, 4, 4, 0] } })),
            barWidth: 14,
            barMaxWidth: 18,
            label: {
              show: true,
              position: 'right',
              formatter: (params: ChartTooltipParam) => `${formatSensitivityValue(chartNumericValue(params.value))}`,
              color: textColor,
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'Fira Code',
            }
          }]
      };

      tornadoInst.current.setOption(tornadoOption, true);
    });
  }, [results, impactData, seriesList]);

  const handleRun = () => {
    onRun({ range, steps, targetSpanIndex: spanIndex, responseMetric: resolvedResponseMetric });
  };

  return (
    <GlassCard className={`p-0 overflow-hidden ${className ?? ''}`}>
      <div className={`flex justify-end border-b border-slate-200/80 bg-slate-50/80 dark:border-slate-700/70 dark:bg-slate-900/55 ${compact ? "px-3 py-3 sm:px-4" : "px-4 py-3 sm:px-5"}`}>
        <button
          onClick={handleRun}
          disabled={isLoading}
          className={`flex items-center justify-center gap-2 rounded-lg bg-slate-900 text-xs font-black text-white transition-all shadow-md shadow-slate-900/10 hover:bg-slate-800 active:scale-95 disabled:opacity-40 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 ${compact ? "px-4 py-2" : "px-5 py-2.5 sm:px-6"}`}
        >
          {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <RefreshCw size={14} />}
          {isLoading ? "扫描中..." : "运行扫描"}
        </button>
      </div>

      <div className={`grid grid-cols-1 lg:grid-cols-[280px_1fr] ${compact ? "min-h-[300px]" : "min-h-[360px]"}`}>
        {/* 左侧控制栏 - 始终渲染 */}
        <div className={`border-b border-slate-200/80 bg-slate-50/85 lg:border-b-0 lg:border-r dark:border-slate-700/70 dark:bg-slate-950/20 ${compact ? "space-y-4 p-3 lg:p-4" : "space-y-6 p-4 lg:p-6"}`}>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
              <Settings2 size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest leading-none">扫描配置</span>
            </div>
            
            <div className={`${compact ? "space-y-4" : "space-y-5"}`}>
              <div className="space-y-2">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-600 dark:text-slate-300">响应指标</span>
                  <span className="max-w-[9rem] truncate text-right text-blue-700 dark:text-blue-300">
                    {responseOptions.find((option) => option.value === resolvedResponseMetric)?.label ?? '默认指标'}
                  </span>
                </div>
                <DropdownSelect
                  value={resolvedResponseMetric}
                  onChange={setResponseMetric}
                  options={responseOptions}
                  className="text-xs font-medium"
                  menuClassName="text-xs font-medium"
                  optionClassName="px-3 py-2 text-xs font-medium"
                />
              </div>

              <div className="space-y-2">
                {hasTargetSelector ? (
                  <>
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-slate-600 dark:text-slate-300">{targetLabel}</span>
                      <span className="max-w-[9rem] truncate text-right text-blue-700 dark:text-blue-300">
                        {targetOptions?.find((option) => option.value === spanIndex)?.label ?? targetOptions?.[0]?.label ?? '默认对象'}
                      </span>
                    </div>
                    <DropdownSelect
                      value={String(spanIndex)}
                      onChange={(nextValue) => setSpanIndex(Number(nextValue))}
                      options={(targetOptions ?? []).map((option) => ({
                        value: String(option.value),
                        label: option.label,
                      }))}
                      className="text-xs font-medium"
                      menuClassName="text-xs font-medium"
                      optionClassName="px-3 py-2 text-xs font-medium"
                    />
                  </>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-600 dark:text-slate-300">变动幅度</span>
                  <span className="text-slate-700 dark:text-slate-200">±{range}%</span>
                </div>
                <input type="range" min="5" max="50" step="5" value={range}
                  onChange={(e) => setRange(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-300 accent-slate-700 dark:bg-slate-800 dark:accent-slate-300" />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-600 dark:text-slate-300">步数</span>
                  <span className="text-teal-700 dark:text-teal-300">{steps}</span>
                </div>
                <input type="range" min="4" max="20" step="2" value={steps}
                  onChange={(e) => setSteps(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-300 accent-teal-600 dark:bg-slate-800" />
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t border-white/5 pt-5 lg:pt-6">
            <div className="flex items-center gap-2 text-teal-700 dark:text-teal-300">
              <BarChart3 size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest leading-none">敏感性排序（龙卷风图）</span>
            </div>
            {/* 始终渲染容器，但无数据时隐藏 */}
            <div className={`transition-opacity duration-500 ${results ? 'opacity-100' : 'opacity-0 h-0'}`}>
              <div ref={tornadoRef} className={`w-full ${compact ? "h-32 sm:h-40" : "h-40 sm:h-44"}`} />
            </div>
            {!results && (
              <div className={`flex items-center justify-center rounded-xl border border-dashed border-slate-300/80 bg-white/70 text-[10px] uppercase tracking-tighter text-slate-500 dark:border-white/5 dark:bg-white/[0.01] dark:text-slate-600 ${compact ? "h-24 sm:h-32" : "h-32 sm:h-40"}`}>
                等待数据
              </div>
            )}
          </div>
        </div>

        {/* 右侧主图表区 */}
        <div className={`relative flex flex-col justify-center p-4 lg:p-6 ${compact ? "min-h-[260px] lg:min-h-[380px]" : "min-h-[320px] lg:min-h-[460px]"}`}>
          {/* 始终渲染容器 */}
          <div className={`flex-1 flex flex-col h-full transition-opacity duration-500 ${results ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'}`}>
            <div className={`${compact ? "mb-3" : "mb-4"} flex items-center gap-2`}>
              <span className="h-2 w-2 animate-pulse rounded-full bg-teal-600 shadow-[0_0_8px_rgba(13,148,136,0.35)] dark:bg-teal-400" />
              <span className={`font-black uppercase tracking-[0.2em] text-slate-600 dark:text-slate-300 ${compact ? "text-[9px]" : "text-[10px]"}`}>参数响应曲线</span>
            </div>
            <div ref={chartRef} className={`flex-1 w-full ${compact ? "min-h-[240px] sm:min-h-[300px] lg:min-h-[340px]" : "min-h-[280px] sm:min-h-[340px] lg:min-h-[400px]"}`} />
            <div className={`flex items-start gap-4 rounded-xl border border-blue-500/15 bg-blue-50/60 px-4 py-3 dark:border-blue-500/15 dark:bg-blue-500/[0.05] ${compact ? "mt-3 sm:mt-4" : "mt-4 sm:mt-6"}`}>
              <div className="mt-1 rounded-lg border border-blue-500/20 bg-blue-500/10 p-1.5 text-blue-600 dark:text-blue-300">
                <Info size={14} />
              </div>
              <div className={`font-medium leading-relaxed text-slate-600 dark:text-slate-300 ${compact ? "text-[10px]" : "text-[11px]"}`}>
                <b className="text-blue-700 dark:text-blue-300">智能洞察报告：</b>
                分析表明{hasTargetSelector ? `在${activeTargetLabel}` : "在当前结构模型"}，<b className="mx-1 text-slate-900 dark:text-slate-100">{impactData.length > 0 ? impactData[impactData.length - 1].name : '---'}</b> 具有最显著的结构效应。建议优先对该参数进行复核以控制变形精度。
              </div>
            </div>
          </div>

          {!results && (
            <div className="flex items-center justify-center py-16 text-sm font-black text-slate-500 animate-in fade-in duration-700 dark:text-slate-400">
              等待扫描
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
