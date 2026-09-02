import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import {
  BookOpenCheck,
  ChevronDown,
  FileDown,
  FileJson,
  FilePlus,
  FileUp,
  FolderKanban,
  History,
  Moon,
  Save,
  Settings,
  Share2,
  Sun,
} from "lucide-react";
import { useDialogs } from "../contexts/DialogContext";
import type { HostPortalAction } from "../lib/host-bridge";
import { Button } from "./ui/button";

interface EmbeddedHostHeaderProps {
  appVersion: string;
  portalActions: readonly HostPortalAction[];
  isDark: boolean;
  isProjectDirty: boolean;
  isProjectReadOnly: boolean;
  isHostSavePending: boolean;
  onRequestPortalAction: (action: HostPortalAction) => boolean;
  releaseNotesHref: string;
  setIsDark: Dispatch<SetStateAction<boolean>>;
}

const FILE_ACTIONS: Array<{ action: HostPortalAction; label: string; icon: typeof FilePlus }> = [
  { action: "new", label: "新建", icon: FilePlus },
  { action: "open", label: "打开", icon: FileUp },
  { action: "saveAs", label: "另存为", icon: FileDown },
];

const PROJECT_ACTIONS: Array<{ action: HostPortalAction; label: string; icon: typeof FolderKanban }> = [
  { action: "project", label: "工程", icon: FolderKanban },
  { action: "versions", label: "历史", icon: History },
  { action: "share", label: "分享", icon: Share2 },
];

const controlClassName = "h-9 gap-1.5 rounded-lg px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white";

export function EmbeddedHostHeader({
  appVersion,
  portalActions,
  isDark,
  isProjectDirty,
  isProjectReadOnly,
  isHostSavePending,
  onRequestPortalAction,
  releaseNotesHref,
  setIsDark,
}: EmbeddedHostHeaderProps) {
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const { setIsBenchmarkSubmissionOpen, setIsPublicExamplesOpen, setIsSystemSettingsOpen } = useDialogs();
  const fileActions = FILE_ACTIONS.filter(({ action }) => portalActions.includes(action));
  const projectActions = PROJECT_ACTIONS.filter(({ action }) => portalActions.includes(action));

  const requestFileAction = (action: HostPortalAction) => {
    setIsFileMenuOpen(false);
    onRequestPortalAction(action);
  };

  return (
    <header className="relative z-30 border-b border-slate-200 bg-white/95 text-slate-950 shadow-[0_8px_28px_rgba(15,23,42,0.09)] backdrop-blur-xl transition-colors dark:border-white/10 dark:bg-slate-950/96 dark:text-slate-100 dark:shadow-[0_8px_28px_rgba(2,6,23,0.28)]">
      <div className="flex min-h-16 w-full items-center justify-between gap-4 overflow-visible px-4 py-2 sm:px-5">
        <div className="flex min-w-max items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-lg font-extrabold tracking-tight sm:text-xl">ArchSight 结构力学求解器</h1>
              <a
                href={releaseNotesHref}
                target="_blank"
                rel="noreferrer"
                title="查看版本发布记录"
                className="rounded-full border border-sky-400/35 bg-sky-400/10 px-2 py-0.5 font-mono text-[10px] font-black text-sky-700 transition-colors hover:border-sky-400/60 hover:bg-sky-400/20 dark:text-sky-200"
              >
                v{appVersion}
              </a>
            </div>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">云端工程工作台</p>
          </div>
        </div>

        <nav aria-label="云端工程操作" className="flex min-w-max items-center gap-1.5">
          {fileActions.length > 0 ? (
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsFileMenuOpen((current) => !current)}
                aria-haspopup="menu"
                aria-expanded={isFileMenuOpen}
                aria-label="云端文件菜单"
                className={controlClassName}
              >
                文件 <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              {isFileMenuOpen ? (
                <div role="menu" className="absolute right-0 top-[calc(100%+0.45rem)] z-50 w-40 rounded-lg border border-slate-300 bg-white p-1.5 text-slate-950 shadow-2xl shadow-slate-950/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50">
                  {fileActions.map(({ action, label, icon: Icon }) => (
                    <button
                      key={action}
                      type="button"
                      role="menuitem"
                      disabled={isProjectReadOnly && action !== "open"}
                      onClick={() => requestFileAction(action)}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-black transition-colors hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-900"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {portalActions.includes("save") ? (
            <Button
              size="sm"
              disabled={isProjectReadOnly || !isProjectDirty || isHostSavePending}
              onClick={() => onRequestPortalAction("save")}
              title={isProjectReadOnly ? "外部宿主只读模式下不能保存工程" : !isProjectDirty ? "云端工程已保存" : isHostSavePending ? "云端工程正在保存" : "保存当前云端工程"}
              className="h-9 gap-1.5 rounded-lg bg-sky-500 px-3 text-xs font-black text-slate-950 hover:bg-sky-400 disabled:bg-sky-500/30 disabled:text-slate-700"
            >
              <Save className="h-3.5 w-3.5" />
              {isHostSavePending ? "正在保存" : isProjectDirty ? "保存" : "已保存"}
            </Button>
          ) : null}
          {projectActions.map(({ action, label, icon: Icon }) => (
            <Button
              key={action}
              variant="ghost"
              size="sm"
              onClick={() => onRequestPortalAction(action)}
              className={controlClassName}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Button>
          ))}
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-slate-200 dark:bg-white/15" />
          <Button
            variant="ghost"
            size="sm"
            disabled={isProjectReadOnly}
            onClick={() => setIsPublicExamplesOpen(true)}
            title={isProjectReadOnly ? "外部宿主只读模式下不能载入公开案例" : "在当前云端工作台载入公开案例"}
            className={controlClassName}
          >
            <BookOpenCheck className="h-3.5 w-3.5" />
            公开案例
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsBenchmarkSubmissionOpen(true)}
            className={controlClassName}
          >
            <FileJson className="h-3.5 w-3.5" />
            验证投稿
          </Button>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-slate-200 dark:bg-white/15" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDark((current) => !current)}
            aria-label={isDark ? "切换到浅色主题" : "切换到深色主题"}
            title={isDark ? "切换到浅色主题" : "切换到深色主题"}
            className={controlClassName}
          >
            {isDark ? <Sun className="h-3.5 w-3.5 text-amber-500 dark:text-amber-300" /> : <Moon className="h-3.5 w-3.5 text-sky-600 dark:text-sky-300" />}
            {isDark ? "浅色" : "深色"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSystemSettingsOpen(true)}
            className={controlClassName}
          >
            <Settings className="h-3.5 w-3.5" />
            系统设置
          </Button>
        </nav>
      </div>
    </header>
  );
}
