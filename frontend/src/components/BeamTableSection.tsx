import {
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

function allSame<T>(values: T[]) {
  return values.length > 0 && values.every((value) => value === values[0]);
}

export function BeamTableSection({
  spans,
  supports,
  loadSummary,
  fieldLabelClass,
  materialLabelForSpan,
}: BeamTableSectionProps) {
  const vocabulary = modelObjectVocabulary("beam");
  const spanMaterialLabels = spans.map((span) => materialLabelForSpan(span));
  const sameMaterial = allSame(spanMaterialLabels);
  const spanMaterialSummary = spans.length ? (sameMaterial ? spanMaterialLabels[0] : "材料按跨段") : "";

  return (
    <section id="beam-table" className="scroll-mt-4 space-y-3 rounded-lg border border-white/8 bg-white/[0.03] p-4">
      <div className="space-y-3">
        <div className="space-y-2 rounded-lg border border-white/8 bg-slate-950/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className={fieldLabelClass}>{vocabulary.memberGroupLabel}</div>
            {spanMaterialSummary ? (
              <span className="truncate rounded-md border border-white/8 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                {spanMaterialSummary}
              </span>
            ) : null}
          </div>
          <div className="space-y-2">
            {spans.map((span, index) => {
              const detail = sameMaterial ? "" : spanMaterialLabels[index];
              return (
                <div
                  key={spanId(index)}
                  className={`grid gap-x-3 gap-y-1 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-xs ${
                    detail
                      ? "grid-cols-[minmax(3rem,0.55fr)_minmax(5rem,1fr)_minmax(7rem,1fr)_minmax(7rem,0.9fr)]"
                      : "grid-cols-[minmax(3rem,0.55fr)_minmax(5rem,1fr)_minmax(7rem,1fr)]"
                  }`}
                >
                  <span className="font-bold">{beamSpanMemberId(index, span)}</span>
                  <span>{beamSpanSemanticLabel(index)}</span>
                  <span className="font-mono">L = {span.length.toFixed(2)} m</span>
                  {detail ? <span className="font-mono text-muted-foreground">{detail}</span> : null}
                </div>
              );
            })}
          </div>
        </div>
        <div className="space-y-2 rounded-lg border border-white/8 bg-slate-950/20 p-3">
          <div className={fieldLabelClass}>{vocabulary.supportGroupLabel}</div>
          <div className="space-y-2">
            {supports.map((support, index) => (
              <div key={supportId(index)} className="grid grid-cols-3 gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-xs">
                <span className="font-bold">{support.id}</span>
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
