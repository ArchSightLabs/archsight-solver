import assert from "node:assert/strict";
import test from "node:test";
import { buildFailureReviewExportPayload } from "./failure-review.ts";

test("failure review payload keeps only completed failure evidence", () => {
  const payload = buildFailureReviewExportPayload({
    analysisMode: "frame",
    analysisObjectId: "frame-1",
    format: "docx",
    notice: {
      phase: "error",
      tone: "error",
      title: "结构求解失败",
      message: "矩阵奇异",
      diagnostics: [{
        code: "FRAME_SINGULAR_MATRIX",
        severity: "error",
        category: "solver",
        title: "整体刚度矩阵奇异",
        detail: "存在未约束自由度",
        suggestions: ["检查支座约束"],
        analysisType: "frame",
        objectRefs: [{ kind: "node", id: "N3" }, { kind: "node", id: "N3" }],
        actions: [],
      }],
    },
  });

  assert.equal(payload?.materialType, "failure-review");
  assert.equal(payload?.stableErrorCode, "FRAME_SINGULAR_MATRIX");
  assert.deepEqual(payload?.completedStages, ["计算请求已提交", "失败诊断已返回"]);
  assert.deepEqual(payload?.objectRefs, [{ kind: "node", id: "N3" }]);
  assert.deepEqual(payload?.suggestedActions, ["检查支座约束"]);
  assert.equal("results" in (payload ?? {}), false);
  assert.equal("solution" in (payload ?? {}), false);
});

test("failure review payload turns local validation into an explicit blocked stage", () => {
  const payload = buildFailureReviewExportPayload({
    analysisMode: "truss",
    analysisObjectId: "truss-1",
    format: "xlsx",
    notice: {
      phase: "error",
      tone: "error",
      title: "模型输入未通过校核",
      message: "节点约束不足",
    },
  });

  assert.equal(payload?.stableErrorCode, "STRUCTURE_INPUT_REVIEW_REQUIRED");
  assert.deepEqual(payload?.completedStages, ["客户端输入校核"]);
  assert.equal(payload?.diagnostics[0]?.detail, "节点约束不足");
});

test("failure review payload is unavailable for completed operations", () => {
  assert.equal(buildFailureReviewExportPayload({
    analysisMode: "beam",
    analysisObjectId: "beam-1",
    format: "docx",
    notice: {
      phase: "complete",
      tone: "success",
      title: "梁系计算完成",
      message: "结果可用",
    },
  }), null);
});
