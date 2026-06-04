import { Grid3X3, Magnet } from "lucide-react";

import { normalizeGridSnapStep } from "../lib/node-coordinate-snap.ts";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface GridSnapControlsProps {
  enabled: boolean;
  stepM: number;
  onEnabledChange: (enabled: boolean) => void;
  onStepChange: (stepM: number) => void;
}

export function GridSnapControls({
  enabled,
  stepM,
  onEnabledChange,
  onStepChange,
}: GridSnapControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-slate-950/20 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-muted-foreground">
        <Grid3X3 className="h-3.5 w-3.5 text-primary" />
        网格吸附
      </div>
      <Button
        type="button"
        variant={enabled ? "default" : "outline"}
        size="sm"
        onClick={() => onEnabledChange(!enabled)}
        className="h-8 rounded-xl"
        title={enabled ? "关闭节点坐标网格吸附" : "开启节点坐标网格吸附"}
      >
        <Magnet className="mr-1.5 h-3.5 w-3.5" />
        {enabled ? "已开启" : "未开启"}
      </Button>
      <label className="flex min-w-[9rem] items-center gap-2 text-[10px] font-black tracking-widest text-muted-foreground">
        步距 m
        <Input
          type="number"
          min="0.01"
          step="0.01"
          value={stepM}
          onChange={(event) => onStepChange(normalizeGridSnapStep(Number(event.target.value)))}
          className="h-8 w-20 font-mono text-xs"
          aria-label="网格吸附步距（m）"
        />
      </label>
    </div>
  );
}
