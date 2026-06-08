import { expect, test, type Page } from "@playwright/test";

test.setTimeout(90_000);

type FrameNode = {
  id: string;
  x: number;
  y: number;
  supportType?: string;
};

type FrameMember = {
  id: string;
  start: string;
  end: string;
  kind?: string;
};

type FrameLoad =
  | { type: "distributed"; member: string; direction?: string; qStartKnPerM?: number; qEndKnPerM?: number; startRatio?: number; endRatio?: number }
  | { type: "member_point"; member: string; direction?: string; forceKn?: number; positionRatio?: number }
  | { type: "temperature"; member: string; deltaTempC?: number; alphaPerC?: number }
  | { type: "nodal"; node: string; fxKn?: number; fyKn?: number; mzKnM?: number };

type FrameLoadCase = {
  id: string;
  title: string;
  loads: FrameLoad[];
};

type FramePayload = {
  analysisType: "frame";
  structure: {
    nodes: FrameNode[];
    members: FrameMember[];
    loads?: FrameLoad[];
    loadCases?: FrameLoadCase[];
    loadCombinations?: Array<{ id: string; title: string; factors: Record<string, number>; tags?: string[] }>;
  };
};

type FrameNodeResult = {
  nodeId: string;
  x: number;
  y: number;
  supportType: string;
  uxMm: number;
  uyMm: number;
  rotationDeg: number;
  resultantMm: number;
  reactionFxKn: number;
  reactionFyKn: number;
  reactionMzKnM: number;
};

type FrameMemberResult = {
  memberId: string;
  kind: string;
  startNode: string;
  endNode: string;
  axialStartKn: number;
  shearStartKn: number;
  momentStartKnM: number;
  axialEndKn: number;
  shearEndKn: number;
  momentEndKnM: number;
  maxAbsAxialKn: number;
  maxAbsShearKn: number;
  maxAbsMomentKnM: number;
  lengthM: number;
};

type FrameMemberDiagram = {
  memberId: string;
  stationsM: number[];
  stations: number[];
  axialKn: number[];
  shearKn: number[];
  momentKnM: number[];
  deflectionMm: number[];
};

type FrameSummary = {
  allowableMm: number;
  maxDisplacementMm: number;
  maxVerticalMm: number;
  maxRotationDeg: number;
  maxMomentKnM: number;
  maxDisplacementNodeId: string | null;
  status: string;
  statusCode: "PASS";
  method: string;
};

type FrameCaseResult = {
  id: string;
  title: string;
  summary: FrameSummary;
  nodeResults: FrameNodeResult[];
  memberResults: FrameMemberResult[];
  memberDiagrams: FrameMemberDiagram[];
};

const FRAME_MULTI_CASE_TEXT = [
  "N,1,0,0",
  "N,2,6,0",
  "N,3,0,4",
  "N,4,6,4",
  "NSUPT,1,6,0",
  "NSUPT,2,4,0",
  "E,1,3,1,1,1,1,1,1",
  "E,3,4,1,1,1,1,1,1",
  "E,2,4,1,1,1,1,1,1",
  "CASE,DL,恒载",
  "CASELOAD,DL,DLOAD,2,-12,-12,global_y,0,1",
  "CASE,TL,温度",
  "CASELOAD,TL,TLOAD,2,25",
].join("\n");

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

async function openFrameWorkbench(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto("/");
  await stabilizeWorkbench(page);
  const frameCanvas = page.locator('svg[data-model-canvas="frame"]');
  if (!(await frameCanvas.isVisible())) {
    await page.getByRole("button", { name: /平面框架-1\s+(平面框架|框架)/ }).click();
  }
  await expect(frameCanvas).toBeVisible();
}

