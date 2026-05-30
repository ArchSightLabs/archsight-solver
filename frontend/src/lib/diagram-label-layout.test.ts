import test from "node:test";
import assert from "node:assert/strict";

import {
  estimateDiagramTextWidth,
  labelCandidatesAroundPoint,
  overlapDiagramRects,
  placeDiagramLabel,
  placeDiagramLabels,
  type DiagramLabelBlocker,
} from "./diagram-label-layout.ts";

const bounds = { left: 0, top: 0, right: 240, bottom: 160 };

test("estimateDiagramTextWidth gives CJK labels enough width", () => {
  assert.ok(estimateDiagramTextWidth("节点 N1", 12) > estimateDiagramTextWidth("N1", 12));
  assert.ok(estimateDiagramTextWidth("节点 N1", 12) < 80);
});

test("placeDiagramLabel selects a non-overlapping candidate", () => {
  const blockers: DiagramLabelBlocker[] = [{ left: 110, top: 50, right: 170, bottom: 90, weight: 20 }];
  const placed = placeDiagramLabel({
    anchor: { x: 100, y: 80 },
    lines: [{ text: "42.9 kN·m", fontSize: 12 }],
    candidates: [
      { dx: 18, dy: -8, textAnchor: "start", verticalAnchor: "middle" },
      { dx: -18, dy: -8, textAnchor: "end", verticalAnchor: "middle" },
    ],
    blockers,
    bounds,
  });

  assert.ok(placed.rect.right <= 100);
});

test("placeDiagramLabels lets higher priority labels reserve space first", () => {
  const placed = placeDiagramLabels(
    [
      {
        id: "dimension",
        anchor: { x: 20, y: 20 },
        lines: [{ text: "B1=6 m", fontSize: 12 }],
        candidates: [{ dx: 0, dy: 0, textAnchor: "start", verticalAnchor: "top" }],
        priority: 100,
        occupiedWeight: 20,
      },
      {
        id: "node",
        anchor: { x: 24, y: 24 },
        lines: [{ text: "N3", fontSize: 11 }],
        candidates: labelCandidatesAroundPoint(12),
        priority: 90,
      },
    ],
    { bounds },
  );

  assert.equal(placed[0]?.id, "dimension");
  assert.equal(placed[1]?.id, "node");
  assert.equal(overlapDiagramRects(placed[0].rect, placed[1].rect), 0);
});
