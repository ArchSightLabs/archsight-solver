export type BeamWorkbenchSelection =
  | { mode: "beam"; type: "span"; id: string }
  | { mode: "beam"; type: "support"; id: string }
  | { mode: "beam"; type: "load"; id: "primary" };

export type FrameWorkbenchSelection =
  | { mode: "frame"; type: "node"; id: string }
  | { mode: "frame"; type: "member"; id: string }
  | { mode: "frame"; type: "load"; id: string }
  | { mode: "frame"; type: "loadCases"; id: "all" }
  | { mode: "frame"; type: "loadCombinations"; id: "all" };

export type TrussWorkbenchSelection =
  | { mode: "truss"; type: "node"; id: string }
  | { mode: "truss"; type: "member"; id: string }
  | { mode: "truss"; type: "load"; id: string };

export type WorkbenchSelection = BeamWorkbenchSelection | FrameWorkbenchSelection | TrussWorkbenchSelection;

export interface WorkbenchSelectionOptions {
  additive?: boolean;
  openEditor?: boolean;
}
