import { DropdownSelect } from "./ui/DropdownSelect";
import { FRAME_SUPPORT_OPTIONS, TRUSS_SUPPORT_OPTIONS, nodeSupportDetail, nodeSupportNote, supportChoiceOptions, supportSystemHint, trussSupportDetail, trussSupportNote } from "../lib/support-vocabulary.ts";
import { cn } from "@/lib/utils";
import type { SupportType } from "../types/structure.ts";

type NodeSupportMode = "frame" | "truss";

interface NodeSupportFieldProps {
  mode: NodeSupportMode;
  supportType?: SupportType;
  onSupportTypeChange: (nextSupportType: SupportType) => void;
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
  fieldLabelClass,
  className,
  label = "支座约束",
  ariaLabel = "支座约束",
  showHint = false,
}: NodeSupportFieldProps) {
  const options = mode === "truss" ? TRUSS_SUPPORT_OPTIONS : FRAME_SUPPORT_OPTIONS;
  const choiceOptions = supportChoiceOptions(options);
  const value = mode === "truss" && supportType === "fixed" ? "pinned" : supportType ?? "free";
  const detail = mode === "truss" ? trussSupportDetail(value as SupportType) : nodeSupportDetail(value as SupportType);
  const note = mode === "truss" ? trussSupportNote(value as SupportType) : nodeSupportNote(value as SupportType);

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
          <div>当前含义：{detail}</div>
          <div>工程提示：{note}</div>
          <div>{supportSystemHint(mode)}</div>
        </div>
      ) : null}
    </div>
  );
}
