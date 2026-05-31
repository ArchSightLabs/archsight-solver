import type { BeamLinearLoadConfig, BeamPointLoadConfig, BeamSpanConfig, BeamSupportConfig, BeamSupportDof, BeamWorkspaceState } from "../types/beam.ts";
import { PREDEFINED_MATERIALS, type Material } from "../types/material.ts";
import { parseTextModelNumber, splitTextModelTokens } from "./text-model-utils.ts";
import { beamTextSupportConstraintsForType, parseBeamTextSupportType } from "./support-text-model.ts";

export interface BeamTextParseResult {
  patch: Partial<BeamWorkspaceState> | null;
  diagnostics: string[];
}

const splitTokens = splitTextModelTokens;
const toNumber = parseTextModelNumber;

const supportType = parseBeamTextSupportType;
const constraintsForType = beamTextSupportConstraintsForType;

function supportDof(value: string | undefined): BeamSupportDof | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["v", "uy", "y", "竖向", "竖向位移", "挠度"].includes(normalized)) return "v";
  if (["rz", "theta", "θz", "rotation", "转角"].includes(normalized)) return "rz";
  return null;
}

function parseSupportConstraints(value: string | undefined): BeamSupportDof[] | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || ["-", "none", "free", "release", "released", "无", "释放"].includes(normalized)) return [];
  const constraints: BeamSupportDof[] = [];
  for (const part of normalized.split(/[+|/;；、]+/u).filter(Boolean)) {
    const dof = supportDof(part);
    if (!dof) return null;
    if (!constraints.includes(dof)) constraints.push(dof);
  }
  return constraints;
}

function sameDofs(left: BeamSupportDof[], right: BeamSupportDof[]): boolean {
  return left.length === right.length && left.every((dof) => right.includes(dof));
}

function supportConstraintToken(support: BeamSupportConfig): string | null {
  const constraints = support.constraints ?? constraintsForType(support.type);
  const defaults = constraintsForType(support.type);
  if (sameDofs(constraints, defaults)) return null;
  return constraints.length ? constraints.join("+") : "-";
}

function defaultBeamSupportTextId(index: number) {
  return `S${index + 1}`;
}

function normalizeBeamSupportTextId(value: string | undefined, index: number) {
  const id = String(value ?? "").trim();
  const legacyNodeMatch = /^N(\d+)$/iu.exec(id);
  if (legacyNodeMatch) {
    return `S${legacyNodeMatch[1]}`;
  }
  return id || defaultBeamSupportTextId(index);
}

function beamType(value: string | undefined): BeamWorkspaceState["beamType"] | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["continuous", "连续", "连续梁"].includes(normalized)) return "continuous";
  if (["simply_supported", "simple", "简支", "简支梁"].includes(normalized)) return "simply_supported";
  if (["cantilever", "悬臂", "悬臂梁"].includes(normalized)) return "cantilever";
  return null;
}

function createMaterialMap(materials: Material[] = PREDEFINED_MATERIALS): Map<string, Material> {
  return new Map(materials.map((material) => [material.id.toLowerCase(), { ...material, id: material.id.toLowerCase() }]));
}

function materialId(value: string | undefined, materials: Map<string, Material>): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  const material = materials.get(normalized);
  return material?.id ?? null;
}

function materialList(materials: Map<string, Material>): Material[] {
  return Array.from(materials.values());
}

function materialOptionsLabel(materials: Map<string, Material>): string {
  return materialList(materials).map((material) => material.id).join("、");
}

function materialByYoungModulus(E: number, materials: Map<string, Material>): Material | undefined {
  return materialList(materials).find((material) => Math.abs(material.youngModulus - E) < 1e-9);
}

function materialDefinition(tokens: string[]): Material | null {
  if (tokens.length < 5) {
    return null;
  }
  const id = String(tokens[1] ?? "").trim().toLowerCase();
  const name = String(tokens[2] ?? "").trim();
  const youngModulus = toNumber(tokens[3]);
  const density = toNumber(tokens[4]);
  if (!id || !name || !youngModulus || youngModulus <= 0 || !density || density <= 0) {
    return null;
  }
  return { id, name, youngModulus, density };
}

function isPredefinedMaterial(material: Material): boolean {
  const predefined = PREDEFINED_MATERIALS.find((item) => item.id === material.id);
  return Boolean(
    predefined &&
    predefined.name === material.name &&
    predefined.youngModulus === material.youngModulus &&
    predefined.density === material.density
  );
}

