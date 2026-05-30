import type { TrussLoad, TrussMember, TrussNode } from "../types/structure.ts";
import { parseTextModelNumber, splitTextModelTokens } from "./text-model-utils.ts";

export interface TrussTextCollections {
  nodes: TrussNode[];
  members: TrussMember[];
  loads: TrussLoad[];
}

export interface TrussTextParseResult {
  collections: TrussTextCollections | null;
  diagnostics: string[];
}

const splitTokens = splitTextModelTokens;
const toNumber = parseTextModelNumber;

function supportType(value: string | undefined): TrussNode["supportType"] {
  const normalized = String(value ?? "free").toLowerCase();
  if (["pinned", "pin", "铰接", "铰支", "铰支座"].includes(normalized)) return "pinned";
  if (["roller", "roll", "滚动", "滚动支座", "滑动"].includes(normalized)) return "roller";
  return "free";
}

export function parseTrussTextModel(text: string): TrussTextParseResult {
  const diagnostics: string[] = [];
  const nodes: TrussNode[] = [];
  const members: TrussMember[] = [];
  const loads: TrussLoad[] = [];

  for (const [lineIndex, line] of text.split(/\r?\n/u).entries()) {
    const tokens = splitTokens(line);
    if (tokens.length === 0) continue;
    const command = tokens[0].toUpperCase();

    if (command === "NODE" || command === "N" || command === "节点") {
      const x = toNumber(tokens[2]);
      const y = toNumber(tokens[3]);
      if (x === null || y === null) {
        diagnostics.push(`第 ${lineIndex + 1} 行：节点坐标必须为数字。`);
        continue;
      }
      nodes.push({ id: tokens[1] || `N${nodes.length + 1}`, x, y, supportType: supportType(tokens[4]) });
      continue;
    }

    if (command === "MEMBER" || command === "M" || command === "杆件") {
      members.push({
        id: tokens[1] || `M${members.length + 1}`,
        start: tokens[2] || "N1",
        end: tokens[3] || "N2",
        elementType: "truss",
        E_GPa: toNumber(tokens[4]) ?? 210,
        A_cm2: toNumber(tokens[5]) ?? 24,
        kind: tokens[6] || "generic",
      });
      continue;
    }

    if (command === "LOAD" || command === "荷载") {
      loads.push({ type: "nodal", node: tokens[1] || "N1", fxKn: toNumber(tokens[2]) ?? 0, fyKn: toNumber(tokens[3]) ?? 0 });
      continue;
    }

    diagnostics.push(`第 ${lineIndex + 1} 行：未识别的桁架文本命令 ${tokens[0]}。`);
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const validMembers = members.filter((member) => nodeIds.has(member.start) && nodeIds.has(member.end) && member.start !== member.end);
  const validLoads = loads.filter((load) => load.type === "nodal" && nodeIds.has(load.node));
  if (validMembers.length !== members.length) diagnostics.push("已忽略起止节点不存在或两端相同的杆件。");
  if (validLoads.length !== loads.length) diagnostics.push("已忽略引用不存在节点的荷载。");
  if (nodes.length < 2) return { collections: null, diagnostics: ["桁架文本模型至少需要 2 个节点。", ...diagnostics] };

  return { collections: { nodes, members: validMembers, loads: validLoads }, diagnostics };
}

export function serializeTrussTextModel(collections: TrussTextCollections): string {
  return [
    "# ArchSight 平面桁架文本模型",
    "# NODE,节点号,x,y,支座类型（pinned=铰支座；roller=滚动支座；free=自由节点）",
    ...collections.nodes.map((node) => `NODE,${node.id},${node.x},${node.y},${node.supportType ?? "free"}`),
    "",
    "# MEMBER,杆件号,起点,终点,E_GPa,A_cm2,类型",
    ...collections.members.map((member) => `MEMBER,${member.id},${member.start},${member.end},${member.E_GPa},${member.A_cm2},${member.kind ?? "generic"}`),
    "",
    "# LOAD,节点号,Fx_kN,Fy_kN",
    ...collections.loads.flatMap((load) => load.type === "nodal" ? [`LOAD,${load.node},${load.fxKn ?? 0},${load.fyKn ?? 0}`] : []),
  ].join("\n");
}
