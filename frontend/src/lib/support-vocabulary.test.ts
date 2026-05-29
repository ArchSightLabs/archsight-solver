import { strict as assert } from "node:assert";
import test from "node:test";
import { nodeCoordinateAriaLabel, nodeCoordinateLabel, supportAngleLabel } from "./node-field-vocabulary.ts";
import {
  BEAM_SUPPORT_DOF_ROWS,
  SUPPORT_DOF_MODE_OPTIONS,
  beamSupportConstraints,
  beamSupportDetail,
  beamSupportNote,
  nodeSupportDetail,
  nodeSupportNote,
  supportSystemHint,
  trussSupportDetail,
  trussSupportNote,
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

test("节点坐标和滚动支座角标签显式显示工程单位", () => {
  assert.equal(nodeCoordinateLabel("x"), "横坐标（m）");
  assert.equal(nodeCoordinateLabel("y"), "纵坐标（m）");
  assert.equal(nodeCoordinateAriaLabel("第 2 个节点", "x"), "第 2 个节点横坐标（m）");
  assert.equal(supportAngleLabel(), "滚动约束角（deg）");
});
