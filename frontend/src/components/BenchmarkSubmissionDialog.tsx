import { FileJson, X } from "lucide-react";
import type { BenchmarkSubmissionCategory } from "../lib/benchmark-submission-package";
import { BenchmarkSubmissionPackagePanel } from "./BenchmarkSubmissionPackagePanel";
import { Button } from "./ui/button";

interface BenchmarkSubmissionDialogProps {
  category: BenchmarkSubmissionCategory;
  payload: unknown | null;
  calculationResult?: unknown | null;
  objectName: string;
  disabledReason?: string | null;
  isCalculating: boolean;
  onRunCalculation: () => unknown | Promise<unknown>;
  onClose: () => void;
}

export function BenchmarkSubmissionDialog({
  category,
  payload,
  calculationResult,
  objectName,
  disabledReason,
  isCalculating,
  onRunCalculation,
  onClose,
}: BenchmarkSubmissionDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/82 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="benchmark-submission-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-950 shadow-2xl shadow-slate-950/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:shadow-black/45"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950 sm:px-5 sm:py-4">
          <div className="min-w-0 space-y-1">
            <div className="eyebrow flex items-center gap-2 text-slate-500">
              <FileJson className="h-3.5 w-3.5 text-sky-600 dark:text-sky-300" />
              公开验证
            </div>
            <h2 id="benchmark-submission-title" className="text-lg font-black tracking-tight text-slate-950 dark:text-slate-50">
              生成验证投稿包
            </h2>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              基于当前分析对象生成离线 JSON，用于提交公开验证算例候选。
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={onClose}
            aria-label="关闭验证投稿"
            className="h-9 w-9 shrink-0 rounded-lg border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50 p-3 dark:bg-slate-950 sm:p-4">
          <BenchmarkSubmissionPackagePanel
            category={category}
            payload={payload}
            calculationResult={calculationResult}
            objectName={objectName}
            disabledReason={disabledReason}
            isCalculating={isCalculating}
            onRunCalculation={onRunCalculation}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