function spanMaterialToken(span: BeamSpanConfig, materials: Map<string, Material>): string {
  const material = span.materialId ? materials.get(span.materialId.toLowerCase()) : null;
  if (material && Math.abs(material.youngModulus - span.E) < 1e-9) {
    return material.id;
  }
  return String(span.E);
}

export function parseBeamTextModel(text: string): BeamTextParseResult {
  const diagnostics: string[] = [];
  const spans: BeamWorkspaceState["spans"] = [];
  const supports: BeamSupportConfig[] = [];
  const pointLoads: BeamPointLoadConfig[] = [];
  const linearLoads: BeamLinearLoadConfig[] = [];
  const patch: Partial<BeamWorkspaceState> = {};
  const materials = createMaterialMap();
  let materialsChanged = false;
  let hasLoadCommand = false;
  let uniformLoadEnabled = false;
  let linearLoadEnabled = false;

  for (const [lineIndex, line] of text.split(/\r?\n/u).entries()) {
    const tokens = splitTokens(line);
    if (tokens.length === 0) continue;
    const command = tokens[0].toUpperCase();

    if (command === "BEAM" || command === "梁型") {
      if (tokens.length < 2) {
        diagnostics.push(`第 ${lineIndex + 1} 行：BEAM 必须包含梁型。`);
        continue;
      }
      const type = beamType(tokens[1]);
      if (!type) {
        diagnostics.push(`第 ${lineIndex + 1} 行：梁型必须为 continuous、simply_supported 或 cantilever。`);
        continue;
      }
      patch.beamType = type;
      continue;
    }

    if (command === "MATERIAL" || command === "材料") {
      if (!tokens[1]) {
        diagnostics.push(`第 ${lineIndex + 1} 行：材料编号不能为空。`);
        continue;
      }
      const definition = materialDefinition(tokens);
      if (tokens.length >= 5 && !definition) {
        diagnostics.push(`第 ${lineIndex + 1} 行：材料定义必须为 MATERIAL,编号,名称,E_GPa,密度kg/m3，且 E 与密度必须大于 0。`);
        continue;
      }
      if (definition) {
        materials.set(definition.id, definition);
        materialsChanged = true;
        patch.materialId = definition.id;
        continue;
      }
      const nextMaterialId = materialId(tokens[1], materials);
      if (!nextMaterialId) {
        diagnostics.push(`第 ${lineIndex + 1} 行：材料编号 ${tokens[1]} 未在材料库中定义，可用值：${materialOptionsLabel(materials)}。`);
        continue;
      }
      patch.materialId = nextMaterialId;
      continue;
    }

    if (command === "SPAN" || command === "跨段" || command === "MEMBER" || command === "杆件") {
      const directLength = toNumber(tokens[1]);
      const hasExplicitId = directLength === null;
      const spanId = hasExplicitId ? tokens[1]?.trim() : `(${spans.length + 1})`;
      const lengthTokenIndex = hasExplicitId ? 2 : 1;
      if ((hasExplicitId && tokens.length < 5) || (!hasExplicitId && tokens.length < 4)) {
        diagnostics.push(`第 ${lineIndex + 1} 行：SPAN 必须包含杆件编号（可选）、跨长、材料编号或 E_GPa、I_cm4。`);
        continue;
      }
      if (!spanId) {
        diagnostics.push(`第 ${lineIndex + 1} 行：杆件编号不能为空。`);
        continue;
      }
      const length = toNumber(tokens[lengthTokenIndex]);
      if (!length || length <= 0) {
        diagnostics.push(`第 ${lineIndex + 1} 行：跨长必须大于 0。`);
        continue;
      }
      const materialToken = tokens[lengthTokenIndex + 1];
      const directE = toNumber(materialToken);
      const spanMaterial = directE === null ? materials.get(String(materialToken ?? "").trim().toLowerCase()) : null;
      const E = directE ?? spanMaterial?.youngModulus ?? null;
      if (!E || E <= 0) {
        diagnostics.push(`第 ${lineIndex + 1} 行：杆件材料编号 ${materialToken ?? ""} 未在材料库中定义，或弹性模量 E_GPa 不是大于 0 的数字。`);
        continue;
      }
      const I = toNumber(tokens[lengthTokenIndex + 2]);
      if (!I || I <= 0) {
        diagnostics.push(`第 ${lineIndex + 1} 行：截面惯性矩 I_cm4 必须大于 0。`);
        continue;
      }
      const inferredMaterialId = spanMaterial?.id ?? materialByYoungModulus(E, materials)?.id ?? patch.materialId;
      spans.push({ id: spanId, length, E, I, materialId: inferredMaterialId });
      continue;
    }

    if (command === "SUPPORT" || command === "支座" || command === "NODE" || command === "节点") {
      if (tokens.length < 4) {
        diagnostics.push(`第 ${lineIndex + 1} 行：SUPPORT 必须包含支座编号、x 位置和支座类型。`);
        continue;
      }
      const id = normalizeBeamSupportTextId(tokens[1], supports.length);
      if (!id) {
        diagnostics.push(`第 ${lineIndex + 1} 行：支座编号不能为空。`);
        continue;
      }
      const x = toNumber(tokens[2]);
      if (x === null || x < 0) {
        diagnostics.push(`第 ${lineIndex + 1} 行：支座位置必须为非负数。`);
        continue;
      }
      const type = supportType(tokens[3]);
      if (!type) {
        diagnostics.push(`第 ${lineIndex + 1} 行：支座类型必须为 fixed、pinned、roller 或 free。`);
        continue;
      }
      const parsedConstraints = tokens[4] ? parseSupportConstraints(tokens[4]) : constraintsForType(type);
      if (tokens[4] && parsedConstraints === null) {
        diagnostics.push(`第 ${lineIndex + 1} 行：支座约束自由度必须为 v、rz、v+rz 或 -。`);
        continue;
      }
      supports.push({
        id,
        x,
        type,
        constraints: parsedConstraints ?? constraintsForType(type),
      });
      continue;
    }

    if (command === "SPRING" || command === "弹簧") {
      if (tokens.length < 4) {
        diagnostics.push(`第 ${lineIndex + 1} 行：SPRING 必须包含支座编号、自由度和刚度。`);
        continue;
      }
      const supportReference = normalizeBeamSupportTextId(tokens[1], 0);
      const support = supports.find((item) => item.id === supportReference || item.id === tokens[1]);
      if (!support) {
        diagnostics.push(`第 ${lineIndex + 1} 行：弹性约束引用了不存在的支座 ${tokens[1] ?? ""}。`);
        continue;
      }
      const rawDof = String(tokens[2] ?? "").toLowerCase();
      if (rawDof !== "v" && rawDof !== "rz") {
        diagnostics.push(`第 ${lineIndex + 1} 行：弹性约束自由度必须为 v 或 rz。`);
        continue;
      }
      const dof = rawDof as BeamSupportDof;
      const stiffness = toNumber(tokens[3]);
      if (stiffness === null) {
        diagnostics.push(`第 ${lineIndex + 1} 行：弹性约束刚度不能为空。`);
        continue;
      }
      if (stiffness <= 0) {
        diagnostics.push(`第 ${lineIndex + 1} 行：弹性约束刚度必须大于 0。`);
        continue;
      }
      support.constraints = (support.constraints ?? []).filter((item) => item !== dof);
      support.springs = [
        ...(support.springs ?? []).filter((item) => item.dof !== dof),
        dof === "rz" ? { dof, stiffnessKnMPerRad: stiffness } : { dof, stiffnessKnPerM: stiffness },
      ];
      support.type = support.constraints.length > 0 ? support.type : "free";
      continue;
    }

    if (command === "LOAD" || command === "荷载") {
      hasLoadCommand = true;
      if (tokens.length < 2) {
        diagnostics.push(`第 ${lineIndex + 1} 行：LOAD 必须包含荷载类型。`);
        continue;
      }
      const loadType = String(tokens[1]).toLowerCase();
      if (["point", "集中", "集中力"].includes(loadType)) {
        if (tokens.length < 4) {
          diagnostics.push(`第 ${lineIndex + 1} 行：集中力 LOAD,point 必须包含 P_kN 和位置比例。`);
          continue;
        }
        const magnitudeKn = toNumber(tokens[2]);
        if (magnitudeKn === null) {
          diagnostics.push(`第 ${lineIndex + 1} 行：集中力 P_kN 必须为数字。`);
          continue;
        }
        const positionRatio = toNumber(tokens[3]);
        if (positionRatio === null || positionRatio < 0 || positionRatio > 1) {
          diagnostics.push(`第 ${lineIndex + 1} 行：集中力位置比例必须在 0 到 1 之间。`);
          continue;
        }
        pointLoads.push({
          id: `P${pointLoads.length + 1}`,
          magnitudeKn,
          positionRatio,
        });
        patch.pointLoad = pointLoads[0]?.magnitudeKn ?? 0;
        patch.pointLoadPositionRatio = pointLoads[0]?.positionRatio ?? 0.5;
      } else if (["linear", "线性"].includes(loadType)) {
        if (tokens.length < 6) {
          diagnostics.push(`第 ${lineIndex + 1} 行：线性荷载 LOAD,linear 必须包含 q1、q2、startRatio 和 endRatio。`);
          continue;
        }
        const qStart = toNumber(tokens[2]);
        const qEnd = toNumber(tokens[3]);
        const startRatio = toNumber(tokens[4]);
        const endRatio = toNumber(tokens[5]);
        if (qStart === null || qEnd === null) {
          diagnostics.push(`第 ${lineIndex + 1} 行：线性荷载 q1 和 q2 必须为数字。`);
          continue;
        }
        if (startRatio === null || endRatio === null || startRatio < 0 || startRatio > 1 || endRatio < 0 || endRatio > 1 || startRatio >= endRatio) {
          diagnostics.push(`第 ${lineIndex + 1} 行：线性荷载范围比例必须满足 0 <= startRatio < endRatio <= 1。`);
          continue;
        }
        linearLoads.push({
          id: `L${linearLoads.length + 1}`,
          qStartKnPerM: qStart,
          qEndKnPerM: qEnd,
          startRatio,
          endRatio,
        });
        linearLoadEnabled = true;
        const primaryLinearLoad = linearLoads[0];
        patch.distributedLoadStart = primaryLinearLoad.qStartKnPerM;
        patch.distributedLoadEnd = primaryLinearLoad.qEndKnPerM;
        patch.distributedLoadStartRatio = primaryLinearLoad.startRatio;
        patch.distributedLoadEndRatio = primaryLinearLoad.endRatio;
      } else if (["uniform", "均布"].includes(loadType)) {
        if (tokens.length < 3) {
          diagnostics.push(`第 ${lineIndex + 1} 行：均布荷载 LOAD,uniform 必须包含 q_kN_per_m。`);
          continue;
        }
        const q = toNumber(tokens[2]);
        if (q === null) {
          diagnostics.push(`第 ${lineIndex + 1} 行：均布荷载 q_kN_per_m 必须为数字。`);
          continue;
        }
        const startRatio = tokens.length >= 5 ? toNumber(tokens[3]) : 0;
        const endRatio = tokens.length >= 5 ? toNumber(tokens[4]) : 1;
        if (startRatio === null || endRatio === null || startRatio < 0 || startRatio > 1 || endRatio < 0 || endRatio > 1 || startRatio >= endRatio) {
          diagnostics.push(`第 ${lineIndex + 1} 行：均布荷载范围比例必须满足 0 <= startRatio < endRatio <= 1。`);
          continue;
        }
        uniformLoadEnabled = true;
        patch.q = q;
        patch.uniformLoadStartRatio = startRatio;
        patch.uniformLoadEndRatio = endRatio;
      } else {
        diagnostics.push(`第 ${lineIndex + 1} 行：荷载类型必须为 uniform、point 或 linear。`);
      }
      continue;
    }

    diagnostics.push(`第 ${lineIndex + 1} 行：未识别的梁系文本命令 ${tokens[0]}。`);
  }

  if (spans.length > 0) {
    patch.spans = spans;
    patch.beamType = patch.beamType ?? (spans.length > 1 ? "continuous" : "simply_supported");
    patch.materialId = patch.materialId ?? spans[0]?.materialId;
  }
  if (materialsChanged) {
    patch.materials = materialList(materials);
  }
  if (supports.length > 0) {
    patch.supports = supports;
  }
  if (hasLoadCommand) {
    const activeTypeCount = (uniformLoadEnabled ? 1 : 0) + (linearLoadEnabled ? linearLoads.length : 0) + pointLoads.length;
    patch.uniformLoadEnabled = uniformLoadEnabled;
    patch.linearLoadEnabled = linearLoadEnabled;
    patch.linearLoads = linearLoads;
    patch.pointLoads = pointLoads;
    patch.loadType =
      activeTypeCount === 0
        ? "none"
        : activeTypeCount > 1
          ? "combined"
          : uniformLoadEnabled
            ? "uniform"
            : linearLoadEnabled
              ? "linear"
              : "point";
  }

  if (!patch.spans && !patch.supports && !patch.loadType && !patch.materialId && !patch.beamType) {
    return { patch: null, diagnostics: ["文本模型至少需要 BEAM、MATERIAL、SPAN、SUPPORT 或 LOAD 中的一类定义。", ...diagnostics] };
  }

  return { patch, diagnostics };
}

