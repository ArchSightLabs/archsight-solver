import { useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Plus, Triangle, Sparkles } from "lucide-react";
import { TrussLoadEditor } from "./TrussLoadEditor";
import { TrussBasicSection } from "./TrussBasicSection";
import { TrussMemberEditor } from "./TrussMemberEditor";
import { TrussNodeEditor } from "./TrussNodeEditor";
import { TrussObjectNavigator, type TrussSelectedObject } from "./TrussObjectNavigator";
import { TrussTableSection, type TrussAdvancedSection } from "./TrussTableSection";
import { TrussTextModelSection } from "./TrussTextModelSection";
import {
  createConnectedTrussMember,
  createTrussMemberDraft,
  createTrussMemberLoadDraft,
  createTrussNodalLoadDraft,
  createTrussNodeDraft,
  trussMemberExists,
} from "../lib/truss-editor-model.ts";
import { TRUSS_MODEL_TEMPLATES, cloneTrussModelTemplate } from "../lib/workbench-model-templates.ts";
import { useTrussTextModel } from "../hooks/useTrussTextModel.ts";
import { useNodePairConnection } from "../hooks/useNodePairConnection.ts";
import { normalizeModuleSectionId } from "../lib/workbench-navigation.ts";
import { memberElasticityDistributionLabel, youngModulusForMaterial } from "../lib/material-presets.ts";
import { trussSupportStabilityWarning } from "../solver-payload.ts";
import { PREDEFINED_MATERIALS } from "../types/material.ts";
import type { TrussLoad, TrussMember, TrussNode } from "../types/structure.ts";
import type { TrussWorkbenchSelection, WorkbenchSelectionOptions } from "../types/workbench-selection.ts";

interface TrussCollections {
  nodes: TrussNode[];
  members: TrussMember[];
  loads: TrussLoad[];
}

interface TrussCustomModelEditorProps {
  value: TrussCollections;
  materialId: string;
  onChange: (next: TrussCollections) => void;
  onMaterialChange: (nextMaterialId: string) => void;
  onResetToBenchmark: () => void;
  activeSectionId?: string;
  selection?: TrussWorkbenchSelection | null;
  onSelectionChange?: (next: TrussWorkbenchSelection, options?: WorkbenchSelectionOptions) => void;
}

