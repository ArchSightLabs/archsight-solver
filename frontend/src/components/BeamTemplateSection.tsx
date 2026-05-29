import { Sparkles } from "lucide-react";
import { BEAM_MODEL_TEMPLATES, type BeamModelTemplate } from "../lib/workbench-model-templates.ts";

interface BeamTemplateSectionProps {
  onApplyTemplate: (template: BeamModelTemplate) => void;
}

export function BeamTemplateSection({ onApplyTemplate }: BeamTemplateSectionProps) {
  return (
    <section id="beam-template" className="scroll-mt-4 space-y-3 rounded-lg border border-white/8 bg-white/[0.03] p-3">
      <div className="eyebrow flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        模板
      </div>
      <div className="grid grid-cols-1 gap-2">
        {BEAM_MODEL_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onApplyTemplate(template)}
            className="rounded-lg border border-white/8 bg-slate-950/20 p-3 text-left transition-colors hover:border-primary/35 hover:bg-primary/5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold">{template.title}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {template.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="rounded border border-white/8 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {template.state.spans.length} 跨
                </span>
                <span className="rounded border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  套用
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
