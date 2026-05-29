import { FileText } from "lucide-react";
import { Button } from "./ui/button";
import { TextModelCheckPanel, type TextModelPreviewMetric } from "./TextModelCheckPanel";

interface TrussTextModelSectionProps {
  draft: string;
  message: string | null;
  diagnostics: string[];
  metrics: TextModelPreviewMetric[];
  onDraftChange: (draft: string) => void;
  onExport: () => void;
  onCheck: () => void;
  onImport: () => void;
}

export function TrussTextModelSection({
  draft,
  message,
  diagnostics,
  metrics,
  onDraftChange,
  onExport,
  onCheck,
  onImport,
}: TrussTextModelSectionProps) {
  return (
    <section id="truss-text" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
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
        id="truss-text-model-draft"
        name="trussTextModelDraft"
        aria-label="平面桁架文本模型"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        spellCheck={false}
        wrap="off"
        className="min-h-[32rem] w-full resize-y rounded-xl border border-slate-200 bg-white p-3 font-mono text-[11px] leading-5 text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary/60 dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-100 dark:placeholder:text-slate-500"
        placeholder={"NODE,N1,0,0,pinned\nNODE,N2,6,0,roller\nNODE,N3,3,3,free\nMEMBER,M1,N1,N3,210,24,upper_chord\nMEMBER,M2,N3,N2,210,24,upper_chord\nLOAD,N3,0,-50"}
      />
      <TextModelCheckPanel message={message} diagnostics={diagnostics} metrics={metrics} maxDiagnostics={4} />
    </section>
  );
}
