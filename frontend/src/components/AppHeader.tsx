import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  BookOpenCheck,
  FileDown,
  FileJson,
  FilePlus,
  FileUp,
  MoreHorizontal,
  Moon,
  Save,
  Settings,
  Sun,
} from "lucide-react";
import { Button } from "./ui/button";
import { useDialogs } from "../contexts/DialogContext";

interface AppHeaderProps {
  appVersion: string;
  fileDisplayName: string;
  fileMenuRef: RefObject<HTMLDivElement | null>;
  fileStateLabel: string;
  fileStatusMessage: string | null;
  isCompactWorkbench: boolean;
  isDark: boolean;
  isFileMenuOpen: boolean;
  isProjectDirty: boolean;
  releaseNotesHref: string;
  onNewProjectFile: () => void;
  onOpenProjectFile: () => void;
  onSaveProjectFile: (forceSaveAs?: boolean) => void;
  setIsDark: Dispatch<SetStateAction<boolean>>;
  setIsFileMenuOpen: Dispatch<SetStateAction<boolean>>;
}

export function AppHeader({
  appVersion,
  fileDisplayName,
  fileMenuRef,
  fileStateLabel,
  fileStatusMessage,
  isCompactWorkbench,
  isDark,
  isFileMenuOpen,
  isProjectDirty,
  releaseNotesHref,
  onNewProjectFile,
  onOpenProjectFile,
  onSaveProjectFile,
  setIsDark,
  setIsFileMenuOpen,
}: AppHeaderProps) {
  const { setIsSystemSettingsOpen, setIsPublicExamplesOpen, setIsBenchmarkSubmissionOpen } = useDialogs();

  return (
    <header className="sticky top-0 z-30 border-b border-white/8 bg-background/85 backdrop-blur-2xl">
      <div className="mx-auto max-w-[118rem] px-4 py-2.5 sm:px-6 sm:py-3">
        <div className={`grid xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center ${isCompactWorkbench ? "gap-3" : "gap-4"}`}>
          <div>
            <div className="flex flex-wrap items-end">
              <h1 className={`font-heading font-extrabold leading-tight tracking-tight ${isCompactWorkbench ? "text-[1.25rem]" : "text-lg sm:text-xl md:text-2xl"}`}>
                ArchSight 结构力学求解器
              </h1>
              <a
                className="ml-2 mb-1 rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 font-mono text-[11px] font-black text-sky-700 transition-colors hover:border-sky-400/60 hover:bg-sky-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70 dark:text-sky-200"
                href={releaseNotesHref}
                target="_blank"
                rel="noreferrer"
                title="查看版本发布记录"
              >
                v{appVersion}
              </a>
            </div>
            <div
              className="mt-2 flex max-w-full flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground"
              title={fileDisplayName}
            >
              <span className="max-w-[18rem] truncate rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1">
                {fileDisplayName}
              </span>
              <span className={`rounded-lg border px-2.5 py-1 ${isProjectDirty ? "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300" : "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"}`}>
                {fileStateLabel}
              </span>
              {fileStatusMessage ? <span className="truncate opacity-75">{fileStatusMessage}</span> : null}
            </div>
          </div>

          <div className={`flex flex-wrap items-center justify-start xl:justify-end ${isCompactWorkbench ? "gap-2" : "gap-3"}`}>
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.035] p-1 shadow-sm shadow-black/5 dark:bg-white/[0.025]">
              <Button
                variant="ghost"
                onClick={onNewProjectFile}
                className={`rounded-lg font-bold text-foreground hover:bg-primary/10 ${isCompactWorkbench ? "h-9 px-3 text-xs" : "h-10 px-3.5"}`}
              >
                <FilePlus className={`mr-2 ${isCompactWorkbench ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
                新建
              </Button>
              <Button
                variant="ghost"
                onClick={onOpenProjectFile}
                className={`rounded-lg font-bold text-foreground hover:bg-primary/10 ${isCompactWorkbench ? "h-9 px-3 text-xs" : "h-10 px-3.5"}`}
              >
                <FileUp className={`mr-2 ${isCompactWorkbench ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
                打开
              </Button>
              <Button
                variant="ghost"
                onClick={() => onSaveProjectFile(false)}
                className={`rounded-lg font-bold text-foreground hover:bg-primary/10 ${isCompactWorkbench ? "h-9 px-3 text-xs" : "h-10 px-3.5"}`}
              >
                <Save className={`mr-2 ${isCompactWorkbench ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
                保存
              </Button>
              <Button
                variant="ghost"
                onClick={() => setIsPublicExamplesOpen(true)}
                className={`rounded-lg font-bold text-foreground hover:bg-primary/10 ${isCompactWorkbench ? "h-9 px-3 text-xs" : "h-10 px-3.5"}`}
              >
                <BookOpenCheck className={`mr-2 ${isCompactWorkbench ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
                公开案例
              </Button>
              <Button
                variant="ghost"
                onClick={() => setIsBenchmarkSubmissionOpen(true)}
                className={`rounded-lg font-bold text-foreground hover:bg-primary/10 ${isCompactWorkbench ? "h-9 px-3 text-xs" : "h-10 px-3.5"}`}
              >
                <FileJson className={`mr-2 ${isCompactWorkbench ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
                验证投稿
              </Button>
              <div ref={fileMenuRef} className="relative">
                <Button
                  variant="ghost"
                  onClick={() => setIsFileMenuOpen((current) => !current)}
                  aria-haspopup="menu"
                  aria-expanded={isFileMenuOpen}
                  aria-label="更多文件操作"
                  title="更多文件操作"
                  className={`rounded-lg font-bold text-foreground hover:bg-primary/10 ${isCompactWorkbench ? "h-9 px-2.5" : "h-10 px-3"}`}
                >
                  <MoreHorizontal className={isCompactWorkbench ? "h-4 w-4" : "h-5 w-5"} />
                  <span className="sr-only">更多文件操作</span>
                </Button>
                {isFileMenuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%+0.45rem)] z-50 w-52 rounded-lg border border-slate-300 bg-white p-1.5 text-slate-950 shadow-2xl shadow-slate-950/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsFileMenuOpen(false);
                        onSaveProjectFile(true);
                      }}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:hover:bg-slate-900"
                    >
                      <FileDown className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300" />
                      <span className="min-w-0">
                        <span className="block text-sm font-black">保存副本</span>
                        <span className="block truncate text-[11px] font-bold text-slate-500 dark:text-slate-400">另存为项目文件</span>
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setIsDark((current) => !current)}
              aria-label={isDark ? "切换到浅色主题" : "切换到深色主题"}
              title={isDark ? "切换到浅色主题" : "切换到深色主题"}
              className={`rounded-lg border-white/10 bg-white/[0.03] font-bold text-foreground hover:bg-primary/5 ${isCompactWorkbench ? "h-10 px-3 text-xs" : "h-11 px-4"}`}
            >
              {isDark ? (
                <Sun className={`mr-2 text-amber-400 ${isCompactWorkbench ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
              ) : (
                <Moon className={`mr-2 text-blue-600 ${isCompactWorkbench ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
              )}
              {isDark ? "浅色" : "深色"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsSystemSettingsOpen(true)}
              className={`rounded-lg border-white/10 bg-white/[0.03] font-bold text-foreground hover:bg-primary/5 ${isCompactWorkbench ? "h-10 px-3 text-xs" : "h-11 px-4"}`}
            >
              <Settings className={`mr-2 ${isCompactWorkbench ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
              系统设置
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
