import type { ReactNode } from "react";
import { Plus, SlidersHorizontal } from "lucide-react";
import type { BeamSpanConfig, BeamSupportConfig } from "../types/beam.ts";
import { Button } from "./ui/button";
import { ModelObjectGuide } from "./ModelObjectGuide";
import { modelObjectVocabulary } from "../lib/model-object-vocabulary";
import { beamSupportLabel } from "../lib/support-vocabulary";

export type BeamSelectedObject =
  | { type: "span"; id: string }
  | { type: "support"; id: string }
  | { type: "load"; id: "primary" };

export function spanId(index: number) {
  return `span-${index}`;
}

export function spanIndexFromId(id: string) {
  const index = Number(id.replace("span-", ""));
  return Number.isInteger(index) && index >= 0 ? index : 0;
}

export function beamSpanMemberId(index: number, span?: BeamSpanConfig) {
  return span?.id?.trim() || `(${index + 1})`;
}

export function beamSpanSemanticLabel(index: number) {
  return `第 ${index + 1} 跨`;
}

export function beamSpanChipLabel(index: number, span: BeamSpanConfig) {
  return `${beamSpanMemberId(index, span)} · L=${formatCompactLength(span.length)} m`;
}

export function beamSpanChipSummary(span: BeamSpanConfig, materialLabel: string) {
  return `${materialLabel.toUpperCase()} · E=${formatCompactNumber(span.E)} · I=${formatCompactNumber(span.I)}`;
}

export function beamSupportChipLabel(support: BeamSupportConfig, _index: number) {
  return `${support.id} · ${beamSupportLabel(support.type)} · x=${formatCompactLength(support.x)} m`;
}

export function supportId(index: number) {
  return `support-${index}`;
}

export function supportIndexFromId(id: string) {
  const index = Number(id.replace("support-", ""));
  return Number.isInteger(index) && index >= 0 ? index : 0;
}

interface BeamObjectNavigatorProps {
  spans: BeamSpanConfig[];
  supports: BeamSupportConfig[];
  selectedObject: BeamSelectedObject;
  loadSummary: string;
  maxSpans: number;
  fieldLabelClass: string;
  selectedEditor: ReactNode;
  materialLabelForSpan: (span: BeamSpanConfig) => string;
  onSelectObject: (next: BeamSelectedObject) => void;
  onAddSpan: () => void;
}

function objectButtonClass(isActive: boolean) {
  return isActive
    ? "border-sky-300 bg-sky-400 text-slate-950 shadow-sm shadow-sky-500/15"
    : "border-white/8 bg-slate-950/20 text-muted-foreground hover:text-foreground";
}

function formatCompactNumber(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/u, "");
}

function formatCompactLength(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(2).replace(/\.?0+$/u, "");
}

function selectedObjectLabel(selectedObject: BeamSelectedObject, spans: BeamSpanConfig[], supports: BeamSupportConfig[], loadSummary: string) {
  if (selectedObject.type === "load") return loadSummary;
  if (selectedObject.type === "support") {
    const index = supportIndexFromId(selectedObject.id);
    return beamSupportChipLabel(supports[index] ?? { id: "S?", x: 0, type: "pinned" }, index);
  }
  const index = spanIndexFromId(selectedObject.id);
  return beamSpanChipLabel(index, spans[index] ?? { id: `(${index + 1})`, length: 0, E: 0, I: 0 });
}

export function BeamObjectNavigator({
  spans,
  supports,
  selectedObject,
  loadSummary,
  maxSpans,
  fieldLabelClass,
  selectedEditor,
  materialLabelForSpan,
  onSelectObject,
  onAddSpan,
}: BeamObjectNavigatorProps) {
  const vocabulary = modelObjectVocabulary("beam");
  return (
    <section id="beam-object" className="scroll-mt-4 space-y-2.5 rounded-lg border border-white/8 bg-white/[0.03] p-2.5">
      <div className="space-y-2.5">
        <div className="space-y-2.5 rounded-lg border border-white/8 bg-slate-950/20 p-2.5">
          <ModelObjectGuide mode="beam" />
          <div className="space-y-2">
            <div className={fieldLabelClass}>{vocabulary.supportGroupLabel}</div>
            <div className="flex flex-wrap gap-2">
              {supports.map((support, index) => (
                <button
                  key={supportId(index)}
                  type="button"
                  onClick={() => onSelectObject({ type: "support", id: supportId(index) })}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${objectButtonClass(selectedObject.type === "support" && selectedObject.id === supportId(index))}`}
                >
                  {beamSupportChipLabel(support, index)}
                </button>
              ))}
              {supports.length === 0 ? (
                <span className="rounded-lg border border-dashed border-white/10 px-2.5 py-1.5 text-xs text-muted-foreground">{vocabulary.noSupportLabel}</span>
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            <div className={fieldLabelClass}>{vocabulary.memberGroupLabel}</div>
            <div className="flex flex-wrap gap-2">
              {spans.map((span, index) => (
                <button
                  key={spanId(index)}
                  type="button"
                  onClick={() => onSelectObject({ type: "span", id: spanId(index) })}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${objectButtonClass(selectedObject.type === "span" && selectedObject.id === spanId(index))}`}
                  title={beamSpanChipSummary(span, materialLabelForSpan(span))}
                >
                  <span>{beamSpanChipLabel(index, span)}</span>
                </button>
              ))}
              <Button variant="outline" size="sm" onClick={onAddSpan} disabled={spans.length >= maxSpans} className="h-8 rounded-lg px-2 text-[10px]">
                <Plus className="mr-1 h-3 w-3" />
                {spans.length >= maxSpans ? `已达 ${maxSpans} 跨` : vocabulary.addMemberLabel}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <div className={fieldLabelClass}>{vocabulary.loadGroupLabel}</div>
            <button
              type="button"
              onClick={() => onSelectObject({ type: "load", id: "primary" })}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${objectButtonClass(selectedObject.type === "load")}`}
            >
              {loadSummary}
            </button>
          </div>
        </div>
        <div className="space-y-2.5 rounded-lg border border-white/8 bg-background/20 p-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="eyebrow flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
              属性编辑
            </div>
            <span className="max-w-[12rem] truncate rounded-full border border-primary/10 bg-primary/10 px-3 py-1 text-[10px] font-bold text-primary/80">
              {selectedObjectLabel(selectedObject, spans, supports, loadSummary)}
            </span>
          </div>
          {selectedEditor}
        </div>
      </div>
    </section>
  );
}
