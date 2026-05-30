import { useMemo, useState } from "react";
import { Button } from "./ui/button";
import { FrameBasicSection } from "./FrameBasicSection";
import { FrameLoadEditor } from "./FrameLoadEditor";
import { FrameMemberEditor } from "./FrameMemberEditor";
import { FrameNodeEditor } from "./FrameNodeEditor";
import { FrameObjectNavigator, type FrameSelectedObject } from "./FrameObjectNavigator";
import { FrameTableSection, type FrameAdvancedSection } from "./FrameTableSection";
import { FrameTemplateSection } from "./FrameTemplateSection";
import { FrameTextModelSection } from "./FrameTextModelSection";
import { Plus, Layers3 } from "lucide-react";
import {
  createConnectedFrameMember,
  createFrameCombinationDraft,
  createFrameLoadCaseDraft,
  createFrameLoadDraft,
  createFrameMemberDraft,
  distanceBetweenFrameNodes,
  frameDistributedLoadKindLabel,
  frameMemberExists,
  inferFrameNodeDraft,
} from "../lib/frame-editor-model.ts";
import { useFrameTextModel } from "../hooks/useFrameTextModel.ts";
import { useNodePairConnection } from "../hooks/useNodePairConnection.ts";
import { FRAME_MODEL_TEMPLATES, cloneFrameModelTemplate } from "../lib/workbench-model-templates.ts";
import { normalizeModuleSectionId } from "../lib/workbench-navigation.ts";
import { memberElasticityDistributionLabel, youngModulusForMaterial } from "../lib/material-presets.ts";
import { frameSupportStabilityWarning } from "../solver-payload.ts";
import { PREDEFINED_MATERIALS } from "../types/material.ts";
import type {
  FrameLoad,
  FrameLoadCase,
  FrameLoadCombination,
  StructureMember,
  StructureNode,
} from "../types/structure.ts";
import type { FrameWorkbenchSelection, WorkbenchSelectionOptions } from "../types/workbench-selection.ts";

interface FrameCollections {
  nodes: StructureNode[];
  members: StructureMember[];
  loads: FrameLoad[];
  loadCases: FrameLoadCase[];
  loadCombinations: FrameLoadCombination[];
}

interface FrameCustomModelEditorProps {
  value: FrameCollections;
  materialId: string;
  onChange: (next: FrameCollections) => void;
  onMaterialChange: (nextMaterialId: string) => void;
  onResetToPortal: () => void;
  activeSectionId?: string;
  selection?: FrameWorkbenchSelection | null;
  onSelectionChange?: (next: FrameWorkbenchSelection, options?: WorkbenchSelectionOptions) => void;
}

