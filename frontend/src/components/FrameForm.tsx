import { FrameCustomModelEditor } from "./FrameCustomModelEditor";
import { normalizeModuleSectionId } from "../lib/workbench-navigation.ts";
import type { FrameWorkspaceState } from "../types/structure.ts";
import type { FrameWorkbenchSelection, WorkbenchSelectionOptions } from "../types/workbench-selection.ts";

interface FrameFormProps {
  value: FrameWorkspaceState;
  onChange: (next: FrameWorkspaceState) => void;
  activeSectionId?: string;
  selection?: FrameWorkbenchSelection | null;
  onSelectionChange?: (next: FrameWorkbenchSelection, options?: WorkbenchSelectionOptions) => void;
}

const DEFAULT_SECTION_ID = "frame-template";

export function FrameForm({ value, onChange, activeSectionId, selection, onSelectionChange }: FrameFormProps) {
  const visibleSectionId = normalizeModuleSectionId("frame", activeSectionId) ?? DEFAULT_SECTION_ID;
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

  return (
    <FrameCustomModelEditor
      value={{
        nodes: value.customNodes,
        members: value.customMembers,
        loads: value.customLoads,
        loadCases: value.customLoadCases,
        loadCombinations: value.customLoadCombinations,
      }}
      materialId={value.materialId}
      onMaterialChange={(nextMaterialId) => onChange({ ...value, materialId: nextMaterialId })}
      onChange={commitCollections}
      selection={selection}
      onSelectionChange={onSelectionChange}
      activeSectionId={visibleSectionId}
    />
  );
}
