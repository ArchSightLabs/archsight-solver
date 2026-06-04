import { useMemo, useState } from "react";
import { Button } from "./ui/button";
import { FrameBasicSection } from "./FrameBasicSection";
import { FrameLoadCaseSection } from "./FrameLoadCaseSection";
import { FrameLoadCombinationSection } from "./FrameLoadCombinationSection";
import { FrameLoadEditor } from "./FrameLoadEditor";
import { FrameMemberEditor } from "./FrameMemberEditor";
import { FrameNodeEditor } from "./FrameNodeEditor";
import { FrameObjectNavigator, type FrameSelectedObject } from "./FrameObjectNavigator";
import { FrameTableSection, type FrameAdvancedSection } from "./FrameTableSection";
import { FrameTemplateSection } from "./FrameTemplateSection";
import { FrameTextModelSection } from "./FrameTextModelSection";
import { GridSnapControls } from "./GridSnapControls";
import { ArrowRight, ArrowUp, Copy, FlipHorizontal, FlipVertical, Plus, Layers3 } from "lucide-react";
import {
  createConnectedFrameMember,
  createConnectedFrameMemberByNodeId,
  createFrameCombinationDraft,
  createFrameLoadCaseDraft,
  createFrameLoadDraft,
  distanceBetweenFrameNodes,
  frameDistributedLoadKindLabel,
  frameMemberExists,
  inferFrameNodeDraft,
} from "../lib/frame-editor-model.ts";
import { useFrameTextModel } from "../hooks/useFrameTextModel.ts";
import { useNodePairConnection } from "../hooks/useNodePairConnection.ts";
import {
  arrayFrameCollections,
  copyFrameCollections,
  mirrorFrameCollections,
  removeFrameLoadCaseCollections,
  removeFrameLoadCollections,
  removeFrameLoadCombinationCollections,
  removeFrameMemberCollections,
  removeFrameNodeCollections,
  updateFrameLoadCaseCollections,
  updateFrameLoadCollections,
  updateFrameLoadCombinationCollections,
  updateFrameMemberCollections,
  updateFrameNodeCollections,
  type FrameEditorCollections,
} from "../lib/frame-model-edits.ts";
import { FRAME_MODEL_TEMPLATES, cloneFrameModelTemplate } from "../lib/workbench-model-templates.ts";
import { normalizeModuleSectionId } from "../lib/workbench-navigation.ts";
import { memberElasticityDistributionLabel, momentOfInertiaForMaterial, sectionAreaForMaterial, youngModulusForMaterial } from "../lib/material-presets.ts";
import { modelObjectMemberTerm } from "../lib/model-object-vocabulary.ts";
import { frameSupportStabilityWarning } from "../solver-payload.ts";
import type { Material } from "../types/material.ts";
import type {
  FrameLoad,
  FrameLoadCase,
  FrameLoadCombination,
  StructureMember,
  StructureNode,
} from "../types/structure.ts";
import type { FrameWorkbenchSelection, WorkbenchSelectionOptions } from "../types/workbench-selection.ts";

type FrameCollections = FrameEditorCollections;

interface FrameCustomModelEditorProps {
  value: FrameCollections;
  materialId: string;
  materialLibrary: Material[];
  onChange: (next: FrameCollections) => void;
  onMaterialChange: (nextMaterialId: string) => void;
  activeSectionId?: string;
  selection?: FrameWorkbenchSelection | null;
  onSelectionChange?: (next: FrameWorkbenchSelection, options?: WorkbenchSelectionOptions) => void;
}

interface FrameGeometryEditTarget {
  nodeIds?: string[];
  memberIds?: string[];
  preferredNodeId?: string;
  preferredMemberId?: string;
  label: string;
}

