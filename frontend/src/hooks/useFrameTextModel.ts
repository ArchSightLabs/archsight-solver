import { useState } from "react";
import type { TextModelPreviewMetric } from "../components/TextModelCheckPanel";
import { createConnectedFrameMember } from "../lib/frame-editor-model.ts";
import { parseFrameTextModel, serializeFrameTextModel, type FrameTextCollections } from "../lib/frame-text-model.ts";
import { modelObjectCountPhrase, modelObjectVocabulary } from "../lib/model-object-vocabulary.ts";
import type { FrameLoad, FrameLoadCase, FrameLoadCombination, StructureMember, StructureNode } from "../types/structure.ts";

export interface FrameTextModelEditorCollections {
  nodes: StructureNode[];
  members: StructureMember[];
  loads: FrameLoad[];
  loadCases: FrameLoadCase[];
  loadCombinations: FrameLoadCombination[];
}

interface UseFrameTextModelOptions {
  value: FrameTextModelEditorCollections;
  onApplyCollections: (next: FrameTextModelEditorCollections) => void;
}

function completeFrameTextCollections(collections: FrameTextCollections): FrameTextModelEditorCollections {
  let nextMembers = collections.members;
  if (nextMembers.length === 0 && collections.nodes.length >= 2) {
    const generatedMembers: StructureMember[] = [];
    collections.nodes.slice(1).forEach((node, index) => {
      generatedMembers.push(createConnectedFrameMember(
        collections.nodes[index],
        node,
        generatedMembers,
        generatedMembers.map((member) => member.id),
      ));
    });
    nextMembers = generatedMembers;
  }

  return {
    nodes: collections.nodes,
    members: nextMembers,
    loads: collections.loads,
    loadCases: collections.loadCases ?? [],
    loadCombinations: collections.loadCombinations ?? [],
  };
}

function frameTextMetrics(collections: FrameTextModelEditorCollections): TextModelPreviewMetric[] {
  const vocabulary = modelObjectVocabulary("frame");
  return [
    { label: vocabulary.nodeGroupLabel, value: `${collections.nodes.length}` },
    { label: vocabulary.memberGroupLabel, value: `${collections.members.length}` },
    { label: "基本荷载", value: `${collections.loads.length}` },
    { label: "荷载工况", value: `${collections.loadCases.length}` },
    { label: "荷载组合", value: `${collections.loadCombinations.length}` },
  ];
}

export function useFrameTextModel({ value, onApplyCollections }: UseFrameTextModelOptions) {
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<TextModelPreviewMetric[]>([]);

  const exportTextModel = () => {
    const vocabulary = modelObjectVocabulary("frame");
    setDraft(serializeFrameTextModel(value));
    setDiagnostics([]);
    setMetrics([]);
    setMessage(`已按当前${vocabulary.nodeGroupLabel}、${vocabulary.memberGroupLabel}、基本${vocabulary.loadGroupLabel}、荷载工况与组合生成文本模型，可编辑后先检查再应用。`);
  };

  const previewDraft = (nextDraft: string) => {
    setDraft(nextDraft);
    if (nextDraft.trim().length === 0) {
      setDiagnostics([]);
      setMetrics([]);
      setMessage(null);
      return;
    }

    const result = parseFrameTextModel(nextDraft);
    setDiagnostics(result.diagnostics);
    if (!result.collections || result.diagnostics.length > 0) {
      setMetrics([]);
      setMessage(null);
      return;
    }

    const next = completeFrameTextCollections(result.collections);
    const vocabulary = modelObjectVocabulary("frame");
    setMetrics(frameTextMetrics(next));
    setMessage(`检查通过：将导入 ${modelObjectCountPhrase("frame", "node", next.nodes.length)}、${modelObjectCountPhrase("frame", "member", next.members.length)}、${next.loads.length} 条基本${vocabulary.loadGroupLabel}、${next.loadCases.length} 个荷载工况和 ${next.loadCombinations.length} 个荷载组合。点击“应用文本模型”后写入正式模型。`);
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
    const result = parseFrameTextModel(draft);
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

    const next = completeFrameTextCollections(result.collections);
    const vocabulary = modelObjectVocabulary("frame");
    onApplyCollections(next);
    setMetrics(frameTextMetrics(next));
    setMessage(`已导入 ${modelObjectCountPhrase("frame", "node", next.nodes.length)}、${modelObjectCountPhrase("frame", "member", next.members.length)}、${next.loads.length} 条基本${vocabulary.loadGroupLabel}、${next.loadCases.length} 个荷载工况和 ${next.loadCombinations.length} 个荷载组合。`);
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
