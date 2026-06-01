import { useRef, useState } from "react";
import { Building2, Library, X } from "lucide-react";
import type { ProjectInfo } from "../lib/solver-project";
import { normalizeProjectInfo } from "../lib/solver-project";
import type { Material } from "../types/material";
import { ProjectInfoPanel } from "./ProjectInfoPanel";
import { ProjectMaterialPanel, type ProjectMaterialPanelHandle } from "./ProjectMaterialPanel";
import { Button } from "./ui/button";

type ProjectSettingsTab = "info" | "materials";

interface ProjectInfoDialogProps {
  initialValue?: Partial<ProjectInfo> | null;
  initialTab?: ProjectSettingsTab;
  title: string;
  confirmLabel: string;
  customMaterials?: Material[];
  onSubmit: (next: ProjectInfo) => void;
  onCustomMaterialsChange?: (materials: Material[]) => void;
  onClose: () => void;
}

const PROJECT_SETTINGS_TABS: Array<{ id: ProjectSettingsTab; label: string; icon: typeof Building2 }> = [
  { id: "info", label: "工程信息", icon: Building2 },
  { id: "materials", label: "工程材料", icon: Library },
];

export function ProjectInfoDialog({
  initialValue,
  initialTab = "info",
  title,
  confirmLabel,
  customMaterials,
  onSubmit,
  onCustomMaterialsChange,
  onClose,
}: ProjectInfoDialogProps) {
  const showMaterialTab = Boolean(customMaterials && onCustomMaterialsChange);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>(() => normalizeProjectInfo(initialValue));
  const [activeTab, setActiveTab] = useState<ProjectSettingsTab>(() => showMaterialTab && initialTab === "materials" ? "materials" : "info");
  const materialPanelRef = useRef<ProjectMaterialPanelHandle | null>(null);

  const handleSubmit = () => {
    if (showMaterialTab && materialPanelRef.current && !materialPanelRef.current.confirmPendingDraft()) {
      setActiveTab("materials");
      return;
    }
    onSubmit(normalizeProjectInfo(projectInfo));
  };

  const visibleTabs = showMaterialTab ? PROJECT_SETTINGS_TABS : PROJECT_SETTINGS_TABS.slice(0, 1);

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-info-dialog-title"
      onClick={onClose}
    >
      <div
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950 ${showMaterialTab ? "max-w-[72rem]" : "max-w-3xl"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3.5 dark:border-white/10 sm:px-5">
          <div>
            <h3 id="project-info-dialog-title" className="text-lg font-black tracking-tight">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="关闭工程设置"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {showMaterialTab ? (
          <div className="border-b border-slate-200 px-4 py-3 dark:border-white/10 sm:px-5">
            <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2" role="tablist" aria-label="工程设置分组">
              {visibleTabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-black transition-colors ${
                      active
                        ? "border-sky-400 bg-sky-400 text-slate-950 shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.08]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar sm:p-5">
          {showMaterialTab && customMaterials && onCustomMaterialsChange ? (
            <>
              <div className={activeTab === "info" ? "" : "hidden"} aria-hidden={activeTab !== "info"}>
                <ProjectInfoPanel value={projectInfo} onChange={setProjectInfo} />
              </div>
              <div className={activeTab === "materials" ? "" : "hidden"} aria-hidden={activeTab !== "materials"}>
                <ProjectMaterialPanel ref={materialPanelRef} customMaterials={customMaterials} onCustomMaterialsChange={onCustomMaterialsChange} />
              </div>
            </>
          ) : (
            <ProjectInfoPanel value={projectInfo} onChange={setProjectInfo} />
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-white/10 sm:px-5">
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
