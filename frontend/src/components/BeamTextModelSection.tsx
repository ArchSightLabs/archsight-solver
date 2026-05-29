import { useRef } from "react";
import { FileText } from "lucide-react";
import { Button } from "./ui/button";
import { TextModelCheckPanel, type TextModelPreviewMetric } from "./TextModelCheckPanel";

interface BeamTextModelSectionProps {
  draft: string;
  message: string | null;
  diagnostics: string[];
  metrics: TextModelPreviewMetric[];
  onDraftChange: (draft: string) => void;
  onExport: () => void;
  onCheck: () => void;
  onImport: () => void;
}

export function BeamTextModelSection({
  draft,
  message,
  diagnostics,
  metrics,
  onDraftChange,
  onExport,
  onCheck,
  onImport,
}: BeamTextModelSectionProps) {
  const textareaRef = useRef<globalThis.HTMLTextAreaElement | null>(null);
  const lineNumberRef = useRef<HTMLDivElement | null>(null);
  const lineNumbers = Array.from({ length: Math.max(draft.split(/\r?\n/).length, 1) }, (_, index) => index + 1);

  const syncLineNumbers = () => {
    if (lineNumberRef.current && textareaRef.current) {
      lineNumberRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  return (
    <section id="beam-text" className="scroll-mt-4 space-y-4 rounded-lg border border-white/8 bg-white/[0.03] p-4">
      <section className="space-y-3 rounded-lg border border-white/8 bg-slate-950/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="eyebrow flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-primary" />
            梁系文本模型
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
        <div className="flex min-h-[32rem] overflow-hidden rounded-xl border border-slate-200 bg-white font-mono text-[11px] leading-5 focus-within:border-primary/60 dark:border-white/10 dark:bg-slate-950/70">
          <div
            ref={lineNumberRef}
            aria-hidden="true"
            className="custom-scrollbar max-h-[32rem] w-11 shrink-0 overflow-hidden border-r border-slate-200 bg-slate-50 px-2 py-3 text-right text-slate-400 dark:border-white/10 dark:bg-slate-950/80 dark:text-slate-500"
          >
            {lineNumbers.map((lineNumber) => (
              <div key={lineNumber} className="h-5 leading-5">
                {lineNumber}
              </div>
            ))}
          </div>
          <textarea
            id="beam-text-model-draft"
            name="beamTextModelDraft"
            aria-label="梁系文本模型"
            ref={textareaRef}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onScroll={syncLineNumbers}
            spellCheck={false}
            wrap="off"
            className="min-h-[32rem] w-full resize-y border-0 bg-transparent p-3 font-mono text-[11px] leading-5 text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder={"BEAM,continuous\nMATERIAL,q345\nSPAN,(1),6,q345,85000\nSUPPORT,S1,0,pinned\nSUPPORT,S2,6,roller\nLOAD,uniform,12"}
          />
        </div>
        <TextModelCheckPanel
          message={message}
          diagnostics={diagnostics}
          metrics={metrics}
        />
      </section>
    </section>
  );
}
