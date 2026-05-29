import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";

import { Button, type ButtonProps } from "./ui/button";

export interface WorkbenchModelMetric {
  label: string;
  value: number | string;
}

export interface WorkbenchModelDetailRow {
  label: string;
  value: string;
}

export interface WorkbenchModelAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: ButtonProps["variant"];
}

interface WorkbenchModelBasicSectionProps {
  id: string;
  title: string;
  description: string;
  metrics: WorkbenchModelMetric[];
  modelWarnings: string[];
  successMessage: string;
  detailRows: WorkbenchModelDetailRow[];
  actions: WorkbenchModelAction[];
  controls?: ReactNode;
}

export function WorkbenchModelBasicSection({
  id,
  title,
  description,
  metrics,
  modelWarnings,
  successMessage,
  detailRows,
  actions,
  controls,
}: WorkbenchModelBasicSectionProps) {
  return (
    <>
      <div id={id} className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="eyebrow flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {title}
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button
                key={action.label}
                variant={action.variant ?? "outline"}
                size="sm"
                onClick={action.onClick}
                className="h-8 rounded-xl"
              >
                {action.icon}
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <section className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        {controls ? (
          <div className="rounded-xl border border-white/8 bg-slate-950/20 p-3">
            {controls}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {metrics.map((item) => (
            <div key={item.label} className="rounded-xl border border-white/8 bg-slate-950/20 p-3">
              <div className="text-[10px] font-black tracking-widest text-muted-foreground">{item.label}</div>
              <div className="mt-1 font-mono text-lg font-black">{item.value}</div>
            </div>
          ))}
        </div>
        {modelWarnings.length === 0 ? (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-400/15 bg-emerald-500/8 p-3 text-xs text-emerald-700 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {successMessage}
          </div>
        ) : (
          <div className="space-y-1 rounded-xl border border-amber-400/15 bg-amber-500/8 p-3 text-xs text-amber-700 dark:text-amber-200">
            {modelWarnings.map((warning) => (
              <div key={warning} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-2 text-xs text-foreground/70">
          {detailRows.map((row) => (
            <div
              key={row.label}
              className="grid gap-1 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 sm:grid-cols-[7rem_minmax(0,1fr)]"
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-semibold leading-relaxed sm:text-right">{row.value}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
