import type { BeamSupportConfig, BeamSupportDof, BeamSupportSpring, BeamSupportType } from "../types/beam.ts";
import type { FrameSpring, StructureNode, SupportType } from "../types/structure.ts";
import sharedSupports from "../../../shared/supports.json" with { type: "json" };

export interface SupportOption<T extends string> {
  value: T;
  label: string;
  detail: string;
  constraints: string[];
  released: string[];
  note: string;
}

export interface SupportChoiceOption<T extends string> {
  value: T;
  label: string;
}

type SupportGroup = "beam" | "frame" | "truss";
export type SupportDofMode = "fixed" | "spring" | "free";
type FrameSupportDof = "ux" | "uy" | "rz";

type FrameNodeSupportState = Pick<StructureNode, "supportType" | "supportAngleDeg" | "springs">;

export interface BeamSupportDofRow {
  dof: BeamSupportDof;
  label: string;
  springLabel: string;
  defaultStiffness: number;
}

interface SharedSupportOption {
  value: string;
  label: string;
  detail: string;
  constraints?: string[];
  released?: string[];
  note?: string;
}

interface SharedSupportCatalog extends Record<SupportGroup, SharedSupportOption[]> {
  notes: Record<SupportGroup, string>;
}

const SUPPORT_CATALOG = sharedSupports as SharedSupportCatalog;

export const SUPPORT_DOF_MODE_OPTIONS: Array<{ label: string; value: SupportDofMode }> = [
  { label: "约束", value: "fixed" },
  { label: "弹簧", value: "spring" },
  { label: "释放", value: "free" },
];

export const BEAM_SUPPORT_DOF_ROWS: BeamSupportDofRow[] = [
  { dof: "v", label: "竖向位移 v", springLabel: "竖向弹簧刚度（kN/m）", defaultStiffness: 50000 },
  { dof: "rz", label: "转角 θz", springLabel: "转动弹簧刚度（kN·m/rad）", defaultStiffness: 10000 },
];

function supportOptions<T extends string>(group: SupportGroup): Array<SupportOption<T>> {
  return SUPPORT_CATALOG[group].map((option) => ({
    value: option.value as T,
    label: option.label,
    detail: option.detail,
    constraints: option.constraints ?? [],
    released: option.released ?? [],
    note: option.note ?? "",
  }));
}

export const BEAM_SUPPORT_OPTIONS: Array<SupportOption<BeamSupportType>> = supportOptions<BeamSupportType>("beam");

export const FRAME_SUPPORT_OPTIONS: Array<SupportOption<SupportType>> = supportOptions<SupportType>("frame");

export const TRUSS_SUPPORT_OPTIONS: Array<SupportOption<Exclude<SupportType, "fixed">>> = supportOptions<Exclude<SupportType, "fixed">>("truss");

export function supportOptionChoiceLabel(option: Pick<SupportOption<string>, "label" | "detail">): string {
  return option.detail ? `${option.label}（${option.detail}）` : option.label;
}

export function supportChoiceOptions<T extends string>(options: Array<SupportOption<T>>): Array<SupportChoiceOption<T>> {
  return options.map((option) => ({
    value: option.value,
    label: supportOptionChoiceLabel(option),
  }));
}

function optionLabel<T extends string>(options: Array<SupportOption<T>>, value: T | undefined, fallback: string): string {
  return options.find((option) => option.value === value)?.label ?? fallback;
}

export function beamSupportLabel(type: BeamSupportType | undefined): string {
  return optionLabel(BEAM_SUPPORT_OPTIONS, type ?? "pinned", "铰支座");
}

export function nodeSupportLabel(type: SupportType | undefined): string {
  return optionLabel(FRAME_SUPPORT_OPTIONS, type ?? "free", "自由节点");
}

export function trussSupportLabel(type: SupportType | undefined): string {
  return optionLabel(TRUSS_SUPPORT_OPTIONS, (type === "fixed" ? "pinned" : type ?? "free") as Exclude<SupportType, "fixed">, "自由节点");
}

function optionDetail<T extends string>(options: Array<SupportOption<T>>, value: T | undefined, fallback: string): string {
  return options.find((option) => option.value === value)?.detail ?? fallback;
}

function optionNote<T extends string>(options: Array<SupportOption<T>>, value: T | undefined, fallback: string): string {
  return options.find((option) => option.value === value)?.note ?? fallback;
}

export function beamSupportDetail(type: BeamSupportType | undefined): string {
  return optionDetail(BEAM_SUPPORT_OPTIONS, type ?? "pinned", "约束 v，释放 θz");
}

function compactSupportNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return value.toFixed(0);
  return value.toFixed(2).replace(/\.?0+$/u, "");
}

function beamDofLabel(dof: BeamSupportDof): string {
  return dof === "rz" ? "θz" : "v";
}

function beamSpringSummary(spring: BeamSupportSpring): string {
  if (spring.dof === "rz") return `${beamDofLabel(spring.dof)} 弹簧 ${compactSupportNumber(spring.stiffnessKnMPerRad)} kN·m/rad`;
  return `${beamDofLabel(spring.dof)} 弹簧 ${compactSupportNumber(spring.stiffnessKnPerM)} kN/m`;
}

