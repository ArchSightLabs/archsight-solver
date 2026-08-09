import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { BookOpenCheck, CheckCircle2, CircleAlert, Download, FileCheck2, RefreshCw, ShieldCheck } from "lucide-react";
import { trackSolverAnalyticsEvent } from "../analytics/umami-analytics";
import {
  createLearningReview,
  evaluateLearningReview,
  isLearningReviewComplete,
  type LearningAnswers,
  type LearningReview,
} from "../lib/learning-review";
import type { BenchmarkCaseSource } from "../lib/solver-project";
import type { ResultValidity } from "../lib/result-provenance";
import type { AnalysisMode } from "../types/structure";
import type { ExportFormat } from "../hooks/useWorkbenchActions";
import { Button } from "./ui/button";

interface VerificationLearningPanelProps {
  analysisMode: AnalysisMode;
  benchmark: BenchmarkCaseSource;
  exportingFormat: ExportFormat | null;
  isSolving: boolean;
  resultValidity: ResultValidity;
  onRunAndReview: () => void;
  onExport: (format: ExportFormat, learningReview: LearningReview) => void;
}

export function VerificationLearningPanel({
  analysisMode,
  benchmark,
  exportingFormat,
  isSolving,
  resultValidity,
  onRunAndReview,
  onExport,
}: VerificationLearningPanelProps) {
  const learning = benchmark.learning;
  const [answers, setAnswers] = useState<LearningAnswers>({});
  const [submitted, setSubmitted] = useState(false);
  const evidenceTrackedRef = useRef("");
  const completedTrackedRef = useRef("");

  useEffect(() => {
    if (!learning) return;
    void trackSolverAnalyticsEvent("learning_path_opened", { analysis_mode: analysisMode });
  }, [analysisMode, benchmark.caseId, learning]);

  const complete = learning ? isLearningReviewComplete(learning, answers) : false;
  const evaluations = useMemo(
    () => learning ? evaluateLearningReview(learning, answers) : [],
    [answers, learning],
  );
  const currentEvidence = submitted && resultValidity.status === "current";

  useEffect(() => {
    if (!learning || !currentEvidence) return;
    const key = `${benchmark.caseId}:${learning.pathId}`;
    if (evidenceTrackedRef.current === key) return;
    evidenceTrackedRef.current = key;
    void trackSolverAnalyticsEvent("learning_evidence_viewed", { analysis_mode: analysisMode });
  }, [analysisMode, benchmark.caseId, currentEvidence, learning]);

  if (!learning) return null;

  const updateAnswer = (predictionId: string, optionId: string) => {
    setAnswers((current) => ({ ...current, [predictionId]: optionId }));
    if (submitted) setSubmitted(false);
  };

  const runAndReview = () => {
    if (!complete) return;
    setSubmitted(true);
    void trackSolverAnalyticsEvent("learning_prediction_submitted", { analysis_mode: analysisMode });
    onRunAndReview();
  };

  const exportLearningEvidence = (format: ExportFormat) => {
    const review = createLearningReview(benchmark.caseId, learning, answers, true);
    const key = `${benchmark.caseId}:${learning.pathId}`;
    if (completedTrackedRef.current !== key) {
      completedTrackedRef.current = key;
      void trackSolverAnalyticsEvent("learning_path_completed", { analysis_mode: analysisMode });
    }
    onExport(format, review);
  };

  return (
    <section className="rounded-xl border border-sky-300 bg-sky-50/75 p-4 shadow-sm dark:border-sky-800 dark:bg-sky-950/30" aria-label="五分钟学习路径">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
            <BookOpenCheck className="h-4 w-4" />
            五分钟路径 · {benchmark.verificationLevelLabel}
          </div>
          <h2 className="mt-1 text-lg font-black tracking-tight">{learning.title}</h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">{learning.objective}</p>
        </div>
        <span className="rounded-md border border-sky-300 bg-white px-2.5 py-1 text-xs font-black text-sky-800 dark:border-sky-700 dark:bg-slate-900 dark:text-sky-200">
          {benchmark.caseId}
        </span>
      </div>

      {!submitted ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          {learning.predictions.map((prediction, index) => (
            <fieldset key={prediction.id} className="rounded-lg border border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/85">
              <legend className="px-1 text-xs font-black text-sky-700 dark:text-sky-300">预判 {index + 1}</legend>
              <div className="text-sm font-black leading-5">{prediction.prompt}</div>
              <div className="mt-2 space-y-1.5">
                {prediction.options.map((option) => {
                  const selected = answers[prediction.id] === option.id;
                  return (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-xs font-bold leading-5 transition-colors ${selected ? "border-sky-500 bg-sky-50 text-sky-950 dark:bg-sky-950 dark:text-sky-50" : "border-slate-200 hover:border-sky-400 dark:border-slate-700"}`}
                    >
                      <input
                        type="radio"
                        name={`${learning.pathId}-${prediction.id}`}
                        value={option.id}
                        checked={selected}
                        onChange={() => updateAnswer(prediction.id, option.id)}
                        className="mt-1 accent-sky-600"
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          {learning.predictions.map((prediction, index) => {
            const evaluation = evaluations[index];
            const selected = prediction.options.find((option) => option.id === evaluation?.selectedOptionId)?.label ?? "未作答";
            const expected = prediction.options.find((option) => option.id === prediction.expectedOptionId)?.label ?? "标准答案缺失";
            return (
              <div key={prediction.id} className="rounded-lg border border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/85">
                <div className={`flex items-center gap-1.5 text-xs font-black ${evaluation?.matched ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                  {evaluation?.matched ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
                  {evaluation?.matched ? "判断一致" : "需要复核"}
                </div>
                <div className="mt-1 text-sm font-black leading-5">{prediction.prompt}</div>
                <div className="mt-2 text-xs leading-5 text-muted-foreground">你的判断：{selected}</div>
                <div className="text-xs font-bold leading-5">标准结论：{expected}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{prediction.explanation}</div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-sky-200 pt-3 dark:border-sky-800">
        <div className="min-w-0 text-xs font-bold text-muted-foreground">
          {!submitted
            ? `已完成 ${Object.keys(answers).length}/${learning.predictions.length} 项预判`
            : isSolving
              ? "正在计算，完成后将显示图形与解析证据。"
              : resultValidity.status === "current"
                ? "计算结果与当前模型一致，可以导出学习复核证据。"
                : resultValidity.message}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!submitted ? (
            <Button onClick={runAndReview} disabled={!complete || isSolving} className="rounded-lg font-black">
              <RefreshCw className={isSolving ? "animate-spin" : ""} />
              计算并核对
            </Button>
          ) : resultValidity.status !== "current" ? (
            <Button onClick={onRunAndReview} disabled={isSolving} className="rounded-lg font-black">
              <RefreshCw className={isSolving ? "animate-spin" : ""} />
              重新计算
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setSubmitted(false)} className="rounded-lg font-black">修改预判</Button>
              <Button
                variant="outline"
                onClick={() => exportLearningEvidence("docx")}
                disabled={exportingFormat !== null}
                className="rounded-lg font-black"
              >
                <Download />
                学习计算书
              </Button>
              <Button
                variant="outline"
                onClick={() => exportLearningEvidence("xlsx")}
                disabled={exportingFormat !== null}
                className="rounded-lg font-black"
              >
                <Download />
                XLSX 复核表
              </Button>
              <Button
                onClick={() => exportLearningEvidence("verification-package")}
                disabled={exportingFormat !== null}
                className="rounded-lg font-black"
              >
                <FileCheck2 />
                可信证据包
              </Button>
            </>
          )}
        </div>
      </div>

      {currentEvidence ? (
        <details className="mt-3 rounded-lg border border-slate-300 bg-white/80 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/70">
          <summary className="cursor-pointer font-black">图形核对与证据边界</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <EvidenceList title="图形核对" items={learning.graphicalChecks} icon={<CheckCircle2 className="h-4 w-4" />} />
            <EvidenceList title="本路径证明" items={learning.proves} icon={<ShieldCheck className="h-4 w-4" />} />
            <EvidenceList title="本路径不证明" items={learning.doesNotProve} icon={<CircleAlert className="h-4 w-4" />} />
          </div>
        </details>
      ) : null}
    </section>
  );
}

function EvidenceList({ title, items, icon }: { title: string; items: string[]; icon: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 font-black">{icon}{title}</div>
      <ul className="mt-1 space-y-1 pl-4 text-muted-foreground">
        {items.map((item) => <li key={item} className="list-disc leading-5">{item}</li>)}
      </ul>
    </div>
  );
}
