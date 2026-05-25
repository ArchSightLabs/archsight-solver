import assert from "node:assert/strict";
import test from "node:test";
import { createTemplateLibraryStateFromStorage, createWorkspaceSnapshot, deleteTemplateEntry, duplicateTemplateEntry, parseTemplateLibraryState, restoreWorkspaceSnapshot, saveTemplateFromWorkspace, setBaselineTemplateEntry, validateTemplateName } from "./template-library.ts";
import { createDefaultWorkspaceState, normalizeFrameWorkspaceState, normalizeTrussWorkspaceState } from "./workspace-state.ts";
import { createEmptyTemplateLibraryState } from "./template-library.ts";

test("validateTemplateName trims and rejects blank or overlong names", () => {
  assert.equal(validateTemplateName("  标准梁系模板  "), null);
  assert.equal(validateTemplateName("   "), "模板名称不能为空。");
  assert.equal(validateTemplateName("x".repeat(41)), "模板名称不能超过 40 个字符。");
});

test("parseTemplateLibraryState falls back to an empty library for invalid JSON", () => {
  const state = parseTemplateLibraryState("{not-json");
  assert.equal(state.version, "1.0");
  assert.equal(state.baselineTemplateId, null);
  assert.equal(state.templates.length, 0);
});

test("createTemplateLibraryStateFromStorage falls back to legacy storage", () => {
  const legacyState = JSON.stringify({
    version: "1.0",
    baselineTemplateId: null,
    templates: [
      {
        id: "legacy-template",
        name: "旧模板",
        createdAt: 10,
        updatedAt: 20,
        snapshot: {
          analysisMode: "beam",
          beam: createWorkspaceSnapshot(createDefaultWorkspaceState()).beam,
          compareEnabled: false,
          scenarios: [],
        },
      },
    ],
  });

  const state = createTemplateLibraryStateFromStorage(null, legacyState);
  assert.equal(state.templates.length, 1);
  assert.equal(state.templates[0].id, "legacy-template");
  assert.equal(state.templates[0].name, "旧模板");
});

test("parseTemplateLibraryState migrates legacy beam snapshots", () => {
  const raw = JSON.stringify({
    version: "0.9",
    baselineTemplateId: "legacy",
    templates: [
      {
        id: "legacy",
        name: " Legacy Template ",
        createdAt: 1,
        updatedAt: 2,
        snapshot: {
          form: {
            q: 12,
            E: 206,
            I: 4600,
            spans: [4, 5],
            beamType: "continuous",
            loadType: "uniform",
            loadValue: 12,
            loadPosition: 0.4,
            loadEnd: 0.7,
            freq: 1.2,
            duration: 5,
            materialId: "q235",
            projectName: "Legacy Project",
          },
          spanCount: 2,
          compareEnabled: true,
          scenarios: [
            {
              id: "scenario-1",
              label: "方案 1",
              q: 13,
              E: 205,
              I: 4400,
              freq: 1.1,
              duration: 6,
              color: "#38bdf8",
            },
          ],
        },
      },
    ],
  });

  const state = parseTemplateLibraryState(raw);
  assert.equal(state.templates.length, 1);
  assert.equal(state.templates[0].name, "Legacy Template");
  assert.equal(state.templates[0].snapshot.analysisMode, "beam");
  assert.equal(state.templates[0].snapshot.beam?.spans.length, 2);
  assert.equal(state.templates[0].snapshot.compareEnabled, true);
});

