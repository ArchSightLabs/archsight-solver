import { useState } from "react";
import { Calculator, FileInput } from "lucide-react";
import { FRAME_MODEL_TEMPLATES } from "../lib/workbench-model-templates.ts";
import type { FrameQuickModelInput } from "../lib/workbench-quick-models.ts";

interface FrameTemplateSectionProps {
  onApplyTemplate: (templateId: string) => void;
  onApplyTemplateAndRun: (templateId: string) => void;
  onGenerateQuickModel: (input: FrameQuickModelInput) => void;
  onGenerateQuickModelAndRun: (input: FrameQuickModelInput) => void;
}

const numberFieldClass = "h-8 rounded-md border border-white/10 bg-slate-950/20 px-2 text-xs font-semibold outline-none transition-colors focus:border-primary/50";
const selectFieldClass = "h-8 rounded-md border border-white/10 bg-slate-950/20 px-2 text-xs font-semibold outline-none transition-colors focus:border-primary/50";
const quickLabelClass = "text-[10px] font-black tracking-widest text-muted-foreground";
const frameQuickPresets = [
  { id: "portal", label: "单跨门式刚架", input: { bayCount: 1, storyCount: 1, bayWidthM: 6, storyHeightM: 4, beamLoadKnPerM: 18, topLateralLoadKn: 12 } },
  { id: "two-bay", label: "两跨单层框架", input: { bayCount: 2, storyCount: 1, bayWidthM: 6, storyHeightM: 3.6, beamLoadKnPerM: 15, topLateralLoadKn: 0 } },
  { id: "two-story", label: "两跨两层框架", input: { bayCount: 2, storyCount: 2, bayWidthM: 5, storyHeightM: 3.6, beamLoadKnPerM: 14, topLateralLoadKn: 18 } },
] satisfies Array<{ id: string; label: string; input: FrameQuickModelInput }>;

