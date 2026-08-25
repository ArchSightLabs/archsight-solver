import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const realBackendEnabled = process.env.ARCHSIGHT_SOLVER_E2E_REAL_BACKEND === "1";

type VerificationPackage = {
  analysis: {
    recordedResult: {
      solution: {
        secondOrder: {
          status: string;
          nonlinearPathTrace: { keyPoints: unknown[] };
        };
      };
    };
  };
  evidence: { learningReview: { caseId: string; reviewed: boolean } };
  integrity: { packageHash: string };
};

test.describe("v1.8.1 真实后端教学闭环", () => {
  test.skip(!realBackendEnabled, "仅在发布镜像真实后端门禁中运行，禁止以 mock 结果充当发布证据");
  test.setTimeout(360_000);

  const cases = [
    {
      caseId: "GNA-001",
      title: "P-Δ：从首阶位移到真实平衡路径",
      expectedStatus: "converged",
    },
    {
      caseId: "GNA-003",
      title: "Williams 浅拱翻转：为什么收敛失败也可能是正确结果",
      expectedStatus: "not_converged",
    },
  ] as const;

  for (const benchmark of cases) {
    test(`${benchmark.caseId} 从公开案例真实复算、播放并下载可信证据`, async ({ page }) => {
      await page.addInitScript(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
      });
      await page.goto("/");
      await page.getByRole("button", { name: "公开案例", exact: true }).click();
      await page.getByRole("tab", { name: /学习路径/u }).click();
      await page.getByRole("button", { name: new RegExp(benchmark.title, "u") }).click();

      const learning = page.getByRole("region", { name: "五分钟学习路径" });
      await expect(learning.getByText(`算例编号 ${benchmark.caseId}`, { exact: true })).toBeVisible();
      for (const fieldset of await learning.locator("fieldset").all()) {
        await fieldset.getByRole("radio").first().check();
      }
      await learning.getByRole("button", { name: "计算并核对" }).click();
      await expect(learning.getByText("判断一致")).toHaveCount(3, { timeout: 300_000 });

      const downloadPromise = page.waitForEvent("download");
      await learning.getByRole("button", { name: "可信证据包" }).click();
      const download = await downloadPromise;
      const downloadPath = await download.path();
      expect(downloadPath).not.toBeNull();
      const verificationPackage = JSON.parse(await readFile(downloadPath!, "utf-8")) as VerificationPackage;
      expect(verificationPackage.evidence.learningReview).toMatchObject({
        caseId: benchmark.caseId,
        reviewed: true,
      });
      expect(verificationPackage.integrity.packageHash).toMatch(/^[0-9a-f]{64}$/u);
      const recorded = verificationPackage.analysis.recordedResult.solution;
      expect(recorded.secondOrder.status).toBe(benchmark.expectedStatus);
      expect(recorded.secondOrder.nonlinearPathTrace.keyPoints.length).toBeGreaterThan(1);

      await page.getByRole("tab", { name: "稳定审查", exact: true }).click();
      await expect(page.getByRole("heading", { name: "几何非线性过程播放" })).toBeVisible();
      await expect(page.getByRole("img", { name: /几何非线性荷载路径/u })).toBeVisible();
      await expect(page.locator('[data-keypoint-kind="start"]')).toHaveCount(1);
      if (benchmark.expectedStatus === "not_converged") {
        await expect(page.locator('[data-keypoint-kind="failure"]')).toHaveCount(1);
        await expect(page.locator('[data-keypoint-kind="last_converged"]')).toHaveCount(1);
        await expect(page.getByText("未收敛", { exact: true }).first()).toBeVisible();
      } else {
        await expect(page.getByText("已收敛", { exact: true }).first()).toBeVisible();
      }

    });
  }
});
