import type { WorkbenchOperationNotice as WorkbenchOperationNoticeModel } from "../lib/workbench-operation-status";

interface WorkbenchOperationNoticeProps {
  notice: WorkbenchOperationNoticeModel | null;
  compact?: boolean;
}

const TONE_CLASSES: Record<WorkbenchOperationNoticeModel["tone"], string> = {
  info: "border-sky-500/25 bg-sky-500/[0.08] text-sky-900 dark:border-sky-400/25 dark:bg-sky-400/[0.10] dark:text-sky-100",
  success: "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-400/[0.10] dark:text-emerald-100",
  error: "border-rose-500/30 bg-rose-500/[0.08] text-rose-900 dark:border-rose-400/30 dark:bg-rose-400/[0.10] dark:text-rose-100",
};

export function WorkbenchOperationNotice({ notice, compact = false }: WorkbenchOperationNoticeProps) {
  if (!notice) {
    return null;
  }

  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      aria-live="polite"
      className={`rounded-lg border px-3 py-2 ${TONE_CLASSES[notice.tone]} ${compact ? "text-[11px]" : "text-xs"}`}
    >
      <div className="font-black">{notice.title}</div>
      <div className="mt-0.5 font-medium opacity-80">{notice.message}</div>
      {notice.diagnostics?.length ? (
        <div className="mt-2 grid gap-1.5" aria-label="结构化诊断">
          {notice.diagnostics.slice(0, 3).map((issue) => (
            <div key={`${issue.code}-${issue.title}`} className="rounded-md border border-current/15 bg-white/20 px-2 py-1.5 dark:bg-black/10">
              <div className="flex flex-wrap items-center gap-1.5 font-black">
                <span>{issue.title}</span>
                <code className="rounded bg-black/5 px-1 py-0.5 text-[9px] font-bold dark:bg-white/10">{issue.code}</code>
              </div>
              <div className="mt-0.5 opacity-85">{issue.detail}</div>
              {issue.objectRefs.length ? <div className="mt-0.5 opacity-75">定位：{issue.objectRefs.map((ref) => `${ref.kind} ${ref.id}`).join("、")}</div> : null}
              {issue.suggestions[0] ? <div className="mt-0.5 opacity-75">建议：{issue.suggestions[0]}</div> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
