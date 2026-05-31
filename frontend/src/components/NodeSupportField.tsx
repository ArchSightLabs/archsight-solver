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
import type { FrameSpring, SupportType, TrussSupportType } from "../types/structure.ts";

interface CommonNodeSupportFieldProps {
  fieldLabelClass: string;
  className?: string;
  label?: string;
  ariaLabel?: string;
  showHint?: boolean;
}

interface FrameNodeSupportFieldProps extends CommonNodeSupportFieldProps {
  mode: "frame";
  supportType?: SupportType;
  onSupportTypeChange: (nextSupportType: SupportType) => void;
  supportAngleDeg?: number;
  springs?: FrameSpring[];
}

interface TrussNodeSupportFieldProps extends CommonNodeSupportFieldProps {
  mode: "truss";
  supportType?: TrussSupportType;
  onSupportTypeChange: (nextSupportType: TrussSupportType) => void;
}

type NodeSupportFieldProps = FrameNodeSupportFieldProps | TrussNodeSupportFieldProps;

export function NodeSupportField(props: NodeSupportFieldProps) {
  const {
    mode,
    fieldLabelClass,
    className,
    label = supportConstraintFieldLabel(),
    ariaLabel = "支座类型",
    showHint = false,
  } = props;

  const isTruss = mode === "truss";
  const choiceOptions = supportChoiceOptions(isTruss ? TRUSS_SUPPORT_OPTIONS : FRAME_SUPPORT_OPTIONS);
  const value = props.supportType ?? "free";
  const detail = isTruss
    ? trussSupportDetail(value)
    : frameNodeSupportStateDetail({ supportType: value, supportAngleDeg: props.supportAngleDeg, springs: props.springs });
  const note = isTruss ? trussSupportNote(value) : nodeSupportNote(value);
  const dofStates = isTruss
    ? trussSupportDofStates(value)
    : frameNodeSupportDofStates({ supportType: value, supportAngleDeg: props.supportAngleDeg, springs: props.springs });

  const handleChange = (nextValue: string) => {
    if (isTruss) {
      props.onSupportTypeChange(nextValue as TrussSupportType);
      return;
    }
    props.onSupportTypeChange(nextValue as SupportType);
  };

  return (
    <div className={cn("space-y-1", className)}>
      <div className={fieldLabelClass}>{label}</div>
      <DropdownSelect
        value={value}
        onChange={handleChange}
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
