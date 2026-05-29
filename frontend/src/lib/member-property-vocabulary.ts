export type MemberPropertyMode = "beam" | "frame" | "truss";
export type MemberLabel = "杆件" | "构件";

export interface MemberPropertyLabels {
  youngModulus: string;
  sectionArea?: string;
  momentOfInertia?: string;
}

const MEMBER_PROPERTY_LABELS: Record<MemberPropertyMode, MemberPropertyLabels> = {
  beam: {
    youngModulus: "弹性模量（GPa）",
    momentOfInertia: "截面惯性矩（cm⁴）",
  },
  frame: {
    youngModulus: "弹性模量（GPa）",
    sectionArea: "截面面积（cm²）",
    momentOfInertia: "截面惯性矩（cm⁴）",
  },
  truss: {
    youngModulus: "弹性模量（GPa）",
    sectionArea: "截面面积（cm²）",
  },
};

export function memberPropertyLabels(mode: MemberPropertyMode): MemberPropertyLabels {
  return MEMBER_PROPERTY_LABELS[mode];
}

export function memberPropertyAriaLabel(subjectLabel: string, propertyLabel: string): string {
  return `${subjectLabel}${propertyLabel}`;
}

export function memberMaterialPresetHint(mode: Exclude<MemberPropertyMode, "beam">, memberLabel: MemberLabel): string {
  const sectionFields = mode === "frame" ? "截面面积 A 和截面惯性矩 I" : "截面面积 A";
  return `材料预设来自统一材料库，只回填弹性模量 E；${sectionFields} 仍按${memberLabel}截面单独维护。`;
}
