import { strict as assert } from "node:assert";
import test from "node:test";
import { nodeCoordinateAriaLabel, nodeCoordinateLabel, supportAngleApplies, supportAngleHelpText, supportAngleLabel } from "./node-field-vocabulary.ts";
import {
  BEAM_SUPPORT_DOF_ROWS,
  FRAME_SUPPORT_DOF_ROWS,
  FRAME_SUPPORT_OPTIONS,
  SUPPORT_DOF_MODE_OPTIONS,
  TRUSS_SUPPORT_DOF_ROWS,
  TRUSS_SUPPORT_OPTIONS,
  beamSupportConstraints,
  beamSupportDetail,
  beamSupportNote,
  beamSupportStateDetail,
  beamSupportSummary,
  frameNodeSupportDofStates,
  frameNodeSupportStateDetail,
  frameNodeSupportSummary,
  hasFrameSupportBoundary,
  nodeSupportDetail,
  nodeSupportNote,
  nodeSupportSummary,
  supportChoiceOptions,
  supportOptionChoiceLabel,
  supportSystemHint,
  trussSupportDetail,
  trussSupportDofStates,
  trussSupportNote,
  trussSupportSummary,
} from "./support-vocabulary.ts";

test("梁系支座约束来自共享目录并保留 v / θz 口径", () => {
  assert.deepEqual(beamSupportConstraints("fixed"), ["v", "rz"]);
  assert.deepEqual(beamSupportConstraints("roller"), ["v"]);
  assert.match(beamSupportDetail("roller"), /梁系中与铰支座同自由度/u);
});

test("框架和桁架支座说明区分转角自由度", () => {
  assert.match(nodeSupportDetail("fixed"), /ux、uy、rz/u);
  assert.match(nodeSupportDetail("roller"), /支座角度/u);
  assert.match(trussSupportDetail("pinned"), /ux、uy/u);
  assert.match(supportSystemHint("truss"), /桁架支座不提供转动约束/u);
  assert.match(supportSystemHint("truss"), /不接收节点弹簧/u);
});

test("支座选择项用简短名称承载主控面板显示", () => {
  const frameRoller = FRAME_SUPPORT_OPTIONS.find((option) => option.value === "roller");
  assert.equal(frameRoller ? supportOptionChoiceLabel(frameRoller) : "", "滚动支座（默认约束 uy、释放 ux 与 rz；设置支座角度时约束法向位移）");
  assert.deepEqual(
    supportChoiceOptions(FRAME_SUPPORT_OPTIONS).map((option) => [option.label, option.selectedLabel, option.description]),
    [
      ["固结支座", "固结支座", "约束 ux、uy、rz"],
      ["铰支座", "铰支座", "约束 ux、uy，释放 rz"],
      ["滚动支座", "滚动支座", "默认约束 uy、释放 ux 与 rz；设置支座角度时约束法向位移"],
      ["自由节点", "自由节点", "释放 ux、uy、rz"],
    ],
  );
  assert.deepEqual(
    supportChoiceOptions(TRUSS_SUPPORT_OPTIONS).map((option) => [option.label, option.description]),
    [["铰支座", "约束 ux、uy"], ["滚动支座", "约束 uy，释放 ux"], ["自由节点", "释放 ux、uy"]],
  );
});

test("对象导航支座概览同时显示支座类型和自由度约束", () => {
  assert.equal(beamSupportSummary({ type: "pinned" }), "铰支座 · 约束 v，释放 θz");
  assert.equal(beamSupportSummary({ type: "fixed" }), "固结支座 · 约束 v、θz");
  assert.equal(nodeSupportSummary("fixed"), "固结支座 · 约束 ux、uy、rz");
  assert.equal(nodeSupportSummary("roller"), "滚动支座 · 默认约束 uy、释放 ux 与 rz；设置支座角度时约束法向位移");
  assert.equal(trussSupportSummary("pinned"), "铰支座 · 约束 ux、uy");
  assert.equal(trussSupportSummary("roller"), "滚动支座 · 约束 uy，释放 ux");
});

