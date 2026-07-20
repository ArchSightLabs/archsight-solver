import { useCallback, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { WorkbenchView } from "../lib/solver-project.ts";
import type { AnalysisMode } from "../types/structure.ts";
import type { WorkbenchSelection, WorkbenchSelectionOptions } from "../types/workbench-selection.ts";
import {
  filterSelectionSetForMode,
  primarySelectionForMode,
  replaceSelectionSetForMode,
  toggleWorkbenchSelection,
  uniqueWorkbenchSelections,
} from "../lib/workbench-selection-utils.ts";
import { moduleSectionId, moduleSectionsForMode, objectNavigatorSectionId } from "../lib/workbench-navigation.ts";
import type { ModelDiagnosticIssue } from "../lib/model-diagnostics.ts";

interface WorkbenchSelectionState {
  primary: WorkbenchSelection | null;
  items: WorkbenchSelection[];
}

interface AnalysisObjectPageState {
  moduleSectionId?: string;
  resultTabId?: string;
  workbenchView?: WorkbenchView;
}

interface UseWorkbenchPageSelectionFlowOptions {
  activeAnalysisObjectId: string;
  analysisMode: AnalysisMode;
  activeObjectPageState: AnalysisObjectPageState;
  fallbackActiveModuleSectionId?: string;
  setPageStateByObjectId: Dispatch<SetStateAction<Record<string, AnalysisObjectPageState>>>;
  setWorkbenchSelectionState: Dispatch<SetStateAction<WorkbenchSelectionState>>;
  setWorkbenchView: (next: SetStateAction<WorkbenchView>) => void;
  workbenchSelectionState: WorkbenchSelectionState;
}

interface UseWorkbenchPageSelectionFlowResult {
  activeGeometrySelection: WorkbenchSelection | null;
  activeGeometrySelectionSet: WorkbenchSelection[];
  activeModuleSectionId: string;
  activeWorkbenchSelection: WorkbenchSelection | null;
  activeWorkbenchSelectionSet: WorkbenchSelection[];
  handleModelDiagnosticNavigate: (diagnostic: ModelDiagnosticIssue) => void;
  handleWorkbenchSelectionChange: (next: WorkbenchSelection, options?: WorkbenchSelectionOptions) => void;
  handleWorkbenchSelectionSetChange: (next: WorkbenchSelection[], options?: WorkbenchSelectionOptions) => void;
  moduleSections: ReturnType<typeof moduleSectionsForMode>;
  setActiveModuleSection: (sectionId: string) => void;
  setActiveResultTab: (tabId: string) => void;
}

export function useWorkbenchPageSelectionFlow({
  activeAnalysisObjectId,
  analysisMode,
  activeObjectPageState,
  fallbackActiveModuleSectionId,
  setPageStateByObjectId,
  setWorkbenchSelectionState,
  setWorkbenchView,
  workbenchSelectionState,
}: UseWorkbenchPageSelectionFlowOptions): UseWorkbenchPageSelectionFlowResult {
  const moduleSections = useMemo(() => moduleSectionsForMode(analysisMode), [analysisMode]);
  const activeModuleSectionId = useMemo(() => {
    const selected = activeObjectPageState.moduleSectionId ?? fallbackActiveModuleSectionId;
    const normalized = selected
      && moduleSections.some((item) => item.id === selected)
      ? selected
      : moduleSections[0]?.id ?? "";
    return normalized;
  }, [activeObjectPageState.moduleSectionId, fallbackActiveModuleSectionId, moduleSections]);

  const setActiveModuleSection = useCallback((sectionId: string) => {
    setPageStateByObjectId((current) => ({
      ...current,
      [activeAnalysisObjectId]: {
        ...current[activeAnalysisObjectId],
        moduleSectionId: sectionId,
      },
    }));
  }, [activeAnalysisObjectId, setPageStateByObjectId]);

  const setActiveResultTab = useCallback((tabId: string) => {
    setPageStateByObjectId((current) => ({
      ...current,
      [activeAnalysisObjectId]: {
        ...current[activeAnalysisObjectId],
        resultTabId: tabId,
      },
    }));
  }, [activeAnalysisObjectId, setPageStateByObjectId]);

  const handleModelDiagnosticNavigate = useCallback((diagnostic: ModelDiagnosticIssue) => {
    if (!diagnostic.action) return;
    setWorkbenchView("model");
    setActiveModuleSection(moduleSectionId(analysisMode, diagnostic.action.targetSection));

    const target = diagnostic.objectRefs?.[0];
    if (!target) return;
    const isBeamTarget = analysisMode === "beam" && (target.kind === "span" || target.kind === "support" || target.kind === "node");
    const isStructureTarget = analysisMode !== "beam" && (target.kind === "node" || target.kind === "member");
    if (!isBeamTarget && !isStructureTarget) return;
    setWorkbenchSelectionState({
      primary: { mode: analysisMode, type: target.kind, id: target.id } as WorkbenchSelection,
      items: [{ mode: analysisMode, type: target.kind, id: target.id } as WorkbenchSelection],
    });
  }, [analysisMode, setActiveModuleSection, setWorkbenchSelectionState, setWorkbenchView]);

  const handleWorkbenchSelectionChange = useCallback((next: WorkbenchSelection, options?: WorkbenchSelectionOptions) => {
    setWorkbenchSelectionState((current) => {
      const scoped = filterSelectionSetForMode(current.items, next.mode);
      const nextForMode = options?.additive ? toggleWorkbenchSelection(scoped, next) : [next];
      return {
        primary: nextForMode.at(-1) ?? null,
        items: replaceSelectionSetForMode(current.items, next.mode, nextForMode),
      };
    });
    if (options?.openEditor === false) {
      return;
    }
    const selectedEditorId = objectNavigatorSectionId(next.mode);
    if (moduleSections.some((section) => section.id === selectedEditorId)) {
      setActiveModuleSection(selectedEditorId);
    }
  }, [moduleSections, setActiveModuleSection, setWorkbenchSelectionState]);

  const handleWorkbenchSelectionSetChange = useCallback((next: WorkbenchSelection[], options?: WorkbenchSelectionOptions) => {
    const scoped = uniqueWorkbenchSelections(next.filter((selection) => selection.mode === analysisMode));
    setWorkbenchSelectionState((current) => ({
      primary: scoped.at(-1) ?? null,
      items: replaceSelectionSetForMode(current.items, analysisMode, scoped),
    }));
    if (options?.openEditor === false || scoped.length === 0) {
      return;
    }
    const selectedEditorId = objectNavigatorSectionId(analysisMode);
    if (moduleSections.some((section) => section.id === selectedEditorId)) {
      setActiveModuleSection(selectedEditorId);
    }
  }, [analysisMode, moduleSections, setActiveModuleSection, setWorkbenchSelectionState]);

  const activeWorkbenchSelectionSet = useMemo(
    () => filterSelectionSetForMode(workbenchSelectionState.items, analysisMode),
    [analysisMode, workbenchSelectionState.items],
  );
  const activeWorkbenchSelection = primarySelectionForMode(workbenchSelectionState.primary, workbenchSelectionState.items, analysisMode);
  const activeGeometrySelectionSet = useMemo(
    () => activeWorkbenchSelectionSet.filter((selection) => selection.type !== "label"),
    [activeWorkbenchSelectionSet],
  );
  const activeGeometrySelection = activeWorkbenchSelection?.type === "label" ? null : activeWorkbenchSelection;

  return {
    activeGeometrySelection,
    activeGeometrySelectionSet,
    activeModuleSectionId,
    activeWorkbenchSelection,
    activeWorkbenchSelectionSet,
    handleModelDiagnosticNavigate,
    handleWorkbenchSelectionChange,
    handleWorkbenchSelectionSetChange,
    moduleSections,
    setActiveModuleSection,
    setActiveResultTab,
  };
}
