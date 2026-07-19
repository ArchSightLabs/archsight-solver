import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { SystemSettingsPanel } from "./SystemSettingsPanel";
import { NewAnalysisObjectDialog, type NewAnalysisObjectStartMode } from "./NewAnalysisObjectDialog";
import { ProjectInfoDialog } from "./ProjectInfoDialog";
import { PublicExamplesDialog } from "./PublicExamplesDialog";
import { BenchmarkSubmissionDialog } from "./BenchmarkSubmissionDialog";
import { TemplateLibraryPanel } from "./TemplateLibraryPanel";
import { analysisVocabulary } from "../lib/analysis-vocabulary";
import { buildProjectContractSummary } from "../lib/project-health";
import { createWorkspaceSnapshot } from "../lib/template-library";
import { useDialogs } from "../contexts/DialogContext";
import type { SolverProject, ProjectInfo, AnalysisObjectType } from "../lib/solver-project";
import type { WorkspaceState } from "../lib/workspace-state";
import type { ModelPreviewStyle } from "../types/beam";
import type { BenchmarkSubmissionCategory } from "../lib/benchmark-submission-package";
import type { ProjectTemplate, TemplateSnapshot, Material } from "../types/beam";
import type { AnalysisMode } from "../types/structure";
import type { TemplateActionResult } from "../lib/template-library";

interface GlobalDialogsProps {
  hostManagedProject?: boolean;
  isCompactWorkbench: boolean;
  isProjectReadOnly: boolean;
  project: SolverProject;
  visitStats: { pageViews: string; uniqueVisitors: string };
  setModelPreviewStyle: (style: ModelPreviewStyle) => void;

  objectCountByType: Record<AnalysisObjectType, number>;
  handleCreateAnalysisObject: (type: AnalysisObjectType, name: string, startMode: NewAnalysisObjectStartMode) => void;

  setCustomMaterials: (materials: Material[]) => void;
  handleUpdateProjectInfo: (info: ProjectInfo) => void;
  handleCreateProjectWithInfo: (info: ProjectInfo) => void;

  handleOpenPublicExampleProject: (project: SolverProject, title: string) => void;

  benchmarkSubmissionContext: {
    category: BenchmarkSubmissionCategory;
    payload: unknown;
    calculationResult: unknown;
    objectName: string;
    disabledReason: string | null;
  };
  isSolving: boolean;
  handleRunCurrentModule: () => void;

  analysisMode: AnalysisMode;
  templates: ProjectTemplate[];
  baselineTemplateId: string | null;
  isAtCapacity: boolean;
  saveTemplate: (name: string, snapshot: TemplateSnapshot) => TemplateActionResult<ProjectTemplate>;
  workspace: WorkspaceState;
  handleRestoreTemplate: (template: ProjectTemplate) => TemplateActionResult<void>;
  duplicateTemplate: (templateId: string) => TemplateActionResult<ProjectTemplate>;
  deleteTemplate: (id: string) => TemplateActionResult<void>;
  setBaselineTemplate: (id: string | null) => TemplateActionResult<void>;

  RELEASE_NOTES_HREF: string;
  USER_MANUAL_HREF: string;
}