export function beamSupportStateDetail(support: Pick<BeamSupportConfig, "type" | "constraints" | "springs">): string {
  const constraints = support.constraints ?? beamSupportConstraints(support.type);
  const springs = support.springs ?? [];
  const constrained = new Set<BeamSupportDof>(constraints);
  const springDofs = new Set<BeamSupportDof>(springs.map((spring) => spring.dof));
  const released = BEAM_SUPPORT_DOF_ROWS.map((row) => row.dof).filter((dof) => !constrained.has(dof) && !springDofs.has(dof));
  const parts: string[] = [];

  if (constraints.length) parts.push(`约束 ${constraints.map(beamDofLabel).join("、")}`);
  parts.push(...springs.map(beamSpringSummary));
  if (released.length) parts.push(`释放 ${released.map(beamDofLabel).join("、")}`);

  return parts.length ? parts.join("，") : "释放 v、θz";
}

export function beamSupportSummary(support: Pick<BeamSupportConfig, "type" | "constraints" | "springs">): string {
  return `${beamSupportLabel(support.type)} · ${beamSupportStateDetail(support)}`;
}

export function nodeSupportDetail(type: SupportType | undefined): string {
  return optionDetail(FRAME_SUPPORT_OPTIONS, type ?? "free", "释放 ux、uy、rz");
}

export function trussSupportDetail(type: SupportType | undefined): string {
  return optionDetail(TRUSS_SUPPORT_OPTIONS, (type === "fixed" ? "pinned" : type ?? "free") as Exclude<SupportType, "fixed">, "释放 ux、uy");
}

export function nodeSupportSummary(type: SupportType | undefined): string {
  return `${nodeSupportLabel(type)} · ${nodeSupportDetail(type)}`;
}

function frameSpringStiffness(spring: FrameSpring): number {
  return spring.dof === "rz" ? spring.stiffnessKnMPerRad : spring.stiffnessKnPerM;
}

function isPositiveFrameSpring(spring: FrameSpring): boolean {
  return frameSpringStiffness(spring) > 0;
}

function frameSpringSummary(spring: FrameSpring): string {
  const unit = spring.dof === "rz" ? "kN·m/rad" : "kN/m";
  return `${spring.dof} 弹簧 ${compactSupportNumber(frameSpringStiffness(spring))} ${unit}`;
}

function frameSupportConstraintDofs(type: SupportType | undefined): FrameSupportDof[] {
  if (type === "fixed") return ["ux", "uy", "rz"];
  if (type === "pinned") return ["ux", "uy"];
  if (type === "roller") return ["uy"];
  return [];
}

function formatSupportAngle(value: number): string {
  return compactSupportNumber(value);
}

export function hasFrameSupportBoundary(node: FrameNodeSupportState): boolean {
  return (node.supportType ?? "free") !== "free" || (node.springs ?? []).some(isPositiveFrameSpring);
}

export function frameNodeSupportStateDetail(node: FrameNodeSupportState): string {
  const supportType = node.supportType ?? "free";
  const activeSprings = (node.springs ?? []).filter(isPositiveFrameSpring);
  const constrainedDofs = new Set<FrameSupportDof>(frameSupportConstraintDofs(supportType));
  const springDofs = new Set<FrameSupportDof>(activeSprings.map((spring) => spring.dof));
  const parts: string[] = [];

  if (supportType === "roller" && Number.isFinite(node.supportAngleDeg)) {
    parts.push(`约束法向位移（${formatSupportAngle(Number(node.supportAngleDeg))}°）`);
    constrainedDofs.clear();
  } else if (constrainedDofs.size > 0) {
    parts.push(`约束 ${Array.from(constrainedDofs).join("、")}`);
  }

  parts.push(...activeSprings.map(frameSpringSummary));

  if (supportType === "roller" && Number.isFinite(node.supportAngleDeg)) {
    parts.push(springDofs.has("rz") ? "释放切向位移" : "释放切向位移、rz");
  } else {
    const released = (["ux", "uy", "rz"] as FrameSupportDof[]).filter((dof) => !constrainedDofs.has(dof) && !springDofs.has(dof));
    if (released.length) parts.push(`释放 ${released.join("、")}`);
  }

  return parts.length ? parts.join("，") : "释放 ux、uy、rz";
}

export function frameNodeSupportSummary(node: FrameNodeSupportState): string {
  const activeSprings = (node.springs ?? []).some(isPositiveFrameSpring);
  const label = (node.supportType ?? "free") === "free" && activeSprings ? "弹性支座" : nodeSupportLabel(node.supportType);
  return `${label} · ${frameNodeSupportStateDetail(node)}`;
}

export function trussSupportSummary(type: SupportType | undefined): string {
  return `${trussSupportLabel(type)} · ${trussSupportDetail(type)}`;
}

export function beamSupportNote(type: BeamSupportType | undefined): string {
  return optionNote(BEAM_SUPPORT_OPTIONS, type ?? "pinned", "梁系支座按 v / θz 自由度参与整体刚度矩阵。");
}

export function nodeSupportNote(type: SupportType | undefined): string {
  return optionNote(FRAME_SUPPORT_OPTIONS, type ?? "free", "框架支座按 ux / uy / rz 自由度参与整体刚度矩阵。");
}

export function trussSupportNote(type: SupportType | undefined): string {
  return optionNote(TRUSS_SUPPORT_OPTIONS, (type === "fixed" ? "pinned" : type ?? "free") as Exclude<SupportType, "fixed">, "桁架支座只约束节点平动自由度。");
}

function optionConstraints<T extends string>(options: Array<SupportOption<T>>, value: T | undefined): string[] {
  return options.find((option) => option.value === value)?.constraints ?? [];
}

export function beamSupportConstraints(type: BeamSupportType | undefined): Array<"v" | "rz"> {
  return optionConstraints(BEAM_SUPPORT_OPTIONS, type ?? "pinned") as Array<"v" | "rz">;
}

export function supportSystemHint(group: SupportGroup): string {
  return SUPPORT_CATALOG.notes[group];
}
