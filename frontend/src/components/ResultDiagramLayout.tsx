import type { ReactNode } from "react";
import { GlassCard } from "./ui/GlassCard";

export type DiagramSelectionKey<Key extends string> = Key | "all";

export interface ResultDiagramMetricOption<Key extends string> {
  key: Key;
  title: string;
}

interface ResultDiagramMetricTabsProps<Key extends string> {
  ariaLabel: string;
  compact: boolean;
  gridClassName: string;
  metrics: ResultDiagramMetricOption<Key>[];
  selectedKey: DiagramSelectionKey<Key>;
  onSelect: (key: DiagramSelectionKey<Key>) => void;
}

interface ResultDiagramCardProps {
  compact: boolean;
  heading: string;
  badges?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

interface ResultDiagramMetricGalleryProps<Key extends string, Metric extends ResultDiagramMetricOption<Key>> {
  ariaLabel: string;
  compact: boolean;
  gridClassName: string;
  metrics: Metric[];
  selectedKey: DiagramSelectionKey<Key>;
  selectedMetric: Metric;
  onSelect: (key: DiagramSelectionKey<Key>) => void;
  renderMetric: (metric: Metric) => ReactNode;
}

const activeMetricTabClass =
  "border-slate-300 bg-slate-100 text-slate-950 dark:border-sky-400/40 dark:bg-sky-400/[0.14] dark:text-sky-50";
const inactiveMetricTabClass =
  "border-slate-200/80 bg-white/45 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-900/45 dark:text-slate-300 dark:hover:border-sky-400/35 dark:hover:bg-sky-400/10";

function metricTabClass(active: boolean) {
  return `min-w-0 rounded-lg border px-3 py-2 text-left text-[12px] font-bold transition-colors ${
    active ? activeMetricTabClass : inactiveMetricTabClass
  }`;
}

export function ResultDiagramEmptyState({ compact, label }: { compact: boolean; label: string }) {
  return (
    <GlassCard className={`flex items-center justify-center border-dashed border-primary/10 ${compact ? "min-h-[220px]" : "min-h-[320px]"}`}>
      <div className="text-center text-sm text-muted-foreground">{label}</div>
    </GlassCard>
  );
}

export function ResultDiagramMetricTabs<Key extends string>({
  ariaLabel,
  compact,
  gridClassName,
  metrics,
  selectedKey,
  onSelect,
}: ResultDiagramMetricTabsProps<Key>) {
  return (
    <GlassCard className={compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}>
      <div className="flex justify-end">
        <div className={`grid w-full gap-2 sm:w-auto ${gridClassName}`} role="tablist" aria-label={ariaLabel}>
          <button
            type="button"
            role="tab"
            aria-selected={selectedKey === "all"}
            onClick={() => onSelect("all")}
            className={metricTabClass(selectedKey === "all")}
          >
            <span className="block truncate">全部</span>
          </button>
          {metrics.map((metric) => {
            const active = metric.key === selectedKey;
            return (
              <button
                key={metric.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(metric.key)}
                className={metricTabClass(active)}
              >
                <span className="block truncate">{metric.title}</span>
              </button>
            );
          })}
        </div>
      </div>
    </GlassCard>
  );
}

export function resultDiagramVisibleMetrics<Key extends string, Metric extends ResultDiagramMetricOption<Key>>(
  selectedKey: DiagramSelectionKey<Key>,
  metrics: Metric[],
  selectedMetric: Metric,
): Metric[] {
  return selectedKey === "all" ? metrics : [selectedMetric];
}

export function ResultDiagramMetricGallery<Key extends string, Metric extends ResultDiagramMetricOption<Key>>({
  ariaLabel,
  compact,
  gridClassName,
  metrics,
  selectedKey,
  selectedMetric,
  onSelect,
  renderMetric,
}: ResultDiagramMetricGalleryProps<Key, Metric>) {
  return (
    <div className="space-y-3">
      <ResultDiagramMetricTabs
        ariaLabel={ariaLabel}
        compact={compact}
        gridClassName={gridClassName}
        metrics={metrics}
        selectedKey={selectedKey}
        onSelect={onSelect}
      />
      {resultDiagramVisibleMetrics(selectedKey, metrics, selectedMetric).map((metric) => renderMetric(metric))}
    </div>
  );
}

export function ResultDiagramMetricBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900/70">
      {children}
    </span>
  );
}

export function ResultDiagramKeyPointTypeToggle({ visible, onChange }: { visible: boolean; onChange: (visible: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={visible}
      aria-label="显示关键点类型"
      onClick={() => onChange(!visible)}
      className={`h-8 shrink-0 rounded-lg border px-2.5 text-[11px] font-bold transition-colors ${
        visible
          ? "border-sky-400/55 bg-sky-400/15 text-sky-700 dark:text-sky-200"
          : "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-sky-400/50 dark:hover:text-sky-200"
      }`}
    >
      类型说明
    </button>
  );
}

export function ResultDiagramCard({ compact, heading, badges, actions, children }: ResultDiagramCardProps) {
  return (
    <GlassCard className={compact ? "space-y-3 p-3 sm:p-4" : "space-y-4 p-4 sm:p-5"}>
      <div className={`flex gap-3 ${compact ? "flex-col" : "flex-col xl:flex-row xl:items-start xl:justify-between"}`}>
        <div className="min-w-0">
          <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>{heading}</h3>
          {badges ? <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold text-slate-600 dark:text-slate-300">{badges}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </GlassCard>
  );
}