async function importFrameTextModel(page: Page, text: string) {
  await page.getByRole("tab", { name: "文本", exact: true }).click();
  await page.getByLabel("平面框架文本模型").fill(text);
  await page.getByRole("button", { name: "检查文本模型" }).click();
  await expect(page.getByText(/检查通过/)).toBeVisible();
  await page.getByRole("button", { name: "应用文本模型" }).click();
  await expect(page.locator('[data-canvas-mode="frame"][data-canvas-type="member"][data-canvas-id="M2"]')).toBeVisible();
}

function memberLength(payload: FramePayload, member: { start: string; end: string }) {
  const start = payload.structure.nodes.find((node) => node.id === member.start);
  const end = payload.structure.nodes.find((node) => node.id === member.end);
  if (!start || !end) return 1;
  return Math.hypot(end.x - start.x, end.y - start.y) || 1;
}

function frameCaseResult(payload: FramePayload, loadCase: FrameLoadCase, caseIndex: number): FrameCaseResult {
  const nodes = payload.structure.nodes;
  const members = payload.structure.members;
  const temperatureCase = loadCase.loads.some((load) => load.type === "temperature");
  const nodeResults = nodes.map((node, index) => {
    const uyMm = temperatureCase ? 0.18 + index * 0.06 : index === nodes.length - 1 ? -1.4 : -0.12 * index;
    const uxMm = temperatureCase ? 0.08 * index : 0.16 * index;
    return {
      nodeId: node.id,
      x: node.x,
      y: node.y,
      supportType: node.supportType ?? "free",
      uxMm,
      uyMm,
      rotationDeg: temperatureCase ? 0.01 * index : 0,
      resultantMm: Math.hypot(uxMm, uyMm),
      reactionFxKn: index < 2 ? (temperatureCase ? 1.4 + index : 0.4 + index) : 0,
      reactionFyKn: index < 2 ? (temperatureCase ? 3.5 + index : 8 + index) : 0,
      reactionMzKnM: index === 0 ? (temperatureCase ? 2.5 : 4) : 0,
    };
  });
  const memberResults = members.map((member, index) => ({
    memberId: member.id,
    kind: member.kind ?? "member",
    startNode: member.start,
    endNode: member.end,
    axialStartKn: (temperatureCase ? 4 : 10) + index + caseIndex,
    shearStartKn: (temperatureCase ? 1.5 : 6) + index,
    momentStartKnM: (temperatureCase ? 3 : 14) + index,
    axialEndKn: -((temperatureCase ? 4 : 10) + index + caseIndex),
    shearEndKn: -((temperatureCase ? 1.5 : 6) + index),
    momentEndKnM: -((temperatureCase ? 3 : 14) + index),
    maxAbsAxialKn: (temperatureCase ? 4 : 10) + index + caseIndex,
    maxAbsShearKn: (temperatureCase ? 1.5 : 6) + index,
    maxAbsMomentKnM: (temperatureCase ? 3 : 14) + index,
    lengthM: memberLength(payload, member),
  }));
  const memberDiagrams = members.map((member, index) => ({
    memberId: member.id,
    stationsM: [0, memberLength(payload, member) / 2, memberLength(payload, member)],
    stations: [0, 0.5, 1],
    axialKn: temperatureCase ? [2 + index, 3 + index, 2 + index] : [6 + index, 7 + index, 5 + index],
    shearKn: temperatureCase ? [1 + index, 0, -(1 + index)] : [8 + index, 0, -(8 + index)],
    momentKnM: temperatureCase ? [0, 4 + index, 0] : [0, 16 + index, 0],
    deflectionMm: temperatureCase ? [0, 0.25 + index * 0.05, 0] : [0, -(0.6 + index * 0.1), 0],
  }));
  const summary = {
    allowableMm: 20,
    maxDisplacementMm: Math.max(...nodeResults.map((node) => node.resultantMm), 0),
    maxVerticalMm: Math.max(...nodeResults.map((node) => Math.abs(node.uyMm)), 0),
    maxRotationDeg: Math.max(...nodeResults.map((node) => Math.abs(node.rotationDeg)), 0),
    maxMomentKnM: Math.max(...memberResults.map((member) => member.maxAbsMomentKnM), 0),
    maxDisplacementNodeId: nodeResults.at(-1)?.nodeId ?? null,
    status: "合格",
    statusCode: "PASS" as const,
    method: temperatureCase ? "浏览器验收 mock：均匀温差框架杆单元法" : "浏览器验收 mock：二维平面框架杆单元法",
  };
  return { id: loadCase.id, title: loadCase.title, summary, nodeResults, memberResults, memberDiagrams };
}

