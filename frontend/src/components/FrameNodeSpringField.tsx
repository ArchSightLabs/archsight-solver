import { Plus, Trash2 } from "lucide-react";
import { FRAME_SPRING_DOF_OPTIONS, updateFrameSpringValue } from "../lib/frame-editor-model.ts";
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

const DEFAULT_FRAME_SPRING: FrameSpring = { dof: "uy", stiffnessKnPerM: 10000 };

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
          <div className={fieldLabelClass}>弹性支座</div>
          {showHint ? (
            <div className="mt-1 text-[11px] text-muted-foreground">
              平动弹簧单位 kN/m，转角弹簧单位 kN·m/rad。
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
          新增弹簧
        </Button>
      </div>
      {springs.length === 0 ? (
        <div className="text-xs text-muted-foreground">未设置节点弹簧</div>
      ) : (
        <div className="space-y-2">
          {springs.map((spring, springIndex) => (
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
                ariaLabel={`节点 ${nodeId} 第 ${springIndex + 1} 个弹簧自由度`}
              />
              <Input
                aria-label={`节点 ${nodeId} 第 ${springIndex + 1} 个弹簧刚度`}
                name={`${nodeId}-spring-${springIndex + 1}-stiffness`}
                type="number"
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
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={() => onChange(springs.filter((_, index) => index !== springIndex))}
                aria-label={`删除节点 ${nodeId} 第 ${springIndex + 1} 个弹簧`}
              >
                <Trash2 className="h-4 w-4 text-rose-300" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
