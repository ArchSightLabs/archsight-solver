import { AlertTriangle, CheckCircle2 } from "lucide-react";

export interface TextModelPreviewMetric {
  label: string;
  value: string;
}

interface TextModelCheckPanelProps {
  message: string | null;
  diagnostics: string[];
  metrics?: TextModelPreviewMetric[];
  units?: string[];
  maxDiagnostics?: number;
}

export function TextModelCheckPanel({ message, diagnostics, metrics = [], units = [], maxDiagnostics = 5 }: TextModelCheckPanelProps) {
  if (!message && diagnostics.length === 0 && metrics.length === 0) return null;

  const hasDiagnostics = diagnostics.length > 0;
  const hasCheckedResult = metrics.length > 0;
  const panelTone = hasDiagnostics
    ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-300/25 dark:bg-amber-400/10 dark:text-amber-100"
    : "border-slate-200 bg-slate-50/70 text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200";
  const insetTone = hasDiagnostics
    ? "border-amber-200/80 bg-white/70 dark:border-white/10 dark:bg-slate-950/20"
    : "border-slate-200 bg-white/70 dark:border-white/10 dark:bg-slate-950/20";
  const iconTone = hasDiagnostics ? "text-current" : "text-slate-400 dark:text-slate-400";

  return (
    <div className={`space-y-2 rounded-lg border p-3 text-xs ${panelTone}`}>
      <div className="flex items-start gap-2">
        {hasDiagnostics ? <AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${iconTone}`} /> : <CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${iconTone}`} />}
        <div className="min-w-0 space-y-1">
          <div className="font-bold">{hasDiagnostics ? "检查结果：存在诊断，暂不应用" : hasCheckedResult ? "检查结果：可应用" : "文本模型说明"}</div>
          {message ? <div className="leading-relaxed text-current/85">{message}</div> : null}
        </div>
      </div>
      {metrics.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className={`rounded-md border px-2 py-1.5 ${insetTone}`}>
              <div className="text-[10px] font-semibold text-current/65">{metric.label}</div>
              <div className="mt-0.5 font-mono font-bold text-current">{metric.value}</div>
            </div>
          ))}
        </div>
      ) : null}
      {units.length > 0 ? (
        <div className={`rounded-md border px-2 py-1.5 leading-relaxed text-current/75 ${insetTone}`}>
          单位口径：{units.join("；")}
        </div>
      ) : null}
      {hasDiagnostics ? (
        <div className="space-y-1">
          {diagnostics.slice(0, maxDiagnostics).map((item) => (
            <div key={item} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{item}</span>
            </div>
          ))}
          {diagnostics.length > maxDiagnostics ? <div className="text-current/70">另有 {diagnostics.length - maxDiagnostics} 条诊断未显示。</div> : null}
        </div>
      ) : null}
    </div>
  );
}