function frameCalculationEnvelope(payload: FramePayload) {
  expectFramePayloadModelIsConsistent(payload);
  const fallbackCase: FrameLoadCase = { id: "BASE", title: "基本荷载", loads: payload.structure.loads ?? [] };
  const cases = payload.structure.loadCases?.length ? payload.structure.loadCases : [fallbackCase];
  const caseResults = cases.map((loadCase, index) => frameCaseResult(payload, loadCase, index));
  const primary = caseResults[0];
  const loads = payload.structure.loads?.length ? payload.structure.loads : cases[0]?.loads ?? [];
  const nodes = payload.structure.nodes;
  const members = payload.structure.members;
  return {
    success: true,
    operation: "calculate",
    version: "v1",
    analysisType: "frame",
    request: payload,
    model: { analysisType: "frame", structure: payload.structure },
    results: {
      summary: primary.summary,
      preview: {
        analysisType: "frame",
        structureType: "explicit",
        structureTypeLabel: "二维平面框架",
        nodes,
        members,
        loads,
        nodeResults: primary.nodeResults,
        memberResults: primary.memberResults,
        memberDiagrams: primary.memberDiagrams,
        deformedNodes: nodes.map((node, index) => ({ nodeId: node.id, x: node.x + index * 0.01, y: node.y - index * 0.01 })),
        deformationScale: 1,
        summary: primary.summary,
        warnings: [],
      },
      diagram: {},
      nodeResults: primary.nodeResults,
      memberResults: primary.memberResults,
      memberDiagrams: primary.memberDiagrams,
      loadCaseResults: caseResults,
      loadCombinationResults: [],
      nodeIds: nodes.map((node) => node.id),
      memberIds: members.map((member) => member.id),
      series: {
        ux_data: primary.nodeResults.map((node) => node.uxMm),
        uy_data: primary.nodeResults.map((node) => node.uyMm),
        rz_data: primary.nodeResults.map((node) => node.rotationDeg),
        member_axial_data: primary.memberResults.map((member) => member.maxAbsAxialKn),
        member_shear_data: primary.memberResults.map((member) => member.maxAbsShearKn),
        member_moment_data: primary.memberResults.map((member) => member.maxAbsMomentKnM),
      },
    },
    diagnostics: { status: "合格", statusCode: "PASS" },
    errors: [],
  };
}

async function routeFrameCalculate(page: Page, onPayload?: (payload: FramePayload) => void) {
  await page.route("**/api/calculate", async (route) => {
    const payload = route.request().postDataJSON() as FramePayload;
    onPayload?.(payload);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(frameCalculationEnvelope(payload)),
    });
  });
}

function expectUnique(values: string[]) {
  expect(new Set(values).size).toBe(values.length);
}

