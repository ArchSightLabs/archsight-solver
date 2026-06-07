import { Grid3X3, Magnet } from "lucide-react";

import { normalizeGridSnapStep } from "../lib/node-coordinate-snap.ts";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface GridSnapControlsProps {
  enabled: boolean;
  stepM: number;
  variant?: "panel" | "toolbar";
  compact?: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onStepChange: (stepM: number) => void;
}

export function GridSnapControls({
  enabled,
  stepM,
  variant = "panel",
  compact = false,
  onEnabledChange,
  onStepChange,
}: GridSnapControlsProps) {
  const isToolbar = variant === "toolbar";
  const enabledLabel = enabled ? "关闭节点坐标网格吸附" : "开启节点坐标网格吸附";

  return (
    <div
      className={
        isToolbar
          ? "flex min-w-0 flex-wrap items-center gap-1 rounded-xl border border-slate-200/80 bg-white/[0.88] p-1 shadow-sm backdrop-blur dark:border-slate-700/80 dark:bg-slate-950/[0.82]"
          : "flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-slate-950/20 px-3 py-2"
      }
      role={isToolbar ? "toolbar" : undefined}
      aria-label={isToolbar ? "网格吸附工具" : undefined}
    >
      <div className={`flex items-center gap-1.5 text-[10px] font-black tracking-widest text-muted-foreground ${isToolbar && compact ? "sr-only" : ""}`}>
        <Grid3X3 className="h-3.5 w-3.5 text-primary" />
        网格吸附
      </div>
      <Button
        type="button"
        variant={isToolbar ? "ghost" : enabled ? "default" : "outline"}
        size={isToolbar && compact ? "icon" : "sm"}
        onClick={() => onEnabledChange(!enabled)}
        className={`${isToolbar ? `${compact ? "h-7 w-7" : "h-7 px-2"} rounded-lg text-[11px] font-bold` : "h-8 rounded-xl"} ${
          isToolbar && enabled ? "bg-sky-100 text-sky-700 hover:bg-sky-100 hover:text-sky-800 dark:bg-sky-400/15 dark:text-sky-100" : ""
        }`}
        aria-label={enabledLabel}
        aria-pressed={enabled}
        title={enabledLabel}
      >
        <Magnet className={`${isToolbar || compact ? "" : "mr-1.5"} h-3.5 w-3.5`} />
        {isToolbar ? (compact ? <span className="sr-only">吸附</span> : "吸附") : enabled ? "已开启" : "未开启"}
      </Button>
      <label
        className={
          isToolbar
            ? "flex items-center gap-1 text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400"
            : "flex min-w-[9rem] items-center gap-2 text-[10px] font-black tracking-widest text-muted-foreground"
        }
      >
        <span className={isToolbar && compact ? "sr-only" : ""}>步距 m</span>
        <Input
          type="number"
          min="0.01"
          step="0.01"
          value={stepM}
          onChange={(event) => onStepChange(normalizeGridSnapStep(Number(event.target.value)))}
          className={isToolbar ? "h-7 w-16 rounded-md border border-white/20 bg-white/[0.04] shadow-inner px-1.5 text-center font-mono text-[11px] font-bold" : "h-8 w-20 font-mono text-xs"}
          aria-label="网格吸附步距（m）"
        />
      </label>
    </div>
  );
}
