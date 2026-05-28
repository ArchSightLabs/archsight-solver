import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBenchmarkSubmissionChannelDraft,
  buildBenchmarkSubmissionPackageRequest,
  buildMetricPayload,
  createBenchmarkCaseId,
  createDefaultBenchmarkSubmissionForm,
  splitMultivalueText,
} from "./benchmark-submission-package.ts";

test("createDefaultBenchmarkSubmissionForm keeps truss metrics in axial-force vocabulary", () => {
  const form = createDefaultBenchmarkSubmissionForm("truss", {
    analysisType: "truss",
    structure: {
      nodes: [{ id: "N1" }, { id: "N2" }],
      members: [{ id: "M1" }],
    },
  });

  assert.ok(form.metrics.some((metric) => metric.label === "最大杆件轴力"));
  assert.ok(form.metrics.every((metric) => !/弯矩|剪力/u.test(metric.label)));
  assert.deepEqual(buildMetricPayload(form.metrics).expected, {
    statusCode: "PASS",
    nodeCount: 2,
    memberCount: 1,
    maxDisplacementMm: 0,
    maxAxialForceKn: 0,
    maxDisplacementNodeId: "N1",
    maxAxialForceMemberId: "M1",
  });
});

test("buildBenchmarkSubmissionPackageRequest creates complete package input", () => {
  const form = createDefaultBenchmarkSubmissionForm("beam", {
    analysisType: "beam",
    supports: [{ id: "S1" }, { id: "S2" }],
  });
  const request = buildBenchmarkSubmissionPackageRequest("beam", { analysisType: "beam" }, {
    ...form,
    caseId: "beam-user-case",
    method: "按简支梁解析公式独立复核。",
    reference: "结构力学教材",
    contributorName: "测试用户",
  });

  assert.equal(request.case.id, "beam-user-case");
  assert.equal(request.case.category, "beam");
  assert.equal(request.case.verification.method, "按简支梁解析公式独立复核。");
  assert.deepEqual(request.case.verification.checkedMetrics, ["节点/支座数量", "最大挠度", "最大挠度位置"]);
  assert.equal(request.case.metricDefinitions.find((metric) => metric.key === "maxDeflectionMm")?.unit, "mm");
  assert.equal(request.contributor.name, "测试用户");
});

test("createDefaultBenchmarkSubmissionForm inherits selected object name", () => {
  const form = createDefaultBenchmarkSubmissionForm("frame", { analysisType: "frame", structure: { nodes: [], members: [] } }, "平面框架-2");

  assert.equal(form.title, "平面框架-2");
  assert.equal(form.caseId, "frame-平面框架-2");
  assert.equal(createBenchmarkCaseId("beam", ""), "beam-submission");
});

test("createDefaultBenchmarkSubmissionForm reads locked metrics from selected object result", () => {
  const form = createDefaultBenchmarkSubmissionForm(
    "truss",
    {
      analysisType: "truss",
      structure: {
        nodes: [{ id: "N1" }, { id: "N2" }],
        members: [{ id: "M1" }, { id: "M2" }],
      },
    },
    "平面桁架-1",
    {
      nodeIds: ["N1", "N2"],
      memberIds: ["M1", "M2"],
      summary: {
        statusCode: "REVIEW",
        maxDisplacementMm: 1.234,
        maxAxialForceKn: 45.67,
        maxDisplacementNodeId: "N2",
        maxAxialForceMemberId: "M2",
      },
    }
  );

  const byKey = new Map(form.metrics.map((metric) => [metric.key, metric]));

  assert.equal(byKey.get("statusCode")?.expectedValue, "REVIEW");
  assert.equal(byKey.get("statusCode")?.expectedReadonly, true);
  assert.equal(byKey.get("nodeCount")?.expectedValue, "2");
  assert.equal(byKey.get("memberCount")?.expectedReadonly, true);
  assert.equal(byKey.get("maxDisplacementMm")?.expectedValue, "1.234");
  assert.equal(byKey.get("maxAxialForceKn")?.expectedValue, "45.67");
  assert.equal(byKey.get("maxDisplacementNodeId")?.expectedValue, "N2");
  assert.equal(byKey.get("maxAxialForceMemberId")?.expectedReadonly, true);
});

test("buildMetricPayload converts display units to canonical benchmark units", () => {
  const form = createDefaultBenchmarkSubmissionForm("beam", {
    analysisType: "beam",
    supports: [{ id: "S1" }, { id: "S2" }],
  });
  const nextMetrics = form.metrics.map((metric) => {
    if (metric.key === "maxDeflectionMm") {
      return { ...metric, expectedValue: "0.0015", expectedUnit: "m", toleranceValue: "0.00001", toleranceUnit: "m" };
    }
    if (metric.key === "maxDeflectionXM") {
      return { ...metric, expectedValue: "4200", expectedUnit: "mm", toleranceValue: "10", toleranceUnit: "mm" };
    }
    return metric;
  });

  const payload = buildMetricPayload(nextMetrics);

  assert.equal(payload.expected.maxDeflectionMm, 1.5);
  assert.equal(payload.tolerances.maxDeflectionMm, 0.01);
  assert.equal(payload.expected.maxDeflectionXM, 4.2);
  assert.equal(payload.tolerances.maxDeflectionXM, 0.01);
});

test("splitMultivalueText accepts newline and comma separated values", () => {
  assert.deepEqual(splitMultivalueText("最大挠度\n峰值位置，节点/支座数量"), ["最大挠度", "峰值位置", "节点/支座数量"]);
});

test("buildBenchmarkSubmissionChannelDraft creates GitHub and email submission links", () => {
  const draft = buildBenchmarkSubmissionChannelDraft({
    repositoryUrl: "https://github.com/ArchSightLabs/archsight-solver/",
    officialEmail: "archsight-labs@qq.com",
    submissionId: "bench-beam-user-case-abc123",
    filename: "beam-user-case-abc123.json",
    caseId: "beam-user-case",
    caseTitle: "用户梁系验证算例",
    category: "beam",
    reviewStatus: "ready_for_review",
  });

  assert.equal(draft.officialEmail, "archsight-labs@qq.com");
  assert.equal(draft.issueTitle, "验证算例投稿：beam-user-case");
  assert.ok(draft.issueUrl.startsWith("https://github.com/ArchSightLabs/archsight-solver/issues/new?"));
  assert.ok(draft.issueUrl.includes("template=benchmark_submission.md"));
  assert.ok(draft.issueBody.includes("投稿编号：bench-beam-user-case-abc123"));
  assert.ok(draft.mailtoUrl.startsWith("mailto:archsight-labs@qq.com?"));
  assert.ok(draft.emailSubject.includes("bench-beam-user-case-abc123"));
  assert.ok(draft.emailBody.includes("浏览器无法自动把 JSON 文件加入邮件附件"));
});
