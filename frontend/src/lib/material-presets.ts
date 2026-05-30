import { PREDEFINED_MATERIALS, type Material } from "../types/material.ts";

export interface MaterialDropdownOption {
  value: string;
  label: string;
}

export function materialOptionLabel(material: Material): string {
  if (material.id === "custom") {
    return "CUSTOM · 自定义 / 手动输入 E（不回填预设）";
  }
  return `${material.id.toUpperCase()} · ${material.name} · E=${material.youngModulus} GPa · ρ=${material.density} kg/m³`;
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
  memberLabel: "构件" | "杆件",
  materials: Material[] = PREDEFINED_MATERIALS,
): string {
  const material = materials.find((item) => item.id === materialId);
  if (!material || material.id === "custom") {
    return `当前${memberLabel}使用自定义弹性模量 E=${formatMaterialNumber(youngModulusGPa)} GPa；材料库未指定强度、稳定、连接和规范设计参数。`;
  }
  return materialEngineeringNote(material.id, materials);
}

export function materialDropdownOptions(materials: Material[] = PREDEFINED_MATERIALS): MaterialDropdownOption[] {
  return materials.map((material) => ({
    value: material.id,
    label: materialOptionLabel(material),
  }));
}

export function materialIdForYoungModulus(youngModulus: number, materials: Material[] = PREDEFINED_MATERIALS): string {
  return materials.find((material) => material.id !== "custom" && Math.abs(material.youngModulus - youngModulus) < 1e-9)?.id ?? "custom";
}

export function youngModulusForMaterial(materialId: string, fallback: number, materials: Material[] = PREDEFINED_MATERIALS): number {
  if (materialId === "custom") return fallback;
  return materials.find((material) => material.id === materialId)?.youngModulus ?? fallback;
}

export function memberElasticityDistributionLabel(
  members: Array<{ E_GPa?: number }>,
  memberLabel: "构件" | "杆件",
): string {
  const counts = new Map<string, number>();
  members.forEach((member) => {
    const elasticity = formatMaterialNumber(Number(member.E_GPa));
    if (elasticity === "—") return;
    counts.set(elasticity, (counts.get(elasticity) ?? 0) + 1);
  });
  if (counts.size === 0) return `未设置${memberLabel}弹性模量`;
  return Array.from(counts.entries())
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([elasticity, count]) => `E=${elasticity} GPa：${count} 个${memberLabel}`)
    .join("；");
}

function formatMaterialNumber(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(4))) : "—";
}
