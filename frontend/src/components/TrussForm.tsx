import { TrussCustomModelEditor } from "./TrussCustomModelEditor";
import { createDefaultTrussWorkspaceState } from "../lib/workspace-state.ts";
import { normalizeModuleSectionId } from "../lib/workbench-navigation.ts";
import type { TrussWorkspaceState } from "../types/structure.ts";
import type { TrussWorkbenchSelection, WorkbenchSelectionOptions } from "../types/workbench-selection.ts";

interface TrussFormProps {
  value: TrussWorkspaceState;
  onChange: (next: TrussWorkspaceState) => void;
  activeSectionId?: string;
  selection?: TrussWorkbenchSelection | null;
  onSelectionChange?: (next: TrussWorkbenchSelection, options?: WorkbenchSelectionOptions) => void;
}

const DEFAULT_SECTION_ID = "truss-template";

export function TrussForm({ value, onChange, activeSectionId, selection, onSelectionChange }: TrussFormProps) {
  const visibleSectionId = normalizeModuleSectionId("truss", activeSectionId) ?? DEFAULT_SECTION_ID;
  return (
    <TrussCustomModelEditor
      value={{
        nodes: value.customNodes,
        members: value.customMembers,
        loads: value.customLoads,
      }}
      onChange={(next) =>
        onChange({
          ...value,
          customNodes: next.nodes,
          customMembers: next.members,
          customLoads: next.loads,
        })
      }
      onResetToBenchmark={() => onChange(createDefaultTrussWorkspaceState())}
      selection={selection}
      onSelectionChange={onSelectionChange}
      activeSectionId={visibleSectionId}
    />
  );
}