test("workspace snapshots round-trip beam and frame state", () => {
  const workspace = createDefaultWorkspaceState();
  workspace.analysisMode = "beam";
  workspace.beam.spans[0].length = 6.25;
  workspace.beam.compareEnabled = true;
  workspace.beam.scenarios = [
    {
      id: "scenario-a",
      label: "方案 A",
      q: 11,
      E: 208,
      I: 4300,
      freq: 1.4,
      duration: 5.5,
      color: "#38bdf8",
    },
  ];

  const beamSnapshot = createWorkspaceSnapshot(workspace);
  const restoredBeam = restoreWorkspaceSnapshot(beamSnapshot);
  assert.equal(restoredBeam.analysisMode, "beam");
  assert.equal(restoredBeam.beam.spans[0].length, 6.25);
  assert.equal(restoredBeam.beam.compareEnabled, true);
  assert.equal(restoredBeam.beam.scenarios[0].label, "方案 A");

  workspace.analysisMode = "frame";
  workspace.frame = normalizeFrameWorkspaceState({
    ...workspace.frame,
    projectName: "Frame Restore",
    frameMode: "custom",
    span: 7.2,
    height: 4.8,
    beamLoadKnPerM: 20,
    customNodes: [
      { id: "N1", x: 0, y: 0, supportType: "fixed" },
      { id: "N2", x: 5, y: 0, supportType: "pinned" },
      { id: "N3", x: 0, y: 4, supportType: "free" },
    ],
    customMembers: [
      { id: "C1", start: "N1", end: "N3", E_GPa: 210, A_cm2: 180, I_cm4: 9000, kind: "column" },
      { id: "B1", start: "N3", end: "N2", E_GPa: 210, A_cm2: 160, I_cm4: 8500, kind: "beam" },
    ],
    customLoads: [
      { type: "distributed", member: "B1", wyKnPerM: -12 },
      { type: "nodal", node: "N3", fxKn: 8, fyKn: -4, mzKnM: 0 },
    ],
  });

  const frameSnapshot = createWorkspaceSnapshot(workspace);
  const restoredFrame = restoreWorkspaceSnapshot(frameSnapshot);
  assert.equal(restoredFrame.analysisMode, "frame");
  assert.equal(restoredFrame.frame.projectName, "Frame Restore");
  assert.equal(restoredFrame.frame.frameMode, "custom");
  assert.equal(restoredFrame.frame.span, 7.2);
  assert.equal(restoredFrame.frame.customNodes.length, 3);
  assert.equal(restoredFrame.frame.customMembers[1].id, "B1");
  assert.equal(restoredFrame.frame.customLoads[0].type, "distributed");
  assert.equal(restoredFrame.frame.customLoads[0].type === "distributed" ? restoredFrame.frame.customLoads[0].wyKnPerM : 0, -12);

  workspace.analysisMode = "truss";
  workspace.truss = normalizeTrussWorkspaceState({
    ...workspace.truss,
    projectName: "Truss Restore",
    materialId: "q345",
    customNodes: [
      { id: "N1", x: 0, y: 0, supportType: "pinned" },
      { id: "N2", x: 6, y: 0, supportType: "roller" },
      { id: "N3", x: 2, y: 3, supportType: "free" },
    ],
    customMembers: [
      { id: "M1", start: "N1", end: "N3", E_GPa: 210, A_cm2: 24, kind: "upper_chord" },
      { id: "M2", start: "N3", end: "N2", E_GPa: 210, A_cm2: 24, kind: "diagonal" },
    ],
    customLoads: [
      { type: "nodal", node: "N3", fxKn: 0, fyKn: -36 },
    ],
  });

  const trussSnapshot = createWorkspaceSnapshot(workspace);
  const restoredTruss = restoreWorkspaceSnapshot(trussSnapshot);
  assert.equal(restoredTruss.analysisMode, "truss");
  assert.equal(restoredTruss.truss.projectName, "Truss Restore");
  assert.equal(restoredTruss.truss.customNodes.length, 3);
  assert.equal(restoredTruss.truss.customMembers[1].id, "M2");
  assert.equal(restoredTruss.truss.customLoads[0].type, "nodal");
});

test("template library reducers support save, duplicate, baseline and delete", () => {
  const beamSnapshot = createWorkspaceSnapshot(createDefaultWorkspaceState());
  const initial = createEmptyTemplateLibraryState();

  const saved = saveTemplateFromWorkspace(initial, "  基准模板  ", beamSnapshot, 1000, () => "template-1");
  assert.equal(saved.ok, true);
  assert.equal(saved.state?.templates[0].name, "基准模板");
  assert.equal(saved.state?.templates[0].id, "template-1");

  const duplicated = duplicateTemplateEntry(saved.state!, "template-1", 2000, () => "template-2");
  assert.equal(duplicated.ok, true);
  assert.equal(duplicated.state?.templates[0].name, "基准模板 - 副本");

  const baseline = setBaselineTemplateEntry(duplicated.state!, "template-1");
  assert.equal(baseline.ok, true);
  assert.equal(baseline.state?.baselineTemplateId, "template-1");

  const deleted = deleteTemplateEntry(baseline.state!, "template-1");
  assert.equal(deleted.ok, true);
  assert.equal(deleted.state?.baselineTemplateId, null);
  assert.equal(deleted.state?.templates.length, 1);
});
