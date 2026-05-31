import type { BeamSupportConfig, BeamSupportDof, BeamSupportSpring, BeamSupportType } from "../types/beam.ts";
import type { FrameSpring, FrameSupportDof, StructureNode, SupportType, TrussSupportDof, TrussSupportType } from "../types/structure.ts";
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
  selectedLabel?: string;
  description?: string;
}

type SupportGroup = "beam" | "frame" | "truss";
export type SupportDofMode = "fixed" | "spring" | "free";

type FrameNodeSupportState = Pick<StructureNode, "supportType" | "supportAngleDeg" | "springs">;

export interface BeamSupportDofRow {
  dof: BeamSupportDof;
  label: string;
  springLabel: string;
  defaultStiffness: number;
}

export interface FrameSupportDofRow {
  dof: FrameSupportDof;
  label: string;
  springLabel: string;
  defaultStiffness: number;
}

export interface TrussSupportDofRow {
  dof: TrussSupportDof;
  label: string;
}

export interface SupportDofState {
  dof: string;
  label: string;
  mode: SupportDofMode;
  detail: string;
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
  { label: "弹性", value: "spring" },
  { label: "释放", value: "free" },
];

export const BEAM_SUPPORT_DOF_ROWS: BeamSupportDofRow[] = [
  { dof: "v", label: "竖向位移 v", springLabel: "竖向弹性约束刚度（kN/m）", defaultStiffness: 50000 },
  { dof: "rz", label: "转角 θz", springLabel: "转动弹性约束刚度（kN·m/rad）", defaultStiffness: 10000 },
];

export const FRAME_SUPPORT_DOF_ROWS: FrameSupportDofRow[] = [
  { dof: "ux", label: "水平位移 ux", springLabel: "水平弹性约束刚度（kN/m）", defaultStiffness: 10000 },
  { dof: "uy", label: "竖向位移 uy", springLabel: "竖向弹性约束刚度（kN/m）", defaultStiffness: 10000 },
  { dof: "rz", label: "转角 rz", springLabel: "转动弹性约束刚度（kN·m/rad）", defaultStiffness: 10000 },
];

export const TRUSS_SUPPORT_DOF_ROWS: TrussSupportDofRow[] = [
  { dof: "ux", label: "水平位移 ux" },
  { dof: "uy", label: "竖向位移 uy" },
];

export function supportConstraintFieldLabel(): string {
  return "支座类型";
}

export function supportDofStateLabel(): string {
  return "自由度状态";
}

export function frameSpringBoundaryTitle(): string {
  return "自由度弹性约束";
}

export function frameSpringBoundaryHint(): string {
  return "在支座类型之外，为框架节点 ux、uy 或 rz 附加有限刚度边界；0 刚度不作为有效边界。";
}

export function frameSpringBoundaryEmptyHint(): string {
  return "未设置自由度弹性约束；节点仅按上方支座类型提供刚性边界。";
}

export function frameSpringBoundaryAddLabel(): string {
  return "添加自由度弹性约束";
}

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

export const TRUSS_SUPPORT_OPTIONS: Array<SupportOption<TrussSupportType>> = supportOptions<TrussSupportType>("truss");

export function supportOptionChoiceLabel(option: Pick<SupportOption<string>, "label" | "detail">): string {
  return option.detail ? `${option.label}（${option.detail}）` : option.label;
}