function expectFramePayloadModelIsConsistent(payload: FramePayload) {
  expect(payload.analysisType).toBe("frame");
  expect(payload.structure.nodes.length).toBeGreaterThan(0);
  expect(payload.structure.members.length).toBeGreaterThan(0);
  const nodeIds = payload.structure.nodes.map((node) => node.id);
  const memberIds = payload.structure.members.map((member) => member.id);
  expectUnique(nodeIds);
  expectUnique(memberIds);

  const nodeIdSet = new Set(nodeIds);
  for (const member of payload.structure.members) {
    expect(nodeIdSet.has(member.start)).toBe(true);
    expect(nodeIdSet.has(member.end)).toBe(true);
  }

  const adjacency = new Map<string, Set<string>>(nodeIds.map((id) => [id, new Set<string>()]));
  for (const member of payload.structure.members) {
    adjacency.get(member.start)?.add(member.end);
    adjacency.get(member.end)?.add(member.start);
  }

  const supportNodeIds = new Set(payload.structure.nodes.filter((node) => node.supportType && node.supportType !== "free").map((node) => node.id));
  const visited = new Set<string>();
  for (const nodeId of nodeIds) {
    if (visited.has(nodeId)) continue;
    const stack = [nodeId];
    const component = new Set<string>();
    while (stack.length) {
      const current = stack.pop()!;
      if (component.has(current)) continue;
      component.add(current);
      visited.add(current);
      for (const next of adjacency.get(current) ?? []) {
        stack.push(next);
      }
    }
    const componentHasMember = payload.structure.members.some((member) => component.has(member.start) || component.has(member.end));
    if (componentHasMember) {
      expect([...component].some((id) => supportNodeIds.has(id))).toBe(true);
    }
  }
}

async function runFrameCalculation(page: Page) {
  await page.getByRole("tab", { name: "结构计算", exact: true }).click();
  await page.getByRole("button", { name: "运行平面框架计算" }).click();
  await expect(page.getByText("平面框架计算完成")).toBeVisible();
}

async function frameCanvasIds(page: Page, type: "node" | "member") {
  return page.locator(`[data-canvas-mode="frame"][data-canvas-type="${type}"]`).evaluateAll((elements) =>
    elements
      .map((element) => (element as HTMLElement).dataset.canvasId)
      .filter((id): id is string => Boolean(id)),
  );
}

async function expectFrameCanvasIntegrity(page: Page) {
  const nodeIds = await frameCanvasIds(page, "node");
  const memberIds = await frameCanvasIds(page, "member");
  expectUnique(nodeIds);
  expectUnique(memberIds);
  return { nodeIds, memberIds };
}

async function expectFrameCanvasSnapshot(page: Page, snapshot: { nodeIds: string[]; memberIds: string[] }) {
  await expect(page.locator('[data-canvas-mode="frame"][data-canvas-type="node"]')).toHaveCount(snapshot.nodeIds.length);
  await expect(page.locator('[data-canvas-mode="frame"][data-canvas-type="member"]')).toHaveCount(snapshot.memberIds.length);
  await expectFrameCanvasIntegrity(page);
}

async function undoWorkspaceEdit(page: Page) {
  await page.getByRole("button", { name: "撤销建模编辑" }).click();
}

async function redoWorkspaceEdit(page: Page) {
  await page.getByRole("button", { name: "重做建模编辑" }).click();
}

async function selectFrameMember(page: Page, memberId: string) {
  const member = page.locator(`[data-canvas-mode="frame"][data-canvas-type="member"][data-canvas-id="${memberId}"]`);
  await expect(member).toBeVisible();
  await member.focus();
  await page.keyboard.press("Enter");
}

async function selectFrameNode(page: Page, nodeId: string) {
  const node = page.locator(`[data-canvas-mode="frame"][data-canvas-type="node"][data-canvas-id="${nodeId}"]`);
  await expect(node).toBeVisible();
  await node.focus();
  await page.keyboard.press("Enter");
}

