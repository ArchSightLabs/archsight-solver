import { type ReactNode, useId, useState } from "react";
import { BarChart3, BookOpen, ChevronDown, ClipboardList, ExternalLink, Github, Info, Library, Palette, Settings, X } from "lucide-react";
import { Button } from "./ui/button";
import type { ModelPreviewStyle } from "../types/beam";
import { APP_VERSION, BUSUANZI_VISIT_STATS_ENABLED, GITHUB_REPOSITORY_URL } from "../lib/app-metadata";
import { selectableMaterialPresets } from "../lib/material-presets";
import { PREDEFINED_MATERIALS } from "../types/material";

interface VisitStats {
  pageViews: string;
  uniqueVisitors: string;
}

interface SystemSettingsPanelProps {
  compact: boolean;
  docked?: boolean;
  releaseNotesHref: string;
  userManualHref: string;
  modelPreviewStyle: ModelPreviewStyle;
  visitStats: VisitStats;
  onModelPreviewStyleChange: (style: ModelPreviewStyle) => void;
  onOpenTemplateLibrary: () => void;
  onClose: () => void;
}

const MODEL_PREVIEW_STYLE_OPTIONS: Array<{ label: string; value: ModelPreviewStyle; description: string }> = [
  { label: "彩色高亮", value: "color", description: "梁系、框架和桁架建模图使用蓝色结构对象与橙色荷载" },
  { label: "工程简图", value: "simple", description: "梁系、框架和桁架建模图使用低饱和黑白表达" },
];
const MATERIAL_LIBRARY_ITEMS = selectableMaterialPresets(PREDEFINED_MATERIALS);
const STATUS_LINE_CLASS = "rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-[11px] font-semibold leading-5 text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300";

function settingButtonClass(compact: boolean) {
  return `flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-left text-slate-950 shadow-sm transition-colors hover:border-sky-300/70 hover:bg-sky-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:hover:border-sky-400/45 dark:hover:bg-sky-400/10 ${compact ? "text-xs" : "text-sm"}`;
}

function iconBoxClass() {
  return "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

function materialCategoryLabel(category: string | undefined) {
  if (category === "steel") return "钢材";
  if (category === "concrete") return "混凝土";
  return "材料";
}

function CollapsibleSettingsSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const panelId = useId();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="rounded-lg border border-slate-200/80 bg-white p-1.5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm font-black tracking-tight text-slate-950 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen ? (
        <div id={panelId} className="space-y-3 px-1.5 pb-2 pt-2">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function VisitStatsBlock({ stats, visible }: { stats: VisitStats; visible: boolean }) {
  const [statsVisible, setStatsVisible] = useState(visible);

  return (
    <div className="rounded-lg border border-slate-200/80 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-black">
          <BarChart3 className="h-4 w-4 text-sky-500" />
          访问统计
        </div>
        {BUSUANZI_VISIT_STATS_ENABLED ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setStatsVisible((current) => !current)}
            className="h-7 rounded-lg border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700 hover:border-sky-300 hover:bg-sky-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:hover:bg-sky-400/10"
          >
            {statsVisible ? "隐藏" : "查看"}
          </Button>
        ) : null}
      </div>
      {BUSUANZI_VISIT_STATS_ENABLED ? (
        statsVisible ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.035]">
                <div className="text-[10px] font-bold text-muted-foreground">总访问量</div>
                <div className="mt-1 text-lg font-black text-foreground">{stats.pageViews || "加载中"}</div>
              </div>
              <div className="rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.035]">
                <div className="text-[10px] font-bold text-muted-foreground">访客数</div>
                <div className="mt-1 text-lg font-black text-foreground">{stats.uniqueVisitors || "加载中"}</div>
              </div>
            </div>
            <div className={STATUS_LINE_CLASS}>
              已启用 PV/UV 统计。
            </div>
          </div>
        ) : (
          <div className={STATUS_LINE_CLASS}>
            已启用，默认隐藏。
          </div>
        )
      ) : (
        <div className={STATUS_LINE_CLASS}>
          未启用。
        </div>
      )}
    </div>
  );
}

