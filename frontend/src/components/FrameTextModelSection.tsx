import { FileText } from "lucide-react";
import { Button } from "./ui/button";
import { TextModelCheckPanel, type TextModelPreviewMetric } from "./TextModelCheckPanel";

interface FrameTextModelSectionProps {
  draft: string;
  message: string | null;
  diagnostics: string[];
  metrics: TextModelPreviewMetric[];
  onDraftChange: (draft: string) => void;
  onExport: () => void;
  onCheck: () => void;
  onImport: () => void;
}

export function FrameTextModelSection({
  draft,
  message,
  diagnostics,
  metrics,
  onDraftChange,
  onExport,
  onCheck,
  onImport,
}: FrameTextModelSectionProps) {
  return (
    <section id="frame-text" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="eyebrow flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-primary" />
          文本模型
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onExport} className="h-7 rounded-lg px-2 text-[10px]">
            生成当前模型文本
          </Button>
          <Button variant="outline" size="sm" onClick={onCheck} className="h-7 rounded-lg px-2 text-[10px]" disabled={!draft.trim()}>
            检查文本模型
          </Button>
          <Button size="sm" onClick={onImport} className="h-7 rounded-lg px-2 text-[10px]" disabled={!draft.trim()}>
            应用文本模型
          </Button>
        </div>
      </div>
      <textarea
        id="frame-text-model-draft"
        name="frameTextModelDraft"
        aria-label="平面框架文本模型"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        spellCheck={false}
        wrap="off"
        className="min-h-[32rem] w-full resize-y rounded-xl border border-slate-200 bg-white p-3 font-mono text-[11px] leading-5 text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary/60 dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-100 dark:placeholder:text-slate-500"
        placeholder={"N,1,0,0\nN,2,6,0\nN,3,0,4\nN,4,6,4\nNSUPT,1,6,0\nNSUPT,2,6,0\nE,1,3,1,1,1,1,1,1\nE,3,4,1,1,1,1,1,1\nE,2,4,1,1,1,1,1,1\nDLOAD,2,-18,-18,global_y,0.15,0.85\nPLOAD,2,-12,0.5,global_y\nNLOAD,4,-1,24,90"}
      />
      <TextModelCheckPanel message={message} diagnostics={diagnostics} metrics={metrics} maxDiagnostics={4} />
    </section>
  );
}
