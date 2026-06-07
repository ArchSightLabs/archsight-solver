import { DropdownSelect } from "./ui/DropdownSelect";
import {
  FRAME_SUPPORT_OPTIONS,
  TRUSS_SUPPORT_OPTIONS,
  frameNodeSupportStateDetail,
  supportConstraintFieldLabel,
  supportChoiceOptions,
  trussSupportDetail,
} from "../lib/support-vocabulary.ts";
import { cn } from "@/lib/utils";
import type { FrameSpring, StructureNode, SupportType, TrussSupportType } from "../types/structure.ts";

interface CommonNodeSupportFieldProps {
  fieldLabelClass: string;
  className?: string;
  label?: string;
  ariaLabel?: string;
  showHint?: boolean;
  compact?: boolean;
}

interface FrameNodeSupportFieldProps extends CommonNodeSupportFieldProps {
  mode: "frame";
  supportType?: SupportType;
  onSupportTypeChange: (nextSupportType: SupportType) => void;
  supportAngleDeg?: number;
  springs?: FrameSpring[];
  supportDisplacements?: StructureNode["supportDisplacements"];
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
    compact = false,
  } = props;

  const isTruss = mode === "truss";
  const choiceOptions = supportChoiceOptions(isTruss ? TRUSS_SUPPORT_OPTIONS : FRAME_SUPPORT_OPTIONS)
    .map(({ description: _description, ...option }) => option);
  const value = props.supportType ?? "free";
  const detail = isTruss
    ? trussSupportDetail(value)
    : frameNodeSupportStateDetail({ supportType: value, supportAngleDeg: props.supportAngleDeg, springs: props.springs, supportDisplacements: props.supportDisplacements });

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
      compact={compact} />
      {showHint ? (
        <div className="truncate text-[10px] font-semibold leading-snug text-muted-foreground">{detail}</div>
      ) : null}
    </div>
  );
}