function canonicalId(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

export function TrussCustomModelEditor({
  value,
  materialId,
  onChange,
  onMaterialChange,
  onResetToBenchmark,
  activeSectionId,
  selection,
  onSelectionChange,
}: TrussCustomModelEditorProps) {
  const [selectedObject, setSelectedObject] = useState<TrussSelectedObject>({ type: "node", id: value.nodes[0]?.id ?? "" });
  const [nodeConnectionTargetId, setNodeConnectionTargetId] = useState("");
  const [advancedSectionId, setAdvancedSectionId] = useState<TrussAdvancedSection>("nodes");
  const visibleSectionId = normalizeModuleSectionId("truss", activeSectionId) ?? "truss-template";
  const isSectionVisible = (sectionId: string) => visibleSectionId === sectionId;

  const nodeOptions = useMemo(
    () => value.nodes.map((node) => ({ value: node.id, label: node.id })),
    [value.nodes]
  );
  const nodeIds = useMemo(() => value.nodes.map((node) => node.id), [value.nodes]);
  const memberConnection = useNodePairConnection({
    nodeIds,
    duplicateExists: (startNodeId, endNodeId) => trussMemberExists(value.members, startNodeId, endNodeId),
    duplicateReason: "两节点间已有杆件",
  });

  const trussTextModel = useTrussTextModel({
    value,
    onApplyCollections: (next) => {
      onChange(next);
      memberConnection.resetToAvailablePair({
        nodeIds: next.nodes.map((node) => node.id),
        duplicateExists: (nextStartId, nextEndId) => trussMemberExists(next.members, nextStartId, nextEndId),
      });
      setSelectedObject({ type: "node", id: next.nodes[0]?.id ?? "" });
    },
  });
  const memberOptions = useMemo(
    () => value.members.map((member) => ({ value: member.id, label: member.id })),
    [value.members]
  );
  const loadOptions = useMemo(
    () => value.loads.map((load, index) => ({
      value: `load-${index}`,
      label: load.type === "nodal" ? `节点荷载 ${index + 1}（${load.node}）` : `杆件荷载 ${index + 1}（${load.member}）`,
    })),
    [value.loads]
  );

  const resolvedSelectedObject = useMemo<TrussSelectedObject>(() => {
    const current = selection ? { type: selection.type, id: selection.id } : selectedObject;
    if (current.type === "node" && value.nodes.some((node) => node.id === current.id)) return current;
    if (current.type === "member" && value.members.some((member) => member.id === current.id)) return current;
    if (current.type === "load" && value.loads[Number(current.id.replace("load-", ""))]) return current;
    if (value.nodes[0]) return { type: "node", id: value.nodes[0].id };
    if (value.members[0]) return { type: "member", id: value.members[0].id };
    return { type: "load", id: "load-0" };
  }, [selectedObject, selection, value.loads, value.members, value.nodes]);
  const supportCount = value.nodes.filter((node) => (node.supportType ?? "free") !== "free").length;
  const memberElasticitySummary = useMemo(
    () => memberElasticityDistributionLabel(value.members, "杆件"),
    [value.members],
  );
  const defaultMemberElasticityGPa = youngModulusForMaterial(materialId, 210);
  const modelWarnings = useMemo(() => {
    const warnings: string[] = [];
    const nodeIds = new Set(value.nodes.map((node) => node.id));
    const memberIds = new Set(value.members.map((member) => member.id));
    const supportWarning = trussSupportStabilityWarning(value.nodes);
    if (supportCount === 0) {
      warnings.push("尚未设置支座约束。");
    } else if (supportWarning) {
      warnings.push(supportWarning);
    }
    if (value.members.some((member) => !nodeIds.has(member.start) || !nodeIds.has(member.end))) warnings.push("存在引用缺失节点的杆件。");
    if (value.loads.some((load) => load.type === "nodal" ? !nodeIds.has(load.node) : !memberIds.has(load.member))) warnings.push("存在引用缺失对象的荷载。");
    if (value.loads.length === 0) warnings.push("尚未设置节点荷载或杆件荷载。");
    return warnings;
  }, [supportCount, value.loads, value.members, value.nodes]);

  const commit = (next: TrussCollections) => onChange(next);

  const selectObject = (next: TrussSelectedObject, options?: WorkbenchSelectionOptions) => {
    setSelectedObject(next);
    onSelectionChange?.({ mode: "truss", type: next.type, id: next.id }, options);
  };

  const applyTypicalCase = (templateId: string) => {
    const template = TRUSS_MODEL_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    const collections = cloneTrussModelTemplate(template);
    commit(collections);
    memberConnection.resetToAvailablePair({
      nodeIds: collections.nodes.map((node) => node.id),
      duplicateExists: (nextStartId, nextEndId) => trussMemberExists(collections.members, nextStartId, nextEndId),
    });
    selectObject({ type: "node", id: collections.nodes[0]?.id ?? "" }, { openEditor: false });
    trussTextModel.noteTemplateApplied(template.title);
  };

  const updateNode = (index: number, patch: Partial<TrussNode>) => {
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
    const nextLoads = value.loads.map((load) => (isRenaming && load.type === "nodal" && load.node === current.id ? { ...load, node: nextId } : load));
    commit({ nodes: nextNodes, members: nextMembers, loads: nextLoads });
    if (isRenaming && resolvedSelectedObject.type === "node" && resolvedSelectedObject.id === current.id) {
      selectObject({ type: "node", id: nextId }, { openEditor: false });
    }
  };

  const addNode = () => {
    const nextNode = createTrussNodeDraft(value.nodes.length, value.nodes.map((node) => node.id));
    const nextNodes = [...value.nodes, nextNode];
    const nearest = value.nodes.reduce<TrussNode | null>((candidate, node) => {
      if (!candidate) return node;
      const candidateDistance = Math.hypot(candidate.x - nextNode.x, candidate.y - nextNode.y);
      const nodeDistance = Math.hypot(node.x - nextNode.x, node.y - nextNode.y);
      return nodeDistance < candidateDistance ? node : candidate;
    }, null);
    commit({ nodes: nextNodes, members: value.members, loads: value.loads });
    memberConnection.selectAvailablePairForNode({
      nodeIds: nextNodes.map((node) => node.id),
      nodeId: nextNode.id,
      preferredNeighborId: nearest?.id,
      duplicateExists: (nextStartId, nextEndId) => trussMemberExists(value.members, nextStartId, nextEndId),
    });
    selectObject({ type: "node", id: nextNode.id }, { openEditor: false });
  };

  const removeNode = (index: number) => {
    const removed = value.nodes[index];
    if (!removed) return;
    commit({
      nodes: value.nodes.filter((_, nodeIndex) => nodeIndex !== index),
      members: value.members.filter((member) => member.start !== removed.id && member.end !== removed.id),
      loads: value.loads.filter((load) => load.type !== "nodal" || load.node !== removed.id),
    });
  };

  const addMember = () => {
    if (value.nodes.length < 2) {
      return;
    }
    const nextMember = createTrussMemberDraft(value.members.length, value.nodes, value.members.map((member) => member.id), defaultMemberElasticityGPa);
    const nextMembers = [...value.members, nextMember];
    commit({ nodes: value.nodes, members: nextMembers, loads: value.loads });
    selectObject({ type: "member", id: nextMember.id }, { openEditor: false });
  };

  const addMemberBetweenNodes = (startId: string, endId: string) => {
    if (!startId || !endId || startId === endId || trussMemberExists(value.members, startId, endId)) {
      return;
    }
    const start = value.nodes.find((node) => node.id === startId);
    const end = value.nodes.find((node) => node.id === endId);
    if (!start || !end) {
      return;
    }
    const nextMember = createConnectedTrussMember(start, end, value.members, value.members.map((member) => member.id), defaultMemberElasticityGPa);
    const nextMembers = [...value.members, nextMember];
    memberConnection.advanceAfterConnection({
      nodeIds,
      startNodeId: startId,
      endNodeId: endId,
      duplicateExists: (nextStartId, nextEndId) => trussMemberExists(nextMembers, nextStartId, nextEndId),
    });
    commit({ nodes: value.nodes, members: nextMembers, loads: value.loads });
    selectObject({ type: "member", id: nextMember.id }, { openEditor: false });
  };

  const updateMember = (index: number, patch: Partial<TrussMember>) => {
    const current = value.members[index];
    if (!current) return;
    const nextId = patch.id !== undefined ? canonicalId(patch.id, current.id) : current.id;
    const nextPatch = patch.id !== undefined ? { ...patch, id: nextId } : patch;
    const isRenaming = nextId !== current.id;
    const nextMembers = value.members.map((member, memberIndex) => (memberIndex === index ? { ...member, ...nextPatch } : member));
    const nextLoads = value.loads.map((load) => {
      if (isRenaming && load.type !== "nodal" && load.member === current.id) {
        return { ...load, member: nextId } as TrussLoad;
      }
      return load;
    });
    commit({ nodes: value.nodes, members: nextMembers, loads: nextLoads });
    if (isRenaming && resolvedSelectedObject.type === "member" && resolvedSelectedObject.id === current.id) {
      selectObject({ type: "member", id: nextId }, { openEditor: false });
    }
  };

  const removeMember = (index: number) => {
    const removed = value.members[index];
    if (!removed) return;
    commit({
      nodes: value.nodes,
      members: value.members.filter((_, memberIndex) => memberIndex !== index),
      loads: value.loads.filter((load) => load.type === "nodal" || load.member !== removed.id),
    });
  };

  const addNodalLoad = () => {
    const nextLoads = [...value.loads, createTrussNodalLoadDraft(value.nodes)];
    commit({ nodes: value.nodes, members: value.members, loads: nextLoads });
    selectObject({ type: "load", id: `load-${nextLoads.length - 1}` });
  };

  const addMemberLoad = () => {
    if (value.members.length === 0) {
      return;
    }
    const preferredMemberId = resolvedSelectedObject.type === "member" ? resolvedSelectedObject.id : undefined;
    const nextLoads = [...value.loads, createTrussMemberLoadDraft(value.members, preferredMemberId)];
    commit({ nodes: value.nodes, members: value.members, loads: nextLoads });
    selectObject({ type: "load", id: `load-${nextLoads.length - 1}` });
  };

  const updateLoad = (index: number, patch: Partial<TrussLoad>) => {
    const current = value.loads[index];
    if (!current) return;
    const nextLoads = value.loads.map((load, loadIndex) => (loadIndex === index ? ({ ...load, ...patch } as TrussLoad) : load));
    commit({ nodes: value.nodes, members: value.members, loads: nextLoads });
  };

  const removeLoad = (index: number) => {
    commit({
      nodes: value.nodes,
      members: value.members,
      loads: value.loads.filter((_, loadIndex) => loadIndex !== index),
    });
  };

  const fieldLabelClass = "text-[10px] font-black tracking-widest text-muted-foreground";
  const renderSelectedEditor = () => {
    if (resolvedSelectedObject.type === "node") {
      const index = value.nodes.findIndex((node) => node.id === resolvedSelectedObject.id);
      const node = value.nodes[index];
      if (!node) return null;
      return (
        <TrussNodeEditor
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
          memberConnectionExists={(startId, endId) => trussMemberExists(value.members, startId, endId)}
        />
      );
    }

    if (resolvedSelectedObject.type === "member") {
      const index = value.members.findIndex((member) => member.id === resolvedSelectedObject.id);
      const member = value.members[index];
      if (!member) return null;
      return (
        <TrussMemberEditor
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

    const index = Number(resolvedSelectedObject.id.replace("load-", ""));
    const load = value.loads[index];
    if (!load) return null;
    return (
      <TrussLoadEditor
        load={load}
        index={index}
        nodes={value.nodes}
        members={value.members}
        nodeOptions={nodeOptions}
        memberOptions={memberOptions}
        fieldLabelClass={fieldLabelClass}
        onUpdate={(patch) => updateLoad(index, patch)}
        onRemove={() => removeLoad(index)}
        variant="selected"
      />
    );
  };

  return (
    <div className="space-y-5">
      {isSectionVisible("truss-basic") ? (
      <TrussBasicSection
        materialId={materialId}
        materialLibrary={PREDEFINED_MATERIALS}
        memberElasticitySummary={memberElasticitySummary}
        nodeCount={value.nodes.length}
        memberCount={value.members.length}
        supportCount={supportCount}
        loadCount={value.loads.length}
        modelWarnings={modelWarnings}
        onResetToBenchmark={onResetToBenchmark}
        onAddNode={addNode}
        onMaterialChange={onMaterialChange}
      />
      ) : null}

      {isSectionVisible("truss-text") ? (
      <TrussTextModelSection
        draft={trussTextModel.draft}
        message={trussTextModel.message}
        diagnostics={trussTextModel.diagnostics}
        metrics={trussTextModel.metrics}
        onDraftChange={trussTextModel.previewDraft}
        onExport={trussTextModel.exportTextModel}
        onCheck={trussTextModel.checkDraft}
        onImport={trussTextModel.importDraft}
      />
      ) : null}

      {isSectionVisible("truss-template") ? (
      <section id="truss-template" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            模板
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {TRUSS_MODEL_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => applyTypicalCase(template.id)}
              className="rounded-xl border border-white/8 bg-slate-950/20 p-3 text-left transition-colors hover:border-primary/35 hover:bg-primary/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold">{template.title}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {template.members.length} 杆件
                  </span>
                  <span className="rounded border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    套用
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
      ) : null}

      {isSectionVisible("truss-object") ? (
      <TrussObjectNavigator
        nodes={value.nodes}
        members={value.members}
        nodeOptions={nodeOptions}
        loadOptions={loadOptions}
        selectedObject={resolvedSelectedObject}
        supportCount={supportCount}
        fieldLabelClass={fieldLabelClass}
        memberConnectionStartId={memberConnection.startNodeId}
        memberConnectionEndId={memberConnection.endNodeId}
        memberConnectionDisabledReason={memberConnection.disabledReason}
        onSelectObject={(next) => selectObject(next)}
        onMemberConnectionStartChange={memberConnection.updateStartNodeId}
        onMemberConnectionEndChange={memberConnection.updateEndNodeId}
        onAddMemberConnection={() => addMemberBetweenNodes(memberConnection.startNodeId, memberConnection.endNodeId)}
        onAddNodalLoad={addNodalLoad}
        onAddMemberLoad={addMemberLoad}
      />
      ) : null}

      {isSectionVisible("truss-object") ? (
      <section id="truss-selected-editor" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow flex items-center gap-2">
            <Triangle className="h-3.5 w-3.5 text-primary" />
            属性编辑
          </div>
          <Button size="sm" onClick={addNode} className="h-8 rounded-xl">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            新增节点
          </Button>
        </div>
        {renderSelectedEditor()}
      </section>
      ) : null}

      {isSectionVisible("truss-table") ? (
      <TrussTableSection
        nodes={value.nodes}
        members={value.members}
        loads={value.loads}
        nodeOptions={nodeOptions}
        memberOptions={memberOptions}
        fieldLabelClass={fieldLabelClass}
        activeSectionId={advancedSectionId}
        onSectionChange={setAdvancedSectionId}
        onUpdateNode={updateNode}
        onRemoveNode={removeNode}
        onAddMember={addMember}
        onUpdateMember={updateMember}
        onRemoveMember={removeMember}
        onAddNodalLoad={addNodalLoad}
        onAddMemberLoad={addMemberLoad}
        onUpdateLoad={updateLoad}
        onRemoveLoad={removeLoad}
      />
      ) : null}
    </div>
  );
}
