import { Button } from "./ui/button";
import { DeferredIdInput } from "./ui/DeferredIdInput";
import { Input } from "./ui/input";
import {
  BEAM_SUPPORT_DOF_ROWS,
  BEAM_SUPPORT_OPTIONS,
  SUPPORT_DOF_MODE_OPTIONS,
  beamSupportConstraints,
  beamSupportDetail,
  beamSupportLabel,
  beamSupportNote,
  supportSystemHint,
  type SupportDofMode,
} from "../lib/support-vocabulary.ts";
import type { BeamSupportConfig, BeamSupportDof, BeamSupportSpring, BeamSupportType } from "../types/beam.ts";

const SEGMENTED_OPTION_ACTIVE_CLASS =
  "border-transparent bg-sky-400 text-slate-950 shadow-[0_10px_24px_rgba(56,189,248,0.22)] hover:bg-sky-300 focus-visible:ring-sky-300/70 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300";
const SEGMENTED_OPTION_IDLE_CLASS =
  "border-white/10 bg-white/[0.03] text-foreground/70 hover:border-sky-300/35 hover:bg-sky-400/10 hover:text-foreground dark:hover:bg-sky-400/10";

function constraintsFromType(type: BeamSupportType): BeamSupportDof[] {
  return beamSupportConstraints(type);
}

function supportConstraints(support: BeamSupportConfig): BeamSupportDof[] {
  return support.constraints ?? constraintsFromType(support.type);
}

function deriveSupportType(constraints: BeamSupportDof[], springs: BeamSupportSpring[] | undefined, prior: BeamSupportType): BeamSupportType {
  const hasV = constraints.includes("v");
  const hasRz = constraints.includes("rz");
  if (hasV && hasRz) return "fixed";
  if (hasV) return prior === "roller" ? "roller" : "pinned";
  if ((springs ?? []).length > 0) return "free";
  return "free";
}

function dofMode(support: BeamSupportConfig, dof: BeamSupportDof): SupportDofMode {
  if (supportConstraints(support).includes(dof)) return "fixed";
  if (support.springs?.some((spring) => spring.dof === dof)) return "spring";
  return "free";
}

function defaultSpring(dof: BeamSupportDof): BeamSupportSpring {
  const defaultStiffness = BEAM_SUPPORT_DOF_ROWS.find((row) => row.dof === dof)?.defaultStiffness ?? 0;
  return dof === "rz" ? { dof, stiffnessKnMPerRad: defaultStiffness } : { dof, stiffnessKnPerM: defaultStiffness };
}

interface BeamSupportEditorProps {
  support: BeamSupportConfig;
  supportIndex: number;
  nodeLabel: string;
  totalLength: number;
  fieldLabelClass: string;
  onUpdate: (patch: Partial<BeamSupportConfig>) => void;
  onUpdateId: (nextId: string) => void;
}

