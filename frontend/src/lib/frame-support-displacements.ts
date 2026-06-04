import type {
  FrameSupportDisplacement,
  FrameSupportDisplacementDof,
  StructureNode,
} from "../types/structure.ts";

export interface FrameSupportDisplacementOption {
  dof: FrameSupportDisplacementDof;
  label: string;
  unit: "mm" | "deg";
}

export function frameSupportDisplacementOptions(node: Pick<StructureNode, "supportType" | "supportAngleDeg">): FrameSupportDisplacementOption[] {
  const supportType = node.supportType ?? "free";
  if (supportType === "fixed") {
    return [
      { dof: "ux", label: "水平支座位移 ux", unit: "mm" },
      { dof: "uy", label: "竖向支座位移 uy", unit: "mm" },
      { dof: "rz", label: "支座转角 rz", unit: "deg" },
    ];
  }
  if (supportType === "pinned") {
    return [
      { dof: "ux", label: "水平支座位移 ux", unit: "mm" },
      { dof: "uy", label: "竖向支座位移 uy", unit: "mm" },
    ];
  }
  if (supportType === "roller") {
    if (Number.isFinite(node.supportAngleDeg)) {
      return [{ dof: "n", label: "法向支座位移 n", unit: "mm" }];
    }
    return [{ dof: "uy", label: "竖向支座位移 uy", unit: "mm" }];
  }
  return [];
}

export function isFrameSupportDisplacementDof(value: unknown): value is FrameSupportDisplacementDof {
  return value === "ux" || value === "uy" || value === "rz" || value === "n";
}

export function frameSupportDisplacementMagnitude(displacement: FrameSupportDisplacement): number {
  return displacement.dof === "rz" ? displacement.rotationDeg : displacement.displacementMm;
}

export function createFrameSupportDisplacement(dof: FrameSupportDisplacementDof, value = 0): FrameSupportDisplacement {
  return dof === "rz" ? { dof, rotationDeg: value } : { dof, displacementMm: value };
}

export function updateFrameSupportDisplacement(
  displacement: FrameSupportDisplacement,
  patch: Partial<FrameSupportDisplacement>,
): FrameSupportDisplacement {
  const dof = isFrameSupportDisplacementDof(patch.dof) ? patch.dof : displacement.dof;
  if (dof === "rz") {
    const previous = displacement.dof === "rz" ? displacement.rotationDeg : displacement.displacementMm;
    const next = "rotationDeg" in patch ? patch.rotationDeg : previous;
    return { dof, rotationDeg: Number(next) || 0 };
  }
  const previous = displacement.dof === "rz" ? displacement.rotationDeg : displacement.displacementMm;
  const next = "displacementMm" in patch ? patch.displacementMm : previous;
  return { dof, displacementMm: Number(next) || 0 };
}

export function normalizeFrameSupportDisplacements(node: Pick<StructureNode, "supportType" | "supportAngleDeg" | "supportDisplacements">): FrameSupportDisplacement[] | undefined {
  const allowed = new Set(frameSupportDisplacementOptions(node).map((option) => option.dof));
  const seen = new Set<FrameSupportDisplacementDof>();
  const normalized = (node.supportDisplacements ?? [])
    .map((displacement) => {
      const dof = displacement.dof;
      if (!allowed.has(dof) || seen.has(dof)) {
        return null;
      }
      seen.add(dof);
      const value = frameSupportDisplacementMagnitude(displacement);
      if (!Number.isFinite(value)) {
        return null;
      }
      return createFrameSupportDisplacement(dof, Number(value));
    })
    .filter((displacement): displacement is FrameSupportDisplacement => Boolean(displacement));
  return normalized.length ? normalized : undefined;
}
