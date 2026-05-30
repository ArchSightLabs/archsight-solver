import assert from "node:assert/strict";
import test from "node:test";
import { parseTrussTextModel, serializeTrussTextModel } from "./truss-text-model.ts";

test("parseTrussTextModel imports nodes members and nodal loads", () => {
  const result = parseTrussTextModel(`
NODE,N1,0,0,pinned
NODE,N2,6,0,roller
NODE,N3,3,3,free
MEMBER,M1,N1,N3,210,24,upper_chord
MEMBER,M2,N3,N2,210,24,upper_chord
LOAD,N3,0,-50
`);

  assert.ok(result.collections);
  assert.equal(result.collections?.nodes.length, 3);
  assert.equal(result.collections?.members.length, 2);
  assert.deepEqual(result.collections?.loads, [{ type: "nodal", node: "N3", fxKn: 0, fyKn: -50 }]);
});

test("serializeTrussTextModel emits importable text", () => {
  const collections = parseTrussTextModel(`
NODE,N1,0,0,pinned
NODE,N2,4,0,roller
MEMBER,M1,N1,N2,210,24,generic
LOAD,N2,0,-10
`).collections!;

  const result = parseTrussTextModel(serializeTrussTextModel(collections));

  assert.ok(result.collections);
  assert.equal(result.collections?.members[0]?.start, "N1");
  const load = result.collections?.loads[0];
  assert.equal(load?.type, "nodal");
  assert.equal(load?.type === "nodal" ? load.node : "", "N2");
});

test("parseTrussTextModel maps legacy fixed support to pinned", () => {
  const result = parseTrussTextModel(`
NODE,N1,0,0,fixed
NODE,N2,4,0,roller
MEMBER,M1,N1,N2,210,24,generic
`);

  assert.ok(result.collections);
  assert.equal(result.collections?.nodes[0]?.supportType, "pinned");
});

test("parseTrussTextModel reports ignored invalid references for preview blocking", () => {
  const result = parseTrussTextModel(`
NODE,N1,0,0,pinned
NODE,N2,4,0,roller
MEMBER,M1,N1,N3,210,24,generic
LOAD,N3,0,-10
`);

  assert.ok(result.collections);
  assert.equal(result.collections.members.length, 0);
  assert.equal(result.collections.loads.length, 0);
  assert.match(result.diagnostics.join("\n"), /已忽略/u);
});
