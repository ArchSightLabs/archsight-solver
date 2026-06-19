import type { BeamWorkspaceState } from "../types/beam.ts";
import type {
  FrameLoad,
  FrameSupportType,
  StructureMember,
  StructureNode,
  TrussLoad,
  TrussMember,
  TrussNode,
  TrussSupportType,
} from "../types/structure.ts";
import { MAX_BEAM_SPANS } from "./solver-limits.ts";
import { mergeDefaultBeamSupportLayout } from "./workspace-state.ts";

export interface BeamQuickModelInput {
  spanCount: number;
  spanLengthM: number;
  uniformLoadKnPerM: number;
}

export interface BeamQuickModelOptions extends BeamQuickModelInput {
  materialId: string;
  youngModulusGPa: number;
  momentOfInertiaCm4: number;
}

export interface FrameQuickModelInput {
  bayCount: number;
  storyCount: number;
  bayWidthM: number;
  storyHeightM: number;
  beamLoadKnPerM: number;
  topLateralLoadKn: number;
}

export interface FrameQuickModelOptions extends FrameQuickModelInput {
  materialId: string;
  supportType?: FrameSupportType;
  columnAreaCm2: number;
  beamAreaCm2: number;
  columnMomentOfInertiaCm4: number;
  beamMomentOfInertiaCm4: number;
  youngModulusGPa: number;
}

export interface FrameQuickModelCollections {
  nodes: StructureNode[];
  members: StructureMember[];
  loads: FrameLoad[];
}

export interface TrussQuickModelInput {
  panelCount: number;
  panelLengthM: number;
  heightM: number;
  topNodeLoadKn: number;
}

export interface TrussQuickModelOptions extends TrussQuickModelInput {
  materialId: string;
  chordAreaCm2: number;
  webAreaCm2: number;
  youngModulusGPa: number;
}

export interface TrussQuickModelCollections {
  nodes: TrussNode[];
  members: TrussMember[];
  loads: TrussLoad[];
}

function boundedInteger(value: number, min: number, max: number): number {
  const rounded = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, rounded));
}

function boundedNumber(value: number, min: number, max: number, fallback: number): number {
  const normalized = Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, normalized));
}

function positiveMagnitude(value: number): number {
  return Math.max(0, Math.abs(Number.isFinite(value) ? value : 0));
}

export function buildContinuousBeamQuickModel(current: BeamWorkspaceState, options: BeamQuickModelOptions): BeamWorkspaceState {
  const spanCount = boundedInteger(options.spanCount, 1, MAX_BEAM_SPANS);
  const spanLengthM = boundedNumber(options.spanLengthM, 0.5, 60, 6);
  const uniformLoadKnPerM = positiveMagnitude(options.uniformLoadKnPerM);
  const beamType: BeamWorkspaceState["beamType"] = spanCount === 1 ? "simply_supported" : "continuous";
  const spans = Array.from({ length: spanCount }, (_, index) => ({
    id: `(${index + 1})`,
    length: spanLengthM,
    E: boundedNumber(options.youngModulusGPa, 1, 300, 210),
    I: boundedNumber(options.momentOfInertiaCm4, 1, 1_000_000, 8_000),
    materialId: options.materialId,
  }));

  return {
    ...current,
    projectName: spanCount === 1 ? "快速生成简支梁" : `快速生成${spanCount}跨连续梁`,
    materialId: options.materialId,
    beamType,
    loadType: uniformLoadKnPerM > 0 ? "uniform" : "none",
    uniformLoadEnabled: uniformLoadKnPerM > 0,
    linearLoadEnabled: false,
    linearLoads: [],
    pointLoads: [],
    q: uniformLoadKnPerM,
    uniformLoadStartRatio: 0,
    uniformLoadEndRatio: 1,
    spans,
    supports: mergeDefaultBeamSupportLayout(beamType, spans, []),
    customLoadCases: [],
    customLoadCombinations: [],
    modelLabelOffsets: undefined,
  };
}