export function FrameTemplateSection({ onApplyTemplate, onApplyTemplateAndRun, onGenerateQuickModel, onGenerateQuickModelAndRun }: FrameTemplateSectionProps) {
  const [bayCount, setBayCount] = useState(2);
  const [storyCount, setStoryCount] = useState(1);
  const [bayWidthM, setBayWidthM] = useState(6);
  const [storyHeightM, setStoryHeightM] = useState(3.6);
  const [beamLoadKnPerM, setBeamLoadKnPerM] = useState(15);
  const [topLateralLoadKn, setTopLateralLoadKn] = useState(0);
  const [presetId, setPresetId] = useState("two-bay");
  const nodeCount = (storyCount + 1) * (bayCount + 1);
  const columnCount = storyCount * (bayCount + 1);
  const beamCount = storyCount * bayCount;
  const loadCount = (beamLoadKnPerM > 0 ? beamCount : 0) + (topLateralLoadKn > 0 ? 1 : 0);
  const applyPreset = (nextPresetId: string) => {
    setPresetId(nextPresetId);
    const preset = frameQuickPresets.find((item) => item.id === nextPresetId);
    if (!preset) return;
    setBayCount(preset.input.bayCount);
    setStoryCount(preset.input.storyCount);
    setBayWidthM(preset.input.bayWidthM);
    setStoryHeightM(preset.input.storyHeightM);
    setBeamLoadKnPerM(preset.input.beamLoadKnPerM);
    setTopLateralLoadKn(preset.input.topLateralLoadKn);
  };

  return (
    <section id="frame-template" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
      <div className="space-y-3 rounded-lg border border-primary/15 bg-primary/[0.04] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-black">规则框架快速生成</div>
            <div className="mt-1 text-[11px] font-semibold text-muted-foreground">跨数、层数、梁面荷载和顶层水平荷载</div>
          </div>
          <div className="flex min-w-0 flex-wrap justify-end gap-2">
            <select
              aria-label="规则框架快速生成预设"
              value={presetId}
              onChange={(event) => applyPreset(event.target.value)}
              className={`${selectFieldClass} min-w-36 flex-1`}
            >
              {frameQuickPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onGenerateQuickModel({ bayCount, storyCount, bayWidthM, storyHeightM, beamLoadKnPerM, topLateralLoadKn })}
              className="h-8 rounded-md border border-primary/25 bg-primary/10 px-3 text-xs font-black text-primary transition-colors hover:bg-primary/15"
            >
              生成框架
            </button>
            <button
              type="button"
              onClick={() => onGenerateQuickModelAndRun({ bayCount, storyCount, bayWidthM, storyHeightM, beamLoadKnPerM, topLateralLoadKn })}
              className="h-8 rounded-md border border-sky-300/45 bg-sky-400 px-3 text-xs font-black text-slate-950 transition-colors hover:bg-sky-300"
            >
              生成并计算
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className={quickLabelClass}>跨数</span>
            <input
              type="number"
              min={1}
              max={5}
              step={1}
              value={bayCount}
              onChange={(event) => setBayCount(Number(event.target.value))}
              className={numberFieldClass}
            />
          </label>
          <label className="space-y-1">
            <span className={quickLabelClass}>层数</span>
            <input
              type="number"
              min={1}
              max={4}
              step={1}
              value={storyCount}
              onChange={(event) => setStoryCount(Number(event.target.value))}
              className={numberFieldClass}
            />
          </label>
          <label className="space-y-1">
            <span className={quickLabelClass}>跨度 m</span>
            <input
              type="number"
              min={1}
              step={0.5}
              value={bayWidthM}
              onChange={(event) => setBayWidthM(Number(event.target.value))}
              className={numberFieldClass}
            />
          </label>
          <label className="space-y-1">
            <span className={quickLabelClass}>层高 m</span>
            <input
              type="number"
              min={1}
              step={0.1}
              value={storyHeightM}
              onChange={(event) => setStoryHeightM(Number(event.target.value))}
              className={numberFieldClass}
            />
          </label>
          <label className="space-y-1">
            <span className={quickLabelClass}>梁荷载 kN/m</span>
            <input
              type="number"
              min={0}
              step={1}
              value={beamLoadKnPerM}
              onChange={(event) => setBeamLoadKnPerM(Number(event.target.value))}
              className={numberFieldClass}
            />
          </label>
          <label className="space-y-1">
            <span className={quickLabelClass}>顶层水平 kN</span>
            <input
              type="number"
              min={0}
              step={1}
              value={topLateralLoadKn}
              onChange={(event) => setTopLateralLoadKn(Number(event.target.value))}
              className={numberFieldClass}
            />
          </label>
        </div>
        <div className="rounded-md border border-white/8 bg-slate-950/15 px-2.5 py-2 text-[11px] font-semibold text-muted-foreground">
          即将生成：{nodeCount} 节点、{columnCount} 柱、{beamCount} 梁、{loadCount} 个荷载。
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {FRAME_MODEL_TEMPLATES.map((template, index) => (
          <article
            key={template.id}
            aria-label={`${template.title} 模板`}
            className="rounded-xl border border-white/8 bg-slate-950/20 transition-colors hover:border-primary/35 hover:bg-primary/5"
          >
            <button type="button" onClick={() => onApplyTemplate(template.id)} className="block w-full p-3 text-left">
              <div className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded border border-white/8 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <div className="min-w-0 text-sm font-bold leading-snug">{template.title}</div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded border border-white/8 px-1.5 py-0.5 text-[10px] font-black text-muted-foreground">
                      <FileInput className="h-3 w-3" />
                      打开模板
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {template.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded border border-white/8 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                    <span className="rounded border border-white/8 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {template.nodes.length} 节点
                    </span>
                  </div>
                </div>
              </div>
            </button>
            <div className="border-t border-white/8 px-3 pb-3 pt-2">
              <button
                type="button"
                onClick={() => onApplyTemplateAndRun(template.id)}
                className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-sky-300/45 bg-sky-400 px-3 text-xs font-black text-slate-950 transition-colors hover:bg-sky-300"
              >
                <Calculator className="h-3.5 w-3.5" />
                打开并计算
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
