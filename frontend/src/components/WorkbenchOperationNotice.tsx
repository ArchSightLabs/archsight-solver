import type { WorkbenchOperationNotice as WorkbenchOperationNoticeModel } from "../lib/workbench-operation-status";
import type { FailureReviewFormat } from "../lib/failure-review";

interface WorkbenchOperationNoticeProps {
  notice: WorkbenchOperationNoticeModel | null;
  compact?: boolean;
  exportingFormat?: FailureReviewFormat | "verification-package" | null;
  onExportFailureReview?: (format: FailureReviewFormat) => void;
}

const TONE_CLASSES: Record<WorkbenchOperationNoticeModel["tone"], string> = {
  info: "border-sky-500/25 bg-sky-500/[0.08] text-sky-900 dark:border-sky-400/25 dark:bg-sky-400/[0.10] dark:text-sky-100",
  success: "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-400/[0.10] dark:text-emerald-100",
  error: "border-rose-500/30 bg-rose-500/[0.08] text-rose-900 dark:border-rose-400/30 dark:bg-rose-400/[0.10] dark:text-rose-100",
};

const OBJECT_KIND_LABELS: Record<string, string> = {
  node: "节点",
  member: "构件",
  span: "跨段",
  support: "支座",
  load: "荷载",
  loadCase: "荷载工况",
  loadCombination: "荷载组合",
  project: "项目",
};

function diagnosticObjectLabel(kind: string, id: string): string {
  return `${OBJECT_KIND_LABELS[kind] ?? "对象"} ${id}`;
}

export function WorkbenchOperationNotice({ notice, compact = false, exportingFormat = null, onExportFailureReview }: WorkbenchOperationNoticeProps) {
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
              </div>
              <div className="mt-0.5 opacity-85">{issue.detail}</div>
              {issue.objectRefs.length ? <div className="mt-0.5 opacity-75">定位：{issue.objectRefs.map((ref) => diagnosticObjectLabel(ref.kind, ref.id)).join("、")}</div> : null}
              {issue.suggestions[0] ? <div className="mt-0.5 opacity-75">建议：{issue.suggestions[0]}</div> : null}
              <details className="mt-1 opacity-75">
                <summary className="cursor-pointer select-none">技术诊断信息</summary>
                <code className="mt-1 block break-all rounded bg-black/5 px-1.5 py-1 text-[9px] font-bold dark:bg-white/10">诊断代码：{issue.code}</code>
              </details>
            </div>
          ))}
        </div>
      ) : null}
      {notice.phase === "error" && onExportFailureReview ? (
        <div className="mt-2 flex flex-wrap gap-2" aria-label="失败审查材料导出">
          {(["docx", "xlsx"] as const).map((format) => (
            <button
              key={format}
              type="button"
              disabled={exportingFormat !== null}
              onClick={() => onExportFailureReview(format)}
              className="rounded-md border border-current/25 bg-white/35 px-2.5 py-1.5 font-bold transition-colors hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-black/10 dark:hover:bg-black/20"
            >
              {exportingFormat === format ? "正在生成…" : `下载失败审查 ${format.toUpperCase()}`}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
