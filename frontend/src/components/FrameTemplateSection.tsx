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
        {FRAME_MODEL_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onApplyTemplate(template.id)}
            className="rounded-xl border border-white/8 bg-slate-950/20 p-3 text-left transition-colors hover:border-primary/35 hover:bg-primary/5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-bold">{template.title}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {template.nodes.length} 节点
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
