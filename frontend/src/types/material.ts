import sharedMaterials from "../../../shared/materials.json" with { type: "json" };

export interface Material {
  id: string;
  name: string;
  youngModulus: number; // GPa
  density: number; // kg/m3
  sectionAreaCm2?: number;
  momentOfInertiaCm4?: number;
  category?: "custom" | "steel" | "concrete";
  note?: string;
}

interface SharedMaterial {
  id: string;
  name: string;
  youngModulusGPa: number;
  densityKgPerM3: number;
  sectionAreaCm2?: number;
  momentOfInertiaCm4?: number;
  category?: "custom" | "steel" | "concrete";
  note?: string;
}

export const PREDEFINED_MATERIALS: Material[] = (sharedMaterials as SharedMaterial[]).map((material) => ({
  id: material.id,
  name: material.name,
  youngModulus: material.youngModulusGPa,
  density: material.densityKgPerM3,
  sectionAreaCm2: material.sectionAreaCm2,
  momentOfInertiaCm4: material.momentOfInertiaCm4,
  category: material.category,
  note: material.note,
}));
