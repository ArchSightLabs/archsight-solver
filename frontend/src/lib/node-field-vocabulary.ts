import type { SupportType } from "../types/structure.ts";

export type NodeCoordinateAxis = "x" | "y";

const NODE_COORDINATE_LABELS: Record<NodeCoordinateAxis, string> = {
  x: "横坐标（m）",
  y: "纵坐标（m）",
};

export function nodeCoordinateLabel(axis: NodeCoordinateAxis): string {
  return NODE_COORDINATE_LABELS[axis];
}

export function nodeCoordinateAriaLabel(subjectLabel: string, axis: NodeCoordinateAxis): string {
  return `${subjectLabel}${nodeCoordinateLabel(axis)}`;
}

export function supportAngleLabel(): string {
  return "滚动支座法向角（deg）";
}

export function supportAngleAriaLabel(subjectLabel: string): string {
  return `${subjectLabel}${supportAngleLabel()}`;
}

export function supportAngleApplies(supportType: SupportType | undefined): boolean {
  return supportType === "roller";
}

export function supportAngleHelpText(): string {
  return "仅滚动支座生效；角度表示被约束的法向位移方向。";
}
