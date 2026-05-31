import assert from "node:assert/strict";
import test from "node:test";
import {
  beamTextSupportConstraintsForType,
  parseBeamTextSupportType,
  parseFrameTextSupportType,
  parseTrussTextSupportType,
} from "./support-text-model.ts";

test("文本模型支座别名集中区分三类结构体系", () => {
  assert.equal(parseBeamTextSupportType("固定支座"), "fixed");
  assert.equal(parseBeamTextSupportType("hinge"), "pinned");
  assert.equal(parseBeamTextSupportType("滚动支座"), "roller");
  assert.equal(parseBeamTextSupportType("unknown"), null);

  assert.equal(parseFrameTextSupportType("6"), "fixed");
  assert.equal(parseFrameTextSupportType("4"), "pinned");
  assert.equal(parseFrameTextSupportType("0"), "free");
  assert.equal(parseFrameTextSupportType("unknown", "roller"), "roller");

  assert.equal(parseTrussTextSupportType("fixed"), "pinned");
  assert.equal(parseTrussTextSupportType("固结支座"), "pinned");
  assert.equal(parseTrussTextSupportType("roller"), "roller");
  assert.equal(parseTrussTextSupportType("free"), "free");
});

test("梁系文本支座默认自由度约束保持 v / rz 口径", () => {
  assert.deepEqual(beamTextSupportConstraintsForType("fixed"), ["v", "rz"]);
  assert.deepEqual(beamTextSupportConstraintsForType("pinned"), ["v"]);
  assert.deepEqual(beamTextSupportConstraintsForType("roller"), ["v"]);
  assert.deepEqual(beamTextSupportConstraintsForType("free"), []);
});
