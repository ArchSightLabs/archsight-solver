import { expect, test, type Page } from "@playwright/test";

test.setTimeout(60_000);

type StructurePayload = {
  analysisType: "frame" | "truss";
  structure: {
    nodes: Array<{ id: string; x: number; y: number }>;
    members: Array<{ id: string; start: string; end: string }>;
    loads?: unknown[];
  };
};

async function stabilizeWorkbench(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `,
  });
}

async function chooseDropdownOption(page: Page, buttonName: RegExp, optionName: string) {
  await page.getByRole("button", { name: buttonName }).click();
  await page.getByRole("option", { name: optionName, exact: true }).click();
}

async function openAnalysisObject(page: Page, buttonName: RegExp) {
  const moduleRail = page.locator("aside").filter({ hasText: "分析对象" });
  await moduleRail.getByRole("button", { name: buttonName }).click();
}

async function openObjectMemberGroup(page: Page, connectionButtonName: string) {
  await page.getByRole("tab", { name: "对象", exact: true }).click();
  await expect(page.getByRole("button", { name: connectionButtonName })).toBeVisible();
}

function hasConnection(payload: StructurePayload, start: string, end: string) {
  return payload.structure.members.some(
    (member) => (member.start === start && member.end === end) || (member.start === end && member.end === start),
  );
}

function calculationEnvelope(payload: StructurePayload) {
  const isFrame = payload.analysisType === "frame";
  const summary = isFrame
    ? {
        maxDisplacementMm: 1.2,
        maxVerticalMm: 0.8,
        maxMomentKnM: 12.5,
        maxDisplacementNodeId: payload.structure.nodes[0]?.id ?? "N1",
        status: "合格",
        statusCode: "PASS",
        method: "二维平面框架杆单元法",
      }
    : {
        allowableMm: 10,
        allowableRatio: 250,
        maxDisplacementMm: 0.9,
        maxDisplacementNodeId: payload.structure.nodes[0]?.id ?? "N1",
        maxAxialForceKn: 8.5,
        maxAxialForceMemberId: payload.structure.members[0]?.id ?? "M1",
        status: "合格",
        statusCode: "PASS",
        method: "二维平面桁架杆单元法",
      };

  return {
    success: true,
    operation: "calculate",
    version: "v1",
    analysisType: payload.analysisType,
    request: payload,
    model: {
      analysisType: payload.analysisType,
      structure: payload.structure,
    },
    results: {
      summary,
      preview: {
        analysisType: payload.analysisType,
        structureType: "explicit",
        structureTypeLabel: isFrame ? "二维平面框架" : "二维平面桁架",
        nodes: payload.structure.nodes,
        members: payload.structure.members,
        loads: payload.structure.loads ?? [],
        nodeResults: [],
        memberResults: [],
        deformedNodes: [],
        deformationScale: 1,
        summary,
        warnings: [],
      },
      diagram: {},
      nodeResults: [],
      memberResults: [],
      nodeIds: payload.structure.nodes.map((node) => node.id),
      memberIds: payload.structure.members.map((member) => member.id),
      series: isFrame
        ? {
            ux_data: [0],
            uy_data: [0],
            rz_data: [0],
            member_axial_data: [0],
            member_shear_data: [0],
            member_moment_data: [0],
          }
        : {
            ux_data: [0],
            uy_data: [0],
            member_axial_data: [],
          },
    },
    diagnostics: {
      status: "合格",
      statusCode: "PASS",
    },
    errors: [],
  };
}

async function expectCalculatePayload(
  page: Page,
  mode: StructurePayload["analysisType"],
  expectedConnection: [string, string],
) {
  let observedPayload: StructurePayload | null = null;
  await page.route("**/api/calculate", async (route) => {
    const payload = route.request().postDataJSON() as StructurePayload;
    expect(payload.analysisType).toBe(mode);
    expect(hasConnection(payload, expectedConnection[0], expectedConnection[1])).toBe(true);
    observedPayload = payload;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(calculationEnvelope(payload)),
    });
  });
  return () => observedPayload;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto("/");
  await stabilizeWorkbench(page);
});

test("平面框架对象页按指定起终节点新增构件并提交计算 payload", async ({ page }) => {
  const observedPayload = await expectCalculatePayload(page, "frame", ["N1", "N4"]);

  await openAnalysisObject(page, /平面框架-1\s+(平面框架|框架)/);
  await openObjectMemberGroup(page, "连接为构件");
  await chooseDropdownOption(page, /新增构件终点节点，当前值：N2/, "N4");
  await page.getByRole("button", { name: "连接为构件" }).click();

  await expect(page.getByRole("button", { name: /M1 · N1-N4/ })).toBeVisible();

  await page.getByRole("tab", { name: /结构计算/ }).click();
  await page.getByRole("button", { name: "运行平面框架计算" }).click();

  await expect(page.getByText("平面框架计算完成")).toBeVisible();
  expect(observedPayload()?.structure.members).toHaveLength(4);
});

test("平面桁架对象页按指定起终节点新增杆件并提交计算 payload", async ({ page }) => {
  const observedPayload = await expectCalculatePayload(page, "truss", ["N2", "N1"]);

  await openAnalysisObject(page, /平面桁架-1\s+(平面桁架|桁架)/);
  await openObjectMemberGroup(page, "连接为杆件");
  await chooseDropdownOption(page, /新增杆件起点节点，当前值：N1/, "N2");
  await page.getByRole("button", { name: "连接为杆件" }).click();

  await expect(page.getByRole("button", { name: /M6 · N2-N1/ })).toBeVisible();

  await page.getByRole("tab", { name: /结构计算/ }).click();
  await page.getByRole("button", { name: "运行平面桁架计算" }).click();

  await expect(page.getByText("平面桁架计算完成")).toBeVisible();
  expect(observedPayload()?.structure.members).toHaveLength(6);
});