test("v1.4.0 平面框架多工况可切换普通荷载和均匀温度荷载结果图", async ({ page }) => {
  let capturedPayload: FramePayload | null = null;
  await routeFrameCalculate(page, (payload) => {
    capturedPayload = payload;
    expect(payload.structure.loadCases).toHaveLength(2);
    const distributedCase = payload.structure.loadCases?.find((item) => item.id === "DL");
    const temperatureCase = payload.structure.loadCases?.find((item) => item.id === "TL");
    expect(distributedCase?.loads[0]).toMatchObject({ type: "distributed", member: "M2", qStartKnPerM: -12, qEndKnPerM: -12, direction: "global_y" });
    expect(temperatureCase?.loads[0]).toMatchObject({ type: "temperature", member: "M2", deltaTempC: 25, alphaPerC: 1.2e-5 });
  });
  await openFrameWorkbench(page);
  await importFrameTextModel(page, FRAME_MULTI_CASE_TEXT);
  await runFrameCalculation(page);

  await page.getByRole("button", { name: /恒载\s+工况 DL/ }).click();
  await page.getByRole("button", { name: "受力变形", exact: true }).click();
  await expect(page.locator('[data-result-mode="frame"][data-result-surface="preview"][data-result-label-id="load:0:distributed"]')).toBeVisible();
  await expect(page.locator('[data-result-mode="frame"][data-result-surface="preview"][data-result-label-id="load:0:temperature"]')).toHaveCount(0);

  await page.getByRole("button", { name: /温度\s+工况 TL/ }).click();
  await expect(page.locator('[data-result-mode="frame"][data-result-surface="preview"][data-result-label-id="load:0:temperature"]')).toBeVisible();
  await expect(page.locator('[data-result-mode="frame"][data-result-surface="preview"][data-result-label-id="load:0:distributed"]')).toHaveCount(0);

  await page.getByRole("button", { name: "工程图", exact: true }).click();
  await expect(page.locator('[data-result-mode="frame"][data-result-surface="diagram"]').first()).toBeVisible();
  expect(capturedPayload).not.toBeNull();
});

test("v1.4.0 网格吸附在对象页和表格页坐标编辑中保持同一步距", async ({ page }) => {
  await openFrameWorkbench(page);

  const snapToggle = page.getByRole("button", { name: "开启节点坐标网格吸附" });
  await snapToggle.click();
  await expect(page.getByRole("button", { name: "关闭节点坐标网格吸附" })).toHaveAttribute("aria-pressed", "true");
  const snapStep = page.getByLabel("网格吸附步距（m）");
  await snapStep.fill("0.25");
  await expect(snapStep).toHaveValue("0.25");

  await page.getByRole("tab", { name: "对象", exact: true }).click();
  const objectNodeX = page.locator('#frame-selected-editor input[name="N1-x"]');
  await expect(objectNodeX).toBeVisible();
  await objectNodeX.fill("0.37");
  await objectNodeX.blur();
  await expect(objectNodeX).toHaveValue("0.25");

  await page.getByRole("tab", { name: "表格", exact: true }).click();
  const tableNodeX = page.locator('#frame-custom-nodes input[name="N1-x"]');
  await expect(tableNodeX).toBeVisible();
  await tableNodeX.fill("0.63");
  await tableNodeX.blur();
  await expect(tableNodeX).toHaveValue("0.75");
});

