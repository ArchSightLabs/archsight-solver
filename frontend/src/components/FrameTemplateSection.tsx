import { Sparkles } from "lucide-react";
import { FRAME_MODEL_TEMPLATES } from "../lib/workbench-model-templates.ts";

interface FrameTemplateSectionProps {
  onApplyTemplate: (templateId: string) => void;
}

export function FrameTemplateSection({ onApplyTemplate }: FrameTemplateSectionProps) {
  return (
    <section id="frame-template" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="eyebrow flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          模板
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {FRAME_MODEL_TEMPLATES.map((template, index) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onApplyTemplate(template.id)}
            className="rounded-xl border border-white/8 bg-slate-950/20 p-3 text-left transition-colors hover:border-primary/35 hover:bg-primary/5"
          >
            <div className="flex min-w-0 items-start gap-2">
              <span className="mt-0.5 shrink-0 rounded border border-white/8 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold leading-snug">{template.title}</div>
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
        ))}
      </div>
    </section>
  );
}