export function buildRegularFrameQuickModel(options: FrameQuickModelOptions): FrameQuickModelCollections {
  const bayCount = boundedInteger(options.bayCount, 1, 5);
  const storyCount = boundedInteger(options.storyCount, 1, 4);
  const bayWidthM = boundedNumber(options.bayWidthM, 1, 30, 6);
  const storyHeightM = boundedNumber(options.storyHeightM, 1, 12, 3.6);
  const beamLoadKnPerM = positiveMagnitude(options.beamLoadKnPerM);
  const topLateralLoadKn = positiveMagnitude(options.topLateralLoadKn);
  const supportType = options.supportType ?? "fixed";
  const nodeId = (storyIndex: number, gridIndex: number) => `N${storyIndex * (bayCount + 1) + gridIndex + 1}`;
  const nodes: StructureNode[] = [];

  for (let storyIndex = 0; storyIndex <= storyCount; storyIndex += 1) {
    for (let gridIndex = 0; gridIndex <= bayCount; gridIndex += 1) {
      nodes.push({
        id: nodeId(storyIndex, gridIndex),
        x: gridIndex * bayWidthM,
        y: storyIndex * storyHeightM,
        supportType: storyIndex === 0 ? supportType : "free",
      });
    }
  }

  const members: StructureMember[] = [];
  let columnIndex = 1;
  for (let storyIndex = 0; storyIndex < storyCount; storyIndex += 1) {
    for (let gridIndex = 0; gridIndex <= bayCount; gridIndex += 1) {
      members.push({
        id: `C${columnIndex}`,
        start: nodeId(storyIndex, gridIndex),
        end: nodeId(storyIndex + 1, gridIndex),
        elementType: "frame",
        materialId: options.materialId,
        E_GPa: boundedNumber(options.youngModulusGPa, 1, 300, 210),
        A_cm2: boundedNumber(options.columnAreaCm2, 1, 10_000, 240),
        I_cm4: boundedNumber(options.columnMomentOfInertiaCm4, 1, 1_000_000, 12_000),
        kind: "column",
      });
      columnIndex += 1;
    }
  }

  let beamIndex = 1;
  for (let storyIndex = 1; storyIndex <= storyCount; storyIndex += 1) {
    for (let gridIndex = 0; gridIndex < bayCount; gridIndex += 1) {
      members.push({
        id: `B${beamIndex}`,
        start: nodeId(storyIndex, gridIndex),
        end: nodeId(storyIndex, gridIndex + 1),
        elementType: "frame",
        materialId: options.materialId,
        E_GPa: boundedNumber(options.youngModulusGPa, 1, 300, 210),
        A_cm2: boundedNumber(options.beamAreaCm2, 1, 10_000, 220),
        I_cm4: boundedNumber(options.beamMomentOfInertiaCm4, 1, 1_000_000, 15_000),
        kind: "beam",
      });
      beamIndex += 1;
    }
  }

  const loads: FrameLoad[] = [];
  if (beamLoadKnPerM > 0) {
    members
      .filter((member) => member.kind === "beam")
      .forEach((member) => {
        loads.push({
          type: "distributed",
          member: member.id,
          direction: "global_y",
          qStartKnPerM: -beamLoadKnPerM,
          qEndKnPerM: -beamLoadKnPerM,
        });
      });
  }
  if (topLateralLoadKn > 0) {
    loads.push({
      type: "nodal",
      node: nodeId(storyCount, bayCount),
      fxKn: topLateralLoadKn,
      fyKn: 0,
      mzKnM: 0,
    });
  }

  return { nodes, members, loads };
}

export function buildParallelChordTrussQuickModel(options: TrussQuickModelOptions): TrussQuickModelCollections {
  const panelCount = boundedInteger(options.panelCount, 2, 8);
  const panelLengthM = boundedNumber(options.panelLengthM, 1, 20, 3);
  const heightM = boundedNumber(options.heightM, 0.8, 12, 3);
  const topNodeLoadKn = positiveMagnitude(options.topNodeLoadKn);
  const lowerId = (index: number) => `N${index + 1}`;
  const upperId = (index: number) => `N${panelCount + 2 + index}`;
  const nodes: TrussNode[] = [];

  for (let index = 0; index <= panelCount; index += 1) {
    const supportType: TrussSupportType = index === 0 ? "pinned" : index === panelCount ? "roller" : "free";
    nodes.push({ id: lowerId(index), x: index * panelLengthM, y: 0, supportType });
  }
  for (let index = 0; index <= panelCount; index += 1) {
    nodes.push({ id: upperId(index), x: index * panelLengthM, y: heightM, supportType: "free" });
  }

  const members: TrussMember[] = [];
  const baseMember = {
    elementType: "truss" as const,
    materialId: options.materialId,
    E_GPa: boundedNumber(options.youngModulusGPa, 1, 300, 210),
  };
  for (let index = 0; index < panelCount; index += 1) {
    members.push({
      ...baseMember,
      id: `L${index + 1}`,
      start: lowerId(index),
      end: lowerId(index + 1),
      A_cm2: boundedNumber(options.chordAreaCm2, 1, 10_000, 30),
      kind: "lower_chord",
    });
    members.push({
      ...baseMember,
      id: `U${index + 1}`,
      start: upperId(index),
      end: upperId(index + 1),
      A_cm2: boundedNumber(options.chordAreaCm2, 1, 10_000, 30),
      kind: "upper_chord",
    });
  }
  for (let index = 0; index <= panelCount; index += 1) {
    members.push({
      ...baseMember,
      id: `V${index + 1}`,
      start: lowerId(index),
      end: upperId(index),
      A_cm2: boundedNumber(options.webAreaCm2, 1, 10_000, 20),
      kind: "vertical",
    });
  }
  for (let index = 0; index < panelCount; index += 1) {
    members.push({
      ...baseMember,
      id: `D${index + 1}`,
      start: index % 2 === 0 ? lowerId(index) : upperId(index),
      end: index % 2 === 0 ? upperId(index + 1) : lowerId(index + 1),
      A_cm2: boundedNumber(options.webAreaCm2, 1, 10_000, 20),
      kind: "diagonal",
    });
  }

  const loads: TrussLoad[] = topNodeLoadKn > 0
    ? Array.from({ length: Math.max(1, panelCount - 1) }, (_, index) => ({
        type: "nodal" as const,
        node: upperId(Math.min(panelCount - 1, index + 1)),
        fxKn: 0,
        fyKn: -topNodeLoadKn,
      }))
    : [];

  return { nodes, members, loads };
}