export function BeamSupportEditor({
  support,
  supportIndex,
  nodeLabel,
  totalLength,
  fieldLabelClass,
  onUpdate,
  onUpdateId,
}: BeamSupportEditorProps) {
  const updateSupportType = (type: BeamSupportType) => {
    onUpdate({ type, constraints: constraintsFromType(type), springs: [] });
  };

  const updateSupportDofMode = (dof: BeamSupportDof, mode: SupportDofMode) => {
    let constraints = supportConstraints(support).filter((item) => item !== dof);
    let springs = (support.springs ?? []).filter((spring) => spring.dof !== dof);
    if (mode === "fixed") {
      constraints = [...constraints, dof];
    } else if (mode === "spring") {
      springs = [...springs, defaultSpring(dof)];
    }
    onUpdate({
      constraints,
      springs: springs.length ? springs : undefined,
      type: deriveSupportType(constraints, springs, support.type),
    });
  };

  const updateSupportSpring = (dof: BeamSupportDof, stiffness: number) => {
    const springs = (support.springs ?? []).map((spring) => {
      if (spring.dof !== dof) return spring;
      return dof === "rz" ? { dof, stiffnessKnMPerRad: stiffness } : { dof, stiffnessKnPerM: stiffness };
    });
    onUpdate({ springs });
  };

  return (
    <div className="space-y-3 rounded-xl border border-white/8 bg-slate-950/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={fieldLabelClass}>当前支座</div>
          <div className="mt-1 text-sm font-bold">{support.id}</div>
          <div className="mt-1 text-[10px] font-semibold text-muted-foreground">
            节点 {nodeLabel} · {beamSupportLabel(support.type)} · {beamSupportDetail(support.type)}
          </div>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-muted-foreground">
          x = {support.x.toFixed(2)} m
        </span>
      </div>
      <div className="space-y-2">
        <div className={fieldLabelClass}>支座约束</div>
        <div className="grid grid-cols-2 gap-2">
          {BEAM_SUPPORT_OPTIONS.map((option) => {
            const isActive = support.type === option.value;
            return (
              <Button
                key={option.value}
                type="button"
                variant="ghost"
                aria-pressed={isActive}
                className={`h-9 rounded-lg border text-[12px] font-semibold ${isActive ? SEGMENTED_OPTION_ACTIVE_CLASS : SEGMENTED_OPTION_IDLE_CLASS}`}
                onClick={() => updateSupportType(option.value)}
              >
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>
      <div className="space-y-3 rounded-xl border border-white/8 bg-background/20 p-3">
        <div className={fieldLabelClass}>自由度约束</div>
        {BEAM_SUPPORT_DOF_ROWS.map((item) => {
          const mode = dofMode(support, item.dof);
          const spring = support.springs?.find((candidate) => candidate.dof === item.dof);
          const stiffness = spring?.dof === "rz"
            ? spring.stiffnessKnMPerRad
            : spring?.dof === "v"
              ? spring.stiffnessKnPerM
              : item.defaultStiffness;
          return (
            <div key={item.dof} className="space-y-2 rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold">{item.label}</div>
                <div className="grid grid-cols-3 gap-1">
                  {SUPPORT_DOF_MODE_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant="ghost"
                      aria-pressed={mode === option.value}
                      className={`h-7 rounded-md border px-2 text-[10px] font-semibold ${mode === option.value ? SEGMENTED_OPTION_ACTIVE_CLASS : SEGMENTED_OPTION_IDLE_CLASS}`}
                      onClick={() => updateSupportDofMode(item.dof, option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
              {mode === "spring" ? (
                <div className="space-y-1">
                  <div className={fieldLabelClass}>{item.springLabel}</div>
                  <Input
                    aria-label={item.springLabel}
                    name={`${support.id}-${item.dof}-spring-stiffness`}
                    type="number"
                    min="0"
                    step="1000"
                    value={stiffness}
                    onChange={(event) => updateSupportSpring(item.dof, Math.max(Number(event.target.value) || 0, 0))}
                    className="h-9 min-w-0 font-mono text-xs"
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <div className={fieldLabelClass}>节点位置 x（m）</div>
          <Input
            aria-label="节点位置 x（m）"
            name={`${support.id}-x`}
            type="number"
            step="0.1"
            min="0"
            max={totalLength}
            value={support.x}
            onChange={(event) => onUpdate({ x: Math.min(Math.max(Number(event.target.value) || 0, 0), totalLength) })}
            className="h-10 min-w-0 font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <div className={fieldLabelClass}>支座编号</div>
          <DeferredIdInput
            key={`beam-support-id-${support.id}`}
            ariaLabel={`第 ${supportIndex + 1} 个支座编号`}
            value={support.id}
            onCommit={onUpdateId}
            className="h-10 min-w-0 font-mono text-xs"
          />
        </div>
      </div>
      <div className="rounded-xl border border-white/8 bg-background/20 px-4 py-3 text-xs leading-relaxed text-foreground/55">
        <div className="font-semibold text-foreground/65">工程提示：{beamSupportNote(support.type)}</div>
        <div className="mt-1">{supportSystemHint("beam")}</div>
      </div>
    </div>
  );
}