export function supportChoiceOptions<T extends string>(options: Array<SupportOption<T>>): Array<SupportChoiceOption<T>> {
  return options.map((option) => ({
    value: option.value,
    label: option.label,
    selectedLabel: option.label,
    description: option.detail,
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
  return optionLabel(TRUSS_SUPPORT_OPTIONS, normalizeTrussSupportForDisplay(type), "自由节点");
}

function normalizeTrussSupportForDisplay(type: SupportType | TrussSupportType | undefined): TrussSupportType {
  return type === "fixed" ? "pinned" : type ?? "free";
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
  if (spring.dof === "rz") return `${beamDofLabel(spring.dof)} 弹性约束 ${compactSupportNumber(spring.stiffnessKnMPerRad)} kN·m/rad`;
  return `${beamDofLabel(spring.dof)} 弹性约束 ${compactSupportNumber(spring.stiffnessKnPerM)} kN/m`;
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
  return optionDetail(TRUSS_SUPPORT_OPTIONS, normalizeTrussSupportForDisplay(type), "释放 ux、uy");
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
  return `${spring.dof} 弹性约束 ${compactSupportNumber(frameSpringStiffness(spring))} ${unit}`;
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
  const label = (node.supportType ?? "free") === "free" && activeSprings ? "弹性约束节点" : nodeSupportLabel(node.supportType);
  return `${label} · ${frameNodeSupportStateDetail(node)}`;
}

export function trussSupportSummary(type: SupportType | undefined): string {
  return `${trussSupportLabel(type)} · ${trussSupportDetail(type)}`;
}

function springStateDetail(spring: FrameSpring): string {
  const unit = spring.dof === "rz" ? "kN·m/rad" : "kN/m";
  return `${compactSupportNumber(frameSpringStiffness(spring))} ${unit}`;
}

function supportDofState(label: string, dof: string, mode: SupportDofMode, detail?: string): SupportDofState {
  return { dof, label, mode, detail: detail ?? (mode === "fixed" ? "约束" : mode === "spring" ? "弹性约束" : "释放") };
}

export function frameNodeSupportDofStates(node: FrameNodeSupportState): SupportDofState[] {
  const supportType = node.supportType ?? "free";
  const activeSprings = (node.springs ?? []).filter(isPositiveFrameSpring);

  if (supportType === "roller" && Number.isFinite(node.supportAngleDeg)) {
    const angle = formatSupportAngle(Number(node.supportAngleDeg));
    const rzSpring = activeSprings.find((spring) => spring.dof === "rz");
    return [
      supportDofState("法向位移 n", "n", "fixed", `约束 ${angle}° 法向`),
      supportDofState("切向位移 t", "t", "free", "释放切向"),
      rzSpring
        ? supportDofState("转角 rz", "rz", "spring", `弹性约束 ${springStateDetail(rzSpring)}`)
        : supportDofState("转角 rz", "rz", "free"),
    ];
  }

  const constrainedDofs = new Set<FrameSupportDof>(frameSupportConstraintDofs(supportType));
  const springByDof = new Map<FrameSupportDof, FrameSpring>(activeSprings.map((spring) => [spring.dof, spring] as const));
  return FRAME_SUPPORT_DOF_ROWS.map((row) => {
    if (constrainedDofs.has(row.dof)) return supportDofState(row.label, row.dof, "fixed");
    const spring = springByDof.get(row.dof);
    if (spring) return supportDofState(row.label, row.dof, "spring", `弹性约束 ${springStateDetail(spring)}`);
    return supportDofState(row.label, row.dof, "free");
  });
}

export function trussSupportDofStates(type: SupportType | undefined): SupportDofState[] {
  const supportType = type === "fixed" ? "pinned" : type ?? "free";
  const constrainedDofs = new Set<TrussSupportDof>(
    supportType === "pinned" ? ["ux", "uy"] : supportType === "roller" ? ["uy"] : [],
  );
  return TRUSS_SUPPORT_DOF_ROWS.map((row) => (
    constrainedDofs.has(row.dof)
      ? supportDofState(row.label, row.dof, "fixed")
      : supportDofState(row.label, row.dof, "free")
  ));
}

export function beamSupportNote(type: BeamSupportType | undefined): string {
  return optionNote(BEAM_SUPPORT_OPTIONS, type ?? "pinned", "梁系支座按 v / θz 自由度参与整体刚度矩阵。");
}

export function nodeSupportNote(type: SupportType | undefined): string {
  return optionNote(FRAME_SUPPORT_OPTIONS, type ?? "free", "框架支座按 ux / uy / rz 自由度参与整体刚度矩阵。");
}

export function trussSupportNote(type: SupportType | undefined): string {
  return optionNote(TRUSS_SUPPORT_OPTIONS, normalizeTrussSupportForDisplay(type), "桁架支座只约束节点平动自由度。");
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