export function FrameCustomModelEditor({
  value,
  materialId,
  materialLibrary,
  onChange,
  onMaterialChange,
  activeSectionId,
  selection,
  onSelectionChange,
}: FrameCustomModelEditorProps) {
  const [selectedObject, setSelectedObject] = useState<FrameSelectedObject>({ type: "node", id: value.nodes[0]?.id ?? "" });
  const [nodeConnectionTargetId, setNodeConnectionTargetId] = useState("");
  const [advancedSectionId, setAdvancedSectionId] = useState<FrameAdvancedSection>("nodes");
  const [gridSnapEnabled, setGridSnapEnabled] = useState(false);
  const [gridSnapStepM, setGridSnapStepM] = useState(0.5);
  const visibleSectionId = normalizeModuleSectionId("frame", activeSectionId) ?? "frame-template";
  const memberTerm = modelObjectMemberTerm("frame");
  const isSectionVisible = (sectionId: string) => visibleSectionId === sectionId;

  const nodeOptions = useMemo(
    () => value.nodes.map((node) => ({ value: node.id, label: node.id })),
    [value.nodes]
  );
  const nodeIds = useMemo(() => value.nodes.map((node) => node.id), [value.nodes]);
  const memberConnection = useNodePairConnection({
    nodeIds,
    duplicateExists: (startNodeId, endNodeId) => frameMemberExists(value.members, startNodeId, endNodeId),
    duplicateReason: `两节点间已有${memberTerm}`,
  });
  const memberOptions = useMemo(
    () => value.members.map((member) => ({ value: member.id, label: member.id })),
    [value.members]
  );
  const loadOptions = useMemo(
    () => value.loads.map((load, index) => ({
      value: `load-${index}`,
      label: load.type === "nodal"
        ? `节点荷载 ${index + 1}（${load.node}）`
        : load.type === "member_point"
          ? `集中荷载 ${index + 1}（${load.member}）`
          : `${frameDistributedLoadKindLabel(load)} ${index + 1}（${load.member}）`,
    })),
    [value.loads]
  );
  const resolvedSelectedObject = useMemo<FrameSelectedObject>(() => {
    let current = selectedObject;
    if (selection) {
      if (selection.type === "node") current = { type: "node", id: selection.id };
      if (selection.type === "member") current = { type: "member", id: selection.id };
      if (selection.type === "load") current = { type: "load", id: selection.id };
      if (selection.type === "loadCases") current = { type: "loadCases", id: selection.id };
      if (selection.type === "loadCombinations") current = { type: "loadCombinations", id: selection.id };
    }
    if (current.type === "node" && value.nodes.some((node) => node.id === current.id)) return current;
    if (current.type === "member" && value.members.some((member) => member.id === current.id)) return current;
    if (current.type === "load" && value.loads.at(Number(current.id.replace("load-", "")))) return current;
    if (current.type === "loadCases") return current;
    if (current.type === "loadCombinations") return current;
    if (value.nodes[0]) return { type: "node", id: value.nodes[0].id };
    if (value.members[0]) return { type: "member", id: value.members[0].id };
    return { type: "load", id: "load-0" };
  }, [selectedObject, selection, value.loads, value.members, value.nodes]);
  const supportCount = value.nodes.filter(
    (node) =>
      (node.supportType ?? "free") !== "free" ||
      (node.springs ?? []).some((spring) => spring.dof === "rz" ? spring.stiffnessKnMPerRad > 0 : spring.stiffnessKnPerM > 0),
  ).length;
  const memberElasticitySummary = useMemo(
    () => memberElasticityDistributionLabel(value.members, memberTerm, materialId, materialLibrary),
    [materialId, materialLibrary, memberTerm, value.members],
  );
  const defaultMemberElasticityGPa = youngModulusForMaterial(materialId, 210, materialLibrary);
  const defaultMemberSectionAreaCm2 = sectionAreaForMaterial(materialId, 120, materialLibrary);
  const defaultMemberMomentOfInertiaCm4 = momentOfInertiaForMaterial(materialId, 8000, materialLibrary);
  const modelWarnings = useMemo(() => {
    const warnings: string[] = [];
    const nodeIds = new Set(value.nodes.map((node) => node.id));
    const supportWarning = frameSupportStabilityWarning(value.nodes);
    if (supportCount === 0) {
      warnings.push("尚未设置支座约束。");
    } else if (supportWarning) {
      warnings.push(supportWarning);
    }
    if (value.members.some((member) => !nodeIds.has(member.start) || !nodeIds.has(member.end))) warnings.push(`存在引用缺失节点的${memberTerm}。`);
    if (value.loads.length === 0) warnings.push("尚未设置基本荷载。");
    if (value.members.length === 0) warnings.push(`尚未设置${memberTerm}。`);
    return warnings;
  }, [memberTerm, supportCount, value.loads.length, value.members, value.nodes]);
  const geometryEditSpacing = useMemo(() => {
    if (value.nodes.length === 0) return { x: 3, y: 3 };
    const xs = value.nodes.map((node) => node.x);
    const ys = value.nodes.map((node) => node.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    return {
      x: Number(Math.max(1, width + 1).toFixed(3)),
      y: Number(Math.max(1, height + 1).toFixed(3)),
    };
  }, [value.nodes]);
  const geometryEditTarget = useMemo<FrameGeometryEditTarget>(() => {
    if (resolvedSelectedObject.type === "node" && value.nodes.some((node) => node.id === resolvedSelectedObject.id)) {
      return {
        nodeIds: [resolvedSelectedObject.id],
        memberIds: [],
        preferredNodeId: resolvedSelectedObject.id,
        label: "当前节点",
      };
    }
    if (resolvedSelectedObject.type === "member" && value.members.some((member) => member.id === resolvedSelectedObject.id)) {
      return {
        nodeIds: [],
        memberIds: [resolvedSelectedObject.id],
        preferredMemberId: resolvedSelectedObject.id,
        label: `当前${memberTerm}`,
      };
    }
    if (resolvedSelectedObject.type === "load") {
      const load = value.loads.at(Number(resolvedSelectedObject.id.replace("load-", "")));
      if (load?.type === "nodal") {
        return {
          nodeIds: [load.node],
          memberIds: [],
          preferredNodeId: load.node,
          label: "荷载作用节点",
        };
      }
      if (load) {
        return {
          nodeIds: [],
          memberIds: [load.member],
          preferredMemberId: load.member,
          label: `荷载作用${memberTerm}`,
        };
      }
    }
    return {
      nodeIds: value.nodes.map((node) => node.id),
      memberIds: value.members.map((member) => member.id),
      preferredNodeId: value.nodes[0]?.id,
      preferredMemberId: value.members[0]?.id,
      label: "全模型",
    };
  }, [memberTerm, resolvedSelectedObject, value.loads, value.members, value.nodes]);
  const geometryEditDisabled = value.nodes.length === 0 && value.members.length === 0;

  const commit = (next: FrameCollections) => onChange(next);

  const selectObject = (next: FrameSelectedObject, options?: WorkbenchSelectionOptions) => {
    setSelectedObject(next);
    if (next.type === "node") onSelectionChange?.({ mode: "frame", type: "node", id: next.id }, options);
    if (next.type === "member") onSelectionChange?.({ mode: "frame", type: "member", id: next.id }, options);
    if (next.type === "load") onSelectionChange?.({ mode: "frame", type: "load", id: next.id }, options);
    if (next.type === "loadCases") onSelectionChange?.({ mode: "frame", type: "loadCases", id: next.id }, options);
    if (next.type === "loadCombinations") onSelectionChange?.({ mode: "frame", type: "loadCombinations", id: next.id }, options);
  };

  const keep = (patch: Partial<FrameCollections> = {}): FrameCollections => ({
    nodes: patch.nodes ?? value.nodes,
    members: patch.members ?? value.members,
    loads: patch.loads ?? value.loads,
    loadCases: patch.loadCases ?? value.loadCases,
    loadCombinations: patch.loadCombinations ?? value.loadCombinations,
  });

  const geometryEditOptions = () => ({
    nodeIds: geometryEditTarget.nodeIds,
    memberIds: geometryEditTarget.memberIds,
  });

  const resetFrameMemberConnection = (next: FrameCollections) => {
    memberConnection.resetToAvailablePair({
      nodeIds: next.nodes.map((node) => node.id),
      duplicateExists: (nextStartId, nextEndId) => frameMemberExists(next.members, nextStartId, nextEndId),
    });
  };

  const selectGeneratedFrameGeometry = (next: FrameCollections, target: FrameGeometryEditTarget) => {
    const previousNodeIds = new Set(value.nodes.map((node) => node.id));
    const previousMemberIds = new Set(value.members.map((member) => member.id));
    if (target.preferredMemberId) {
      const generatedMember = next.members.find((member) => !previousMemberIds.has(member.id) && member.id.startsWith(`${target.preferredMemberId}_C`));
      if (generatedMember) {
        selectObject({ type: "member", id: generatedMember.id }, { openEditor: false });
        return;
      }
    }
    if (target.preferredNodeId) {
      const generatedNode = next.nodes.find((node) => !previousNodeIds.has(node.id) && node.id.startsWith(`${target.preferredNodeId}_C`));
      if (generatedNode) {
        selectObject({ type: "node", id: generatedNode.id }, { openEditor: false });
        return;
      }
    }
    const generatedNode = next.nodes.find((node) => !previousNodeIds.has(node.id));
    if (generatedNode) selectObject({ type: "node", id: generatedNode.id }, { openEditor: false });
  };

  const commitFrameGeometryEdit = (next: FrameCollections, target: FrameGeometryEditTarget) => {
    commit(next);
    resetFrameMemberConnection(next);
    selectGeneratedFrameGeometry(next, target);
  };

  const copyGeometryTarget = () => {
    const next = copyFrameCollections(value, { ...geometryEditOptions(), offsetX: geometryEditSpacing.x, offsetY: 0 });
    commitFrameGeometryEdit(next, geometryEditTarget);
  };

  const mirrorGeometryTarget = (axis: "x" | "y") => {
    const next = mirrorFrameCollections(value, { ...geometryEditOptions(), axis, origin: 0 });
    commitFrameGeometryEdit(next, geometryEditTarget);
  };

  const arrayGeometryTarget = (direction: "x" | "y") => {
    const next = arrayFrameCollections(value, {
      ...geometryEditOptions(),
      count: 2,
      deltaX: direction === "x" ? geometryEditSpacing.x : 0,
      deltaY: direction === "y" ? geometryEditSpacing.y : 0,
    });
    commitFrameGeometryEdit(next, geometryEditTarget);
  };

  const frameTextModel = useFrameTextModel({
    value,
    onApplyCollections: (next) => {
      const nextCollections = keep(next);
      commit(nextCollections);
      memberConnection.resetToAvailablePair({
        nodeIds: nextCollections.nodes.map((node) => node.id),
        duplicateExists: (nextStartId, nextEndId) => frameMemberExists(nextCollections.members, nextStartId, nextEndId),
      });
    },
  });

  const applyTypicalCase = (templateId: string) => {
    const template = FRAME_MODEL_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    const collections = cloneFrameModelTemplate(template);
    commit({
      nodes: collections.nodes,
      members: collections.members,
      loads: collections.loads,
      loadCases: [],
      loadCombinations: [],
    });
    memberConnection.resetToAvailablePair({
      nodeIds: collections.nodes.map((node) => node.id),
      duplicateExists: (nextStartId, nextEndId) => frameMemberExists(collections.members, nextStartId, nextEndId),
    });
    selectObject({ type: "node", id: collections.nodes[0]?.id ?? "" }, { openEditor: false });
    frameTextModel.noteTemplateApplied(template.title);
  };

  const updateNode = (index: number, patch: Partial<StructureNode>) => {
    const result = updateFrameNodeCollections(value, index, patch);
    if (!result) return;
    commit(result.next);
    if (result.renamed && resolvedSelectedObject.type === "node" && resolvedSelectedObject.id === result.previousId) {
      selectObject({ type: "node", id: result.nextId }, { openEditor: false });
    }
  };

  const addNode = () => {
    const preferredConnectionNode = resolvedSelectedObject.type === "node"
      ? value.nodes.find((node) => node.id === resolvedSelectedObject.id) ?? null
      : null;
    const nextNode = inferFrameNodeDraft(value.nodes, value.nodes.map((node) => node.id), preferredConnectionNode?.id);
    const nextNodes = [...value.nodes, nextNode];
    const nearest = value.nodes.reduce<StructureNode | null>((candidate, node) => {
      if (!candidate) return node;
      return distanceBetweenFrameNodes(node, nextNode) < distanceBetweenFrameNodes(candidate, nextNode) ? node : candidate;
    }, null);
    const connectionNode = preferredConnectionNode ?? nearest;
    const nextMembers = connectionNode && !frameMemberExists(value.members, connectionNode.id, nextNode.id)
      ? [...value.members, createConnectedFrameMember(connectionNode, nextNode, value.members, value.members.map((member) => member.id), defaultMemberElasticityGPa, materialId, {
        sectionAreaCm2: defaultMemberSectionAreaCm2,
        momentOfInertiaCm4: defaultMemberMomentOfInertiaCm4,
      })]
      : value.members;
    commit(keep({ nodes: nextNodes, members: nextMembers }));
    memberConnection.selectAvailablePairForNode({
      nodeIds: nextNodes.map((node) => node.id),
      nodeId: nextNode.id,
      preferredNeighborId: connectionNode?.id,
      duplicateExists: (nextStartId, nextEndId) => frameMemberExists(nextMembers, nextStartId, nextEndId),
    });
    selectObject({ type: "node", id: nextNode.id }, { openEditor: false });
  };

  const removeNode = (index: number) => {
    const next = removeFrameNodeCollections(value, index);
    if (next) commit(next);
  };

  const addMemberBetweenNodes = (startId: string, endId: string) => {
    const nextMember = createConnectedFrameMemberByNodeId(startId, endId, value.nodes, value.members, defaultMemberElasticityGPa, materialId, {
      sectionAreaCm2: defaultMemberSectionAreaCm2,
      momentOfInertiaCm4: defaultMemberMomentOfInertiaCm4,
    });
    if (!nextMember) {
      return;
    }
    const nextMembers = [...value.members, nextMember];
    memberConnection.advanceAfterConnection({
      nodeIds,
      startNodeId: startId,
      endNodeId: endId,
      duplicateExists: (nextStartId, nextEndId) => frameMemberExists(nextMembers, nextStartId, nextEndId),
    });
    commit(keep({ members: nextMembers }));
    selectObject({ type: "member", id: nextMember.id }, { openEditor: false });
  };

  const updateMember = (index: number, patch: Partial<StructureMember>) => {
    const result = updateFrameMemberCollections(value, index, patch);
    if (!result) return;
    commit(result.next);
    if (result.renamed && resolvedSelectedObject.type === "member" && resolvedSelectedObject.id === result.previousId) {
      selectObject({ type: "member", id: result.nextId }, { openEditor: false });
    }
  };

  const removeMember = (index: number) => {
    const next = removeFrameMemberCollections(value, index);
    if (next) commit(next);
  };

  const addLoad = () => {
    const nextLoads = [...value.loads, createFrameLoadDraft(value.loads.length, value.nodes, value.members)];
    commit(keep({ loads: nextLoads }));
  };

  const updateLoad = (index: number, patch: Partial<FrameLoad>) => {
    const next = updateFrameLoadCollections(value, index, patch);
    if (next) commit(next);
  };

  const removeLoad = (index: number) => {
    commit(removeFrameLoadCollections(value, index));
  };

  const addLoadCase = () => {
    const nextLoadCases = [
      ...value.loadCases,
      createFrameLoadCaseDraft(value.loadCases.length, value.nodes, value.members, value.loadCases.map((loadCase) => loadCase.id)),
    ];
    commit(keep({ loadCases: nextLoadCases }));
  };

  const updateLoadCase = (index: number, patch: Partial<FrameLoadCase>) => {
    const result = updateFrameLoadCaseCollections(value, index, patch);
    if (result) commit(result.next);
  };

  const removeLoadCase = (index: number) => {
    const next = removeFrameLoadCaseCollections(value, index);
    if (next) commit(next);
  };

  const addLoadToCase = (loadCaseIndex: number) => {
    const loadCase = value.loadCases.at(loadCaseIndex);
    if (!loadCase) return;
    updateLoadCase(loadCaseIndex, { loads: [...loadCase.loads, createFrameLoadDraft(loadCase.loads.length, value.nodes, value.members)] });
  };

  const updateLoadInCase = (loadCaseIndex: number, loadIndex: number, patch: Partial<FrameLoad>) => {
    const loadCase = value.loadCases.at(loadCaseIndex);
    if (!loadCase) return;
    updateLoadCase(loadCaseIndex, {
      loads: loadCase.loads.map((load, index) => (index === loadIndex ? { ...load, ...patch } as FrameLoad : load)),
    });
  };

  const removeLoadFromCase = (loadCaseIndex: number, loadIndex: number) => {
    const loadCase = value.loadCases.at(loadCaseIndex);
    if (!loadCase) return;
    updateLoadCase(loadCaseIndex, { loads: loadCase.loads.filter((_, index) => index !== loadIndex) });
  };

  const addLoadCombination = () => {
    const nextCombinations = [
      ...value.loadCombinations,
      createFrameCombinationDraft(value.loadCombinations.length, value.loadCases, value.loadCombinations.map((combination) => combination.id)),
    ];
    commit(keep({ loadCombinations: nextCombinations }));
  };

  const updateLoadCombination = (index: number, patch: Partial<FrameLoadCombination>) => {
    const next = updateFrameLoadCombinationCollections(value, index, patch);
    if (next) commit(next);
  };

  const fieldLabelClass = "text-[10px] font-black tracking-widest text-muted-foreground";
  const renderSelectedEditor = () => {
    if (resolvedSelectedObject.type === "loadCases") {
      return (
        <FrameLoadCaseSection
          loadCases={value.loadCases}
          nodes={value.nodes}
          members={value.members}
          nodeOptions={nodeOptions}
          memberOptions={memberOptions}
          fieldLabelClass={fieldLabelClass}
          onAddLoadCase={addLoadCase}
          onUpdateLoadCase={updateLoadCase}
          onRemoveLoadCase={removeLoadCase}
          onAddLoadToCase={addLoadToCase}
          onUpdateLoadInCase={updateLoadInCase}
          onRemoveLoadFromCase={removeLoadFromCase}
        />
      );
    }

    if (resolvedSelectedObject.type === "loadCombinations") {
      return (
        <FrameLoadCombinationSection
          loadCases={value.loadCases}
          loadCombinations={value.loadCombinations}
          fieldLabelClass={fieldLabelClass}
          onAddLoadCombination={addLoadCombination}
          onUpdateLoadCombination={updateLoadCombination}
          onRemoveLoadCombination={(combinationIndex) =>
            commit(removeFrameLoadCombinationCollections(value, combinationIndex))
          }
        />
      );
    }

    if (resolvedSelectedObject.type === "node") {
      const index = value.nodes.findIndex((node) => node.id === resolvedSelectedObject.id);
      const node = value.nodes[index];
      if (!node) return null;
      return (
        <FrameNodeEditor
          node={node}
          nodeIndex={index}
          nodeCount={value.nodes.length}
          nodeOptions={nodeOptions}
          fieldLabelClass={fieldLabelClass}
          onUpdate={(patch) => updateNode(index, patch)}
          onRemove={() => removeNode(index)}
          variant="selected"
          connectionTargetId={nodeConnectionTargetId}
          onConnectionTargetChange={setNodeConnectionTargetId}
          onAddMemberBetweenNodes={addMemberBetweenNodes}
          memberConnectionExists={(startId, endId) => frameMemberExists(value.members, startId, endId)}
          gridSnapEnabled={gridSnapEnabled}
          gridSnapStepM={gridSnapStepM}
        />
      );
    }

    if (resolvedSelectedObject.type === "member") {
      const index = value.members.findIndex((member) => member.id === resolvedSelectedObject.id);
      const member = value.members[index];
      if (!member) return null;
      return (
        <FrameMemberEditor
          member={member}
          memberIndex={index}
          nodeOptions={nodeOptions}
          materialLibrary={materialLibrary}
          fieldLabelClass={fieldLabelClass}
          onUpdate={(patch) => updateMember(index, patch)}
          onRemove={() => removeMember(index)}
          variant="selected"
        />
      );
    }

    const loadIndex = Number(resolvedSelectedObject.id.replace("load-", ""));
    const load = value.loads[loadIndex];
    if (!load) return null;
    return (
      <FrameLoadEditor
        load={load}
        index={loadIndex}
        nodes={value.nodes}
        members={value.members}
        nodeOptions={nodeOptions}
        memberOptions={memberOptions}
        fieldLabelClass={fieldLabelClass}
        onUpdate={(patch) => updateLoad(loadIndex, patch)}
        onRemove={() => removeLoad(loadIndex)}
      />
    );
  };

  return (
    <div className="space-y-5">
      {isSectionVisible("frame-basic") ? (
      <FrameBasicSection
        materialId={materialId}
        materialLibrary={materialLibrary}
        memberElasticitySummary={memberElasticitySummary}
        nodeCount={value.nodes.length}
        memberCount={value.members.length}
        supportCount={supportCount}
        loadCount={value.loads.length}
        modelWarnings={modelWarnings}
        onMaterialChange={onMaterialChange}
      />
      ) : null}

      {isSectionVisible("frame-text") ? (
      <FrameTextModelSection
        draft={frameTextModel.draft}
        message={frameTextModel.message}
        diagnostics={frameTextModel.diagnostics}
        metrics={frameTextModel.metrics}
        onDraftChange={frameTextModel.previewDraft}
        onExport={frameTextModel.exportTextModel}
        onCheck={frameTextModel.checkDraft}
        onImport={frameTextModel.importDraft}
      />
      ) : null}

      {isSectionVisible("frame-template") ? (
      <FrameTemplateSection onApplyTemplate={applyTypicalCase} />
      ) : null}

      {isSectionVisible("frame-object") ? (
      <FrameObjectNavigator
        nodes={value.nodes}
        members={value.members}
        materialLibrary={materialLibrary}
        nodeOptions={nodeOptions}
        loadOptions={loadOptions}
        selectedObject={resolvedSelectedObject}
        fieldLabelClass={fieldLabelClass}
        memberConnectionStartId={memberConnection.startNodeId}
        memberConnectionEndId={memberConnection.endNodeId}
        memberConnectionDisabledReason={memberConnection.disabledReason}
        onSelectObject={(next) => selectObject(next)}
        onMemberConnectionStartChange={memberConnection.updateStartNodeId}
        onMemberConnectionEndChange={memberConnection.updateEndNodeId}
        onAddMemberConnection={() => addMemberBetweenNodes(memberConnection.startNodeId, memberConnection.endNodeId)}
        onAddLoad={addLoad}
      />
      ) : null}

      {isSectionVisible("frame-object") ? (
      <section id="frame-selected-editor" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="eyebrow flex items-center gap-2">
            <Layers3 className="h-3.5 w-3.5 text-primary" />
            属性编辑
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold text-muted-foreground">{geometryEditTarget.label}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={copyGeometryTarget}
              disabled={geometryEditDisabled}
              title="复制当前几何对象并沿 X 向错开"
              className="h-8 rounded-xl"
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              复制
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => mirrorGeometryTarget("x")}
              disabled={geometryEditDisabled}
              title="按 X 轴镜像当前几何对象"
              className="h-8 rounded-xl"
            >
              <FlipVertical className="mr-1.5 h-3.5 w-3.5" />
              X 镜像
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => mirrorGeometryTarget("y")}
              disabled={geometryEditDisabled}
              title="按 Y 轴镜像当前几何对象"
              className="h-8 rounded-xl"
            >
              <FlipHorizontal className="mr-1.5 h-3.5 w-3.5" />
              Y 镜像
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => arrayGeometryTarget("x")}
              disabled={geometryEditDisabled}
              title="沿 X 向生成 2 份阵列副本"
              className="h-8 rounded-xl"
            >
              <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
              X 阵列
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => arrayGeometryTarget("y")}
              disabled={geometryEditDisabled}
              title="沿 Y 向生成 2 份阵列副本"
              className="h-8 rounded-xl"
            >
              <ArrowUp className="mr-1.5 h-3.5 w-3.5" />
              Y 阵列
            </Button>
            <Button variant="outline" size="sm" onClick={addNode} className="h-8 rounded-xl">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              新增节点并连接
            </Button>
          </div>
        </div>
        <GridSnapControls
          enabled={gridSnapEnabled}
          stepM={gridSnapStepM}
          onEnabledChange={setGridSnapEnabled}
          onStepChange={setGridSnapStepM}
        />
        {renderSelectedEditor()}
      </section>
      ) : null}

      {isSectionVisible("frame-table") ? (
      <FrameTableSection
        nodes={value.nodes}
        members={value.members}
        materialLibrary={materialLibrary}
        loads={value.loads}
        nodeOptions={nodeOptions}
        memberOptions={memberOptions}
        loadCases={value.loadCases}
        loadCombinations={value.loadCombinations}
        activeSectionId={advancedSectionId}
        onSectionChange={setAdvancedSectionId}
        onNodeUpdate={updateNode}
        onNodeRemove={removeNode}
        onMemberUpdate={updateMember}
        onMemberRemove={removeMember}
        onLoadUpdate={updateLoad}
        onLoadRemove={removeLoad}
        gridSnapEnabled={gridSnapEnabled}
        gridSnapStepM={gridSnapStepM}
        onGridSnapEnabledChange={setGridSnapEnabled}
        onGridSnapStepChange={setGridSnapStepM}
      />
      ) : null}
    </div>
  );
}
