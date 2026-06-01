export type MemberPropertyMode = "beam" | "frame" | "truss";
export type MemberLabel = "跨段" | "杆件" | "构件";

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

export function memberMaterialPresetHint(mode: MemberPropertyMode, memberLabel: MemberLabel): string {
  const sectionFields =
    mode === "beam"
      ? "截面惯性矩 I"
      : mode === "frame"
        ? "截面面积 A 和截面惯性矩 I"
        : "截面面积 A";
  return `材料只回填 E；${sectionFields} 按${memberLabel}维护。`;
}

function compactNumber(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return value.toFixed(0);
  return value.toFixed(2).replace(/\.?0+$/u, "");
}

export interface MemberSectionSummaryInput {
  E?: number;
  E_GPa?: number;
  A_cm2?: number;
  I?: number;
  I_cm4?: number;
  materialLabel?: string;
}

export function memberSectionSummary(mode: MemberPropertyMode, input: MemberSectionSummaryInput): string {
  const youngModulus = input.E_GPa ?? input.E;
  const momentOfInertia = input.I_cm4 ?? input.I;
  const parts = input.materialLabel ? [`材料 ${input.materialLabel}`] : [];

  parts.push(`E=${compactNumber(youngModulus)} GPa`);
  if (mode !== "beam") parts.push(`A=${compactNumber(input.A_cm2)} cm²`);
  if (mode !== "truss") parts.push(`I=${compactNumber(momentOfInertia)} cm⁴`);

  return parts.join(" · ");
}
