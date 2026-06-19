import { useState } from "react";
import { Calculator, FileInput } from "lucide-react";
import { TRUSS_MODEL_TEMPLATES } from "../lib/workbench-model-templates.ts";
import type { TrussQuickModelInput } from "../lib/workbench-quick-models.ts";

interface TrussTemplateSectionProps {
  memberTerm: string;
  onApplyTemplate: (templateId: string) => void;
  onApplyTemplateAndRun: (templateId: string) => void;
  onGenerateQuickModel: (input: TrussQuickModelInput) => void;
  onGenerateQuickModelAndRun: (input: TrussQuickModelInput) => void;
}

const numberFieldClass = "h-8 rounded-md border border-white/10 bg-slate-950/20 px-2 text-xs font-semibold outline-none transition-colors focus:border-primary/50";
const selectFieldClass = "h-8 rounded-md border border-white/10 bg-slate-950/20 px-2 text-xs font-semibold outline-none transition-colors focus:border-primary/50";
const quickLabelClass = "text-[10px] font-black tracking-widest text-muted-foreground";
const trussQuickPresets = [
  { id: "bridge-four", label: "四节间桥式桁架", input: { panelCount: 4, panelLengthM: 3, heightM: 3, topNodeLoadKn: 30 } },
  { id: "bridge-six", label: "六节间桥式桁架", input: { panelCount: 6, panelLengthM: 3, heightM: 3, topNodeLoadKn: 25 } },
  { id: "roof", label: "轻型屋架试算", input: { panelCount: 4, panelLengthM: 2.5, heightM: 2.4, topNodeLoadKn: 20 } },
] satisfies Array<{ id: string; label: string; input: TrussQuickModelInput }>;

export function TrussTemplateSection({ memberTerm, onApplyTemplate, onApplyTemplateAndRun, onGenerateQuickModel, onGenerateQuickModelAndRun }: TrussTemplateSectionProps) {
  const [panelCount, setPanelCount] = useState(4);
  const [panelLengthM, setPanelLengthM] = useState(3);
  const [heightM, setHeightM] = useState(3);
  const [topNodeLoadKn, setTopNodeLoadKn] = useState(30);
  const [presetId, setPresetId] = useState("bridge-four");
  const nodeCount = (panelCount + 1) * 2;
  const memberCount = panelCount * 3 + (panelCount + 1);
  const loadCount = topNodeLoadKn > 0 ? Math.max(1, panelCount - 1) : 0;
  const applyPreset = (nextPresetId: string) => {
    setPresetId(nextPresetId);
    const preset = trussQuickPresets.find((item) => item.id === nextPresetId);
    if (!preset) return;
    setPanelCount(preset.input.panelCount);
    setPanelLengthM(preset.input.panelLengthM);
    setHeightM(preset.input.heightM);
    setTopNodeLoadKn(preset.input.topNodeLoadKn);
  };

  return (
    <section id="truss-template" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
      <div className="space-y-3 rounded-lg border border-primary/15 bg-primary/[0.04] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-black">平行弦桁架快速生成</div>
            <div className="mt-1 text-[11px] font-semibold text-muted-foreground">节间数、节间长度、桁高和上弦节点荷载</div>
          </div>
          <div className="flex min-w-0 flex-wrap justify-end gap-2">
            <select
              aria-label="平行弦桁架快速生成预设"
              value={presetId}
              onChange={(event) => applyPreset(event.target.value)}
              className={`${selectFieldClass} min-w-36 flex-1`}
            >
              {trussQuickPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onGenerateQuickModel({ panelCount, panelLengthM, heightM, topNodeLoadKn })}
              className="h-8 rounded-md border border-primary/25 bg-primary/10 px-3 text-xs font-black text-primary transition-colors hover:bg-primary/15"
            >
              生成桁架
            </button>
            <button
              type="button"
              onClick={() => onGenerateQuickModelAndRun({ panelCount, panelLengthM, heightM, topNodeLoadKn })}
              className="h-8 rounded-md border border-sky-300/45 bg-sky-400 px-3 text-xs font-black text-slate-950 transition-colors hover:bg-sky-300"
            >
              生成并计算
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className={quickLabelClass}>节间数</span>
            <input
              type="number"
              min={2}
              max={8}
              step={1}
              value={panelCount}
              onChange={(event) => setPanelCount(Number(event.target.value))}
              className={numberFieldClass}
            />
          </label>
          <label className="space-y-1">
            <span className={quickLabelClass}>节间长度 m</span>
            <input
              type="number"
              min={1}
              step={0.5}
              value={panelLengthM}
              onChange={(event) => setPanelLengthM(Number(event.target.value))}
              className={numberFieldClass}
            />
          </label>
          <label className="space-y-1">
            <span className={quickLabelClass}>桁高 m</span>
            <input
              type="number"
              min={0.8}
              step={0.1}
              value={heightM}
              onChange={(event) => setHeightM(Number(event.target.value))}
              className={numberFieldClass}
            />
          </label>
          <label className="space-y-1">
            <span className={quickLabelClass}>节点荷载 kN</span>
            <input
              type="number"
              min={0}
              step={1}
              value={topNodeLoadKn}
              onChange={(event) => setTopNodeLoadKn(Number(event.target.value))}
              className={numberFieldClass}
            />
          </label>
        </div>
        <div className="rounded-md border border-white/8 bg-slate-950/15 px-2.5 py-2 text-[11px] font-semibold text-muted-foreground">
          即将生成：{nodeCount} 节点、{memberCount} {memberTerm}、{loadCount} 个节点荷载。
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {TRUSS_MODEL_TEMPLATES.map((template, index) => (
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
                    {template.tags?.slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded border border-white/8 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                    <span className="rounded border border-white/8 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {template.members.length} {memberTerm}
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
