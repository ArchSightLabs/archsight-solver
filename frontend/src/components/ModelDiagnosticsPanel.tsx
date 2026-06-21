import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ModelDiagnosticIssue, ModelDiagnostics } from "../lib/model-diagnostics";

interface ModelDiagnosticsPanelProps {
  diagnostics: ModelDiagnostics;
  compact?: boolean;
}

const statusStyles = {
  blocked: "border-rose-500/25 bg-rose-500/[0.08] text-rose-900 dark:text-rose-100",
  review: "border-amber-500/25 bg-amber-500/[0.08] text-amber-900 dark:text-amber-100",
  ready: "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-900 dark:text-emerald-100",
};

const issueStyles = {
  error: "border-rose-500/20 bg-rose-500/[0.06]",
  warning: "border-amber-500/20 bg-amber-500/[0.06]",
  info: "border-sky-500/20 bg-sky-500/[0.06]",
};

function StatusIcon({ status }: { status: ModelDiagnostics["status"] }) {
  if (status === "blocked") return <XCircle className="h-4 w-4 shrink-0" />;
  if (status === "review") return <AlertTriangle className="h-4 w-4 shrink-0" />;
  return <CheckCircle2 className="h-4 w-4 shrink-0" />;
}

function IssueIcon({ severity }: { severity: ModelDiagnosticIssue["severity"] }) {
  if (severity === "error") return <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />;
  if (severity === "warning") return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />;
  return <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />;
}

export function ModelDiagnosticsPanel({ diagnostics, compact = false }: ModelDiagnosticsPanelProps) {
  const visibleIssues = diagnostics.issues.slice(0, compact ? 3 : 5);
  return (
    <section className={`rounded-lg border p-3 ${statusStyles[diagnostics.status]}`}>
      <div className="flex items-start gap-2">
        <StatusIcon status={diagnostics.status} />
        <div className="min-w-0">
          <div className="text-xs font-black">模型诊断</div>
          <div className="mt-1 text-[11px] font-medium leading-5 opacity-90">{diagnostics.summary}</div>
        </div>
      </div>
      {visibleIssues.length ? (
        <div className="mt-3 grid gap-2">
          {visibleIssues.map((item) => (
            <div key={`${item.code}-${item.title}`} className={`rounded-md border p-2 ${issueStyles[item.severity]}`}>
              <div className="flex items-start gap-2">
                <IssueIcon severity={item.severity} />
                <div className="min-w-0">
                  <div className="text-[11px] font-black">{item.title}</div>
                  <div className="mt-0.5 text-[10px] leading-4 opacity-90">{item.detail}</div>
                  <div className="mt-1 text-[10px] leading-4 opacity-75">{item.suggestion}</div>
                </div>
              </div>
            </div>
          ))}
          {diagnostics.issues.length > visibleIssues.length ? (
            <div className="px-1 text-[10px] font-bold opacity-75">另有 {diagnostics.issues.length - visibleIssues.length} 项诊断未展开。</div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