export function SystemSettingsPanel({
  compact,
  docked = false,
  releaseNotesHref,
  userManualHref,
  modelPreviewStyle,
  visitStats,
  onModelPreviewStyleChange,
  onOpenTemplateLibrary,
  onClose,
}: SystemSettingsPanelProps) {
  const panel = (
    <div
      className={`flex w-full flex-col bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100 ${
        docked
          ? "h-[calc(100vh-7rem)] rounded-lg border border-slate-200 shadow-lg dark:border-white/10"
          : "relative ml-auto h-[100dvh] max-w-[24rem] border-l border-slate-200 shadow-2xl sm:max-w-[26rem] dark:border-white/10"
      }`}
      onClick={(event) => event.stopPropagation()}
    >
        <div className={`sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-950 ${compact ? "px-4 py-3" : "px-4 py-3.5"}`}>
          <div className="flex min-w-0 items-center gap-3">
            <span className={iconBoxClass()}>
              <Settings className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="eyebrow opacity-50">ArchSight Solver</div>
              <h2 className="truncate text-lg font-bold tracking-tight">系统设置</h2>
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={onClose}
            aria-label="关闭系统设置"
            className="h-10 w-10 rounded-lg border-slate-200 bg-white text-slate-900 shadow-sm hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:hover:bg-white/[0.08]"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className={`flex-1 space-y-4 overflow-y-auto custom-scrollbar ${compact ? "p-3" : "p-4"}`}>
          <CollapsibleSettingsSection title="显示偏好" icon={<Palette className="h-4 w-4 text-sky-500" />}>
            <div className="space-y-3 rounded-lg border border-slate-200/80 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-black">结构建模图</div>
                <span className="rounded-full border border-sky-200 bg-white px-2.5 py-1 text-[10px] font-bold text-sky-700 shadow-sm dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200">
                  {modelPreviewStyle === "simple" ? "简图" : "彩色"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200/80 bg-slate-100/80 p-1 dark:border-white/10 dark:bg-slate-900/60">
                {MODEL_PREVIEW_STYLE_OPTIONS.map((option) => {
                  const active = modelPreviewStyle === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onModelPreviewStyleChange(option.value)}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        active
                          ? "border-sky-300 bg-sky-400 text-slate-950 shadow-[0_10px_24px_rgba(56,189,248,0.22)] hover:bg-sky-300 focus-visible:ring-sky-300/70 dark:border-sky-300/70 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300"
                          : "border-slate-200 bg-white text-slate-700 shadow-sm hover:border-sky-300/70 hover:bg-sky-50 hover:text-slate-950 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200 dark:hover:border-sky-400/45 dark:hover:bg-sky-400/10 dark:hover:text-white"
                      }`}
                    >
                      <span className="block text-xs font-black">{option.label}</span>
                      <span className="sr-only">{option.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </CollapsibleSettingsSection>

          <CollapsibleSettingsSection title="材料库" icon={<Library className="h-4 w-4 text-sky-500" />}>
            <div className="space-y-2">
              {MATERIAL_LIBRARY_ITEMS.map((material) => (
                <div
                  key={material.id}
                  className="rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.035]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-black text-foreground">
                        {material.id.toUpperCase()} · {material.name}
                      </div>
                      <div className="mt-1 font-mono text-[11px] font-semibold text-muted-foreground">
                        E={material.youngModulus} GPa · ρ={material.density} kg/m³
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
                      {materialCategoryLabel(material.category)}
                    </span>
                  </div>
                </div>
              ))}
              <div className={STATUS_LINE_CLASS}>
                自定义材料后续作为用户材料库扩展；当前仅支持在对象或表格页手动输入 E。
              </div>
            </div>
          </CollapsibleSettingsSection>

          <CollapsibleSettingsSection title="资源与模板" icon={<BookOpen className="h-4 w-4 text-sky-500" />}>
            <div className="grid gap-2">
              <a className={settingButtonClass(compact)} href={GITHUB_REPOSITORY_URL} target="_blank" rel="noreferrer">
                <span className="flex min-w-0 items-center gap-3">
                  <span className={iconBoxClass()}>
                    <Github className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">GitHub 仓库</span>
                  </span>
                </span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
              </a>
              <a className={settingButtonClass(compact)} href={releaseNotesHref} target="_blank" rel="noreferrer">
                <span className="flex min-w-0 items-center gap-3">
                  <span className={iconBoxClass()}>
                    <ClipboardList className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">版本发布记录</span>
                  </span>
                </span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
              </a>
              <a className={settingButtonClass(compact)} href={userManualHref} target="_blank" rel="noreferrer">
                <span className="flex min-w-0 items-center gap-3">
                  <span className={iconBoxClass()}>
                    <BookOpen className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">操作说明书</span>
                  </span>
                </span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
              </a>
              <button
                type="button"
                className={settingButtonClass(compact)}
                onClick={() => {
                  onClose();
                  onOpenTemplateLibrary();
                }}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className={iconBoxClass()}>
                    <Library className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">模板库</span>
                  </span>
                </span>
              </button>
            </div>
          </CollapsibleSettingsSection>

          <CollapsibleSettingsSection title="关于" icon={<Info className="h-4 w-4 text-sky-500" />}>
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200/80 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-black">ArchSight Solver</div>
                  <a
                    className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 font-mono text-[11px] font-black text-sky-700 transition-colors hover:border-sky-400/60 hover:bg-sky-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70 dark:text-sky-200"
                    href={releaseNotesHref}
                    target="_blank"
                    rel="noreferrer"
                    title="查看版本发布记录"
                  >
                    v{APP_VERSION}
                  </a>
                </div>
              </div>
              <VisitStatsBlock stats={visitStats} visible={false} />
            </div>
          </CollapsibleSettingsSection>
        </div>
    </div>
  );

  if (docked) {
    return (
      <aside className="relative min-w-0 xl:sticky xl:top-24" aria-label="系统设置">
        {panel}
      </aside>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40"
      role="dialog"
      aria-modal="true"
      aria-label="系统设置"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]"
        aria-label="关闭系统设置"
        onClick={onClose}
      />
      {panel}
    </div>
  );
}
