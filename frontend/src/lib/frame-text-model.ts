import type { FrameLoad, FrameLoadCase, FrameLoadCombination, StructureMember, StructureNode } from "../types/structure.ts";

export interface FrameTextCollections {
  nodes: StructureNode[];
  members: StructureMember[];
  loads: FrameLoad[];
  loadCases?: FrameLoadCase[];
  loadCombinations?: FrameLoadCombination[];
}

export interface FrameTextParseResult {
  collections: FrameTextCollections | null;
  diagnostics: string[];
}

const DEFAULT_MEMBER: Pick<StructureMember, "E_GPa" | "A_cm2" | "I_cm4" | "kind"> = {
  E_GPa: 210,
  A_cm2: 120,
  I_cm4: 8000,
  kind: "generic",
};

function cleanLine(line: string): string {
  return line
    .replace(/\/\/.*$/u, "")
    .replace(/#.*$/u, "")
    .replace(/！.*$/u, "")
    .trim();
}

function splitTokens(line: string): string[] {
  return cleanLine(line)
    .split(/[,\s，]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  const normalized = value.replace(/[（）()]/gu, "");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function numericCode(value: string): number | null {
  const match = value.trim().match(/-?\d+/u);
  if (!match) {
    return null;
  }
  const next = Number(match[0]);
  return Number.isFinite(next) ? next : null;
}

function nodeId(value: string | undefined, fallback: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return fallback;
  }
  if (/^N/i.test(raw)) {
    return raw.toUpperCase();
  }
  return `N${raw}`;
}

function memberId(value: string | undefined, fallback: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return fallback;
  }
  if (/^[A-Z]/iu.test(raw)) {
    return raw.toUpperCase();
  }
  return `M${raw}`;
}

function uniqueId(base: string, used: Set<string>): string {
  let candidate = base.trim() || "ID";
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function supportType(value: string | undefined, fallback: StructureNode["supportType"] = "free"): StructureNode["supportType"] {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["fixed", "fix", "固结", "固结支座", "固定", "固定支座", "刚接"].includes(normalized)) {
    return "fixed";
  }
  if (["pinned", "pin", "hinge", "铰接", "铰支", "铰支座"].includes(normalized)) {
    return "pinned";
  }
  if (["roller", "roll", "滑动", "滚动", "滚动支座"].includes(normalized)) {
    return "roller";
  }
  if (["free", "自由", "自由节点"].includes(normalized)) {
    return "free";
  }

  const code = numericCode(normalized);
  if (code === 6) {
    return "fixed";
  }
  if (code === 4) {
    return "pinned";
  }
  if (code === 0) {
    return "free";
  }
  return fallback;
}

function defaultMember(id: string, start: string, end: string, patch: Partial<StructureMember> = {}): StructureMember {
  return {
    id,
    start,
    end,
    elementType: "frame",
    E_GPa: DEFAULT_MEMBER.E_GPa,
    A_cm2: DEFAULT_MEMBER.A_cm2,
    I_cm4: DEFAULT_MEMBER.I_cm4,
    kind: DEFAULT_MEMBER.kind,
    ...patch,
  };
}

function getNumberedMember(members: StructureMember[], value: string): StructureMember | undefined {
  const code = numericCode(value);
  if (code !== null) {
    return members[code - 1];
  }
  const id = memberId(value, value);
  return members.find((member) => member.id === id);
}

function nodeMap(nodes: StructureNode[]): Map<string, StructureNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

function applyEChar(member: StructureMember, ea: number, ei: number): StructureMember {
  const eNPerMm2 = Math.max(member.E_GPa || DEFAULT_MEMBER.E_GPa, 1) * 1000;
  return {
    ...member,
    A_cm2: Math.max(ea / eNPerMm2 / 100, 0),
    I_cm4: Math.max(ei / eNPerMm2 / 10000, 0),
  };
}

function inferMemberKind(start: StructureNode | undefined, end: StructureNode | undefined): string {
  if (!start || !end) {
    return "generic";
  }
  if (Math.abs(start.x - end.x) < 1e-9) {
    return "column";
  }
  if (Math.abs(start.y - end.y) < 1e-9) {
    return "beam";
  }
  return "brace";
}

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

function parseLoadTokens(tokens: string[]): FrameLoad | null {
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

function isLoadReferenceValid(load: FrameLoad, nodeIds: Set<string>, memberIds: Set<string>): boolean {
  if (load.type === "nodal") {
    return nodeIds.has(load.node);
  }
  return memberIds.has(load.member);
}

export function parseFrameTextModel(text: string): FrameTextParseResult {
  const diagnostics: string[] = [];
  const rawNodes: StructureNode[] = [];
  const members: StructureMember[] = [];
  const loads: FrameLoad[] = [];
  const loadCases: FrameLoadCase[] = [];
  const loadCombinations: FrameLoadCombination[] = [];
  const seenNodes = new Set<string>();
  const seenMembers = new Set<string>();
  const seenLoadCases = new Set<string>();
  const seenLoadCombinations = new Set<string>();

  const lines = text.split(/\r?\n/u);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const tokens = splitTokens(lines[lineIndex] ?? "");
    if (tokens.length === 0) {
      continue;
    }
    const command = tokens[0].toUpperCase();

    if (command === "N" || command === "NODE" || command === "结点" || command === "节点") {
      const offset = command === "NODE" || command === "结点" || command === "节点" ? 1 : 1;
      const id = uniqueId(nodeId(tokens[offset], `N${rawNodes.length + 1}`), seenNodes);
      const x = toNumber(tokens[offset + 1]) ?? 0;
      const y = toNumber(tokens[offset + 2]) ?? 0;
      rawNodes.push({ id, x, y, supportType: supportType(tokens[offset + 3], "free") });
      continue;
    }

    if (command === "NGEN") {
      const count = Math.max(toNumber(tokens[1]) ?? 0, 0);
      const nodeIncrement = toNumber(tokens[2]) ?? 0;
      const startCode = toNumber(tokens[3]) ?? 0;
      const endCode = toNumber(tokens[4]) ?? startCode;
      const baseIncrement = Math.max(toNumber(tokens[5]) ?? 1, 1);
      const dx = toNumber(tokens[6]) ?? 0;
      const dy = toNumber(tokens[7]) ?? 0;
      const existing = nodeMap(rawNodes);
      for (let repeat = 1; repeat <= count; repeat += 1) {
        for (let code = startCode; code <= endCode; code += baseIncrement) {
          const base = existing.get(nodeId(String(code), `N${code}`));
          if (!base) {
            diagnostics.push(`第 ${lineIndex + 1} 行：NGEN 引用了不存在的基础节点 ${code}。`);
            continue;
          }
          const nextCode = code + repeat * nodeIncrement;
          const id = uniqueId(nodeId(String(nextCode), `N${nextCode}`), seenNodes);
          rawNodes.push({ ...base, id, x: base.x + repeat * dx, y: base.y + repeat * dy });
        }
      }
      continue;
    }

    if (command === "E" || command === "EL" || command === "ELEMENT") {
      const start = nodeId(tokens[1], "N1");
      const end = nodeId(tokens[2], "N2");
      const id = uniqueId(`M${members.length + 1}`, seenMembers);
      const startRelease = tokens[5] === "0" ? ["rz" as const] : undefined;
      const endRelease = tokens[8] === "0" ? ["rz" as const] : undefined;
      const nodeLookup = nodeMap(rawNodes);
      members.push(defaultMember(id, start, end, {
        kind: inferMemberKind(nodeLookup.get(start), nodeLookup.get(end)),
        endReleases: startRelease || endRelease ? { start: startRelease, end: endRelease } : undefined,
      }));
      continue;
    }

    if (command === "MEMBER" || command === "M") {
      const id = uniqueId(memberId(tokens[1], `M${members.length + 1}`), seenMembers);
      const start = nodeId(tokens[2], "N1");
      const end = nodeId(tokens[3], "N2");
      const nodeLookup = nodeMap(rawNodes);
      members.push(defaultMember(id, start, end, {
        kind: tokens[4] ?? inferMemberKind(nodeLookup.get(start), nodeLookup.get(end)),
        E_GPa: toNumber(tokens[5]) ?? DEFAULT_MEMBER.E_GPa,
        A_cm2: toNumber(tokens[6]) ?? DEFAULT_MEMBER.A_cm2,
        I_cm4: toNumber(tokens[7]) ?? DEFAULT_MEMBER.I_cm4,
      }));
      continue;
    }

    if (command === "EGEN") {
      const count = Math.max(toNumber(tokens[1]) ?? 0, 0);
      const startMember = Math.max(toNumber(tokens[2]) ?? 1, 1);
      const endMember = Math.max(toNumber(tokens[3]) ?? startMember, startMember);
      const nodeIncrement = toNumber(tokens[4]) ?? 0;
      for (let repeat = 1; repeat <= count; repeat += 1) {
        for (let index = startMember; index <= endMember; index += 1) {
          const base = members[index - 1];
          if (!base) {
            diagnostics.push(`第 ${lineIndex + 1} 行：EGEN 引用了不存在的基础单元 ${index}。`);
            continue;
          }
          members.push({
            ...base,
            id: uniqueId(`M${members.length + 1}`, seenMembers),
            start: nodeId(String((numericCode(base.start) ?? 0) + repeat * nodeIncrement), base.start),
            end: nodeId(String((numericCode(base.end) ?? 0) + repeat * nodeIncrement), base.end),
          });
        }
      }
      continue;
    }

    if (command === "NSUPT" || command === "SUPPORT" || command === "支座") {
      const id = nodeId(tokens[1], "N1");
      const node = rawNodes.find((item) => item.id === id);
      if (!node) {
        diagnostics.push(`第 ${lineIndex + 1} 行：支座引用了不存在的节点 ${id}。`);
        continue;
      }
      node.supportType = supportType(tokens[2], "roller");
      const angle = toNumber(tokens[3]);
      node.supportAngleDeg = angle ?? undefined;
      continue;
    }

    if (command === "PROP") {
      const targetStart = getNumberedMember(members, tokens[1] ?? "");
      const usesRange = tokens.length >= 7;
      const targetEnd = usesRange ? getNumberedMember(members, tokens[2] ?? "") : targetStart;
      const startIndex = targetStart ? members.indexOf(targetStart) : -1;
      const endIndex = targetEnd ? members.indexOf(targetEnd) : startIndex;
      if (startIndex < 0 || endIndex < 0) {
        diagnostics.push(`第 ${lineIndex + 1} 行：PROP 引用了不存在的构件。`);
        continue;
      }
      const tokenOffset = usesRange ? 3 : 2;
      for (let index = startIndex; index <= endIndex; index += 1) {
        members[index] = {
          ...members[index],
          E_GPa: toNumber(tokens[tokenOffset]) ?? members[index].E_GPa,
          A_cm2: toNumber(tokens[tokenOffset + 1]) ?? members[index].A_cm2,
          I_cm4: toNumber(tokens[tokenOffset + 2]) ?? members[index].I_cm4,
          kind: tokens[tokenOffset + 3] ?? members[index].kind,
        };
      }
      continue;
    }

    if (command === "ECHAR") {
      const start = getNumberedMember(members, tokens[1] ?? "");
      const end = getNumberedMember(members, tokens[2] ?? "") ?? start;
      const startIndex = start ? members.indexOf(start) : -1;
      const endIndex = end ? members.indexOf(end) : startIndex;
      const ea = toNumber(tokens[3]);
      const ei = toNumber(tokens[4]);
      if (startIndex < 0 || endIndex < 0 || ea === null || ei === null) {
        diagnostics.push(`第 ${lineIndex + 1} 行：ECHAR 缺少有效的构件范围或 EA/EI。`);
        continue;
      }
      for (let index = startIndex; index <= endIndex; index += 1) {
        members[index] = applyEChar(members[index], ea, ei);
      }
      continue;
    }

    if (command === "NLOAD" || command === "LOAD") {
      const load = parseLoadTokens(tokens);
      if (load) {
        loads.push(load);
      }
      continue;
    }

    if (command === "ELOAD" || command === "DLOAD") {
      const load = parseLoadTokens(tokens);
      if (load) {
        loads.push(load);
      } else {
        diagnostics.push(`第 ${lineIndex + 1} 行：当前仅支持 ELOAD 均布荷载类型 3。`);
      }
      continue;
    }

    if (command === "PLOAD" || command === "MLOAD") {
      const load = parseLoadTokens(tokens);
      if (load) {
        loads.push(load);
      }
      continue;
    }

    if (command === "CASE" || command === "LCASE" || command === "LOADCASE") {
      const id = uniqueId(String(tokens[1] ?? `LC${loadCases.length + 1}`).trim() || `LC${loadCases.length + 1}`, seenLoadCases);
      loadCases.push({
        id,
        title: tokens.slice(2).join(" ") || id,
        loads: [],
      });
      continue;
    }

    if (command === "CASELOAD" || command === "LCLOAD") {
      const caseId = String(tokens[1] ?? "").trim();
      const loadCase = loadCases.find((item) => item.id === caseId);
      if (!loadCase) {
        diagnostics.push(`第 ${lineIndex + 1} 行：CASELOAD 引用了不存在的工况 ${caseId || "（空）"}。`);
        continue;
      }
      const load = parseLoadTokens(tokens.slice(2));
      if (!load) {
        diagnostics.push(`第 ${lineIndex + 1} 行：CASELOAD 缺少有效的荷载定义。`);
        continue;
      }
      loadCase.loads = [...loadCase.loads, load];
      continue;
    }

    if (command === "COMB" || command === "COMBINATION") {
      const id = uniqueId(String(tokens[1] ?? `COMB${loadCombinations.length + 1}`).trim() || `COMB${loadCombinations.length + 1}`, seenLoadCombinations);
      const tagsToken = tokens.length >= 4 ? tokens[tokens.length - 1] : "";
      const tags = tagsToken
        ? tagsToken.split(/[|/；;]+/u).map((tag) => tag.trim()).filter(Boolean)
        : undefined;
      loadCombinations.push({
        id,
        title: tokens.length >= 4 ? tokens.slice(2, -1).join(" ") || id : tokens.slice(2).join(" ") || id,
        factors: {},
        tags,
      });
      continue;
    }

    if (command === "FACTOR" || command === "COMBFACTOR") {
      const combinationId = String(tokens[1] ?? "").trim();
      const loadCaseId = String(tokens[2] ?? "").trim();
      const combination = loadCombinations.find((item) => item.id === combinationId);
      if (!combination) {
        diagnostics.push(`第 ${lineIndex + 1} 行：组合系数引用了不存在的组合 ${combinationId || "（空）"}。`);
        continue;
      }
      if (!loadCaseId) {
        diagnostics.push(`第 ${lineIndex + 1} 行：组合系数缺少工况编号。`);
        continue;
      }
      combination.factors = {
        ...combination.factors,
        [loadCaseId]: toNumber(tokens[3]) ?? 0,
      };
      continue;
    }

    diagnostics.push(`第 ${lineIndex + 1} 行：未识别的文本命令 ${tokens[0]}。`);
  }

  const nodeIds = new Set(rawNodes.map((node) => node.id));
  const memberIds = new Set(members.map((member) => member.id));
  const validMembers = members.filter((member) => nodeIds.has(member.start) && nodeIds.has(member.end) && member.start !== member.end);
  const validLoads = loads.filter((load) => isLoadReferenceValid(load, nodeIds, memberIds));
  const validLoadCases = loadCases.map((loadCase) => ({
    ...loadCase,
    loads: loadCase.loads.filter((load) => isLoadReferenceValid(load, nodeIds, memberIds)),
  }));
  const validLoadCaseIds = new Set(validLoadCases.map((loadCase) => loadCase.id));
  const validLoadCombinations = loadCombinations.map((combination) => ({
    ...combination,
    factors: Object.fromEntries(
      Object.entries(combination.factors).filter(([caseId]) => validLoadCaseIds.has(caseId))
    ),
  }));
  if (validMembers.length !== members.length) {
    diagnostics.push("已忽略起止节点不存在或两端相同的构件。");
  }
  if (validLoads.length !== loads.length) {
    diagnostics.push("已忽略引用不存在节点或构件的荷载。");
  }
  if (validLoadCases.some((loadCase, index) => loadCase.loads.length !== loadCases[index]?.loads.length)) {
    diagnostics.push("已忽略工况中引用不存在节点或构件的荷载。");
  }
  if (validLoadCombinations.some((combination, index) => Object.keys(combination.factors).length !== Object.keys(loadCombinations[index]?.factors ?? {}).length)) {
    diagnostics.push("已忽略组合中引用不存在工况的系数。");
  }

  if (rawNodes.length === 0) {
    return { collections: null, diagnostics: ["文本模型至少需要 1 条节点定义。", ...diagnostics] };
  }

  return {
    collections: {
      nodes: rawNodes,
      members: validMembers,
      loads: validLoads,
      loadCases: validLoadCases,
      loadCombinations: validLoadCombinations,
    },
    diagnostics,
  };
}

function nodeNumber(id: string, index: number): number {
  return numericCode(id) ?? index + 1;
}

function memberNumber(id: string, index: number): number {
  void id;
  return index + 1;
}

function supportCode(type: StructureNode["supportType"]): number {
  if (type === "fixed") return 6;
  if (type === "pinned") return 4;
  if (type === "roller") return 3;
  return 0;
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

function frameLoadLine(load: FrameLoad, nodeNumbers: Map<string, number>, memberNumbers: Map<string, number>): string[] {
  if (load.type === "nodal") {
    return nodalLoadLines(load, nodeNumbers);
  }
  if (load.type === "member_point") {
    return [`PLOAD,${memberNumbers.get(load.member) ?? 1},${load.forceKn ?? 0},${load.positionRatio ?? 0.5},${load.direction ?? "local_y"}`];
  }
  return [`DLOAD,${memberNumbers.get(load.member) ?? 1},${load.qStartKnPerM ?? load.wyKnPerM ?? 0},${load.qEndKnPerM ?? load.wyKnPerM ?? 0},${load.direction ?? "local_y"},${load.startRatio ?? 0},${load.endRatio ?? 1}`];
}

export function serializeFrameTextModel(collections: FrameTextCollections): string {
  const nodeNumbers = new Map(collections.nodes.map((node, index) => [node.id, nodeNumber(node.id, index)]));
  const memberNumbers = new Map(collections.members.map((member, index) => [member.id, memberNumber(member.id, index)]));
  const lines = [
    "# ArchSight 平面框架文本模型",
    "# 兼容 SM 常用子集：N / E / NSUPT / NLOAD / ELOAD；扩展支持 PROP / DLOAD / PLOAD。",
    "",
    "# 节点：N,节点号,x,y",
    ...collections.nodes.map((node, index) => `N,${nodeNumber(node.id, index)},${node.x},${node.y}`),
    "",
    "# 支座：NSUPT,节点号,类型码,角度；类型码 6=固结支座,4=铰支座,3=滚动支座,0=自由节点",
    ...collections.nodes
      .filter((node) => (node.supportType ?? "free") !== "free")
      .map((node) => `NSUPT,${nodeNumbers.get(node.id) ?? 1},${supportCode(node.supportType ?? "free")},${node.supportAngleDeg ?? 0}`),
    "",
    "# 构件：E,起点节点号,终点节点号,ux1,uy1,rz1,ux2,uy2,rz2",
    ...collections.members.map((member) => {
      const releaseStart = member.endReleases?.start?.includes("rz") ? 0 : 1;
      const releaseEnd = member.endReleases?.end?.includes("rz") ? 0 : 1;
      return `E,${nodeNumbers.get(member.start) ?? 1},${nodeNumbers.get(member.end) ?? 1},1,1,${releaseStart},1,1,${releaseEnd}`;
    }),
    "",
    "# 截面属性扩展：PROP,构件起号,构件止号,E_GPa,A_cm2,I_cm4,类型",
    ...collections.members.map((member, index) => `PROP,${memberNumber(member.id, index)},${memberNumber(member.id, index)},${member.E_GPa},${member.A_cm2},${member.I_cm4},${member.kind ?? "generic"}`),
    "",
    "# 荷载",
    ...collections.loads.flatMap((load) => frameLoadLine(load, nodeNumbers, memberNumbers)),
    "",
    "# 荷载工况扩展：CASE,工况编号,工况名称；CASELOAD,工况编号,<NLOAD/DLOAD/PLOAD...>",
    ...(collections.loadCases ?? []).flatMap((loadCase) => [
      `CASE,${loadCase.id},${loadCase.title}`,
      ...loadCase.loads.flatMap((load) => frameLoadLine(load, nodeNumbers, memberNumbers).map((line) => `CASELOAD,${loadCase.id},${line}`)),
    ]),
    "",
    "# 荷载组合扩展：COMB,组合编号,组合名称,标签；FACTOR,组合编号,工况编号,系数",
    ...(collections.loadCombinations ?? []).flatMap((combination) => [
      `COMB,${combination.id},${combination.title},${(combination.tags ?? []).join("/")}`,
      ...Object.entries(combination.factors).map(([caseId, factor]) => `FACTOR,${combination.id},${caseId},${factor}`),
    ]),
  ];

  return lines.join("\n");
}
