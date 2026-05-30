import assert from "node:assert/strict";
import test from "node:test";

import {
  addControlCallout,
  addDimensionLegend,
  buildReportStructureLayout,
  type ReportGraphic,
} from "./report-structure-graphics.ts";

test("计算书结构图布局保持模型方向并留出票头空间", () => {
  const layout = buildReportStructureLayout([
    { id: "N1", x: 0, y: 0 },
    { id: "N2", x: 6, y: 4 },
  ]);

  const leftBottom = layout.map({ x: 0, y: 0 });
  const rightTop = layout.map({ x: 6, y: 4 });

  assert.ok(leftBottom.x < rightTop.x);
  assert.ok(leftBottom.y > rightTop.y);
  assert.ok(layout.bounds.top >= 132);
  assert.ok(layout.center.x > layout.bounds.left && layout.center.x < layout.bounds.right);
});

test("计算书控制值标注限制在图面可读范围内", () => {
  const graphics: ReportGraphic[] = [];

  addControlCallout(graphics, {
    point: { x: 890, y: 10 },
    text: "42.00 kN·m\nB1 / 3.00 m",
    color: "#dc2626",
  });

  assert.equal(graphics.length, 3);
  assert.deepEqual(graphics[2], {
    type: "text",
    left: 715,
    top: 74,
    style: {
      text: "42.00 kN·m\nB1 / 3.00 m",
      fill: "#dc2626",
      fontSize: 13,
      fontWeight: 700,
      lineHeight: 17,
      stroke: "#ffffff",
      lineWidth: 4,
    },
  });
});

test("计算书尺寸说明按固定行距写入图面", () => {
  const graphics: ReportGraphic[] = [];

  addDimensionLegend(graphics, ["C1=C2=4m", "B1=6m"]);

  assert.equal(graphics.length, 2);
  assert.equal(graphics[0]?.type, "text");
  assert.equal(graphics[0]?.top, 74);
  assert.equal(graphics[1]?.top, 91);
});
