import { PREDEFINED_MATERIALS, type Material } from "../types/material.ts";

export interface MaterialDropdownOption {
  value: string;
  label: string;
  selectedLabel?: string;
  description?: string;
}

interface MaterialDropdownOptionsConfig {
  includeCustom?: boolean;
  includeDescriptions?: boolean;
}

const SYSTEM_MATERIAL_IDS = new Set(PREDEFINED_MATERIALS.map((material) => material.id.toLowerCase()));

function normalizedMaterialId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

function normalizeProjectCustomMaterial(rawMaterial: unknown): Material | null {
  const candidate = rawMaterial && typeof rawMaterial === "object" ? rawMaterial as Partial<Material> & {
    youngModulusGPa?: unknown;
    densityKgPerM3?: unknown;
  } : {};
  const id = normalizedMaterialId(candidate.id);
  const name = String(candidate.name ?? "").trim();
  const youngModulus = Number(candidate.youngModulus ?? candidate.youngModulusGPa);
  const density = Number(candidate.density ?? candidate.densityKgPerM3);
  if (
    !id ||
    id === "custom" ||
    SYSTEM_MATERIAL_IDS.has(id) ||
    !name ||
    !Number.isFinite(youngModulus) ||
    youngModulus <= 0 ||
    !Number.isFinite(density) ||
    density <= 0
  ) {
    return null;
  }
  return {
    id,
    name,
    youngModulus,
    density,
    category: "custom",
    note: String(candidate.note ?? "").trim() || undefined,
  };
}

export function isSystemMaterialId(materialId: string | undefined): boolean {
  return SYSTEM_MATERIAL_IDS.has(String(materialId ?? "").trim().toLowerCase());
}

export function normalizeProjectCustomMaterials(...sources: unknown[]): Material[] {
  const byId = new Map<string, Material>();
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const rawMaterial of source) {
      const material = normalizeProjectCustomMaterial(rawMaterial);
      if (!material) continue;
      byId.set(material.id, material);
    }
  }
  return Array.from(byId.values()).slice(0, 50);
}

export function materialLibraryFromCustomMaterials(customMaterials: unknown): Material[] {
  return [
    ...PREDEFINED_MATERIALS.map((material) => ({ ...material })),
    ...normalizeProjectCustomMaterials(customMaterials),
  ];
}

function materialDisplayName(material: Material): string {
  const code = material.id.toUpperCase();
  const name = material.name.trim();
  return name.toUpperCase().startsWith(code) ? name : `${code} ${name}`;
}

function isCustomMaterial(material: Material): boolean {
  return material.id === "custom";
}

export function selectableMaterialPresets(materials: Material[] = PREDEFINED_MATERIALS): Material[] {
  return materials.filter((material) => !isCustomMaterial(material));
}

export function materialOptionLabel(material: Material): string {
  if (material.id === "custom") {
    return "手动 E（不回填预设）";
  }
  return `${materialDisplayName(material)} · E=${material.youngModulus} GPa · ρ=${material.density} kg/m³`;
}

export function materialOptionSelectedLabel(material: Material): string {
  return material.id === "custom" ? "自定义" : material.id.toUpperCase();
}

export function materialOptionMenuLabel(material: Material): string {
  return material.id === "custom" ? "手动 E" : materialDisplayName(material);
}

export function materialOptionDescription(material: Material): string {
  if (material.id === "custom") return "手动输入 E；不回填预设";
  return `E=${material.youngModulus} GPa · ρ=${material.density} kg/m³`;
}

export function materialEngineeringNote(materialId: string | undefined, materials: Material[] = PREDEFINED_MATERIALS): string {
  const material = materials.find((item) => item.id === materialId) ?? materials.find((item) => item.id === "custom");
  if (!material) {
    return "材料参数用于线弹性刚度计算；强度、稳定、连接和规范设计仍需单独复核。";
  }
  const base = `${material.name}：E=${material.youngModulus} GPa，ρ=${material.density} kg/m³。`;
  return `${base}${material.note ?? "材料参数用于线弹性刚度计算；强度、稳定、连接和规范设计仍需单独复核。"}`;
}

export function memberMaterialEngineeringNote(
  materialId: string | undefined,
  youngModulusGPa: number,
  memberLabel: "跨段" | "构件" | "杆件",
  materials: Material[] = PREDEFINED_MATERIALS,
): string {
  const material = materials.find((item) => item.id === materialId);
  if (!material || material.id === "custom") {
    return `当前${memberLabel}使用自定义弹性模量 E=${formatMaterialNumber(youngModulusGPa)} GPa；材料库未指定强度、稳定、连接和规范设计参数。`;
  }
  return materialEngineeringNote(material.id, materials);
}

