import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Copy, RefreshCw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import type { AnalysisMode } from "../types/structure.ts";
import type { ProjectTemplate } from "../types/beam.ts";
import { analysisVocabulary } from "../lib/analysis-vocabulary.ts";
import type { TemplateActionResult } from "../lib/template-library.ts";

interface TemplateLibraryPanelProps {
  templates: ProjectTemplate[];
  baselineTemplateId: string | null;
  currentMode: AnalysisMode;
  isAtCapacity: boolean;
  compact?: boolean;
  onSaveTemplate: (name: string) => TemplateActionResult<ProjectTemplate>;
  onSaveComplete?: () => void;
  onRestoreTemplate: (template: ProjectTemplate) => TemplateActionResult<void>;
  onDuplicateTemplate: (templateId: string) => TemplateActionResult<ProjectTemplate>;
  onDeleteTemplate: (templateId: string) => TemplateActionResult<void>;
  onSetBaselineTemplate: (templateId: string | null) => TemplateActionResult<void>;
}

const MODE_LABELS: Record<AnalysisMode, string> = {
  beam: analysisVocabulary("beam").systemLabel,
  frame: analysisVocabulary("frame").systemLabel,
  truss: analysisVocabulary("truss").systemLabel,
};

const MODE_PLACEHOLDERS: Record<AnalysisMode, string> = {
  beam: "例如：标准梁系方案",
  frame: "例如：标准平面框架方案",
  truss: "例如：标准平面桁架方案",
};

const panelSurfaceButton =
  "h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm transition-colors hover:border-sky-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-sky-400/45 dark:hover:bg-slate-800";

const panelPrimaryButton =
  "h-9 rounded-lg border border-sky-500/45 bg-sky-400 px-4 text-sm font-bold text-slate-950 shadow-sm transition-colors hover:bg-sky-300 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:border-slate-700 dark:disabled:bg-slate-900 dark:disabled:text-slate-500";

const panelDangerButton =
  "h-8 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 shadow-sm transition-colors hover:border-red-300 hover:bg-red-50 dark:border-red-400/25 dark:bg-slate-900 dark:text-red-200 dark:hover:border-red-300/40 dark:hover:bg-red-500/10";

