import { useState } from "react";
import { X } from "lucide-react";
import type { ProjectInfo } from "../lib/solver-project";
import { normalizeProjectInfo } from "../lib/solver-project";
import { ProjectInfoPanel } from "./ProjectInfoPanel";
import { Button } from "./ui/button";

interface ProjectInfoDialogProps {
  initialValue?: Partial<ProjectInfo> | null;
  title: string;
  confirmLabel: string;
  onSubmit: (next: ProjectInfo) => void;
  onClose: () => void;
}

export function ProjectInfoDialog({ initialValue, title, confirmLabel, onSubmit, onClose }: ProjectInfoDialogProps) {
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>(() => normalizeProjectInfo(initialValue));

  const handleSubmit = () => {
    onSubmit(normalizeProjectInfo(projectInfo));
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-info-dialog-title"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-950 sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 id="project-info-dialog-title" className="text-lg font-black tracking-tight">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="关闭工程信息设置"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ProjectInfoPanel value={projectInfo} onChange={setProjectInfo} />
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-lg border-white/10 bg-white/[0.03] font-bold">
            取消
          </Button>
          <Button type="button" onClick={handleSubmit} className="rounded-lg font-bold">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
