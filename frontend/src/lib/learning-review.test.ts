import assert from "node:assert/strict";
import test from "node:test";
import { createLearningReview, evaluateLearningReview, isLearningReviewComplete } from "./learning-review.ts";
import type { BenchmarkLearningPath } from "./solver-project.ts";

const learning: BenchmarkLearningPath = {
  pathId: "beam-symmetry-path",
  featured: true,
  durationMinutes: 5,
  title: "简支梁：先判反力，再读弯矩与挠度",
  objective: "用对称性和经典解析解核对结果。",
  modelFocus: ["支座", "集中荷载"],
  predictions: [
    {
      id: "support-reactions",
      prompt: "两端支座反力如何分配？",
      options: [
        { id: "symmetric", label: "两端相等" },
        { id: "left-only", label: "全部由左端承担" },
      ],
      expectedOptionId: "symmetric",
      explanation: "结构与荷载关于跨中对称。",
    },
    {
      id: "moment-position",
      prompt: "最大弯矩在哪里？",
      options: [
        { id: "midspan", label: "跨中" },
        { id: "support", label: "支座" },
      ],
      expectedOptionId: "midspan",
      explanation: "剪力在跨中变号。",
    },
  ],
  graphicalChecks: ["弯矩图跨中达到峰值"],
  proves: ["当前边界和荷载下的解析一致性"],
  doesNotProve: ["规范设计结论"],
};

test("学习复核只保存枚举标识，不复制题目或自由文本", () => {
  const review = createLearningReview("beam-simply-supported-center-point", learning, {
    "support-reactions": "symmetric",
    "moment-position": "support",
  }, true);

  assert.deepEqual(review, {
    schemaVersion: 1,
    pathId: "beam-symmetry-path",
    caseId: "beam-simply-supported-center-point",
    reviewed: true,
    answers: [
      { predictionId: "support-reactions", selectedOptionId: "symmetric" },
      { predictionId: "moment-position", selectedOptionId: "support" },
    ],
  });
  assert.doesNotMatch(JSON.stringify(review), /两端|跨中|解析解/u);
});

test("学习复核能判定完成度并按事实源给出一致性", () => {
  const answers = {
    "support-reactions": "symmetric",
    "moment-position": "support",
  };

  assert.equal(isLearningReviewComplete(learning, answers), true);
  assert.deepEqual(evaluateLearningReview(learning, answers).map((item) => item.matched), [true, false]);
  assert.equal(isLearningReviewComplete(learning, { "support-reactions": "invalid" }), false);
});
