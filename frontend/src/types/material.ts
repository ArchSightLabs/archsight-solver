import sharedMaterials from "../../../shared/materials.json" with { type: "json" };

export interface Material {
  id: string;
  name: string;
  youngModulus: number; // GPa
  density: number; // kg/m3
  category?: "custom" | "steel" | "concrete";
  note?: string;
}

interface SharedMaterial {
  id: string;
  name: string;
  youngModulusGPa: number;
  densityKgPerM3: number;
  category?: "custom" | "steel" | "concrete";
  note?: string;
}

export const PREDEFINED_MATERIALS: Material[] = (sharedMaterials as SharedMaterial[]).map((material) => ({
  id: material.id,
  name: material.name,
  youngModulus: material.youngModulusGPa,
  density: material.densityKgPerM3,
  category: material.category,
  note: material.note,
}));
