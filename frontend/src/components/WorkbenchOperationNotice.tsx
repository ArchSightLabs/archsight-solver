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
    </div>
  );
}
