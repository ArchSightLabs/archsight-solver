import { useCallback, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Material } from "../types/material.ts";
import type { AnalysisMode } from "../types/structure.ts";
import type { WorkbenchSelection, WorkbenchSelectionOptions } from "../types/workbench-selection.ts";
import type { CanvasPoint } from "../lib/model-canvas-projection.ts";
import {
  isZeroModelLabelOffset,
  modelLabelOffsetCount,
  modelLabelOffsetsForMode,
  normalizeModelLabelOffset,
  type ModelLabelOffset,
} from "../lib/model-label-overrides.ts";
import { normalizeGridSnapStep } from "../lib/node-coordinate-snap.ts";
import {
  applyModelGeometryAction,
  canDeleteModelSelections,
  deleteModelSelections,
  modelGeometryToolbarState,
  moveModelCanvasNode,
  type ModelGeometryAction,
} from "../lib/model-workflow-actions.ts";
import type { WorkspaceState } from "../lib/workspace-state.ts";
import type { WorkbenchModelCanvasController } from "../components/WorkbenchModelCanvas.tsx";

interface UseWorkbenchModelCanvasControllerOptions {
  activeSelection: WorkbenchSelection | null;
  activeSelectionSet: WorkbenchSelection[];
  activeGeometrySelection: WorkbenchSelection | null;
  activeGeometrySelectionSet: WorkbenchSelection[];
  analysisMode: AnalysisMode;
  canRedoWorkspace: boolean;
  canUndoWorkspace: boolean;
  gridSnapEnabled: boolean;
  gridSnapStepM: number;
  projectMaterialLibrary: Material[];
  setGridSnapEnabled: Dispatch<SetStateAction<boolean>>;
  setGridSnapStepM: (stepM: number) => void;
  onSelect: (next: WorkbenchSelection, options?: WorkbenchSelectionOptions) => void;
  onSelectionSetChange: (next: WorkbenchSelection[], options?: WorkbenchSelectionOptions) => void;
  updateWorkspace: (updater: WorkspaceState | ((current: WorkspaceState) => WorkspaceState)) => void;
  undoWorkspaceChange: () => void;
  redoWorkspaceChange: () => void;
  workspace: WorkspaceState;
}

