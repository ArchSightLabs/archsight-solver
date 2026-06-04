import assert from "node:assert/strict";
import test from "node:test";
import {
  frameSupportDisplacementOptions,
  normalizeFrameSupportDisplacements,
  updateFrameSupportDisplacement,
} from "./frame-support-displacements.ts";

test("frameSupportDisplacementOptions exposes only constrained support dofs", () => {
  assert.deepEqual(frameSupportDisplacementOptions({ supportType: "fixed" }).map((option) => option.dof), ["ux", "uy", "rz"]);
  assert.deepEqual(frameSupportDisplacementOptions({ supportType: "pinned" }).map((option) => option.dof), ["ux", "uy"]);
  assert.deepEqual(frameSupportDisplacementOptions({ supportType: "roller" }).map((option) => option.dof), ["uy"]);
  assert.deepEqual(frameSupportDisplacementOptions({ supportType: "roller", supportAngleDeg: 45 }).map((option) => option.dof), ["n"]);
  assert.deepEqual(frameSupportDisplacementOptions({ supportType: "free" }).map((option) => option.dof), []);
});

test("normalizeFrameSupportDisplacements filters released dofs and duplicates", () => {
  assert.deepEqual(
    normalizeFrameSupportDisplacements({
      supportType: "pinned",
      supportDisplacements: [
        { dof: "uy", displacementMm: -2 },
        { dof: "rz", rotationDeg: 1 },
        { dof: "uy", displacementMm: -3 },
      ],
    }),
    [{ dof: "uy", displacementMm: -2 }],
  );

  assert.deepEqual(
    normalizeFrameSupportDisplacements({
      supportType: "roller",
      supportAngleDeg: 30,
      supportDisplacements: [
        { dof: "uy", displacementMm: -2 },
        { dof: "n", displacementMm: -1.5 },
      ],
    }),
    [{ dof: "n", displacementMm: -1.5 }],
  );
});

test("updateFrameSupportDisplacement switches units when dof changes", () => {
  assert.deepEqual(updateFrameSupportDisplacement({ dof: "uy", displacementMm: -2 }, { dof: "rz" }), { dof: "rz", rotationDeg: -2 });
  assert.deepEqual(updateFrameSupportDisplacement({ dof: "rz", rotationDeg: 0.25 }, { dof: "ux" }), { dof: "ux", displacementMm: 0.25 });
});
