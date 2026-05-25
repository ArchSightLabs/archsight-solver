import { BookOpen, ClipboardList, ExternalLink, Library, Settings, X } from "lucide-react";
import { Button } from "./ui/button";

interface SystemSettingsPanelProps {
  compact: boolean;
  releaseNotesHref: string;
  userManualHref: string;
  onOpenTemplateLibrary: () => void;
  onClose: () => void;
}

function settingButtonClass(compact: boolean) {
  return `flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-white/70 px-3 py-3 text-left transition-colors hover:border-sky-300/70 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-900/55 dark:hover:border-sky-400/45 dark:hover:bg-sky-400/10 ${compact ? "text-xs" : "text-sm"}`;
}

function iconBoxClass() {
  return "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

export function SystemSettingsPanel({
  compact,
  releaseNotesHref,
  userManualHref,
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
            <h3 className="mb-3 text-sm font-black tracking-tight">资源与模板</h3>
            <div className="grid gap-2">
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
        </div>
      </div>
    </div>
  );
}