const statusLineClass = "rounded-lg border px-3 py-2 text-xs font-semibold leading-5";

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function TemplateLibraryPanel({
  templates,
  baselineTemplateId,
  currentMode,
  isAtCapacity,
  compact = false,
  onSaveTemplate,
  onSaveComplete,
  onRestoreTemplate,
  onDuplicateTemplate,
  onDeleteTemplate,
  onSetBaselineTemplate,
}: TemplateLibraryPanelProps) {
  const [templateName, setTemplateName] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectTemplate | null>(null);

  const baselineTemplate = useMemo(
    () => templates.find((template) => template.id === baselineTemplateId) ?? null,
    [baselineTemplateId, templates],
  );

  useEffect(() => {
    if (!pendingDelete) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setPendingDelete(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingDelete]);

  const handleSave = () => {
    const result = onSaveTemplate(templateName);
    if (result.ok) {
      setTemplateName("");
      setErrorMessage(null);
      setStatusMessage(`已保存模板「${result.value?.name ?? templateName.trim()}」。`);
      onSaveComplete?.();
      return;
    }
    setStatusMessage(null);
    setErrorMessage(result.error ?? "保存失败");
  };

  const handleSaveSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isAtCapacity) {
      return;
    }
    handleSave();
  };

  const handleRestore = (template: ProjectTemplate) => {
    const result = onRestoreTemplate(template);
    if (result.ok) {
      setErrorMessage(null);
      setStatusMessage(`已恢复模板「${template.name}」。`);
      return;
    }
    setStatusMessage(null);
    setErrorMessage(result.error ?? "恢复失败");
  };

  const handleDuplicate = (templateId: string) => {
    const result = onDuplicateTemplate(templateId);
    if (result.ok) {
      setErrorMessage(null);
      setStatusMessage(`已复制模板「${result.value?.name ?? "副本"}」。`);
      return;
    }
    setStatusMessage(null);
    setErrorMessage(result.error ?? "复制失败");
  };

  const handleToggleBaseline = (templateId: string) => {
    const result = onSetBaselineTemplate(baselineTemplateId === templateId ? null : templateId);
    if (result.ok) {
      setErrorMessage(null);
      setStatusMessage(baselineTemplateId === templateId ? "已取消基准模板标记。" : "已更新基准模板。");
      return;
    }
    setStatusMessage(null);
    setErrorMessage(result.error ?? "更新基准失败");
  };

  const confirmDelete = () => {
    if (!pendingDelete) {
      return;
    }
    const result = onDeleteTemplate(pendingDelete.id);
    if (result.ok) {
      setErrorMessage(null);
      setStatusMessage(`已删除模板「${pendingDelete.name}」。`);
      setPendingDelete(null);
      return;
    }
    setStatusMessage(null);
    setErrorMessage(result.error ?? "删除失败");
  };

  return (
    <section className={compact ? "space-y-3" : "space-y-4"}>
      <form
        className="rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-3 shadow-sm dark:border-white/10 dark:bg-white/[0.035]"
        onSubmit={handleSaveSubmit}
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="min-w-0">
            <span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">模板名称</span>
            <input
              type="text"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder={MODE_PLACEHOLDERS[currentMode]}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-200/50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-sky-400/60 dark:focus:ring-sky-400/20"
              aria-label="模板名称"
            />
          </label>
          <Button type="submit" disabled={isAtCapacity} className={`${panelPrimaryButton} sm:min-w-28`}>
            <Save className="h-4 w-4" />
            保存
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-muted-foreground">
          {MODE_LABELS[currentMode]} · {templates.length} / 50 模板
        </span>
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
          {baselineTemplate ? (
            <>
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
              <span className="truncate">基准：{baselineTemplate.name}</span>
            </>
          ) : (
            "未设置基准模板"
          )}
        </span>
      </div>

      {statusMessage && (
        <div className={`${statusLineClass} border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200`}>
          {statusMessage}
        </div>
      )}
      {errorMessage && (
        <div className={`${statusLineClass} border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-200`}>
          {errorMessage}
        </div>
      )}
      {isAtCapacity && (
        <div className={`${statusLineClass} border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-200`}>
          模板已达上限，先删除旧模板再继续保存。
        </div>
      )}

      <div
        className={`space-y-2 overflow-y-auto pr-1 ${compact ? "max-h-[calc(100dvh-18rem)] sm:max-h-[420px]" : "max-h-[440px]"}`}
        aria-label="模板列表"
      >
        {templates.length === 0 ? (
          <div className={`rounded-lg border border-dashed border-slate-300 bg-white ${compact ? "p-4 text-xs" : "p-5 text-sm"} font-semibold text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400`}>
            暂无模板。先把当前工作区保存为模板，后续可以一键恢复、复制或设为基准。
          </div>
        ) : (
          templates.map((template) => {
            const isBaseline = template.id === baselineTemplateId;
            const modeLabel = analysisVocabulary(template.snapshot.analysisMode).systemLabel;

            return (
              <article
                key={template.id}
                className="rounded-lg border border-slate-200/80 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
              >
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h4 className="min-w-0 truncate text-sm font-black text-slate-950 dark:text-white">{template.name}</h4>
                      {isBaseline && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200">
                          <ShieldCheck className="h-3 w-3" />
                          基准
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 dark:border-white/10 dark:bg-white/[0.04]">{modeLabel}</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 dark:border-white/10 dark:bg-white/[0.04]">
                        更新 {formatTime(template.updatedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <Button variant="outline" className={panelSurfaceButton} onClick={() => handleRestore(template)}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      恢复
                    </Button>
                    <Button variant="outline" className={panelSurfaceButton} onClick={() => handleDuplicate(template.id)}>
                      <Copy className="h-3.5 w-3.5" />
                      复制
                    </Button>
                    <Button
                      variant="outline"
                      className={panelSurfaceButton}
                      onClick={() => handleToggleBaseline(template.id)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {isBaseline ? "取消基准" : "设为基准"}
                    </Button>
                    <Button
                      variant="outline"
                      className={panelDangerButton}
                      onClick={() => setPendingDelete(template)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </Button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {pendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-delete-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-950">
            <h3 id="template-delete-title" className="text-lg font-black text-slate-950 dark:text-white">
              删除模板
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              确认删除模板「{pendingDelete.name}」吗？删除后本地保存的数据将同步移除，且无法通过模板库恢复。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                className={panelSurfaceButton}
                onClick={() => setPendingDelete(null)}
              >
                取消
              </Button>
              <Button
                className={`${panelDangerButton} px-4`}
                onClick={confirmDelete}
              >
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
