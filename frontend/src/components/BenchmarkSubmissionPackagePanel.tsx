import type { ReactNode } from "react";
import { useState } from "react";
import { AlertTriangle, Calculator, CheckCircle2, Copy, Download, ExternalLink, FileJson, Mail, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { DropdownSelect } from "./ui/DropdownSelect";
import { BENCHMARK_SUBMISSION_EMAIL, GITHUB_REPOSITORY_URL } from "../lib/app-metadata.ts";
import {
  BENCHMARK_SOURCE_TYPE_OPTIONS,
  buildBenchmarkSubmissionChannelDraft,
  buildBenchmarkSubmissionPackageRequest,
  createBenchmarkCaseId,
  createDefaultBenchmarkSubmissionForm,
  type BenchmarkSubmissionChannelDraft,
  type BenchmarkSubmissionCategory,
  type BenchmarkSubmissionFormState,
  type BenchmarkMetricFormRow,
} from "../lib/benchmark-submission-package.ts";

interface BenchmarkSubmissionPackagePanelProps {
  category: BenchmarkSubmissionCategory;
  payload: unknown | null;
  calculationResult?: unknown | null;
  objectName: string;
  disabledReason?: string | null;
  isCalculating?: boolean;
  onRunCalculation?: () => unknown | Promise<unknown>;
  onCancel?: () => void;
}

interface PackageApiResponse {
  filename?: string;
  submissionId?: string;
  package?: unknown;
  diagnostics?: {
    warnings?: string[];
    infos?: string[];
  };
}

type GeneratedSubmission = BenchmarkSubmissionChannelDraft & {
  filename: string;
  submissionId: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;
const FIELD_LABEL_CLASS = "text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400";
const INPUT_CLASS =
  "border-slate-300 bg-white text-slate-900 shadow-none placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus-visible:ring-sky-400";
const INPUT_SM_CLASS =
  "h-9 min-w-0 border-slate-300 bg-white font-mono text-xs text-slate-900 shadow-none placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus-visible:ring-sky-400";
const SELECT_CLASS =
  "border-slate-300 bg-white text-slate-900 shadow-none hover:border-sky-500/60 hover:bg-slate-50 focus-visible:ring-1 focus-visible:ring-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900 dark:focus-visible:ring-sky-400";
const SELECT_MENU_CLASS = "rounded-lg border-slate-200 bg-white text-slate-900 shadow-2xl shadow-slate-950/10 backdrop-blur-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:shadow-black/40";
const SELECT_OPTION_CLASS = "border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 dark:hover:text-sky-200";
const TEXTAREA_CLASS =
  "min-h-24 w-full resize-y rounded-lg border border-slate-300 bg-white p-3 font-mono text-[11px] leading-5 text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-400";

export function BenchmarkSubmissionPackagePanel({
  category,
  payload,
  calculationResult,
  objectName,
  disabledReason,
  isCalculating = false,
  onRunCalculation,
  onCancel,
}: BenchmarkSubmissionPackagePanelProps) {
  const [form, setForm] = useState<BenchmarkSubmissionFormState>(() => createDefaultBenchmarkSubmissionForm(category, payload, objectName, calculationResult));
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [diagnosticTone, setDiagnosticTone] = useState<"neutral" | "error">("neutral");
  const [generatedSubmission, setGeneratedSubmission] = useState<GeneratedSubmission | null>(null);

  const updateField = <K extends keyof BenchmarkSubmissionFormState>(field: K, nextValue: BenchmarkSubmissionFormState[K]) => {
    setForm((current) => ({ ...current, [field]: nextValue }));
  };
  const updateMetric = (index: number, patch: Partial<BenchmarkMetricFormRow>) => {
    setForm((current) => ({
      ...current,
      metrics: current.metrics.map((metric, metricIndex) => (metricIndex === index ? { ...metric, ...patch } : metric)),
    }));
  };
  const updateTitle = (nextTitle: string) => {
    setForm((current) => ({
      ...current,
      title: nextTitle,
      caseId: createBenchmarkCaseId(category, nextTitle),
    }));
  };

  const resetDraft = () => {
    setForm(createDefaultBenchmarkSubmissionForm(category, payload, objectName, calculationResult));
    setStatusMessage("已按当前模型重置投稿草案。");
    setDiagnostics([]);
    setDiagnosticTone("neutral");
    setGeneratedSubmission(null);
  };
  const fillMetricsFromCalculation = (nextCalculationResult: unknown, message: string) => {
    setForm((current) => {
      const title = current.title.trim() || objectName;
      const nextDraft = createDefaultBenchmarkSubmissionForm(category, payload, title, nextCalculationResult);
      return {
        ...current,
        caseId: createBenchmarkCaseId(category, title),
        title,
        metrics: nextDraft.metrics,
      };
    });
    setStatusMessage(message);
  };
  const runCalculationAndFill = async () => {
    setStatusMessage("正在运行当前分析对象计算；完成后会自动填入校核指标。");
    setDiagnostics([]);
    setDiagnosticTone("neutral");
    setGeneratedSubmission(null);
    const nextCalculationResult = await onRunCalculation?.();
    if (nextCalculationResult) {
      fillMetricsFromCalculation(nextCalculationResult, "已按当前分析对象计算结果填入校核指标。");
    }
  };

  const generatePackage = async () => {
    setStatusMessage(null);
    setDiagnostics([]);
    setGeneratedSubmission(null);
    let request: ReturnType<typeof buildBenchmarkSubmissionPackageRequest>;
    try {
      request = buildBenchmarkSubmissionPackageRequest(category, payload, form);
    } catch (error) {
      setDiagnosticTone("error");
      setDiagnostics([error instanceof Error ? error.message : "请先补全必填项。"]);
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch(apiUrl("/api/benchmark-submission-packages"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        mode: "cors",
        body: JSON.stringify(request),
      });
      const data = asRecord(await response.json());
      if (!response.ok) {
        throw new Error(apiErrorMessage(data, "验证投稿包生成失败"));
      }
      const body = data as PackageApiResponse;
      if (!body.package) {
        throw new Error("接口未返回投稿包。");
      }
      const packageRecord = asRecord(body.package);
      const precheck = asRecord(packageRecord.precheck);
      const submissionId = stringField(body.submissionId) || stringField(precheck.submissionId) || request.case.id;
      const filename = body.filename ?? `${form.caseId.trim() || category}-submission.json`;
      const channelDraft = buildBenchmarkSubmissionChannelDraft({
        repositoryUrl: GITHUB_REPOSITORY_URL,
        officialEmail: BENCHMARK_SUBMISSION_EMAIL,
        submissionId,
        filename,
        caseId: request.case.id,
        caseTitle: request.case.title,
        category,
        reviewStatus: stringField(precheck.reviewStatus),
      });
      downloadJson(body.package, filename);
      setGeneratedSubmission({ ...channelDraft, filename, submissionId });
      setStatusMessage("已生成并下载 JSON 投稿包，可通过 GitHub Issue 或官方邮箱提交。");
      setDiagnosticTone("neutral");
      setDiagnostics([...(body.diagnostics?.warnings ?? []), ...(body.diagnostics?.infos ?? [])]);
    } catch (error) {
      setDiagnosticTone("error");
      setDiagnostics([error instanceof Error ? error.message : "验证投稿包生成失败。"]);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyText = async (text: string, successMessage: string) => {
    try {
      await window.navigator.clipboard.writeText(text);
      setStatusMessage(successMessage);
      setDiagnosticTone("neutral");
    } catch {
      setDiagnosticTone("error");
      setDiagnostics(["复制失败，请手动选择页面中的文本复制。"]);
    }
  };

  const cannotGenerate = isGenerating || isCalculating || Boolean(disabledReason) || payload === null;

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex-1 space-y-4 overflow-y-auto p-4 custom-scrollbar">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="eyebrow flex items-center gap-2 text-slate-500">
            <FileJson className="h-3.5 w-3.5 text-sky-600 dark:text-sky-300" />
            验证投稿包
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            生成单文件 JSON；不写入服务器，由维护者离线复核后决定是否收录。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={runCalculationAndFill}
            disabled={!onRunCalculation || isCalculating}
            className="h-8 rounded-lg border-slate-300 bg-white px-3 text-[11px] text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <Calculator className="mr-1.5 h-3.5 w-3.5" />
            {isCalculating ? "计算中..." : "计算并填入"}
          </Button>
          <Button variant="outline" size="sm" onClick={resetDraft} className="h-8 rounded-lg border-slate-300 bg-white px-3 text-[11px] text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            重置草案
          </Button>
        </div>
      </div>

      {disabledReason ? (
        <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/35 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{disabledReason}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="对象名称" required>
          <Input value={form.title} onChange={(event) => updateTitle(event.target.value)} className={`h-10 min-w-0 text-xs ${INPUT_CLASS}`} />
        </FormField>
        <FormField label="验证目的" className="sm:col-span-2" required>
          <textarea value={form.purpose} onChange={(event) => updateField("purpose", event.target.value)} className={TEXTAREA_CLASS} />
        </FormField>
        <FormField label="验证来源类型" required>
          <DropdownSelect
            value={form.sourceType}
            onChange={(nextValue) => updateField("sourceType", nextValue)}
            options={BENCHMARK_SOURCE_TYPE_OPTIONS}
            className={`h-10 text-xs ${SELECT_CLASS}`}
            menuClassName={`text-xs ${SELECT_MENU_CLASS}`}
            optionClassName={SELECT_OPTION_CLASS}
          />
        </FormField>
        <FormField label="参考来源" optional>
          <Input value={form.reference} onChange={(event) => updateField("reference", event.target.value)} className={`h-10 min-w-0 text-xs ${INPUT_CLASS}`} />
        </FormField>
        <FormField label="复核方法" className="sm:col-span-2" required>
          <textarea value={form.method} onChange={(event) => updateField("method", event.target.value)} className={TEXTAREA_CLASS} />
        </FormField>
        <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950 sm:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className={FIELD_LABEL_CLASS}>自动校核指标</div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                模型数量、状态码和控制对象从当前分析结果读取；数值标准值可按独立复核依据修正。
              </p>
            </div>
          </div>
          <div className="hidden grid-cols-[minmax(9rem,1.1fr)_minmax(7rem,0.8fr)_6rem_minmax(7rem,0.8fr)_6rem] gap-2 px-1 text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-500 md:grid">
            <span>指标</span>
            <span>读取值 / 标准值 *</span>
            <span>单位</span>
            <span>容许误差 *</span>
            <span>误差单位</span>
          </div>
          <div className="space-y-2">
            {form.metrics.map((metric, index) => (
              <div
                key={metric.key}
                className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 md:grid-cols-[minmax(9rem,1.1fr)_minmax(7rem,0.8fr)_6rem_minmax(7rem,0.8fr)_6rem]"
              >
                <div className="min-w-0">
                  <div className="text-[10px] font-black tracking-widest text-slate-500 md:hidden">指标</div>
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <div className="truncate text-sm font-black text-slate-900 dark:text-slate-100">{metric.label}</div>
                    {metric.expectedReadonly ? (
                      <span className="rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[9px] font-black text-sky-700 dark:border-sky-400/25 dark:bg-sky-950 dark:text-sky-200">
                        自动读取
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-slate-500">{metric.key}</div>
                  {metric.expectedSourceLabel ? (
                    <div className="mt-1 text-[10px] font-bold text-slate-500 dark:text-slate-500">来源：{metric.expectedSourceLabel}</div>
                  ) : null}
                </div>
                {metric.expectedReadonly ? (
                  <ReadOnlyMetricValue metric={metric} />
                ) : (
                  <Input
                    type={metric.valueType === "number" ? "number" : "text"}
                    step={metric.valueType === "number" ? "any" : undefined}
                    value={metric.expectedValue}
                    onChange={(event) => updateMetric(index, { expectedValue: event.target.value })}
                    className={INPUT_SM_CLASS}
                    aria-label={`${metric.label}标准值`}
                  />
                )}
                <MetricUnitControl
                  metric={metric}
                  value={metric.expectedUnit}
                  onChange={(nextUnit) => metric.expectedReadonly ? undefined : updateMetric(index, { expectedUnit: nextUnit })}
                  label={`${metric.label}单位`}
                />
                {metric.toleranceKey ? (
                  <Input
                    type="number"
                    step="any"
                    value={metric.toleranceValue}
                    onChange={(event) => updateMetric(index, { toleranceValue: event.target.value })}
                    className={INPUT_SM_CLASS}
                    aria-label={`${metric.label}容许误差`}
                  />
                ) : (
                  <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-[11px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                    精确匹配
                  </div>
                )}
                {metric.toleranceKey ? (
                  <MetricUnitControl
                    metric={metric}
                    value={metric.toleranceUnit}
                    onChange={(nextUnit) => updateMetric(index, { toleranceUnit: nextUnit })}
                    label={`${metric.label}误差单位`}
                  />
                ) : (
                  <div className="hidden md:block" />
                )}
              </div>
            ))}
          </div>
        </section>
        <FormField label="来源链接" className="sm:col-span-2" optional>
          <textarea value={form.sourceLinksText} onChange={(event) => updateField("sourceLinksText", event.target.value)} className={TEXTAREA_CLASS} placeholder="每行一个公开链接，可留空" />
        </FormField>
        <FormField label="投稿人" optional>
          <Input value={form.contributorName} onChange={(event) => updateField("contributorName", event.target.value)} className={`h-10 min-w-0 text-xs ${INPUT_CLASS}`} />
        </FormField>
        <FormField label="联系方式" optional>
          <Input value={form.contributorContact} onChange={(event) => updateField("contributorContact", event.target.value)} className={`h-10 min-w-0 text-xs ${INPUT_CLASS}`} />
        </FormField>
      </div>

      {statusMessage ? (
        <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-950 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      ) : null}
      {diagnostics.length ? (
        <div className={`space-y-1 rounded-lg border p-3 text-xs ${
          diagnosticTone === "error"
            ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-950 dark:text-rose-200"
            : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
        }`}>
          {diagnostics.map((item) => (
            <div key={item}>{item}</div>
          ))}
        </div>
      ) : null}
      {generatedSubmission ? (
        <section className="space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-4 dark:border-sky-500/25 dark:bg-sky-950">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-black text-slate-950 dark:text-slate-50">正式提交通道</div>
              <p className="text-xs leading-relaxed text-sky-900/80 dark:text-sky-100/80">
                投稿编号：<span className="font-mono text-slate-950 dark:text-slate-50">{generatedSubmission.submissionId}</span>。请将已下载的
                <span className="font-mono text-slate-950 dark:text-slate-50"> {generatedSubmission.filename}</span> 作为附件提交。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => copyText(generatedSubmission.submissionId, "已复制投稿编号。")}
              className="h-8 rounded-lg border-sky-200 bg-white px-3 text-[11px] text-sky-800 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100 dark:hover:bg-sky-900"
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              复制编号
            </Button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-sky-200 bg-white p-3 dark:border-sky-800 dark:bg-slate-950">
              <div className="flex items-center gap-2 text-xs font-black text-slate-950 dark:text-slate-50">
                <ExternalLink className="h-3.5 w-3.5 text-sky-600 dark:text-sky-300" />
                GitHub Issue
              </div>
              <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                适合公开来源、希望公开追踪审核状态的验证算例投稿。
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" className="h-8 rounded-lg bg-sky-600 px-3 text-[11px] text-white hover:bg-sky-500 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400">
                  <a href={generatedSubmission.issueUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    打开 GitHub 投稿
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyText(generatedSubmission.issueBody, "已复制 GitHub 投稿摘要。")}
                  className="h-8 rounded-lg border-slate-300 bg-white px-3 text-[11px] text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  复制摘要
                </Button>
              </div>
            </div>
            <div className="space-y-2 rounded-lg border border-sky-200 bg-white p-3 dark:border-sky-800 dark:bg-slate-950">
              <div className="flex items-center gap-2 text-xs font-black text-slate-950 dark:text-slate-50">
                <Mail className="h-3.5 w-3.5 text-sky-600 dark:text-sky-300" />
                官方邮箱
              </div>
              <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                接收邮箱：<span className="font-mono text-slate-950 dark:text-slate-50">{generatedSubmission.officialEmail}</span>。邮件草稿不会自动添加附件。
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm" className="h-8 rounded-lg border-slate-300 bg-white px-3 text-[11px] text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800">
                  <a href={generatedSubmission.mailtoUrl}>
                    <Mail className="mr-1.5 h-3.5 w-3.5" />
                    打开邮件草稿
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyText(generatedSubmission.officialEmail, "已复制官方邮箱。")}
                  className="h-8 rounded-lg border-slate-300 bg-white px-3 text-[11px] text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  复制邮箱
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyText(generatedSubmission.emailBody, "已复制邮件正文。")}
                  className="h-8 rounded-lg border-slate-300 bg-white px-3 text-[11px] text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  复制正文
                </Button>
              </div>
            </div>
          </div>
        </section>
      ) : null}
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-10px_24px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_-10px_24px_rgba(2,6,23,0.55)]">
        <Button type="button" variant="outline" onClick={onCancel} className="h-9 rounded-lg border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800">
          取消
        </Button>
        <Button type="button" onClick={generatePackage} disabled={cannotGenerate} className="h-9 rounded-lg bg-sky-600 px-4 text-xs font-bold text-white hover:bg-sky-500 disabled:bg-slate-200 disabled:text-slate-500 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 dark:disabled:bg-slate-800 dark:disabled:text-slate-500">
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {isGenerating ? "生成中..." : "确定并下载"}
        </Button>
      </div>
    </section>
  );
}

function FormField({
  label,
  className = "",
  required = false,
  optional = false,
  children,
}: {
  label: string;
  className?: string;
  required?: boolean;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`space-y-1.5 ${className}`}>
      <div className={FIELD_LABEL_CLASS}>
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        {optional ? <span className="ml-1 text-[9px] text-slate-500">可选</span> : null}
      </div>
      {children}
    </label>
  );
}

function ReadOnlyMetricValue({ metric }: { metric: BenchmarkMetricFormRow }) {
  return (
    <div
      className="flex h-9 min-w-0 items-center rounded-md border border-slate-200 bg-slate-50 px-3 font-mono text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
      title={metric.expectedValue || "未读取到当前值"}
      aria-label={`${metric.label}自动读取值`}
    >
      <span className="truncate">{metric.expectedValue || "—"}</span>
    </div>
  );
}

function MetricUnitControl({
  metric,
  value,
  onChange,
  label,
}: {
  metric: BenchmarkMetricFormRow;
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  if (!metric.unitOptions.length) {
    return (
      <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
        无
      </div>
    );
  }
  if (metric.unitOptions.length === 1) {
    return (
      <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
        {value || metric.unitOptions[0]}
      </div>
    );
  }
  return (
    <DropdownSelect
      value={value}
      onChange={onChange}
      options={metric.unitOptions.map((unit) => ({ value: unit, label: unit }))}
      className={`h-9 text-xs ${SELECT_CLASS}`}
      menuClassName={`text-xs ${SELECT_MENU_CLASS}`}
      optionClassName={SELECT_OPTION_CLASS}
      placeholder={label}
    />
  );
}

function downloadJson(value: unknown, filename: string) {
  const blob = new window.Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function apiErrorMessage(data: Record<string, unknown>, fallback: string): string {
  const error = asRecord(data.error);
  return typeof error.message === "string" && error.message.trim() ? error.message : fallback;
}
