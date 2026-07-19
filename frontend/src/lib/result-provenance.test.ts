import assert from "node:assert/strict";
import test from "node:test";
import {
  createResultProvenance,
  evaluateResultValidity,
  modelPayloadSignature,
  normalizeResultProvenance,
} from "./result-provenance.ts";

const beamPayload = {
  analysisType: "beam" as const,
  projectName: "测试项目",
  spans: [4, 4],
  supports: [{ id: "S1", x: 0, type: "pinned" }],
  q: 10,
};

test("模型签名忽略项目名称但识别影响计算的输入变化", () => {
  assert.equal(
    modelPayloadSignature(beamPayload),
    modelPayloadSignature({ ...beamPayload, projectName: "重命名后的项目" }),
  );
  assert.notEqual(
    modelPayloadSignature(beamPayload),
    modelPayloadSignature({ ...beamPayload, spans: [5, 4] }),
  );
});

test("结果来源绑定分析对象、结构体系、模型签名和计算时工程修订", () => {
  const provenance = createResultProvenance({
    analysisObjectId: "beam-1",
    analysisType: "beam",
    payload: beamPayload,
    projectRevision: 12,
    solvedAt: "2026-07-19T12:00:00.000Z",
    result: { meta: { modelHash: "model-hash", requestHash: "request-hash" } },
  });

  assert.deepEqual(provenance, {
    schemaVersion: "1.0.0",
    analysisObjectId: "beam-1",
    analysisType: "beam",
    projectRevision: 12,
    modelSignature: modelPayloadSignature(beamPayload),
    modelHash: "model-hash",
    requestHash: "request-hash",
    solvedAt: "2026-07-19T12:00:00.000Z",
    payload: beamPayload,
  });
});

test("结果有效性拒绝跨对象、跨结构体系和模型修改后的旧结果", () => {
  const provenance = createResultProvenance({
    analysisObjectId: "beam-1",
    analysisType: "beam",
    payload: beamPayload,
    projectRevision: 3,
  });

  assert.equal(evaluateResultValidity({ hasResults: true, analysisObjectId: "beam-1", analysisType: "beam", currentPayload: beamPayload, provenance }).status, "current");
  assert.equal(evaluateResultValidity({ hasResults: true, analysisObjectId: "beam-2", analysisType: "beam", currentPayload: beamPayload, provenance }).reason, "analysis-object-changed");
  assert.equal(evaluateResultValidity({ hasResults: true, analysisObjectId: "beam-1", analysisType: "frame", currentPayload: beamPayload, provenance }).reason, "analysis-mode-changed");
  assert.equal(evaluateResultValidity({ hasResults: true, analysisObjectId: "beam-1", analysisType: "beam", currentPayload: { ...beamPayload, q: 12 }, provenance }).reason, "model-changed");
});

test("旧工程中缺少来源契约的结果标记为不可验证而不是默认有效", () => {
  assert.equal(evaluateResultValidity({
    hasResults: true,
    analysisObjectId: "beam-1",
    analysisType: "beam",
    currentPayload: beamPayload,
    provenance: null,
  }).status, "unverifiable");
  assert.equal(normalizeResultProvenance({ analysisObjectId: "beam-1" }), null);
});
