import type { FrameLoad } from "../types/structure.ts";
import { parseTextModelNumber, prefixTextModelId } from "./text-model-utils.ts";

const toNumber = (value: string | undefined) => parseTextModelNumber(value, { stripParentheses: true });
const nodeId = (value: string | undefined, fallback: string) => prefixTextModelId(value, fallback, "N");
const memberId = (value: string | undefined, fallback: string) => prefixTextModelId(value, fallback, "M", { preserveAnyLeadingAlpha: true });

function parseNodalLoad(tokens: string[]): FrameLoad | null {
  if (tokens[0].toUpperCase() === "LOAD" && tokens.length >= 5) {
    return {
      type: "nodal",
      node: nodeId(tokens[1], "N1"),
      fxKn: toNumber(tokens[2]) ?? 0,
      fyKn: toNumber(tokens[3]) ?? 0,
      mzKnM: toNumber(tokens[4]) ?? 0,
    };
  }

  const type = toNumber(tokens[2]) ?? 1;
  const size = toNumber(tokens[3]) ?? 0;
  if (Math.abs(type) === 2) {
    return {
      type: "nodal",
      node: nodeId(tokens[1], "N1"),
      fxKn: 0,
      fyKn: 0,
      mzKnM: type >= 0 ? size : -size,
    };
  }

  const directionDeg = toNumber(tokens[4]) ?? 0;
  const factor = type >= 0 ? 1 : -1;
  const rad = directionDeg * Math.PI / 180;
  return {
    type: "nodal",
    node: nodeId(tokens[1], "N1"),
    fxKn: Number((factor * size * Math.cos(rad)).toFixed(6)),
    fyKn: Number((factor * size * Math.sin(rad)).toFixed(6)),
    mzKnM: 0,
  };
}

function parseDistributedLoad(tokens: string[]): FrameLoad | null {
  if (tokens[0].toUpperCase() === "DLOAD") {
    const startRatio = toNumber(tokens[5]) ?? 0;
    const endRatio = toNumber(tokens[6]) ?? 1;
    return {
      type: "distributed",
      member: memberId(tokens[1], "M1"),
      qStartKnPerM: toNumber(tokens[2]) ?? 0,
      qEndKnPerM: toNumber(tokens[3]) ?? toNumber(tokens[2]) ?? 0,
      direction: tokens[4] === "global_y" ? "global_y" : "local_y",
      startRatio: Math.min(1, Math.max(0, startRatio)),
      endRatio: Math.min(1, Math.max(0, endRatio)),
    };
  }

  const loadType = toNumber(tokens[2]) ?? 3;
  if (Math.abs(loadType) !== 3) {
    return null;
  }
  const size = toNumber(tokens[3]) ?? 0;
  const directionDeg = toNumber(tokens[6]);
  return {
    type: "distributed",
    member: memberId(tokens[1], "M1"),
    qStartKnPerM: loadType >= 0 ? size : -size,
    qEndKnPerM: loadType >= 0 ? size : -size,
    direction: directionDeg !== null && Math.abs(Math.abs(directionDeg) - 90) < 1e-9 ? "global_y" : "local_y",
    startRatio: 0,
    endRatio: 1,
  };
}

function parseMemberPointLoad(tokens: string[]): FrameLoad {
  return {
    type: "member_point",
    member: memberId(tokens[1], "M1"),
    forceKn: toNumber(tokens[2]) ?? 0,
    positionRatio: Math.min(1, Math.max(0, toNumber(tokens[3]) ?? 0.5)),
    direction: tokens[4] === "global_y" ? "global_y" : "local_y",
  };
}

export function parseFrameTextLoad(tokens: string[]): FrameLoad | null {
  const command = tokens[0]?.toUpperCase();
  if (command === "NLOAD" || command === "LOAD") {
    return parseNodalLoad(tokens);
  }
  if (command === "ELOAD" || command === "DLOAD") {
    return parseDistributedLoad(tokens);
  }
  if (command === "PLOAD" || command === "MLOAD") {
    return parseMemberPointLoad(tokens);
  }
  return null;
}

export function isFrameTextLoadReferenceValid(load: FrameLoad, nodeIds: Set<string>, memberIds: Set<string>): boolean {
  if (load.type === "nodal") {
    return nodeIds.has(load.node);
  }
  return memberIds.has(load.member);
}

function nodalLoadLines(load: Extract<FrameLoad, { type: "nodal" }>, nodeNumbers: Map<string, number>): string[] {
  const node = nodeNumbers.get(load.node) ?? 1;
  const lines: string[] = [];
  const fx = load.fxKn ?? 0;
  const fy = load.fyKn ?? 0;
  const mz = load.mzKnM ?? 0;
  const force = Math.hypot(fx, fy);
  if (force > 1e-9) {
    const angle = Math.atan2(fy, fx) * 180 / Math.PI;
    lines.push(`NLOAD,${node},1,${Number(force.toFixed(6))},${Number(angle.toFixed(6))}`);
  }
  if (Math.abs(mz) > 1e-9) {
    lines.push(`NLOAD,${node},${mz >= 0 ? 2 : -2},${Math.abs(mz)}`);
  }
  return lines;
}

export function serializeFrameTextLoad(load: FrameLoad, nodeNumbers: Map<string, number>, memberNumbers: Map<string, number>): string[] {
  if (load.type === "nodal") {
    return nodalLoadLines(load, nodeNumbers);
  }
  if (load.type === "member_point") {
    return [`PLOAD,${memberNumbers.get(load.member) ?? 1},${load.forceKn ?? 0},${load.positionRatio ?? 0.5},${load.direction ?? "local_y"}`];
  }
  return [`DLOAD,${memberNumbers.get(load.member) ?? 1},${load.qStartKnPerM ?? load.wyKnPerM ?? 0},${load.qEndKnPerM ?? load.wyKnPerM ?? 0},${load.direction ?? "local_y"},${load.startRatio ?? 0},${load.endRatio ?? 1}`];
}
