import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Copy, RefreshCw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { GlassCard, GlassHeader } from "./ui/GlassCard";
import type { AnalysisMode } from "../types/structure.ts";
import type { ProjectTemplate } from "../types/beam.ts";
import type { TemplateActionResult } from "../lib/template-library.ts";

interface TemplateLibraryPanelProps {
  templates: ProjectTemplate[];
  baselineTemplateId: string | null;
  currentMode: AnalysisMode;
  isAtCapacity: boolean;
  compact?: boolean;
  onSaveTemplate: (name: string) => TemplateActionResult<ProjectTemplate>;
  onRestoreTemplate: (template: ProjectTemplate) => TemplateActionResult<void>;
  onDuplicateTemplate: (templateId: string) => TemplateActionResult<ProjectTemplate>;
  onDeleteTemplate: (templateId: string) => TemplateActionResult<void>;
  onSetBaselineTemplate: (templateId: string | null) => TemplateActionResult<void>;
}

const MODE_LABELS: Record<AnalysisMode, string> = {
  beam: "梁系",
  frame: "框架",
  truss: "桁架",
};

const MODE_PLACEHOLDERS: Record<AnalysisMode, string> = {
  beam: "例如：标准梁系方案",
  frame: "例如：标准框架方案",
  truss: "例如：标准桁架方案",
};

const panelSurfaceButton =
  "h-10 rounded-lg border border-slate-200/80 bg-white/80 px-3 font-semibold text-slate-950 shadow-sm transition-colors hover:border-sky-300/70 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:hover:border-sky-400/30 dark:hover:bg-white/8";

const panelPrimaryButton =
  "h-10 rounded-lg border border-sky-200/80 bg-sky-50 px-4 font-semibold text-sky-700 shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-100 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100 dark:hover:border-sky-300/30 dark:hover:bg-sky-400/15";

const panelDangerButton =
  "h-10 rounded-lg border border-red-200/90 bg-red-50 px-3 font-semibold text-red-700 shadow-sm transition-colors hover:border-red-300 hover:bg-red-100 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-100 dark:hover:border-red-300/40 dark:hover:bg-red-500/15";

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
    [baselineTemplateId, templates]
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
      return;
    }
    setStatusMessage(null);
    setErrorMessage(result.error ?? "保存失败");
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
    <GlassCard className={`${compact ? "p-4 space-y-3" : "p-5 space-y-4"}`}>
      <GlassHeader
        title="模板库"
        subtitle={`${MODE_LABELS[currentMode]}工作区快照`}
      />

      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-40">模板名称</label>
            <input
              type="text"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder={MODE_PLACEHOLDERS[currentMode]}
              className="h-10 w-full rounded-lg border border-slate-200/70 bg-white/80 px-3 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-200/40 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-slate-500 dark:focus:border-sky-400/40 dark:focus:bg-white/6 dark:focus:ring-sky-400/20"
              aria-label="模板名称"
            />
          </div>
          <div className="flex items-end sm:justify-end">
            <Button
              onClick={handleSave}
              disabled={isAtCapacity}
              className={`${panelPrimaryButton} ${compact ? "w-full px-4" : "px-5"}`}
            >
              <Save className="mr-2 h-4 w-4" />
              保存
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            {templates.length} / 50 模板
          </span>
          <span className="truncate text-primary">
            {baselineTemplate ? `基准：${baselineTemplate.name}` : "未设置基准模板"}
          </span>
        </div>

        {statusMessage && (
          <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-200">
            {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div className="rounded-lg border border-red-500/15 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-200">
            {errorMessage}
          </div>
        )}
        {isAtCapacity && (
          <div className="rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
            模板已达上限，先删除旧模板再继续保存。
          </div>
        )}
      </div>

      <div className={`space-y-3 overflow-y-auto pr-1 ${compact ? "max-h-[calc(100dvh-18rem)] sm:max-h-[420px]" : "max-h-[420px]"}`}>
        {templates.length === 0 ? (
          <div className={`rounded-3xl border border-dashed border-slate-200/70 bg-white/[0.04] ${compact ? "p-4 text-xs" : "p-5 text-sm"} text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400`}>
            暂无模板。先把当前工作区保存为模板，后续可以一键恢复、复制或设为基准。
          </div>
        ) : (
          templates.map((template) => {
            const isBaseline = template.id === baselineTemplateId;
            const modeLabel = template.snapshot.analysisMode === "frame" ? "框架" : template.snapshot.analysisMode === "truss" ? "桁架" : "梁系";

            return (
              <div
                key={template.id}
                className={`rounded-3xl border border-slate-200/70 bg-white/60 ${compact ? "p-3" : "p-4"} shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[0_18px_40px_rgba(2,8,23,0.35)]`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate text-sm font-semibold text-slate-950 dark:text-white">{template.name}</h4>
                      {isBaseline && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-200">
                          <ShieldCheck className="h-3 w-3" />
                          基准
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      <span className="rounded-full border border-slate-200/70 bg-white/70 px-2 py-0.5 dark:border-white/10 dark:bg-white/[0.03]">{modeLabel}</span>
                      <span className="rounded-full border border-slate-200/70 bg-white/70 px-2 py-0.5 dark:border-white/10 dark:bg-white/[0.03]">
                        更新 {formatTime(template.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <BookOpen className="mt-0.5 h-4 w-4 text-sky-500/80 dark:text-sky-300/80" />
                </div>

                <div className={`mt-4 grid grid-cols-2 gap-2 ${compact ? "text-sm" : ""}`}>
                  <Button variant="outline" className={`${panelSurfaceButton} ${compact ? "h-10 rounded-xl px-3 text-xs" : ""}`} onClick={() => handleRestore(template)}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    恢复
                  </Button>
                  <Button variant="outline" className={`${panelSurfaceButton} ${compact ? "h-10 rounded-xl px-3 text-xs" : ""}`} onClick={() => handleDuplicate(template.id)}>
                    <Copy className="mr-2 h-4 w-4" />
                    复制
                  </Button>
                  <Button
                    variant="outline"
                    className={`${panelSurfaceButton} ${compact ? "h-10 rounded-xl px-3 text-xs" : ""}`}
                    onClick={() => handleToggleBaseline(template.id)}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {isBaseline ? "取消基准" : "设为基准"}
                  </Button>
                  <Button
                    variant="outline"
                    className={`${panelDangerButton} ${compact ? "h-10 rounded-xl px-3 text-xs" : ""}`}
                    onClick={() => setPendingDelete(template)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    删除
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {pendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-delete-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-background p-6 shadow-2xl">
            <h3 id="template-delete-title" className="text-lg font-semibold text-slate-950 dark:text-white">
              删除模板
            </h3>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              确认删除模板「{pendingDelete.name}」吗？删除后本地保存的数据将同步移除，且无法通过模板库恢复。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                className={panelSurfaceButton}
                onClick={() => setPendingDelete(null)}
              >
                取消
              </Button>
              <Button
                className={`${panelDangerButton} px-5`}
                onClick={confirmDelete}
              >
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
