import { useState } from "react";
import { Calculator, FileInput } from "lucide-react";
import { BEAM_MODEL_TEMPLATES, type BeamModelTemplate } from "../lib/workbench-model-templates.ts";
import type { BeamQuickModelInput } from "../lib/workbench-quick-models.ts";

interface BeamTemplateSectionProps {
  onApplyTemplate: (template: BeamModelTemplate) => void;
  onApplyTemplateAndRun: (template: BeamModelTemplate) => void;
  onGenerateQuickModel: (input: BeamQuickModelInput) => void;
  onGenerateQuickModelAndRun: (input: BeamQuickModelInput) => void;
}

const numberFieldClass = "h-8 w-full min-w-0 rounded-md border border-white/10 bg-slate-950/20 px-2 text-xs font-semibold outline-none transition-colors focus:border-primary/50";
const selectFieldClass = "h-8 rounded-md border border-white/10 bg-slate-950/20 px-2 text-xs font-semibold outline-none transition-colors focus:border-primary/50";
const quickLabelClass = "text-[10px] font-black tracking-widest text-muted-foreground";
const beamQuickPresets = [
  { id: "simple", label: "单跨简支梁", input: { spanCount: 1, spanLengthM: 6, uniformLoadKnPerM: 12 } },
  { id: "continuous", label: "三跨连续梁", input: { spanCount: 3, spanLengthM: 5, uniformLoadKnPerM: 12 } },
  { id: "long", label: "五跨走廊梁", input: { spanCount: 5, spanLengthM: 4, uniformLoadKnPerM: 8 } },
] satisfies Array<{ id: string; label: string; input: BeamQuickModelInput }>;

export function BeamTemplateSection({ onApplyTemplate, onApplyTemplateAndRun, onGenerateQuickModel, onGenerateQuickModelAndRun }: BeamTemplateSectionProps) {
  const [spanCount, setSpanCount] = useState(3);
  const [spanLengthM, setSpanLengthM] = useState(5);
  const [uniformLoadKnPerM, setUniformLoadKnPerM] = useState(12);
  const [presetId, setPresetId] = useState("continuous");
  const loadCount = uniformLoadKnPerM > 0 ? spanCount : 0;
  const applyPreset = (nextPresetId: string) => {
    setPresetId(nextPresetId);
    const preset = beamQuickPresets.find((item) => item.id === nextPresetId);
    if (!preset) return;
    setSpanCount(preset.input.spanCount);
    setSpanLengthM(preset.input.spanLengthM);
    setUniformLoadKnPerM(preset.input.uniformLoadKnPerM);
  };

  return (
    <section id="beam-template" className="scroll-mt-4 space-y-3 rounded-lg border border-white/8 bg-white/[0.03] p-3">
      <div className="space-y-3 rounded-lg border border-primary/15 bg-primary/[0.04] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-black">连续梁快速生成</div>
            <div className="mt-1 text-[11px] font-semibold text-muted-foreground">跨数、跨长和全跨均布荷载</div>
          </div>
          <div className="flex min-w-0 flex-wrap justify-end gap-2">
            <select
              aria-label="连续梁快速生成预设"
              value={presetId}
              onChange={(event) => applyPreset(event.target.value)}
              className={`${selectFieldClass} min-w-36 flex-1`}
            >
              {beamQuickPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onGenerateQuickModel({ spanCount, spanLengthM, uniformLoadKnPerM })}
              className="h-8 rounded-md border border-primary/25 bg-primary/10 px-3 text-xs font-black text-primary transition-colors hover:bg-primary/15"
            >
              生成连续梁
            </button>
            <button
              type="button"
              onClick={() => onGenerateQuickModelAndRun({ spanCount, spanLengthM, uniformLoadKnPerM })}
              className="h-8 rounded-md border border-sky-300/45 bg-sky-400 px-3 text-xs font-black text-slate-950 transition-colors hover:bg-sky-300"
            >
              生成并计算
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="space-y-1">
            <span className={quickLabelClass}>跨数</span>
            <input
              type="number"
              min={1}
              max={8}
              step={1}
              value={spanCount}
              onChange={(event) => setSpanCount(Number(event.target.value))}
              className={numberFieldClass}
            />
          </label>
          <label className="space-y-1">
            <span className={quickLabelClass}>单跨长度 m</span>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={spanLengthM}
              onChange={(event) => setSpanLengthM(Number(event.target.value))}
              className={numberFieldClass}
            />
          </label>
          <label className="space-y-1">
            <span className={quickLabelClass}>均布荷载 kN/m</span>
            <input
              type="number"
              min={0}
              step={1}
              value={uniformLoadKnPerM}
              onChange={(event) => setUniformLoadKnPerM(Number(event.target.value))}
              className={numberFieldClass}
            />
          </label>
        </div>
        <div className="rounded-md border border-white/8 bg-slate-950/15 px-2.5 py-2 text-[11px] font-semibold text-muted-foreground">
          即将生成：{spanCount} 跨、{spanCount + 1} 个支座、{loadCount} 段全跨均布荷载。
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {BEAM_MODEL_TEMPLATES.map((template, index) => (
          <article
            key={template.id}
            aria-label={`${template.title} 模板`}
            className="rounded-lg border border-white/8 bg-slate-950/20 transition-colors hover:border-primary/35 hover:bg-primary/5"
          >
            <button type="button" onClick={() => onApplyTemplate(template)} className="block w-full p-3 text-left">
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
                  </div>
                </div>
              </div>
            </button>
            <div className="border-t border-white/8 px-3 pb-3 pt-2">
              <button
                type="button"
                onClick={() => onApplyTemplateAndRun(template)}
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