test("v1.4.0 撤销重做覆盖新增节点、连接构件、修改荷载和表格批量编辑", async ({ page }) => {
  await openFrameWorkbench(page);

  const baseline = await expectFrameCanvasIntegrity(page);
  await selectFrameNode(page, "N4");
  await page.getByRole("button", { name: "新增节点并连接" }).click();
  const connectedNode = await expectFrameCanvasIntegrity(page);
  expect(connectedNode.nodeIds.length).toBeGreaterThan(baseline.nodeIds.length);
  expect(connectedNode.memberIds.length).toBeGreaterThan(baseline.memberIds.length);
  await undoWorkspaceEdit(page);
  await expectFrameCanvasSnapshot(page, baseline);
  await redoWorkspaceEdit(page);
  await expectFrameCanvasSnapshot(page, connectedNode);
  await undoWorkspaceEdit(page);
  await expectFrameCanvasSnapshot(page, baseline);

  await page.locator('[data-canvas-mode="frame"][data-canvas-type="node"][data-canvas-id="N1"]').click();
  await page.locator('[data-canvas-mode="frame"][data-canvas-type="node"][data-canvas-id="N4"]').click({ modifiers: ["Control"] });
  await page.getByRole("button", { name: "连接所选节点" }).click();
  const connectedMember = await expectFrameCanvasIntegrity(page);
  expect(connectedMember.nodeIds.length).toBe(baseline.nodeIds.length);
  expect(connectedMember.memberIds.length).toBeGreaterThan(baseline.memberIds.length);
  await undoWorkspaceEdit(page);
  await expectFrameCanvasSnapshot(page, baseline);
  await redoWorkspaceEdit(page);
  await expectFrameCanvasSnapshot(page, connectedMember);
  await undoWorkspaceEdit(page);
  await expectFrameCanvasSnapshot(page, baseline);

  await page.getByRole("tab", { name: "对象", exact: true }).click();
  await page.locator("#frame-object").getByRole("button").filter({ hasText: /荷载 1/ }).first().click();
  const qStartInput = page.getByLabel("第 1 条荷载起点强度（kN/m）");
  await expect(qStartInput).toBeVisible();
  const originalQStart = await qStartInput.inputValue();
  await qStartInput.fill("-21");
  await expect(qStartInput).toHaveValue("-21");
  await undoWorkspaceEdit(page);
  await expect(qStartInput).toHaveValue(originalQStart);
  await redoWorkspaceEdit(page);
  await expect(qStartInput).toHaveValue("-21");
  await undoWorkspaceEdit(page);
  await expect(qStartInput).toHaveValue(originalQStart);

  await page.getByRole("tab", { name: "表格", exact: true }).click();
  const tableNodeY = page.locator('#frame-custom-nodes input[name="N1-y"]');
  await expect(tableNodeY).toBeVisible();
  const originalNodeY = await tableNodeY.inputValue();
  await tableNodeY.fill("0.4");
  await tableNodeY.blur();
  await expect(tableNodeY).toHaveValue("0.4");
  await undoWorkspaceEdit(page);
  await expect(tableNodeY).toHaveValue(originalNodeY);
  await redoWorkspaceEdit(page);
  await expect(tableNodeY).toHaveValue("0.4");
});

test("v1.4.0 复制镜像阵列后的框架模型可撤销重做且求解请求保持拓扑一致", async ({ page }) => {
  let capturedPayload: FramePayload | null = null;
  await routeFrameCalculate(page, (payload) => {
    capturedPayload = payload;
    expectFramePayloadModelIsConsistent(payload);
  });
  await openFrameWorkbench(page);

  const baseline = await expectFrameCanvasIntegrity(page);
  await selectFrameMember(page, "C1");
  await expect(page.getByRole("button", { name: "复制当前几何对象" })).toBeEnabled();
  await page.getByRole("button", { name: "复制当前几何对象" }).click();

  const copied = await expectFrameCanvasIntegrity(page);
  expect(copied.nodeIds.length).toBeGreaterThan(baseline.nodeIds.length);
  expect(copied.memberIds.length).toBeGreaterThan(baseline.memberIds.length);

  await undoWorkspaceEdit(page);
  await expectFrameCanvasSnapshot(page, baseline);

  await redoWorkspaceEdit(page);
  await expectFrameCanvasSnapshot(page, copied);

  await page.getByRole("button", { name: "按 X 轴镜像当前几何对象" }).click();
  const mirrored = await expectFrameCanvasIntegrity(page);
  expect(mirrored.memberIds.length).toBeGreaterThan(copied.memberIds.length);

  await page.getByRole("button", { name: "沿 X 向生成阵列副本" }).click();
  const arrayed = await expectFrameCanvasIntegrity(page);
  expect(arrayed.memberIds.length).toBeGreaterThan(mirrored.memberIds.length);

  await runFrameCalculation(page);
  expect(capturedPayload).not.toBeNull();
});
