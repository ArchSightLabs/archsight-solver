import { FrameCustomModelEditor } from "./FrameCustomModelEditor";
import { createDefaultFrameWorkspaceState } from "../lib/workspace-state.ts";
import type { FrameWorkspaceState } from "../types/structure.ts";
import type { FrameWorkbenchSelection, WorkbenchSelectionOptions } from "../types/workbench-selection.ts";

interface FrameFormProps {
  value: FrameWorkspaceState;
  onChange: (next: FrameWorkspaceState) => void;
  activeSectionId?: string;
  selection?: FrameWorkbenchSelection | null;
  onSelectionChange?: (next: FrameWorkbenchSelection, options?: WorkbenchSelectionOptions) => void;
}

const DEFAULT_SECTION_ID = "frame-typical-cases";
const FRAME_SECTION_IDS = [
  "frame-typical-cases",
  "frame-custom-overview",
  "frame-object-navigator",
  "frame-text-model",
  "frame-advanced-tables",
];

export function FrameForm({ value, onChange, activeSectionId, selection, onSelectionChange }: FrameFormProps) {
  const requestedSectionId = activeSectionId ?? "";
  const visibleSectionId = FRAME_SECTION_IDS.includes(requestedSectionId)
    ? requestedSectionId
    : DEFAULT_SECTION_ID;
  const commitCollections = (next: {
    nodes: FrameWorkspaceState["customNodes"];
    members: FrameWorkspaceState["customMembers"];
    loads: FrameWorkspaceState["customLoads"];
    loadCases: FrameWorkspaceState["customLoadCases"];
    loadCombinations: FrameWorkspaceState["customLoadCombinations"];
  }) => {
    onChange({
      ...value,
      frameMode: "custom",
      customNodes: next.nodes,
      customMembers: next.members,
      customLoads: next.loads,
      customLoadCases: next.loadCases,
      customLoadCombinations: next.loadCombinations,
    });
  };

  const resetToDefaultFrame = () => {
    const defaults = createDefaultFrameWorkspaceState();
    onChange({
      ...value,
      frameMode: "custom",
      customNodes: defaults.customNodes,
      customMembers: defaults.customMembers,
      customLoads: defaults.customLoads,
      customLoadCases: defaults.customLoadCases,
      customLoadCombinations: defaults.customLoadCombinations,
    });
  };

  return (
    <FrameCustomModelEditor
      value={{
        nodes: value.customNodes,
        members: value.customMembers,
        loads: value.customLoads,
        loadCases: value.customLoadCases,
        loadCombinations: value.customLoadCombinations,
      }}
      onChange={commitCollections}
      onResetToPortal={resetToDefaultFrame}
      selection={selection}
      onSelectionChange={onSelectionChange}
      activeSectionId={visibleSectionId}
    />
  );
}