export function GlobalDialogs({
  hostManagedProject = false, isCompactWorkbench, isProjectReadOnly, project, visitStats, setModelPreviewStyle,
  objectCountByType, handleCreateAnalysisObject,
  setCustomMaterials, handleUpdateProjectInfo, handleCreateProjectWithInfo,
  handleOpenPublicExampleProject,
  benchmarkSubmissionContext, isSolving, handleRunCurrentModule,
  analysisMode, templates, baselineTemplateId, isAtCapacity, saveTemplate, workspace, handleRestoreTemplate, duplicateTemplate, deleteTemplate, setBaselineTemplate,
  RELEASE_NOTES_HREF, USER_MANUAL_HREF
}: GlobalDialogsProps) {
  const {
    isSystemSettingsOpen, setIsSystemSettingsOpen, isSystemSettingsDocked,
    isNewAnalysisObjectDialogOpen, setIsNewAnalysisObjectDialogOpen,
    projectInfoDialogMode, setProjectInfoDialogMode,
    isPublicExamplesOpen, setIsPublicExamplesOpen,
    isBenchmarkSubmissionOpen, setIsBenchmarkSubmissionOpen,
    isTemplateLibraryOpen, setIsTemplateLibraryOpen
  } = useDialogs();

  return (
    <>
      {!hostManagedProject && isSystemSettingsOpen && !isSystemSettingsDocked && (
        <SystemSettingsPanel
          compact={isCompactWorkbench}
          releaseNotesHref={RELEASE_NOTES_HREF}
          userManualHref={USER_MANUAL_HREF}
          modelPreviewStyle={project.settings.modelPreviewStyle}
          visitStats={visitStats}
          onModelPreviewStyleChange={setModelPreviewStyle}
          onOpenTemplateLibrary={() => setIsTemplateLibraryOpen(true)}
          onClose={() => setIsSystemSettingsOpen(false)}
        />
      )}

      {isNewAnalysisObjectDialogOpen && !isProjectReadOnly && (
        <NewAnalysisObjectDialog
          existingCountByType={objectCountByType}
          onCreate={handleCreateAnalysisObject}
          onClose={() => setIsNewAnalysisObjectDialogOpen(false)}
        />
      )}

      {!hostManagedProject && projectInfoDialogMode && !isProjectReadOnly && (
        <ProjectInfoDialog
          initialValue={projectInfoDialogMode === "edit" ? project.settings.projectInfo : null}
          title={projectInfoDialogMode === "edit" ? "工程设置" : "新建结构分析项目"}
          confirmLabel={projectInfoDialogMode === "edit" ? "保存工程设置" : "创建项目"}
          customMaterials={projectInfoDialogMode === "edit" ? project.settings.customMaterials : undefined}
          projectContractSummary={projectInfoDialogMode === "edit" ? buildProjectContractSummary(project) : undefined}
          onSubmit={projectInfoDialogMode === "edit" ? handleUpdateProjectInfo : handleCreateProjectWithInfo}
          onCustomMaterialsChange={projectInfoDialogMode === "edit" ? setCustomMaterials : undefined}
          onClose={() => setProjectInfoDialogMode(null)}
        />
      )}

      {!hostManagedProject && isPublicExamplesOpen && !isProjectReadOnly && (
        <PublicExamplesDialog
          onClose={() => setIsPublicExamplesOpen(false)}
          onOpenProject={handleOpenPublicExampleProject}
        />
      )}

      {!hostManagedProject && isBenchmarkSubmissionOpen && (
        <BenchmarkSubmissionDialog
          category={benchmarkSubmissionContext.category}
          payload={benchmarkSubmissionContext.payload}
          calculationResult={benchmarkSubmissionContext.calculationResult}
          objectName={benchmarkSubmissionContext.objectName}
          disabledReason={benchmarkSubmissionContext.disabledReason}
          isCalculating={isSolving}
          onRunCalculation={handleRunCurrentModule}
          onClose={() => setIsBenchmarkSubmissionOpen(false)}
        />
      )}

      {!hostManagedProject && !isProjectReadOnly && isTemplateLibraryOpen && typeof document !== "undefined" ? createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-library-dialog-title"
          onClick={() => setIsTemplateLibraryOpen(false)}
        >
          <div
            className="flex max-h-[92vh] min-h-0 w-full max-w-[64rem] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3.5 dark:border-white/10 sm:px-5">
              <div>
                <div className="text-xs font-bold text-muted-foreground">
                  {analysisVocabulary(analysisMode).systemLabel}工作区快照
                </div>
                <h3 id="template-library-dialog-title" className="text-lg font-black tracking-tight">
                  模板库
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTemplateLibraryOpen(false)}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="关闭模板库"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className={`flex-1 overflow-y-auto custom-scrollbar ${isCompactWorkbench ? "p-3" : "p-5"}`}>
              <TemplateLibraryPanel
                templates={templates}
                baselineTemplateId={baselineTemplateId}
                currentMode={analysisMode}
                isAtCapacity={isAtCapacity}
                compact={isCompactWorkbench}
                onSaveTemplate={(name) => saveTemplate(name, createWorkspaceSnapshot(workspace))}
                onSaveComplete={() => setIsTemplateLibraryOpen(false)}
                onRestoreTemplate={handleRestoreTemplate}
                onDuplicateTemplate={duplicateTemplate}
                onDeleteTemplate={deleteTemplate}
                onSetBaselineTemplate={setBaselineTemplate}
              />
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}
