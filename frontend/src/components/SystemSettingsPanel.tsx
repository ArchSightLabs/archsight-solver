import { BarChart3, BookOpen, ClipboardList, ExternalLink, Github, Info, Library, Palette, Settings, X } from "lucide-react";
import { Button } from "./ui/button";
import type { BeamPreviewStyle } from "../types/beam";
import { APP_VERSION, BUSUANZI_VISIT_STATS_ENABLED, GITHUB_REPOSITORY_URL } from "../lib/app-metadata";

interface SystemSettingsPanelProps {
  compact: boolean;
  releaseNotesHref: string;
  userManualHref: string;
  beamPreviewStyle: BeamPreviewStyle;
  onBeamPreviewStyleChange: (style: BeamPreviewStyle) => void;
  onOpenTemplateLibrary: () => void;
  onClose: () => void;
}

const BEAM_PREVIEW_STYLE_OPTIONS: Array<{ label: string; value: BeamPreviewStyle; description: string }> = [
  { label: "彩色高亮", value: "color", description: "蓝色构件、橙色荷载，适合演示和选中辨识" },
  { label: "工程简图", value: "simple", description: "低饱和黑白表达，适合快速读图" },
];

function settingButtonClass(compact: boolean) {
  return `flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-white/70 px-3 py-3 text-left transition-colors hover:border-sky-300/70 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-900/55 dark:hover:border-sky-400/45 dark:hover:bg-sky-400/10 ${compact ? "text-xs" : "text-sm"}`;
}

function iconBoxClass() {
  return "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

function VisitStatsBlock() {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.04] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-black">
        <BarChart3 className="h-4 w-4 text-sky-500" />
        访问统计
      </div>
      {BUSUANZI_VISIT_STATS_ENABLED ? (
        <div className="text-[11px] font-semibold leading-5 text-muted-foreground">
          当前构建已启用不蒜子 PV/UV 统计，统计结果在页眉项目状态行展示；脚本加载失败不会影响本地建模、求解和导出。
        </div>
      ) : (
        <div className="text-[11px] font-semibold leading-5 text-muted-foreground">
          当前构建未启用第三方访问统计。公开部署需要统计 PV/UV 时，可设置 VITE_ENABLE_BUSUANZI=true。
        </div>
      )}
    </div>
  );
}

export function SystemSettingsPanel({
  compact,
  releaseNotesHref,
  userManualHref,
  beamPreviewStyle,
  onBeamPreviewStyleChange,
  onOpenTemplateLibrary,
  onClose,
}: SystemSettingsPanelProps) {
  return (
    <div
      className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="系统设置"
      onClick={onClose}
    >
      <div
        className={`ml-auto flex h-[100dvh] w-full flex-col bg-background/95 shadow-2xl ${
          compact ? "rounded-none border-0" : "max-w-[32rem] border-l border-white/10"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-background/95 backdrop-blur-md ${compact ? "px-4 py-3" : "px-5 py-4"}`}>
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
            className="h-10 w-10 rounded-lg border-white/10 bg-white/[0.03]"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className={`flex-1 space-y-4 overflow-y-auto custom-scrollbar ${compact ? "p-3" : "p-4"}`}>
          <section className="rounded-lg border border-white/10 bg-white/[0.03] p-3 sm:p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-black tracking-tight">
              <Palette className="h-4 w-4 text-sky-500" />
              显示偏好
            </h3>
            <div className="space-y-3 rounded-lg border border-white/8 bg-white/[0.04] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-black">连续梁建模图</div>
                  <div className="mt-1 text-[11px] font-medium text-muted-foreground">控制中间连续梁建模图的颜色风格。</div>
                </div>
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
                  {beamPreviewStyle === "simple" ? "简图" : "彩色"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {BEAM_PREVIEW_STYLE_OPTIONS.map((option) => {
                  const active = beamPreviewStyle === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onBeamPreviewStyleChange(option.value)}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        active
                          ? "border-transparent bg-sky-400 text-slate-950 shadow-[0_10px_24px_rgba(56,189,248,0.22)] hover:bg-sky-300 focus-visible:ring-sky-300/70 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300"
                          : "border-white/10 bg-white/[0.03] text-foreground/70 hover:border-sky-300/35 hover:bg-sky-400/10 hover:text-foreground dark:hover:bg-sky-400/10"
                      }`}
                    >
                      <span className="block text-xs font-black">{option.label}</span>
                      <span className="mt-1 block text-[10px] font-semibold leading-4 opacity-80">{option.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/[0.03] p-3 sm:p-4">
            <h3 className="mb-3 text-sm font-black tracking-tight">资源与模板</h3>
            <div className="grid gap-2">
              <a className={settingButtonClass(compact)} href={GITHUB_REPOSITORY_URL} target="_blank" rel="noreferrer">
                <span className="flex min-w-0 items-center gap-3">
                  <span className={iconBoxClass()}>
                    <Github className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">GitHub 开源仓库</span>
                    <span className="mt-0.5 block truncate text-[11px] font-semibold text-muted-foreground">
                      ArchSightLabs/archsight-solver
                    </span>
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
                    <span className="block truncate font-bold">更新说明</span>
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
          </section>

          <section className="rounded-lg border border-white/10 bg-white/[0.03] p-3 sm:p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-black tracking-tight">
              <Info className="h-4 w-4 text-sky-500" />
              关于
            </h3>
            <div className="space-y-3">
              <div className="rounded-lg border border-white/8 bg-white/[0.04] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-black">ArchSight 结构力学求解器</div>
                    <div className="mt-1 text-[11px] font-semibold text-muted-foreground">
                      面向梁系、平面框架、平面桁架线弹性静力分析的开源 Web 工作台。
                    </div>
                  </div>
                  <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 font-mono text-[11px] font-black text-sky-700 dark:text-sky-200">
                    v{APP_VERSION}
                  </span>
                </div>
              </div>
              <div className="rounded-lg border border-white/8 bg-white/[0.04] p-3 text-[11px] font-semibold leading-5 text-muted-foreground">
                ArchSightLabs 聚焦结构工程计算、工程图形表达与 AI 辅助工程工具链。该求解器用于教学演示、方案阶段复核和工程软件原型验证，不替代规范设计与注册工程师审查。
              </div>
              <VisitStatsBlock />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
