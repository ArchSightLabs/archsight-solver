import {
  beamNodeLabel,
  beamSpanMemberId,
  beamSpanSemanticLabel,
  spanId,
  supportId,
} from "./BeamObjectNavigator";
import { beamSupportLabel } from "../lib/support-vocabulary.ts";
import { modelObjectVocabulary } from "../lib/model-object-vocabulary.ts";
import type { BeamSpanConfig, BeamSupportConfig } from "../types/beam.ts";

interface BeamTableSectionProps {
  spans: BeamSpanConfig[];
  supports: BeamSupportConfig[];
  loadSummary: string;
  fieldLabelClass: string;
  materialLabelForSpan: (span: BeamSpanConfig) => string;
}

export function BeamTableSection({
  spans,
  supports,
  loadSummary,
  fieldLabelClass,
  materialLabelForSpan,
}: BeamTableSectionProps) {
  const vocabulary = modelObjectVocabulary("beam");
  return (
    <section id="beam-table" className="scroll-mt-4 space-y-4 rounded-lg border border-white/8 bg-white/[0.03] p-4">
      <div className="eyebrow">表格</div>
      <div className="space-y-3">
        <div className="space-y-2 rounded-lg border border-white/8 bg-slate-950/20 p-3">
          <div className={fieldLabelClass}>{vocabulary.memberGroupLabel}</div>
          <div className="space-y-2">
            {spans.map((span, index) => (
              <div key={spanId(index)} className="grid grid-cols-4 gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-xs">
                <span className="font-bold">{beamSpanMemberId(index, span)}</span>
                <span>{beamSpanSemanticLabel(index)}</span>
                <span className="font-mono">L = {span.length.toFixed(2)} m</span>
                <span className="font-mono">{materialLabelForSpan(span)} · E {span.E} GPa / I {span.I} cm4</span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2 rounded-lg border border-white/8 bg-slate-950/20 p-3">
          <div className={fieldLabelClass}>{vocabulary.supportGroupLabel}</div>
          <div className="space-y-2">
            {supports.map((support, index) => (
              <div key={supportId(index)} className="grid grid-cols-3 gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-xs">
                <span className="font-bold">{support.id} / 节点 {beamNodeLabel(index)}</span>
                <span>{beamSupportLabel(support.type)}</span>
                <span className="font-mono">x = {support.x.toFixed(2)} m</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-white/8 bg-slate-950/20 p-3 text-xs">
          <div className={fieldLabelClass}>{vocabulary.loadGroupLabel}</div>
          <div className="mt-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 font-semibold">
            {loadSummary}
          </div>
        </div>
      </div>
    </section>
  );
}
