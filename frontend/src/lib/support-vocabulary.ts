import type { BeamSupportDof, BeamSupportType } from "../types/beam.ts";
import type { SupportType } from "../types/structure.ts";
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

export function nodeSupportDetail(type: SupportType | undefined): string {
  return optionDetail(FRAME_SUPPORT_OPTIONS, type ?? "free", "释放 ux、uy、rz");
}

export function trussSupportDetail(type: SupportType | undefined): string {
  return optionDetail(TRUSS_SUPPORT_OPTIONS, (type === "fixed" ? "pinned" : type ?? "free") as Exclude<SupportType, "fixed">, "释放 ux、uy");
}

export function nodeSupportSummary(type: SupportType | undefined): string {
  return `${nodeSupportLabel(type)} · ${nodeSupportDetail(type)}`;
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