function canonicalId(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

export function FrameCustomModelEditor({
  value,
  materialId,
  onChange,
  onMaterialChange,
  onResetToPortal,
  activeSectionId,
  selection,
  onSelectionChange,
}: FrameCustomModelEditorProps) {
  const [selectedObject, setSelectedObject] = useState<FrameSelectedObject>({ type: "node", id: value.nodes[0]?.id ?? "" });
  const [nodeConnectionTargetId, setNodeConnectionTargetId] = useState("");
  const [advancedSectionId, setAdvancedSectionId] = useState<FrameAdvancedSection>("nodes");
  const visibleSectionId = normalizeModuleSectionId("frame", activeSectionId) ?? "frame-template";
  const isSectionVisible = (sectionId: string) => visibleSectionId === sectionId;

  const nodeOptions = useMemo(
    () => value.nodes.map((node) => ({ value: node.id, label: node.id })),
    [value.nodes]
  );
  const nodeIds = useMemo(() => value.nodes.map((node) => node.id), [value.nodes]);
  const memberConnection = useNodePairConnection({
    nodeIds,
    duplicateExists: (startNodeId, endNodeId) => frameMemberExists(value.members, startNodeId, endNodeId),
    duplicateReason: "两节点间已有构件",
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
    const current = selection ? { type: selection.type, id: selection.id } : selectedObject;
    if (current.type === "node" && value.nodes.some((node) => node.id === current.id)) return current;
    if (current.type === "member" && value.members.some((member) => member.id === current.id)) return current;
    if (current.type === "load" && value.loads[Number(current.id.replace("load-", ""))]) return current;
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
    () => memberElasticityDistributionLabel(value.members, "构件"),
    [value.members],
  );
  const defaultMemberElasticityGPa = youngModulusForMaterial(materialId, 210);
  const modelWarnings = useMemo(() => {
    const warnings: string[] = [];
    const nodeIds = new Set(value.nodes.map((node) => node.id));
    const supportWarning = frameSupportStabilityWarning(value.nodes);
    if (supportCount === 0) {
      warnings.push("尚未设置支座约束。");
    } else if (supportWarning) {
      warnings.push(supportWarning);
    }
    if (value.members.some((member) => !nodeIds.has(member.start) || !nodeIds.has(member.end))) warnings.push("存在引用缺失节点的构件。");
    if (value.loads.length === 0) warnings.push("尚未设置基本荷载。");
    if (value.members.length === 0) warnings.push("尚未设置构件。");
    return warnings;
  }, [supportCount, value.loads.length, value.members, value.nodes]);

  const commit = (next: FrameCollections) => onChange(next);

  const selectObject = (next: FrameSelectedObject, options?: WorkbenchSelectionOptions) => {
    setSelectedObject(next);
    onSelectionChange?.({ mode: "frame", type: next.type, id: next.id }, options);
  };

  const keep = (patch: Partial<FrameCollections> = {}): FrameCollections => ({
    nodes: patch.nodes ?? value.nodes,
    members: patch.members ?? value.members,
    loads: patch.loads ?? value.loads,
    loadCases: patch.loadCases ?? value.loadCases,
    loadCombinations: patch.loadCombinations ?? value.loadCombinations,
  });

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
    const current = value.nodes[index];
    if (!current) return;
    const nextId = patch.id !== undefined ? canonicalId(patch.id, current.id) : current.id;
    const nextPatch = patch.id !== undefined ? { ...patch, id: nextId } : patch;
    const isRenaming = nextId !== current.id;
    const nextNodes = value.nodes.map((node, nodeIndex) => (nodeIndex === index ? { ...node, ...nextPatch } : node));
    const nextMembers = value.members.map((member) => {
      if (isRenaming && current.id === member.start) {
        return { ...member, start: nextId };
      }
      if (isRenaming && current.id === member.end) {
        return { ...member, end: nextId };
      }
      return member;
    });
    const nextLoads = value.loads.map((load) => {
      if (isRenaming && load.type === "nodal" && load.node === current.id) {
        return { ...load, node: nextId };
      }
      return load;
    });
    const nextLoadCases = value.loadCases.map((loadCase) => ({
      ...loadCase,
      loads: loadCase.loads.map((load) => {
        if (isRenaming && load.type === "nodal" && load.node === current.id) {
          return { ...load, node: nextId };
        }
        return load;
      }),
    }));
    commit(keep({ nodes: nextNodes, members: nextMembers, loads: nextLoads, loadCases: nextLoadCases }));
    if (isRenaming && resolvedSelectedObject.type === "node" && resolvedSelectedObject.id === current.id) {
      selectObject({ type: "node", id: nextId }, { openEditor: false });
    }
  };

  const addNode = () => {
    const nextNode = inferFrameNodeDraft(value.nodes, value.nodes.map((node) => node.id));
    const nextNodes = [...value.nodes, nextNode];
    const nearest = value.nodes.reduce<StructureNode | null>((candidate, node) => {
      if (!candidate) return node;
      return distanceBetweenFrameNodes(node, nextNode) < distanceBetweenFrameNodes(candidate, nextNode) ? node : candidate;
    }, null);
    const nextMembers = nearest && !frameMemberExists(value.members, nearest.id, nextNode.id)
      ? [...value.members, createConnectedFrameMember(nearest, nextNode, value.members, value.members.map((member) => member.id), defaultMemberElasticityGPa)]
      : value.members;
    commit(keep({ nodes: nextNodes, members: nextMembers }));
    memberConnection.selectAvailablePairForNode({
      nodeIds: nextNodes.map((node) => node.id),
      nodeId: nextNode.id,
      preferredNeighborId: nearest?.id,
      duplicateExists: (nextStartId, nextEndId) => frameMemberExists(nextMembers, nextStartId, nextEndId),
    });
    selectObject({ type: "node", id: nextNode.id }, { openEditor: false });
  };

  const completeAxisMembers = () => {
    const nodeById = new Map(value.nodes.map((node) => [node.id, node]));
    const candidates: Array<[StructureNode, StructureNode]> = [];
    const sameXGroups = new Map<number, StructureNode[]>();
    const sameYGroups = new Map<number, StructureNode[]>();
    for (const node of value.nodes) {
      const xKey = Number(node.x.toFixed(6));
      const yKey = Number(node.y.toFixed(6));
      sameXGroups.set(xKey, [...(sameXGroups.get(xKey) ?? []), node]);
      sameYGroups.set(yKey, [...(sameYGroups.get(yKey) ?? []), node]);
    }
    for (const group of sameXGroups.values()) {
      group.sort((a, b) => a.y - b.y).slice(1).forEach((node, index) => candidates.push([group[index], node]));
    }
    for (const group of sameYGroups.values()) {
      group.sort((a, b) => a.x - b.x).slice(1).forEach((node, index) => candidates.push([group[index], node]));
    }

    let nextMembers = [...value.members];
    for (const [start, end] of candidates) {
      if (!nodeById.has(start.id) || !nodeById.has(end.id) || frameMemberExists(nextMembers, start.id, end.id)) {
        continue;
      }
      nextMembers = [...nextMembers, createConnectedFrameMember(start, end, nextMembers, nextMembers.map((member) => member.id), defaultMemberElasticityGPa)];
    }
    commit(keep({ members: nextMembers }));
  };

  const removeNode = (index: number) => {
    const removed = value.nodes[index];
    if (!removed) return;
    const nextNodes = value.nodes.filter((_, nodeIndex) => nodeIndex !== index);
    const nextMembers = value.members.filter((member) => member.start !== removed.id && member.end !== removed.id);
    const nextLoads = value.loads.filter((load) => load.type !== "nodal" || load.node !== removed.id);
    const nextLoadCases = value.loadCases.map((loadCase) => ({
      ...loadCase,
      loads: loadCase.loads.filter((load) => load.type !== "nodal" || load.node !== removed.id),
    }));
    commit(keep({ nodes: nextNodes, members: nextMembers, loads: nextLoads, loadCases: nextLoadCases }));
  };

  const addMember = () => {
    if (value.nodes.length < 2) {
      return;
    }
    const nextMember = createFrameMemberDraft(value.members.length, value.nodes, value.members.map((member) => member.id), defaultMemberElasticityGPa);
    const nextMembers = [...value.members, nextMember];
    commit(keep({ members: nextMembers }));
    selectObject({ type: "member", id: nextMember.id }, { openEditor: false });
  };

  const addMemberBetweenNodes = (startId: string, endId: string) => {
    if (!startId || !endId || startId === endId || frameMemberExists(value.members, startId, endId)) {
      return;
    }
    const start = value.nodes.find((node) => node.id === startId);
    const end = value.nodes.find((node) => node.id === endId);
    if (!start || !end) {
      return;
    }
    const nextMember = createConnectedFrameMember(start, end, value.members, value.members.map((member) => member.id), defaultMemberElasticityGPa);
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
    const current = value.members[index];
    if (!current) return;
    const nextId = patch.id !== undefined ? canonicalId(patch.id, current.id) : current.id;
    const nextPatch = patch.id !== undefined ? { ...patch, id: nextId } : patch;
    const isRenaming = nextId !== current.id;
    const nextMembers = value.members.map((member, memberIndex) => (memberIndex === index ? { ...member, ...nextPatch } : member));
    const nextLoads = value.loads.map((load) => {
      if (isRenaming && (load.type === "distributed" || load.type === "member_point") && load.member === current.id) {
        return { ...load, member: nextId };
      }
      return load;
    });
    const nextLoadCases = value.loadCases.map((loadCase) => ({
      ...loadCase,
      loads: loadCase.loads.map((load) => {
        if (isRenaming && (load.type === "distributed" || load.type === "member_point") && load.member === current.id) {
          return { ...load, member: nextId };
        }
        return load;
      }),
    }));
    commit(keep({ members: nextMembers, loads: nextLoads, loadCases: nextLoadCases }));
    if (isRenaming && resolvedSelectedObject.type === "member" && resolvedSelectedObject.id === current.id) {
      selectObject({ type: "member", id: nextId }, { openEditor: false });
    }
  };

  const removeMember = (index: number) => {
    const removed = value.members[index];
    if (!removed) return;
    const nextMembers = value.members.filter((_, memberIndex) => memberIndex !== index);
    const nextLoads = value.loads.filter((load) => load.type === "nodal" || load.member !== removed.id);
    const nextLoadCases = value.loadCases.map((loadCase) => ({
      ...loadCase,
      loads: loadCase.loads.filter((load) => load.type === "nodal" || load.member !== removed.id),
    }));
    commit(keep({ members: nextMembers, loads: nextLoads, loadCases: nextLoadCases }));
  };

  const addLoad = () => {
    const nextLoads = [...value.loads, createFrameLoadDraft(value.loads.length, value.nodes, value.members)];
    commit(keep({ loads: nextLoads }));
  };

  const updateLoad = (index: number, patch: Partial<FrameLoad>) => {
    const current = value.loads[index];
    if (!current) return;
    const nextLoads = value.loads.map((load, loadIndex) => (loadIndex === index ? { ...load, ...patch } as FrameLoad : load));
    commit(keep({ loads: nextLoads }));
  };

  const removeLoad = (index: number) => {
    commit(keep({ loads: value.loads.filter((_, loadIndex) => loadIndex !== index) }));
  };

  const addLoadCase = () => {
    const nextLoadCases = [
      ...value.loadCases,
      createFrameLoadCaseDraft(value.loadCases.length, value.nodes, value.members, value.loadCases.map((loadCase) => loadCase.id)),
    ];
    commit(keep({ loadCases: nextLoadCases }));
  };

  const updateLoadCase = (index: number, patch: Partial<FrameLoadCase>) => {
    const current = value.loadCases[index];
    if (!current) return;
    const nextId = canonicalId(patch.id, current.id);
    const nextPatch = patch.id !== undefined ? { ...patch, id: nextId } : patch;
    const nextLoadCases = value.loadCases.map((loadCase, loadCaseIndex) => (loadCaseIndex === index ? { ...loadCase, ...nextPatch } : loadCase));
    const nextLoadCombinations =
      patch.id !== undefined && nextId !== current.id
        ? value.loadCombinations.map((combination) => {
            if (!(current.id in combination.factors)) return combination;
            const { [current.id]: factor, ...rest } = combination.factors;
            return { ...combination, factors: { ...rest, [nextId]: factor } };
          })
        : value.loadCombinations;
    commit(keep({ loadCases: nextLoadCases, loadCombinations: nextLoadCombinations }));
  };

  const removeLoadCase = (index: number) => {
    const removed = value.loadCases[index];
    if (!removed) return;
    commit(keep({
      loadCases: value.loadCases.filter((_, loadCaseIndex) => loadCaseIndex !== index),
      loadCombinations: value.loadCombinations.map((combination) => {
        const factors = { ...combination.factors };
        delete factors[removed.id];
        return { ...combination, factors };
      }).filter((combination) => Object.keys(combination.factors).length > 0),
    }));
  };

  const addLoadToCase = (loadCaseIndex: number) => {
    const loadCase = value.loadCases[loadCaseIndex];
    if (!loadCase) return;
    updateLoadCase(loadCaseIndex, { loads: [...loadCase.loads, createFrameLoadDraft(loadCase.loads.length, value.nodes, value.members)] });
  };

  const updateLoadInCase = (loadCaseIndex: number, loadIndex: number, patch: Partial<FrameLoad>) => {
    const loadCase = value.loadCases[loadCaseIndex];
    if (!loadCase) return;
    updateLoadCase(loadCaseIndex, {
      loads: loadCase.loads.map((load, index) => (index === loadIndex ? { ...load, ...patch } as FrameLoad : load)),
    });
  };

  const removeLoadFromCase = (loadCaseIndex: number, loadIndex: number) => {
    const loadCase = value.loadCases[loadCaseIndex];
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
    const combination = value.loadCombinations[index];
    if (!combination) return;
    const nextPatch = patch.id !== undefined ? { ...patch, id: canonicalId(patch.id, combination.id) } : patch;
    const nextCombinations = value.loadCombinations.map((item, itemIndex) => (itemIndex === index ? { ...item, ...nextPatch } : item));
    commit(keep({ loadCombinations: nextCombinations }));
  };

  const fieldLabelClass = "text-[10px] font-black tracking-widest text-muted-foreground";
  const renderSelectedEditor = () => {
    if (resolvedSelectedObject.type === "node") {
      const index = value.nodes.findIndex((node) => node.id === resolvedSelectedObject.id);
      const node = value.nodes[index];
      if (!node) return null;
      return (
        <FrameNodeEditor
          node={node}
          nodeIndex={index}
          nodeCount={value.nodes.length}
          members={value.members}
          nodeOptions={nodeOptions}
          fieldLabelClass={fieldLabelClass}
          onUpdate={(patch) => updateNode(index, patch)}
          onRemove={() => removeNode(index)}
          variant="selected"
          connectionTargetId={nodeConnectionTargetId}
          onConnectionTargetChange={setNodeConnectionTargetId}
          onAddMemberBetweenNodes={addMemberBetweenNodes}
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
        materialLibrary={PREDEFINED_MATERIALS}
        memberElasticitySummary={memberElasticitySummary}
        nodeCount={value.nodes.length}
        memberCount={value.members.length}
        supportCount={supportCount}
        loadCount={value.loads.length}
        modelWarnings={modelWarnings}
        onResetToPortal={onResetToPortal}
        onCompleteAxisMembers={completeAxisMembers}
        onAddNode={addNode}
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
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow flex items-center gap-2">
            <Layers3 className="h-3.5 w-3.5 text-primary" />
            属性编辑
          </div>
          <Button variant="outline" size="sm" onClick={addNode} className="h-8 rounded-xl">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            新增节点并连接
          </Button>
        </div>
        {renderSelectedEditor()}
      </section>
      ) : null}

      {isSectionVisible("frame-table") ? (
      <FrameTableSection
        nodes={value.nodes}
        members={value.members}
        loads={value.loads}
        loadCases={value.loadCases}
        loadCombinations={value.loadCombinations}
        nodeOptions={nodeOptions}
        memberOptions={memberOptions}
        fieldLabelClass={fieldLabelClass}
        activeSectionId={advancedSectionId}
        onSectionChange={setAdvancedSectionId}
        onAddMember={addMember}
        onUpdateNode={updateNode}
        onRemoveNode={removeNode}
        onUpdateMember={updateMember}
        onRemoveMember={removeMember}
        onAddLoad={addLoad}
        onUpdateLoad={updateLoad}
        onRemoveLoad={removeLoad}
        onAddLoadCase={addLoadCase}
        onUpdateLoadCase={updateLoadCase}
        onRemoveLoadCase={removeLoadCase}
        onAddLoadToCase={addLoadToCase}
        onUpdateLoadInCase={updateLoadInCase}
        onRemoveLoadFromCase={removeLoadFromCase}
        onAddLoadCombination={addLoadCombination}
        onUpdateLoadCombination={updateLoadCombination}
        onRemoveLoadCombination={(combinationIndex) =>
          commit(keep({ loadCombinations: value.loadCombinations.filter((_, index) => index !== combinationIndex) }))
        }
      />
      ) : null}
    </div>
  );
}