export function useWorkbenchModelCanvasController({
  activeSelection,
  activeSelectionSet,
  activeGeometrySelection,
  activeGeometrySelectionSet,
  analysisMode,
  canRedoWorkspace,
  canUndoWorkspace,
  gridSnapEnabled,
  gridSnapStepM,
  projectMaterialLibrary,
  setGridSnapEnabled,
  setGridSnapStepM,
  onSelect,
  onSelectionSetChange,
  updateWorkspace,
  undoWorkspaceChange,
  redoWorkspaceChange,
  workspace,
}: UseWorkbenchModelCanvasControllerOptions): WorkbenchModelCanvasController {
  const activeModelLabelOffsets = modelLabelOffsetsForMode(workspace, analysisMode);
  const activeModelLabelOffsetCount = modelLabelOffsetCount(activeModelLabelOffsets);
  const canResetSelectedLabel = activeSelection?.type === "label" && Boolean(activeModelLabelOffsets?.[activeSelection.id]);
  const modelGeometryToolbar = useMemo(
    () => activeSelection?.type === "label"
      ? null
      : modelGeometryToolbarState(workspace, activeGeometrySelection, activeGeometrySelectionSet),
    [activeGeometrySelection, activeGeometrySelectionSet, activeSelection, workspace],
  );
  const canDeleteSelection = useMemo(
    () => canDeleteModelSelections(workspace, activeGeometrySelectionSet),
    [activeGeometrySelectionSet, workspace],
  );

  const updateModelLabelOffsets = useCallback((
    mode: "beam" | "frame" | "truss",
    updater: (current: Record<string, ModelLabelOffset>) => Record<string, ModelLabelOffset>,
  ) => {
    updateWorkspace((current) => {
      const currentOffsets = { ...(modelLabelOffsetsForMode(current, mode) ?? {}) };
      const nextOffsets = updater(currentOffsets);
      const normalizedOffsets = Object.fromEntries(
        Object.entries(nextOffsets)
          .map(([labelId, offset]) => [labelId, normalizeModelLabelOffset(offset)] as const)
          .filter((entry): entry is [string, ModelLabelOffset] => Boolean(entry[1]) && !isZeroModelLabelOffset(entry[1])),
      );
      const modelLabelOffsets = Object.keys(normalizedOffsets).length ? normalizedOffsets : undefined;
      if (mode === "beam") {
        return { ...current, beam: { ...current.beam, modelLabelOffsets } };
      }
      if (mode === "frame") {
        return { ...current, frame: { ...current.frame, modelLabelOffsets } };
      }
      return { ...current, truss: { ...current.truss, modelLabelOffsets } };
    });
  }, [updateWorkspace]);

  const handleMoveWorkbenchLabel = useCallback((mode: "beam" | "frame" | "truss", labelId: string, offset: ModelLabelOffset) => {
    updateModelLabelOffsets(mode, (current) => ({
      ...current,
      [labelId]: offset,
    }));
  }, [updateModelLabelOffsets]);

  const handleResetSelectedModelLabel = useCallback(() => {
    if (!activeSelection || activeSelection.type !== "label") return;
    updateModelLabelOffsets(activeSelection.mode, (current) => {
      const next = { ...current };
      delete next[activeSelection.id];
      return next;
    });
  }, [activeSelection, updateModelLabelOffsets]);

  const handleResetAllModelLabels = useCallback(() => {
    updateModelLabelOffsets(analysisMode, () => ({}));
  }, [analysisMode, updateModelLabelOffsets]);

  const handleGridSnapStepChange = useCallback((stepM: number) => {
    setGridSnapStepM(normalizeGridSnapStep(stepM));
  }, [setGridSnapStepM]);

  const handleModelGeometryAction = useCallback((action: ModelGeometryAction) => {
    const result = applyModelGeometryAction({
      workspace,
      selection: activeGeometrySelection,
      selectionSet: activeGeometrySelectionSet,
      action,
      materialLibrary: projectMaterialLibrary,
    });
    if (!result) return;
    updateWorkspace(result.workspace);
    if (result.selection) {
      onSelect(result.selection, { openEditor: false });
    }
  }, [activeGeometrySelection, activeGeometrySelectionSet, onSelect, projectMaterialLibrary, updateWorkspace, workspace]);

  const handleDeleteWorkbenchSelection = useCallback(() => {
    const result = deleteModelSelections({
      workspace,
      selections: activeGeometrySelectionSet,
    });
    if (!result) return;
    updateWorkspace(result.workspace);
    onSelectionSetChange([], { openEditor: false });
  }, [activeGeometrySelectionSet, onSelectionSetChange, updateWorkspace, workspace]);

  const handleMoveWorkbenchNode = useCallback((mode: AnalysisMode, nodeId: string, point: CanvasPoint) => {
    const result = moveModelCanvasNode({
      workspace,
      mode,
      nodeId,
      point,
    });
    if (!result) return;
    updateWorkspace(result.workspace);
    if (result.selection) {
      onSelect(result.selection, { openEditor: false });
    }
  }, [onSelect, updateWorkspace, workspace]);

  return {
    selection: activeSelection,
    selectionSet: activeSelectionSet,
    canDeleteSelection,
    canRedoWorkspace,
    canUndoWorkspace,
    geometryToolbar: modelGeometryToolbar,
    gridSnapEnabled,
    gridSnapStepM,
    labelOffsetCount: activeModelLabelOffsetCount,
    canResetSelectedLabel,
    onDeleteSelection: handleDeleteWorkbenchSelection,
    onGeometryAction: handleModelGeometryAction,
    onGridSnapEnabledChange: setGridSnapEnabled,
    onGridSnapStepChange: handleGridSnapStepChange,
    onMoveLabel: handleMoveWorkbenchLabel,
    onMoveNode: handleMoveWorkbenchNode,
    onRedoWorkspace: redoWorkspaceChange,
    onResetAllLabels: handleResetAllModelLabels,
    onResetSelectedLabel: handleResetSelectedModelLabel,
    onSelect,
    onSelectionSetChange,
    onUndoWorkspace: undoWorkspaceChange,
  };
}
