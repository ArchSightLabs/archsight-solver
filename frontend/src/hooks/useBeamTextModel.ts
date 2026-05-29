import { useState } from "react";
import type { TextModelPreviewMetric } from "../components/TextModelCheckPanel";
import { formatBeamLoadSummary } from "../lib/beam-loads.ts";
import { parseBeamTextModel, serializeBeamTextModel } from "../lib/beam-text-model.ts";
import { modelObjectCountPhrase, modelObjectVocabulary } from "../lib/model-object-vocabulary.ts";
import { createDefaultBeamSupports } from "../lib/workspace-state.ts";
import type { BeamWorkspaceState } from "../types/beam.ts";

interface UseBeamTextModelOptions {
  value: BeamWorkspaceState;
  onApplyWorkspace: (next: BeamWorkspaceState) => void;
  onImportApplied?: () => void;
}

function buildBeamTextPreviewState(value: BeamWorkspaceState, patch: Partial<BeamWorkspaceState>) {
  const nextSpans = patch.spans ?? value.spans;
  const nextSupports = patch.supports ?? createDefaultBeamSupports(patch.beamType ?? value.beamType, nextSpans);
  const previewState = {
    ...value,
    ...patch,
    spans: nextSpans,
    supports: nextSupports,
  };
  return { nextSpans, nextSupports, previewState };
}

function beamTextMetrics(state: BeamWorkspaceState): TextModelPreviewMetric[] {
  const vocabulary = modelObjectVocabulary("beam");
  return [
    { label: vocabulary.memberGroupLabel, value: `${state.spans.length}` },
    { label: vocabulary.supportGroupLabel, value: `${state.supports.length}` },
    { label: "总长", value: `${state.spans.reduce((sum, span) => sum + span.length, 0).toFixed(2)} m` },
    { label: "默认材料", value: state.materialId },
    { label: vocabulary.loadGroupLabel, value: formatBeamLoadSummary(state) },
  ];
}

export function useBeamTextModel({ value, onApplyWorkspace, onImportApplied }: UseBeamTextModelOptions) {
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<TextModelPreviewMetric[]>([]);

  const exportTextModel = () => {
    const vocabulary = modelObjectVocabulary("beam");
    setDraft(serializeBeamTextModel(value));
    setDiagnostics([]);
    setMetrics([]);
    setMessage(`已按当前${vocabulary.supportGroupLabel}、${vocabulary.memberGroupLabel}与${vocabulary.loadGroupLabel}生成梁系文本模型，可编辑后先检查再应用。`);
  };

  const previewDraft = (nextDraft: string) => {
    setDraft(nextDraft);
    if (nextDraft.trim().length === 0) {
      setDiagnostics([]);
      setMetrics([]);
      setMessage(null);
      return;
    }

    const result = parseBeamTextModel(nextDraft);
    setDiagnostics(result.diagnostics);
    if (!result.patch || result.diagnostics.length > 0) {
      setMetrics([]);
      setMessage(null);
      return;
    }

    const { nextSpans, nextSupports, previewState } = buildBeamTextPreviewState(value, result.patch);
    const vocabulary = modelObjectVocabulary("beam");
    const changedParts = [
      result.patch.materialId ? `默认材料：${result.patch.materialId}` : null,
      result.patch.materials ? `${result.patch.materials.length} 个材料编号` : null,
      result.patch.beamType ? "梁型" : null,
      result.patch.spans ? modelObjectCountPhrase("beam", "member", nextSpans.length) : null,
      result.patch.supports ? modelObjectCountPhrase("beam", "support", nextSupports.length) : null,
      result.patch.loadType ? `${vocabulary.loadGroupLabel}：${formatBeamLoadSummary(previewState)}` : null,
    ].filter(Boolean);
    setMetrics(beamTextMetrics(previewState));
    setMessage(`检查通过：将更新${changedParts.length ? changedParts.join("、") : "梁系参数"}。点击“应用文本模型”后写入正式模型。`);
  };

  const checkDraft = () => {
    if (!draft.trim()) {
      setDiagnostics(["请先生成或输入文本模型。"]);
      setMetrics([]);
      setMessage(null);
      return;
    }
    previewDraft(draft);
  };

  const importDraft = () => {
    const result = parseBeamTextModel(draft);
    setDiagnostics(result.diagnostics);
    if (result.diagnostics.length > 0) {
      setDiagnostics(["存在诊断，未写入正式模型。", ...result.diagnostics]);
      setMetrics([]);
      setMessage(null);
      return;
    }
    if (!result.patch) {
      setMessage("文本模型未导入。");
      return;
    }

    const { nextSpans, nextSupports, previewState } = buildBeamTextPreviewState(value, result.patch);
    onApplyWorkspace(previewState);
    setMetrics(beamTextMetrics(previewState));
    setMessage(`已导入 ${modelObjectCountPhrase("beam", "member", nextSpans.length)}、${modelObjectCountPhrase("beam", "support", nextSupports.length)}，默认材料 ${result.patch.materialId ?? value.materialId}。`);
    onImportApplied?.();
  };

  return {
    draft,
    message,
    diagnostics,
    metrics,
    exportTextModel,
    previewDraft,
    checkDraft,
    importDraft,
  };
}
