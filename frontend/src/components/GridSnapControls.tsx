import { Grid3X3, Magnet } from "lucide-react";

import { normalizeGridSnapStep } from "../lib/node-coordinate-snap.ts";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface GridSnapControlsProps {
  enabled: boolean;
  stepM: number;
  variant?: "panel" | "toolbar" | "statusbar";
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
  const isStatusbar = variant === "statusbar";
  const isCompactUI = isToolbar || isStatusbar || compact;
  const enabledLabel = enabled ? "关闭节点坐标网格吸附" : "开启节点坐标网格吸附";

  return (
    <div
      className={
        isStatusbar
          ? "flex items-center gap-1"
          : isToolbar
          ? "flex min-w-0 flex-wrap items-center gap-1 rounded-xl border border-slate-200/80 bg-white/[0.88] p-1 shadow-sm backdrop-blur dark:border-slate-700/80 dark:bg-slate-950/[0.82]"
          : "flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-slate-950/20 px-3 py-2"
      }
      role={isToolbar || isStatusbar ? "toolbar" : undefined}
      aria-label={isToolbar || isStatusbar ? "网格吸附工具" : undefined}
    >
      <div className={`flex items-center gap-1.5 text-[10px] font-black tracking-widest text-muted-foreground ${isCompactUI ? "sr-only" : ""}`}>
        <Grid3X3 className="h-3.5 w-3.5 text-primary" />
        网格吸附
      </div>
      <Button
        type="button"
        variant={isToolbar || isStatusbar ? "ghost" : enabled ? "default" : "outline"}
        size={isCompactUI ? "icon" : "sm"}
        onClick={() => onEnabledChange(!enabled)}
        className={`${isToolbar || isStatusbar ? `${isCompactUI ? "h-6 w-6" : "h-7 px-2"} rounded-lg text-[11px] font-bold` : "h-8 rounded-xl"} ${
          (isToolbar || isStatusbar) && enabled ? "bg-sky-400/20 text-sky-600 dark:bg-sky-400/20 dark:text-sky-300" : ""
        }`}
        aria-label={enabledLabel}
        aria-pressed={enabled}
        title={enabledLabel}
      >
        <Magnet className={`${isCompactUI ? "" : "mr-1.5"} h-3.5 w-3.5`} />
        {isToolbar || isStatusbar ? (isCompactUI ? <span className="sr-only">吸附</span> : "吸附") : enabled ? "已开启" : "未开启"}
      </Button>
      <label
        className={
          isToolbar || isStatusbar
            ? "flex items-center gap-1 text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400"
            : "flex min-w-[9rem] items-center gap-2 text-[10px] font-black tracking-widest text-muted-foreground"
        }
      >
        <span className={isCompactUI ? "sr-only" : ""}>步距 m</span>
        <Input
          type="number"
          min="0.01"
          step="0.01"
          value={stepM}
          onChange={(event) => onStepChange(normalizeGridSnapStep(Number(event.target.value)))}
          className={isToolbar || isStatusbar ? "h-6 w-14 rounded border-none bg-black/5 shadow-inner px-1.5 text-center font-mono text-[10px] md:text-[10px] font-bold dark:bg-black/20" : "h-8 w-20 font-mono text-xs md:text-xs"}
          aria-label="网格吸附步距（m）"
        />
      </label>
    </div>
  );
}
