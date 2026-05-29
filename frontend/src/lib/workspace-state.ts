import { normalizeBeamWorkspaceState } from "./beam-workspace-normalizer.ts";
import { normalizeFrameWorkspaceState } from "./frame-workspace-normalizer.ts";
import { normalizeTrussWorkspaceState } from "./truss-workspace-normalizer.ts";
import { createDefaultWorkspaceState } from "./workspace-defaults.ts";
import type { WorkspaceState } from "./workspace-defaults.ts";

export {
  DEFAULT_BEAM_SPAN,
  DEFAULT_FRAME_MODE,
  cloneBeamWorkspaceState,
  cloneFrameWorkspaceState,
  cloneTrussWorkspaceState,
  cloneWorkspaceState,
  createDefaultBeamSupports,
  createDefaultBeamWorkspaceState,
  createDefaultFrameWorkspaceState,
  createDefaultTrussWorkspaceState,
  createDefaultWorkspaceState,
} from "./workspace-defaults.ts";
export { normalizeBeamWorkspaceState } from "./beam-workspace-normalizer.ts";
export { createPortalFrameModelFromState, normalizeFrameWorkspaceState } from "./frame-workspace-normalizer.ts";
export { normalizeTrussWorkspaceState } from "./truss-workspace-normalizer.ts";
export type { WorkspaceState } from "./workspace-defaults.ts";

export function normalizeWorkspaceState(value: Partial<WorkspaceState> | null | undefined): WorkspaceState {
  if (!value) {
    return createDefaultWorkspaceState();
  }

  return {
    analysisMode: value.analysisMode === "frame" ? "frame" : value.analysisMode === "truss" ? "truss" : "beam",
    beam: normalizeBeamWorkspaceState(value.beam),
    frame: normalizeFrameWorkspaceState(value.frame),
    truss: normalizeTrussWorkspaceState(value.truss),
  };
}