export function materialDropdownOptions(
  materials: Material[] = PREDEFINED_MATERIALS,
  config: MaterialDropdownOptionsConfig = {},
): MaterialDropdownOption[] {
  const selectableMaterials = config.includeCustom ? materials : selectableMaterialPresets(materials);
  return selectableMaterials.map((material) => ({
    value: material.id,
    label: materialOptionMenuLabel(material),
    selectedLabel: materialOptionSelectedLabel(material),
    ...(config.includeDescriptions ? { description: materialOptionDescription(material) } : {}),
  }));
}

export function materialIdForYoungModulus(youngModulus: number, materials: Material[] = PREDEFINED_MATERIALS): string {
  return materials.find((material) => material.id !== "custom" && Math.abs(material.youngModulus - youngModulus) < 1e-9)?.id ?? "custom";
}

export function materialLabelForYoungModulus(youngModulus: number, materials: Material[] = PREDEFINED_MATERIALS): string {
  const materialId = materialIdForYoungModulus(youngModulus, materials);
  if (materialId === "custom") return "自定义";
  return materialId.toUpperCase();
}

export function materialLabelForId(materialId: string | undefined, materials: Material[] = PREDEFINED_MATERIALS): string {
  const normalizedId = String(materialId ?? "").trim().toLowerCase();
  if (!normalizedId || normalizedId === "custom") return "自定义";
  return materials.some((material) => material.id === normalizedId) ? normalizedId.toUpperCase() : normalizedId;
}

export function materialIdForMember(
  member: { materialId?: string; E_GPa?: number },
  materials: Material[] = PREDEFINED_MATERIALS,
): string {
  const explicitId = String(member.materialId ?? "").trim().toLowerCase();
  if (explicitId) return explicitId;
  return materialIdForYoungModulus(Number(member.E_GPa), materials);
}

export function materialElasticityLabelForYoungModulus(youngModulus: number, materials: Material[] = PREDEFINED_MATERIALS): string {
  const materialLabel = materialLabelForYoungModulus(youngModulus, materials);
  return materialLabel === "自定义"
    ? `自定义 E=${formatMaterialNumber(youngModulus)} GPa`
    : `${materialLabel} · E=${formatMaterialNumber(youngModulus)} GPa`;
}

export function materialElasticityLabelForMember(
  member: { materialId?: string; E_GPa?: number },
  materials: Material[] = PREDEFINED_MATERIALS,
): string {
  const youngModulus = Number(member.E_GPa);
  const materialLabel = materialLabelForId(materialIdForMember(member, materials), materials);
  return materialLabel === "自定义"
    ? `自定义 E=${formatMaterialNumber(youngModulus)} GPa`
    : `${materialLabel} · E=${formatMaterialNumber(youngModulus)} GPa`;
}

export function youngModulusForMaterial(materialId: string, fallback: number, materials: Material[] = PREDEFINED_MATERIALS): number {
  if (materialId === "custom") return fallback;
  return materials.find((material) => material.id === materialId)?.youngModulus ?? fallback;
}

export function memberElasticityDistributionLabel(
  members: Array<{ materialId?: string; E_GPa?: number }>,
  memberLabel: "跨段" | "构件" | "杆件",
  defaultMaterialId?: string,
  materials: Material[] = PREDEFINED_MATERIALS,
): string {
  const counts = new Map<string, number>();
  const normalizedDefaultMaterialId = String(defaultMaterialId ?? "").trim().toLowerCase();
  let allMatchDefault = Boolean(normalizedDefaultMaterialId);
  members.forEach((member) => {
    if (!Number.isFinite(Number(member.E_GPa))) return;
    if (allMatchDefault && materialIdForMember(member, materials) !== normalizedDefaultMaterialId) {
      allMatchDefault = false;
    }
    const label = materialElasticityLabelForMember(member, materials);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  if (counts.size === 0) return `未设置${memberLabel}弹性模量`;
  if (counts.size === 1 && allMatchDefault) return "";
  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right, "zh-Hans-CN"))
    .map(([label, count]) => `${label}：${count} 个${memberLabel}`)
    .join("；");
}

function formatMaterialNumber(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(4))) : "—";
}
