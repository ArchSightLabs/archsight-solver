import { useState } from "react";
import type { TextModelPreviewMetric } from "../components/TextModelCheckPanel";
import { modelObjectCountPhrase, modelObjectLoadLabel, modelObjectVocabulary } from "../lib/model-object-vocabulary.ts";
import { parseTrussTextModel, serializeTrussTextModel, type TrussTextCollections } from "../lib/truss-text-model.ts";

interface UseTrussTextModelOptions {
  value: TrussTextCollections;
  onApplyCollections: (next: TrussTextCollections) => void;
}

function trussTextMetrics(collections: TrussTextCollections): TextModelPreviewMetric[] {
  const vocabulary = modelObjectVocabulary("truss");
  return [
    { label: vocabulary.nodeGroupLabel, value: `${collections.nodes.length}` },
    { label: vocabulary.memberGroupLabel, value: `${collections.members.length}` },
    { label: modelObjectLoadLabel("truss", "node"), value: `${collections.loads.length}` },
    { label: "分析假定", value: "轴力杆系" },
  ];
}

export function useTrussTextModel({ value, onApplyCollections }: UseTrussTextModelOptions) {
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<TextModelPreviewMetric[]>([]);

  const exportTextModel = () => {
    const vocabulary = modelObjectVocabulary("truss");
    const nodeLoadLabel = modelObjectLoadLabel("truss", "node");
    setDraft(serializeTrussTextModel(value));
    setDiagnostics([]);
    setMetrics([]);
    setMessage(`已按当前${vocabulary.nodeGroupLabel}、${vocabulary.memberGroupLabel}与${nodeLoadLabel}生成桁架文本模型，可编辑后先检查再应用。`);
  };

  const previewDraft = (nextDraft: string) => {
    setDraft(nextDraft);
    if (nextDraft.trim().length === 0) {
      setDiagnostics([]);
      setMetrics([]);
      setMessage(null);
      return;
    }

    const result = parseTrussTextModel(nextDraft);
    setDiagnostics(result.diagnostics);
    if (!result.collections || result.diagnostics.length > 0) {
      setMetrics([]);
      setMessage(null);
      return;
    }

    setMetrics(trussTextMetrics(result.collections));
    const nodeLoadLabel = modelObjectLoadLabel("truss", "node");
    setMessage(`检查通过：将导入 ${modelObjectCountPhrase("truss", "node", result.collections.nodes.length)}、${modelObjectCountPhrase("truss", "member", result.collections.members.length)}、${result.collections.loads.length} 条${nodeLoadLabel}。点击“应用文本模型”后写入正式模型。`);
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
    const result = parseTrussTextModel(draft);
    setDiagnostics(result.diagnostics);
    if (result.diagnostics.length > 0) {
      setDiagnostics(["存在诊断，未写入正式模型。", ...result.diagnostics]);
      setMetrics([]);
      setMessage(null);
      return;
    }
    if (!result.collections) {
      setMessage("文本模型未导入。");
      return;
    }

    onApplyCollections(result.collections);
    setMetrics(trussTextMetrics(result.collections));
    const nodeLoadLabel = modelObjectLoadLabel("truss", "node");
    setMessage(`已导入 ${modelObjectCountPhrase("truss", "node", result.collections.nodes.length)}、${modelObjectCountPhrase("truss", "member", result.collections.members.length)}、${result.collections.loads.length} 条${nodeLoadLabel}。`);
  };

  const noteTemplateApplied = (templateTitle: string) => {
    setMessage(`已套用参数模板「${templateTitle}」。`);
    setDiagnostics([]);
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
    noteTemplateApplied,
  };
}
