import assert from "node:assert/strict";
import test from "node:test";

import { resultTabsForMode } from "./workbench-result-model.ts";

function tabDescription(mode: Parameters<typeof resultTabsForMode>[0], tabId: string): string {
  return resultTabsForMode(mode).find((tab) => tab.id === tabId)?.description ?? "";
}

test("结果页标签明确区分模型叠加工程图和数据曲线", () => {
  assert.match(tabDescription("beam", "diagrams"), /模型叠加工程图/u);
  assert.match(tabDescription("frame", "diagrams"), /模型叠加工程图/u);
  assert.match(tabDescription("truss", "diagrams"), /模型叠加工程图/u);

  assert.match(tabDescription("frame", "curves"), /节点序列/u);
  assert.match(tabDescription("truss", "curves"), /节点与杆件序列/u);
});

test("平面桁架结果页不把工程图描述成弯矩或剪力图", () => {
  const trussDescriptions = resultTabsForMode("truss").map((tab) => tab.description).join("\n");

  assert.doesNotMatch(trussDescriptions, /弯矩|剪力/u);
  assert.match(tabDescription("truss", "diagrams"), /杆件轴力和节点位移/u);
});

test("结果页结构预览说明沿用各分析对象的共享对象词表口径", () => {
  assert.equal(tabDescription("beam", "preview"), "查看支座、跨段、荷载和挠度形态");
  assert.equal(tabDescription("frame", "preview"), "查看节点、构件、支座节点、荷载、编号与变形");
  assert.equal(tabDescription("truss", "preview"), "查看节点、杆件、支座节点、荷载、编号与变形");
  assert.doesNotMatch(
    ["beam", "truss", "frame"].map((mode) => tabDescription(mode as Parameters<typeof resultTabsForMode>[0], "preview")).join("\n"),
    /节点、(?:杆件|构件)、支座、/u,
  );
});
