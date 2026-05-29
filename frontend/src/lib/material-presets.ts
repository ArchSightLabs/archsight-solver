import { PREDEFINED_MATERIALS, type Material } from "../types/material.ts";

export interface MaterialDropdownOption {
  value: string;
  label: string;
}

export function materialOptionLabel(material: Material): string {
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
  return materials.find((material) => material.id === materialId)?.youngModulus ?? fallback;
}
