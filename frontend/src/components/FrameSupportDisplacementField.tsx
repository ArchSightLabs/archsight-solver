import { Plus, Trash2 } from "lucide-react";
import {
  createFrameSupportDisplacement,
  frameSupportDisplacementMagnitude,
  frameSupportDisplacementOptions,
  normalizeFrameSupportDisplacements,
  updateFrameSupportDisplacement,
} from "../lib/frame-support-displacements.ts";
import type { FrameSupportDisplacement, FrameSupportDisplacementDof, StructureNode } from "../types/structure.ts";
import { Button } from "./ui/button";
import { DropdownSelect } from "./ui/DropdownSelect";
import { Input } from "./ui/input";

interface FrameSupportDisplacementFieldProps {
  node: Pick<StructureNode, "id" | "supportType" | "supportAngleDeg" | "supportDisplacements">;
  fieldLabelClass: string;
  onChange: (nextDisplacements: FrameSupportDisplacement[]) => void;
  compactWhenEmpty?: boolean;
  compact?: boolean;
}

function fallbackDisplacementOption(node: FrameSupportDisplacementFieldProps["node"]) {
  return frameSupportDisplacementOptions(node)[0] ?? null;
}

export function FrameSupportDisplacementField({
  node,
  fieldLabelClass,
  onChange,
  compactWhenEmpty = false,
}: FrameSupportDisplacementFieldProps) {
  const options = frameSupportDisplacementOptions(node);
  const dropdownOptions = options.map((option) => ({ value: option.dof, label: option.label }));
  const displacements = normalizeFrameSupportDisplacements(node) ?? [];
  const canAdd = options.some((option) => !displacements.some((displacement) => displacement.dof === option.dof));
  const addDisplacement = () => {
    const option = options.find((candidate) => !displacements.some((displacement) => displacement.dof === candidate.dof));
    if (!option) return;
    onChange([...displacements, createFrameSupportDisplacement(option.dof)]);
  };
  const updateDisplacement = (index: number, patch: Partial<FrameSupportDisplacement>) => {
    onChange(displacements.map((displacement, displacementIndex) => (
      displacementIndex === index ? updateFrameSupportDisplacement(displacement, patch) : displacement
    )));
  };
  const defaultOption = fallbackDisplacementOption(node);

  if (compactWhenEmpty && displacements.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
        <div className="min-w-0">
          <div className={fieldLabelClass}>支座位移</div>
          <div className="mt-1 text-[10px] font-semibold leading-relaxed text-muted-foreground">
            {options.length ? "未设置" : "需先选择刚性支座"}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={addDisplacement} disabled={!canAdd} className="h-8 rounded-lg px-2 text-[10px]">
          <Plus className="mr-1 h-3 w-3" />
          添加位移
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={fieldLabelClass}>支座位移</div>
          <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            仅对已约束自由度生效；平动单位 mm，转角单位 deg。
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={addDisplacement} disabled={!canAdd} className="h-7 rounded-lg px-2 text-[10px]">
          <Plus className="mr-1 h-3 w-3" />
          添加位移
        </Button>
      </div>
      {displacements.length === 0 ? (
        <div className="text-xs text-muted-foreground">{options.length ? "未设置" : "需先选择 fixed、pinned 或 roller 支座"}</div>
      ) : (
        <div className="space-y-2">
          {displacements.map((displacement, index) => {
            const selectedOption = options.find((option) => option.dof === displacement.dof) ?? defaultOption;
            const unit = selectedOption?.unit ?? (displacement.dof === "rz" ? "deg" : "mm");
            return (
              <div key={`frame-node-${node.id}-support-displacement-${index}`} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <DropdownSelect
                  value={displacement.dof}
                  onChange={(nextValue) => updateDisplacement(index, { dof: nextValue as FrameSupportDisplacementDof })}
                  options={dropdownOptions}
                  className="text-xs font-mono"
                  menuClassName="text-xs font-mono"
                  ariaLabel={`节点 ${node.id} 第 ${index + 1} 个支座位移自由度`}
                />
                <Input
                  aria-label={`节点 ${node.id} 第 ${index + 1} 个支座位移值`}
                  name={`${node.id}-support-displacement-${index + 1}`}
                  type="number"
                  step={unit === "deg" ? "0.01" : "0.1"}
                  value={frameSupportDisplacementMagnitude(displacement)}
                  onChange={(event) => {
                    const value = Number(event.target.value) || 0;
                    updateDisplacement(index, displacement.dof === "rz" ? { rotationDeg: value } : { displacementMm: value });
                  }}
                  className="min-w-0 font-mono text-xs"
                  placeholder={unit}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-10"
                  onClick={() => onChange(displacements.filter((_, displacementIndex) => displacementIndex !== index))}
                  aria-label={`删除节点 ${node.id} 第 ${index + 1} 个支座位移`}
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