test("框架支座概览显示滚动支座角度、弹簧和实际释放自由度", () => {
  assert.equal(frameNodeSupportSummary({ supportType: "fixed" }), "固结支座 · 约束 ux、uy、rz");
  assert.equal(
    frameNodeSupportSummary({ supportType: "roller", supportAngleDeg: 45, springs: [{ dof: "rz", stiffnessKnMPerRad: 12000 }] }),
    "滚动支座 · 约束法向位移（45°），rz 弹簧 12000 kN·m/rad，释放切向位移",
  );
  assert.equal(
    frameNodeSupportSummary({ supportType: "free", springs: [{ dof: "uy", stiffnessKnPerM: 5000 }] }),
    "弹性支座 · uy 弹簧 5000 kN/m，释放 ux、rz",
  );
  assert.equal(frameNodeSupportStateDetail({ supportType: "pinned", springs: [{ dof: "rz", stiffnessKnMPerRad: 12500.5 }] }), "约束 ux、uy，rz 弹簧 12500.5 kN·m/rad");
});

test("框架支座节点列表包含弹簧边界并忽略零刚度弹簧", () => {
  assert.equal(hasFrameSupportBoundary({ supportType: "free" }), false);
  assert.equal(hasFrameSupportBoundary({ supportType: "free", springs: [{ dof: "uy", stiffnessKnPerM: 0 }] }), false);
  assert.equal(hasFrameSupportBoundary({ supportType: "free", springs: [{ dof: "uy", stiffnessKnPerM: 1 }] }), true);
  assert.equal(hasFrameSupportBoundary({ supportType: "roller" }), true);
});

test("梁系支座概览优先显示实际自由度和弹簧状态", () => {
  assert.equal(beamSupportStateDetail({ type: "free", springs: [{ dof: "v", stiffnessKnPerM: 50000 }] }), "v 弹簧 50000 kN/m，释放 θz");
  assert.equal(
    beamSupportStateDetail({ type: "fixed", constraints: ["v"], springs: [{ dof: "rz", stiffnessKnMPerRad: 12500.5 }] }),
    "约束 v，θz 弹簧 12500.5 kN·m/rad",
  );
});

test("支座单项工程提示来自共享目录", () => {
  assert.match(beamSupportNote("fixed"), /悬臂梁固定端/u);
  assert.match(nodeSupportNote("pinned"), /释放平面转角/u);
  assert.match(trussSupportNote("roller"), /允许水平滑移/u);
});

test("梁系支座自由度编辑行统一声明标签、模式和默认弹簧刚度", () => {
  assert.deepEqual(SUPPORT_DOF_MODE_OPTIONS.map((option) => option.label), ["约束", "弹簧", "释放"]);
  assert.deepEqual(BEAM_SUPPORT_DOF_ROWS.map((row) => row.label), ["竖向位移 v", "转角 θz"]);
  assert.deepEqual(BEAM_SUPPORT_DOF_ROWS.map((row) => row.springLabel), ["竖向弹簧刚度（kN/m）", "转动弹簧刚度（kN·m/rad）"]);
});

test("框架和桁架节点边界显式拆成自由度状态", () => {
  assert.deepEqual(FRAME_SUPPORT_DOF_ROWS.map((row) => row.label), ["水平位移 ux", "竖向位移 uy", "转角 rz"]);
  assert.deepEqual(TRUSS_SUPPORT_DOF_ROWS.map((row) => row.label), ["水平位移 ux", "竖向位移 uy"]);
  assert.deepEqual(
    frameNodeSupportDofStates({ supportType: "pinned", springs: [{ dof: "rz", stiffnessKnMPerRad: 12000 }] }).map((state) => [state.dof, state.mode, state.detail]),
    [["ux", "fixed", "约束"], ["uy", "fixed", "约束"], ["rz", "spring", "弹性 12000 kN·m/rad"]],
  );
  assert.deepEqual(
    frameNodeSupportDofStates({ supportType: "roller", supportAngleDeg: 45 }).map((state) => [state.label, state.mode, state.detail]),
    [["法向位移 n", "fixed", "约束 45° 法向"], ["切向位移 t", "free", "释放切向"], ["转角 rz", "free", "释放"]],
  );
  assert.deepEqual(
    trussSupportDofStates("roller").map((state) => [state.dof, state.mode]),
    [["ux", "free"], ["uy", "fixed"]],
  );
});

test("节点坐标和滚动支座角标签显式显示工程单位", () => {
  assert.equal(nodeCoordinateLabel("x"), "横坐标（m）");
  assert.equal(nodeCoordinateLabel("y"), "纵坐标（m）");
  assert.equal(nodeCoordinateAriaLabel("第 2 个节点", "x"), "第 2 个节点横坐标（m）");
  assert.equal(supportAngleLabel(), "滚动支座法向角（°）");
  assert.equal(supportAngleApplies("roller"), true);
  assert.equal(supportAngleApplies("fixed"), false);
  assert.match(supportAngleHelpText(), /90° 表示竖向法向/u);
});
