import { TrussCustomModelEditor } from "./TrussCustomModelEditor";
import { normalizeModuleSectionId } from "../lib/workbench-navigation.ts";
import type { Material } from "../types/material.ts";
import type { TrussWorkspaceState } from "../types/structure.ts";
import type { TrussWorkbenchSelection, WorkbenchSelectionOptions } from "../types/workbench-selection.ts";

interface TrussFormProps {
  value: TrussWorkspaceState;
  materialLibrary: Material[];
  onChange: (next: TrussWorkspaceState) => void;
  activeSectionId?: string;
  selection?: TrussWorkbenchSelection | null;
  onSelectionChange?: (next: TrussWorkbenchSelection, options?: WorkbenchSelectionOptions) => void;
  gridSnapEnabled?: boolean;
  gridSnapStepM?: number;
  compact?: boolean;
}

const DEFAULT_SECTION_ID = "truss-template";

export function TrussForm({
  value,
  materialLibrary,
  onChange,
  activeSectionId,
  selection,
  onSelectionChange,
  gridSnapEnabled = false,
  gridSnapStepM = 0.5,
  compact = false
}: TrussFormProps) {
  const visibleSectionId = normalizeModuleSectionId("truss", activeSectionId) ?? DEFAULT_SECTION_ID;
  return (
    <TrussCustomModelEditor
      value={{
        nodes: value.customNodes,
        members: value.customMembers,
        loads: value.customLoads,
        loadCases: value.customLoadCases,
        loadCombinations: value.customLoadCombinations,
      }}
      materialId={value.materialId}
      materialLibrary={materialLibrary}
      onMaterialChange={(nextMaterialId) => onChange({ ...value, materialId: nextMaterialId })}
      onChange={(next) =>
        onChange({
          ...value,
          customNodes: next.nodes,
          customMembers: next.members,
          customLoads: next.loads,
          customLoadCases: next.loadCases,
          customLoadCombinations: next.loadCombinations,
        })
      }
      selection={selection}
      onSelectionChange={onSelectionChange}
      activeSectionId={visibleSectionId}
      gridSnapEnabled={gridSnapEnabled}
      gridSnapStepM={gridSnapStepM}
      compact={compact}
    />
  );
}
