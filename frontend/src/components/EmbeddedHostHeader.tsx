import type { Dispatch, SetStateAction } from "react";
import {
  BookOpenCheck,
  FileJson,
  FolderKanban,
  History,
  Moon,
  Settings,
  Share2,
  Sun,
} from "lucide-react";
import { useDialogs } from "../contexts/DialogContext";
import type { HostPortalAction } from "../lib/host-bridge";
import { Button } from "./ui/button";

interface EmbeddedHostHeaderProps {
  appVersion: string;
  standaloneExamplesHref: string;
  portalActions: readonly HostPortalAction[];
  isDark: boolean;
  isProjectDirty: boolean;
  isProjectReadOnly: boolean;
  isHostSavePending: boolean;
  onRequestPortalAction: (action: HostPortalAction) => boolean;
  releaseNotesHref: string;
  setIsDark: Dispatch<SetStateAction<boolean>>;
}

const HOST_ACTIONS: Array<{ action: HostPortalAction; label: string; icon: typeof FolderKanban }> = [
  { action: "project", label: "工程", icon: FolderKanban },
  { action: "versions", label: "版本", icon: History },
  { action: "share", label: "分享", icon: Share2 },
];

export function EmbeddedHostHeader({
  appVersion,
  standaloneExamplesHref,
  portalActions,
  isDark,
  isProjectDirty,
  isProjectReadOnly,
  isHostSavePending,
  onRequestPortalAction,
  releaseNotesHref,
  setIsDark,
}: EmbeddedHostHeaderProps) {
  const { setIsBenchmarkSubmissionOpen, setIsSystemSettingsOpen } = useDialogs();

  return (
    <header className="relative z-30 border-b border-white/10 bg-slate-950/92 text-slate-100 shadow-[0_8px_28px_rgba(2,6,23,0.28)] backdrop-blur-xl dark:bg-slate-950/96">
      <div className="flex min-h-16 w-full items-center justify-between gap-4 overflow-x-auto px-4 py-2 sm:px-5">
        <div className="flex min-w-max items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-lg font-extrabold tracking-tight sm:text-xl">ArchSight 结构力学求解器</h1>
              <a
                href={releaseNotesHref}
                target="_blank"
                rel="noreferrer"
                title="查看版本发布记录"
                className="rounded-full border border-sky-400/35 bg-sky-400/10 px-2 py-0.5 font-mono text-[10px] font-black text-sky-200 transition-colors hover:border-sky-300 hover:bg-sky-400/20"
              >
                v{appVersion}
              </a>
            </div>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">云端工程工作台</p>
          </div>
        </div>

        <nav aria-label="云端工程操作" className="flex min-w-max items-center gap-1.5">
          {HOST_ACTIONS.map(({ action, label, icon: Icon }) => {
            if (!portalActions.includes(action)) return null;
            return (
              <Button
                key={action}
                variant="ghost"
                size="sm"
                onClick={() => onRequestPortalAction(action)}
                className="h-9 gap-1.5 rounded-lg px-2.5 text-xs font-bold text-slate-200 hover:bg-white/10 hover:text-white"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Button>
            );
          })}
          {portalActions.length > 0 ? <span aria-hidden="true" className="mx-1 h-5 w-px bg-white/15" /> : null}
          {portalActions.includes("save") ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={isProjectReadOnly || !isProjectDirty || isHostSavePending}
              onClick={() => onRequestPortalAction("save")}
              title={isProjectReadOnly ? "外部宿主只读模式下不能保存工程" : !isProjectDirty ? "云端工程已保存" : isHostSavePending ? "云端工程正在保存" : "保存当前云端工程"}
              className="h-9 gap-1.5 rounded-lg px-2.5 text-xs font-bold text-sky-200 hover:bg-sky-400/15 hover:text-sky-100"
            >
              {isHostSavePending ? "正在保存" : isProjectDirty ? "保存云端工程" : "云端工程已保存"}
            </Button>
          ) : null}
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-white/15" />
          <a
            href={standaloneExamplesHref}
            target="_blank"
            rel="noreferrer"
            title="在独立 Solver 中浏览并使用公开案例"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            <BookOpenCheck className="h-3.5 w-3.5" />
            公开案例
          </a>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsBenchmarkSubmissionOpen(true)}
            className="h-9 gap-1.5 rounded-lg px-2.5 text-xs font-bold text-slate-200 hover:bg-white/10 hover:text-white"
          >
            <FileJson className="h-3.5 w-3.5" />
            验证投稿
          </Button>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-white/15" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDark((current) => !current)}
            aria-label={isDark ? "切换到浅色主题" : "切换到深色主题"}
            title={isDark ? "切换到浅色主题" : "切换到深色主题"}
            className="h-9 gap-1.5 rounded-lg px-2.5 text-xs font-bold text-slate-200 hover:bg-white/10 hover:text-white"
          >
            {isDark ? <Sun className="h-3.5 w-3.5 text-amber-300" /> : <Moon className="h-3.5 w-3.5 text-sky-300" />}
            {isDark ? "浅色" : "深色"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSystemSettingsOpen(true)}
            className="h-9 gap-1.5 rounded-lg px-2.5 text-xs font-bold text-slate-200 hover:bg-white/10 hover:text-white"
          >
            <Settings className="h-3.5 w-3.5" />
            系统设置
          </Button>
        </nav>
      </div>
    </header>
  );
}
