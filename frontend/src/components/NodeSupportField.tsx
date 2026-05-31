import { DropdownSelect } from "./ui/DropdownSelect";
import {
  FRAME_SUPPORT_OPTIONS,
  TRUSS_SUPPORT_OPTIONS,
  frameNodeSupportDofStates,
  frameNodeSupportStateDetail,
  nodeSupportNote,
  supportConstraintFieldLabel,
  supportChoiceOptions,
  supportDofStateLabel,
  supportSystemHint,
  trussSupportDetail,
  trussSupportDofStates,
  trussSupportNote,
  type SupportDofMode,
  type SupportDofState,
} from "../lib/support-vocabulary.ts";
import { cn } from "@/lib/utils";
import type { FrameSpring, SupportType } from "../types/structure.ts";

type NodeSupportMode = "frame" | "truss";

interface NodeSupportFieldProps {
  mode: NodeSupportMode;
  supportType?: SupportType;
  onSupportTypeChange: (nextSupportType: SupportType) => void;
  supportAngleDeg?: number;
  springs?: FrameSpring[];
  fieldLabelClass: string;
  className?: string;
  label?: string;
  ariaLabel?: string;
  showHint?: boolean;
}

export function NodeSupportField({
  mode,
  supportType,
  onSupportTypeChange,
  supportAngleDeg,
  springs,
  fieldLabelClass,
  className,
  label = supportConstraintFieldLabel(),
  ariaLabel = "支座类型",
  showHint = false,
}: NodeSupportFieldProps) {
  const options = mode === "truss" ? TRUSS_SUPPORT_OPTIONS : FRAME_SUPPORT_OPTIONS;
  const choiceOptions = supportChoiceOptions(options);
  const value = mode === "truss" && supportType === "fixed" ? "pinned" : supportType ?? "free";
  const detail = mode === "truss"
    ? trussSupportDetail(value as SupportType)
    : frameNodeSupportStateDetail({ supportType: value as SupportType, supportAngleDeg, springs });
  const note = mode === "truss" ? trussSupportNote(value as SupportType) : nodeSupportNote(value as SupportType);
  const dofStates = mode === "truss"
    ? trussSupportDofStates(value as SupportType)
    : frameNodeSupportDofStates({ supportType: value as SupportType, supportAngleDeg, springs });

  return (
    <div className={cn("space-y-1", className)}>
      <div className={fieldLabelClass}>{label}</div>
      <DropdownSelect
        value={value}
        onChange={(nextValue) => onSupportTypeChange(nextValue as SupportType)}
        options={choiceOptions}
        className="text-xs font-mono"
        menuClassName="text-xs font-mono"
        ariaLabel={ariaLabel}
      />
      {showHint ? (
        <div className="space-y-1 text-[10px] font-semibold leading-relaxed text-muted-foreground">
          <div>{supportDofStateLabel()}：{detail}</div>
          <SupportDofStateChips states={dofStates} />
          <div>工程提示：{note}</div>
          <div>{supportSystemHint(mode)}</div>
        </div>
      ) : null}
    </div>
  );
}

function dofStateTone(mode: SupportDofMode) {
  if (mode === "fixed") return "border-sky-300/45 bg-sky-400/10 text-sky-700 dark:text-sky-200";
  if (mode === "spring") return "border-amber-300/45 bg-amber-300/10 text-amber-700 dark:text-amber-200";
  return "border-slate-300/60 bg-slate-100/60 text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400";
}

function SupportDofStateChips({ states }: { states: SupportDofState[] }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
      {states.map((state) => (
        <span key={state.dof} className={`rounded-md border px-2 py-1 ${dofStateTone(state.mode)}`}>
          <span className="block text-[10px] font-bold text-foreground/70">{state.label}</span>
          <span className="block font-mono text-[10px]">{state.detail}</span>
        </span>
      ))}
    </div>
  );
}
