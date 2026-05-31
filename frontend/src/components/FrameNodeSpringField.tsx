import { Plus, Trash2 } from "lucide-react";
import { updateFrameSpringValue } from "../lib/frame-editor-model.ts";
import { FRAME_SUPPORT_DOF_ROWS } from "../lib/support-vocabulary.ts";
import type { FrameSpring } from "../types/structure.ts";
import { Button } from "./ui/button";
import { DropdownSelect } from "./ui/DropdownSelect";
import { Input } from "./ui/input";

interface FrameNodeSpringFieldProps {
  nodeId: string;
  springs?: FrameSpring[];
  fieldLabelClass: string;
  onChange: (nextSprings: FrameSpring[]) => void;
  showHint?: boolean;
}

const FRAME_SPRING_DOF_OPTIONS = FRAME_SUPPORT_DOF_ROWS.map((row) => ({ value: row.dof, label: row.label }));
const DEFAULT_FRAME_SPRING: FrameSpring = {
  dof: "uy",
  stiffnessKnPerM: FRAME_SUPPORT_DOF_ROWS.find((row) => row.dof === "uy")?.defaultStiffness ?? 10000,
};
const FALLBACK_FRAME_SPRING_DOF = FRAME_SUPPORT_DOF_ROWS.find((row) => row.dof === "uy") ?? {
  dof: "uy" as const,
  label: "竖向位移 uy",
  springLabel: "竖向弹簧刚度（kN/m）",
  defaultStiffness: 10000,
};

function springDofMeta(dof: FrameSpring["dof"]) {
  return FRAME_SUPPORT_DOF_ROWS.find((row) => row.dof === dof) ?? FALLBACK_FRAME_SPRING_DOF;
}

export function FrameNodeSpringField({
  nodeId,
  springs = [],
  fieldLabelClass,
  onChange,
  showHint = false,
}: FrameNodeSpringFieldProps) {
  const updateSpring = (springIndex: number, patch: Partial<FrameSpring>) => {
    onChange(springs.map((spring, index) => (index === springIndex ? updateFrameSpringValue(spring, patch) : spring)));
  };

  return (
    <div className="space-y-2 rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={fieldLabelClass}>弹性约束（节点弹簧）</div>
          {showHint ? (
            <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              对某个节点自由度附加有限刚度；平动单位 kN/m，转角单位 kN·m/rad。0 刚度不作为有效支座边界。
            </div>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...springs, DEFAULT_FRAME_SPRING])}
          className="h-7 rounded-lg px-2 text-[10px]"
        >
          <Plus className="mr-1 h-3 w-3" />
          添加弹性约束
        </Button>
      </div>
      {springs.length === 0 ? (
        <div className="text-xs text-muted-foreground">未设置弹性约束；普通固结、铰支、滚动和自由节点只需使用上方支座预设。</div>
      ) : (
        <div className="space-y-2">
          {springs.map((spring, springIndex) => {
            const meta = springDofMeta(spring.dof);
            return (
              <div
                key={`frame-node-${nodeId}-spring-${springIndex}`}
                className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
              >
                <DropdownSelect
                  value={spring.dof}
                  onChange={(nextValue) => updateSpring(springIndex, { dof: nextValue as FrameSpring["dof"] })}
                  options={FRAME_SPRING_DOF_OPTIONS}
                  className="text-xs font-mono"
                  menuClassName="text-xs font-mono"
                  ariaLabel={`节点 ${nodeId} 第 ${springIndex + 1} 个弹性约束自由度`}
                />
                <Input
                  aria-label={`节点 ${nodeId} 第 ${springIndex + 1} 个${meta.springLabel}`}
                  name={`${nodeId}-spring-${springIndex + 1}-stiffness`}
                  type="number"
                  min="0"
                  step="100"
                  value={spring.dof === "rz" ? spring.stiffnessKnMPerRad : spring.stiffnessKnPerM}
                  onChange={(event) =>
                    updateSpring(
                      springIndex,
                      spring.dof === "rz"
                        ? ({ stiffnessKnMPerRad: Number(event.target.value) || 0 } as Partial<FrameSpring>)
                        : ({ stiffnessKnPerM: Number(event.target.value) || 0 } as Partial<FrameSpring>)
                    )
                  }
                  className="h-10 min-w-0 font-mono text-xs"
                  placeholder={meta.springLabel}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10"
                  onClick={() => onChange(springs.filter((_, index) => index !== springIndex))}
                  aria-label={`删除节点 ${nodeId} 第 ${springIndex + 1} 个弹性约束`}
                >
                  <Trash2 className="h-4 w-4 text-rose-300" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