export function serializeBeamTextModel(value: BeamWorkspaceState): string {
  const materials = createMaterialMap(value.materials?.length ? value.materials : PREDEFINED_MATERIALS);
  const usedMaterialIds = new Set(
    [value.materialId, ...value.spans.map((span) => span.materialId)]
      .map((id) => String(id ?? "").trim().toLowerCase())
      .filter(Boolean)
  );
  const materialLines = Array.from(usedMaterialIds).flatMap((id) => {
    const material = materials.get(id);
    if (!material) {
      return [];
    }
    return isPredefinedMaterial(material)
      ? [`MATERIAL,${material.id}`]
      : [`MATERIAL,${material.id},${material.name},${material.youngModulus},${material.density}`];
  });
  const linearLoads = value.linearLoadEnabled
    ? value.linearLoads.length
      ? value.linearLoads
      : [{
          id: "L1",
          qStartKnPerM: value.distributedLoadStart,
          qEndKnPerM: value.distributedLoadEnd,
          startRatio: value.distributedLoadStartRatio,
          endRatio: value.distributedLoadEndRatio,
        }]
    : [];
  const loadLines = [
    ...(value.uniformLoadEnabled ? [`LOAD,uniform,${value.q},${value.uniformLoadStartRatio},${value.uniformLoadEndRatio}`] : []),
    ...linearLoads.map((load) => `LOAD,linear,${load.qStartKnPerM},${load.qEndKnPerM},${load.startRatio},${load.endRatio}`),
    ...value.pointLoads.map((load) => `LOAD,point,${load.magnitudeKn},${load.positionRatio}`),
  ];
  return [
    "# ArchSight 梁系文本模型",
    "# BEAM,类型 continuous/simply_supported/cantilever",
    "# 梁型说明：continuous=连续梁；simply_supported=简支梁；cantilever=悬臂梁",
    `BEAM,${value.beamType}`,
    "# MATERIAL,材料编号",
    "# 自定义材料：MATERIAL,编号,名称,E_GPa,密度kg/m3",
    ...(materialLines.length ? materialLines : [`MATERIAL,${value.materialId}`]),
    "",
    "# SPAN,杆件编号,跨长m,材料编号或E_GPa,I_cm4",
    ...value.spans.map((span, index) => `SPAN,${span.id?.trim() || `(${index + 1})`},${span.length},${spanMaterialToken(span, materials)},${span.I}`),
    "",
    "# SUPPORT,支座编号,x位置m,支座类型[,约束自由度]",
    "# 支座类型：fixed=固结支座；pinned=铰支座；roller=滚动支座；free=自由端/无约束",
    "# 约束自由度可写 v、rz、v+rz 或 -；未写时按支座类型默认自由度",
    ...value.supports.map((support) => {
      const constraintToken = supportConstraintToken(support);
      return `SUPPORT,${support.id},${support.x},${support.type}${constraintToken ? `,${constraintToken}` : ""}`;
    }),
    ...value.supports.flatMap((support) =>
      (support.springs ?? []).map((spring) =>
        spring.dof === "rz"
          ? `SPRING,${support.id},rz,${spring.stiffnessKnMPerRad}`
          : `SPRING,${support.id},v,${spring.stiffnessKnPerM}`
      )
    ),
    "",
    "# LOAD,uniform,q_kN_per_m,startRatio,endRatio  均布荷载，q 为 kN/m，范围比例默认 0-1",
    "# LOAD,point,P_kN,ratio  集中力，P 为 kN，ratio 为跨全长相对位置 0-1",
    "# LOAD,linear,q1,q2,startRatio,endRatio  线性分布荷载，q1/q2 为起止强度 kN/m",
    ...(loadLines.length ? loadLines : ["# 无荷载"]),
  ].join("\n");
}
