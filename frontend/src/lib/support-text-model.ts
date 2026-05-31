import type { BeamSupportDof, BeamSupportType } from "../types/beam.ts";
import type { StructureNode, TrussSupportType } from "../types/structure.ts";
import { parseTextModelNumericCode } from "./text-model-utils.ts";

const FIXED_ALIASES = ["fixed", "fix", "固结", "固结支座", "固定", "固定支座", "刚接"] as const;
const PINNED_ALIASES = ["pinned", "pin", "hinge", "铰接", "铰支", "铰支座"] as const;
const ROLLER_ALIASES = ["roller", "roll", "滑动", "滚动", "滚动支座"] as const;
const FREE_ALIASES = ["free", "自由", "自由节点"] as const;

function normalizeTextSupportToken(value: string | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function matchesAlias(value: string, aliases: readonly string[]): boolean {
  return aliases.includes(value);
}

export function parseBeamTextSupportType(value: string | undefined): BeamSupportType | null {
  const normalized = normalizeTextSupportToken(value);
  if (matchesAlias(normalized, FIXED_ALIASES)) return "fixed";
  if (matchesAlias(normalized, PINNED_ALIASES)) return "pinned";
  if (matchesAlias(normalized, ROLLER_ALIASES)) return "roller";
  if (matchesAlias(normalized, FREE_ALIASES)) return "free";
  return null;
}

export function beamTextSupportConstraintsForType(type: BeamSupportType): BeamSupportDof[] {
  if (type === "fixed") return ["v", "rz"];
  if (type === "pinned" || type === "roller") return ["v"];
  return [];
}

export function parseFrameTextSupportType(
  value: string | undefined,
  fallback: StructureNode["supportType"] = "free",
): StructureNode["supportType"] {
  const normalized = normalizeTextSupportToken(value);
  if (!normalized) return fallback;
  if (matchesAlias(normalized, FIXED_ALIASES)) return "fixed";
  if (matchesAlias(normalized, PINNED_ALIASES)) return "pinned";
  if (matchesAlias(normalized, ROLLER_ALIASES)) return "roller";
  if (matchesAlias(normalized, FREE_ALIASES)) return "free";

  const code = parseTextModelNumericCode(normalized);
  if (code === 6) return "fixed";
  if (code === 4) return "pinned";
  if (code === 0) return "free";
  return fallback;
}

export function parseTrussTextSupportType(value: string | undefined): TrussSupportType {
  const normalized = normalizeTextSupportToken(value);
  if (matchesAlias(normalized, FIXED_ALIASES) || matchesAlias(normalized, PINNED_ALIASES)) return "pinned";
  if (matchesAlias(normalized, ROLLER_ALIASES)) return "roller";
  return "free";
}
