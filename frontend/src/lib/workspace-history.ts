import { cloneWorkspaceState, type WorkspaceState } from "./workspace-state.ts";

export interface WorkspaceHistoryState {
  past: WorkspaceState[];
  future: WorkspaceState[];
}

export interface WorkspaceHistoryResult {
  workspace: WorkspaceState;
  history: WorkspaceHistoryState;
}

export const DEFAULT_WORKSPACE_HISTORY_LIMIT = 50;

export function createEmptyWorkspaceHistory(): WorkspaceHistoryState {
  return { past: [], future: [] };
}

export function workspaceStatesEqual(left: WorkspaceState, right: WorkspaceState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function pushWorkspaceHistory(
  history: WorkspaceHistoryState,
  previousWorkspace: WorkspaceState,
  nextWorkspace: WorkspaceState,
  limit = DEFAULT_WORKSPACE_HISTORY_LIMIT
): WorkspaceHistoryState {
  if (workspaceStatesEqual(previousWorkspace, nextWorkspace)) {
    return history;
  }
  const nextPast = [...history.past, cloneWorkspaceState(previousWorkspace)].slice(-limit);
  return { past: nextPast, future: [] };
}

export function undoWorkspaceHistory(
  history: WorkspaceHistoryState,
  currentWorkspace: WorkspaceState,
  limit = DEFAULT_WORKSPACE_HISTORY_LIMIT
): WorkspaceHistoryResult | null {
  const previousWorkspace = history.past.at(-1);
  if (!previousWorkspace) {
    return null;
  }
  return {
    workspace: cloneWorkspaceState(previousWorkspace),
    history: {
      past: history.past.slice(0, -1),
      future: [cloneWorkspaceState(currentWorkspace), ...history.future].slice(0, limit),
    },
  };
}

export function redoWorkspaceHistory(
  history: WorkspaceHistoryState,
  currentWorkspace: WorkspaceState,
  limit = DEFAULT_WORKSPACE_HISTORY_LIMIT
): WorkspaceHistoryResult | null {
  const nextWorkspace = history.future[0];
  if (!nextWorkspace) {
    return null;
  }
  return {
    workspace: cloneWorkspaceState(nextWorkspace),
    history: {
      past: [...history.past, cloneWorkspaceState(currentWorkspace)].slice(-limit),
      future: history.future.slice(1),
    },
  };
}
