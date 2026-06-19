import { useMemo, useState } from "react";
import { Triangle } from "lucide-react";
import { WorkbenchTabsLayout } from "./layout/WorkbenchTabsLayout";
import { LoadCombinationSection } from "./LoadCombinationSection";
import { TrussLoadEditor } from "./TrussLoadEditor";
import { TrussLoadCaseSection } from "./TrussLoadCaseSection";
import { TrussBasicSection } from "./TrussBasicSection";
import { TrussMemberEditor } from "./TrussMemberEditor";
import { TrussNodeEditor } from "./TrussNodeEditor";
import { TrussObjectNavigator, type TrussSelectedObject } from "./TrussObjectNavigator";
import { TrussTableSection, type TrussAdvancedSection } from "./TrussTableSection";
import { TrussTemplateSection } from "./TrussTemplateSection";
import { TrussTextModelSection } from "./TrussTextModelSection";
import {
  createConnectedTrussMemberByNodeId,
  createTrussMemberLoadDraft,
  createTrussNodalLoadDraft,
  nextTrussDraftId,
  trussMemberExists,
} from "../lib/truss-editor-model.ts";
import { TRUSS_MODEL_TEMPLATES, cloneTrussModelTemplate } from "../lib/workbench-model-templates.ts";
import { buildParallelChordTrussQuickModel, type TrussQuickModelInput } from "../lib/workbench-quick-models.ts";
import { useTrussTextModel } from "../hooks/useTrussTextModel.ts";
import { useNodePairConnection } from "../hooks/useNodePairConnection.ts";
import {
  removeTrussLoadCaseCollections,
  removeTrussLoadCollections,
  removeTrussLoadCombinationCollections,
  removeTrussMemberCollections,
  removeTrussNodeCollections,
  updateTrussLoadCaseCollections,
  updateTrussLoadCollections,
  updateTrussLoadCombinationCollections,
  updateTrussMemberCollections,
  updateTrussNodeCollections,
  type TrussEditorCollections,
} from "../lib/truss-model-edits.ts";
import { memberElasticityDistributionLabel, sectionAreaForMaterial, youngModulusForMaterial } from "../lib/material-presets.ts";
import { modelObjectMemberTerm } from "../lib/model-object-vocabulary.ts";
import { trussSupportStabilityWarning } from "../solver-payload.ts";
import type { Material } from "../types/material.ts";
import type { TrussLoad, TrussLoadCase, TrussLoadCombination, TrussLoadPatch, TrussMember, TrussNode } from "../types/structure.ts";
import type { TrussWorkbenchSelection, WorkbenchSelectionOptions } from "../types/workbench-selection.ts";

type TrussCollections = TrussEditorCollections;

interface TrussCustomModelEditorProps {
  value: TrussCollections;
  materialId: string;
  materialLibrary: Material[];
  onChange: (next: TrussCollections) => void;
  onRunGeneratedModel?: (next: TrussCollections) => void;
  onMaterialChange: (nextMaterialId: string) => void;
  activeSectionId?: string;
  selection?: TrussWorkbenchSelection | null;
  onSelectionChange?: (next: TrussWorkbenchSelection, options?: WorkbenchSelectionOptions) => void;
  gridSnapEnabled?: boolean;
  gridSnapStepM?: number;
  compact?: boolean;
}

export function TrussCustomModelEditor({
  value,
  materialId,
  materialLibrary,
  onChange,
  onRunGeneratedModel,
  onMaterialChange,
  activeSectionId,
  selection,
  onSelectionChange,
  gridSnapEnabled = false,
  gridSnapStepM = 0.5,
  compact = false }: TrussCustomModelEditorProps) {
  const [selectedObject, setSelectedObject] = useState<TrussSelectedObject>({ type: "node", id: value.nodes[0]?.id ?? "" });
  const [nodeConnectionTargetId, setNodeConnectionTargetId] = useState("");
  const [advancedSectionId, setAdvancedSectionId] = useState<TrussAdvancedSection>("nodes");
  const memberTerm = modelObjectMemberTerm("truss");

  const nodeOptions = useMemo(
    () => value.nodes.map((node) => ({ value: node.id, label: node.id })),
    [value.nodes]
  );
  const nodeIds = useMemo(() => value.nodes.map((node) => node.id), [value.nodes]);
  const memberConnection = useNodePairConnection({
    nodeIds,
    duplicateExists: (startNodeId, endNodeId) => trussMemberExists(value.members, startNodeId, endNodeId),
    duplicateReason: `两节点间已有${memberTerm}`,
  });

  const keep = (patch: Partial<TrussCollections> = {}): TrussCollections => ({
    nodes: patch.nodes ?? value.nodes,
    members: patch.members ?? value.members,
    loads: patch.loads ?? value.loads,
    loadCases: patch.loadCases ?? value.loadCases,
    loadCombinations: patch.loadCombinations ?? value.loadCombinations,
  });

  const trussTextModel = useTrussTextModel({
    value,
    onApplyCollections: (next) => {
      const nextCollections = keep(next);
      onChange(nextCollections);
      memberConnection.resetToAvailablePair({
        nodeIds: nextCollections.nodes.map((node) => node.id),
        duplicateExists: (nextStartId, nextEndId) => trussMemberExists(nextCollections.members, nextStartId, nextEndId),
      });
      setSelectedObject({ type: "node", id: nextCollections.nodes[0]?.id ?? "" });
    },
  });
  const memberOptions = useMemo(
    () => value.members.map((member) => ({ value: member.id, label: member.id })),
    [value.members]
  );
  const loadOptions = useMemo(
    () => value.loads.map((load, index) => ({
      value: `load-${index}`,
      label: load.type === "nodal" ? `节点荷载 ${index + 1}（${load.node}）` : `${memberTerm}荷载 ${index + 1}（${load.member}）`,
    })),
    [memberTerm, value.loads]
  );

  const resolvedSelectedObject = useMemo<TrussSelectedObject>(() => {
    let current: TrussSelectedObject = selectedObject;
    if (selection && selection.type !== "label") {
      if (selection.type === "node" || selection.type === "member" || selection.type === "load") {
        current = { type: selection.type, id: selection.id };
      } else if (selection.type === "loadCases" || selection.type === "loadCombinations") {
        current = { type: selection.type, id: "all" };
      }
    }
    if (current.type === "node" && value.nodes.some((node) => node.id === current.id)) return current;
    if (current.type === "member" && value.members.some((member) => member.id === current.id)) return current;
    if (current.type === "load" && value.loads[Number(current.id.replace("load-", ""))]) return current;
    if (current.type === "loadCases") return { type: "loadCases", id: "all" };
    if (current.type === "loadCombinations") return { type: "loadCombinations", id: "all" };
    if (value.nodes[0]) return { type: "node", id: value.nodes[0].id };
    if (value.members[0]) return { type: "member", id: value.members[0].id };
    return { type: "load", id: "load-0" };
  }, [selectedObject, selection, value.loads, value.members, value.nodes]);
  const supportCount = value.nodes.filter((node) => (node.supportType ?? "free") !== "free").length;
  const memberElasticitySummary = useMemo(
    () => memberElasticityDistributionLabel(value.members, memberTerm, materialId, materialLibrary),
    [materialId, materialLibrary, memberTerm, value.members],
  );
  const defaultMemberElasticityGPa = youngModulusForMaterial(materialId, 210, materialLibrary);
  const defaultMemberSectionAreaCm2 = sectionAreaForMaterial(materialId, 24, materialLibrary);
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
    if (value.members.some((member) => !nodeIds.has(member.start) || !nodeIds.has(member.end))) warnings.push(`存在引用缺失节点的${memberTerm}。`);
    if (value.loads.some((load) => load.type === "nodal" ? !nodeIds.has(load.node) : !memberIds.has(load.member))) warnings.push("存在引用缺失对象的荷载。");
    if (value.loads.length === 0) warnings.push(`尚未设置节点荷载或${memberTerm}荷载。`);
    return warnings;
  }, [memberTerm, supportCount, value.loads, value.members, value.nodes]);
  const commit = (next: TrussCollections) => onChange(next);

  const selectObject = (next: TrussSelectedObject, options?: WorkbenchSelectionOptions) => {
    setSelectedObject(next);
    if (next.type === "node" || next.type === "member" || next.type === "load") {
      onSelectionChange?.({ mode: "truss", type: next.type, id: next.id }, options);
      return;
    }
    if (next.type === "loadCases" || next.type === "loadCombinations") {
      onSelectionChange?.({ mode: "truss", type: next.type, id: "all" }, options);
    }
  };

  const applyTypicalCase = (templateId: string) => {
    const template = TRUSS_MODEL_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    const collections = cloneTrussModelTemplate(template);
    commit(keep({ nodes: collections.nodes, members: collections.members, loads: collections.loads, loadCases: [], loadCombinations: [] }));
    memberConnection.resetToAvailablePair({
      nodeIds: collections.nodes.map((node) => node.id),
      duplicateExists: (nextStartId, nextEndId) => trussMemberExists(collections.members, nextStartId, nextEndId),
    });
    selectObject({ type: "node", id: collections.nodes[0]?.id ?? "" }, { openEditor: false });
    trussTextModel.noteTemplateApplied(template.title);
  };

  const applyTypicalCaseAndRun = (templateId: string) => {
    const template = TRUSS_MODEL_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    const collections = cloneTrussModelTemplate(template);
    const next = keep({ nodes: collections.nodes, members: collections.members, loads: collections.loads, loadCases: [], loadCombinations: [] });
    if (onRunGeneratedModel) {
      onRunGeneratedModel(next);
    } else {
      commit(next);
    }
    memberConnection.resetToAvailablePair({
      nodeIds: collections.nodes.map((node) => node.id),
      duplicateExists: (nextStartId, nextEndId) => trussMemberExists(collections.members, nextStartId, nextEndId),
    });
    selectObject({ type: "node", id: collections.nodes[0]?.id ?? "" }, { openEditor: false });
    trussTextModel.noteTemplateApplied(template.title);
  };

  const buildQuickModel = (input: TrussQuickModelInput) => buildParallelChordTrussQuickModel({
      ...input,
      materialId,
      youngModulusGPa: defaultMemberElasticityGPa,
      chordAreaCm2: defaultMemberSectionAreaCm2,
      webAreaCm2: Math.max(1, Math.round(defaultMemberSectionAreaCm2 * 0.7)),
    });

  const finishGeneratedModel = (collections: ReturnType<typeof buildParallelChordTrussQuickModel>) => {
    memberConnection.resetToAvailablePair({
      nodeIds: collections.nodes.map((node) => node.id),
      duplicateExists: (nextStartId, nextEndId) => trussMemberExists(collections.members, nextStartId, nextEndId),
    });
    selectObject({ type: "node", id: collections.nodes[0]?.id ?? "" }, { openEditor: false });
    trussTextModel.noteTemplateApplied("平行弦桁架快速生成");
  };

  const generateQuickModel = (input: TrussQuickModelInput) => {
    const collections = buildQuickModel(input);
    commit(keep({ nodes: collections.nodes, members: collections.members, loads: collections.loads, loadCases: [], loadCombinations: [] }));
    finishGeneratedModel(collections);
  };

  const generateQuickModelAndRun = (input: TrussQuickModelInput) => {
    const collections = buildQuickModel(input);
    const next = keep({ nodes: collections.nodes, members: collections.members, loads: collections.loads, loadCases: [], loadCombinations: [] });
    if (onRunGeneratedModel) {
      onRunGeneratedModel(next);
    } else {
      commit(next);
    }
    finishGeneratedModel(collections);
  };

  const updateNode = (index: number, patch: Partial<TrussNode>) => {
    const result = updateTrussNodeCollections(value, index, patch);
    if (!result) return;
    commit(result.next);
    if (result.renamed && resolvedSelectedObject.type === "node" && resolvedSelectedObject.id === result.previousId) {
      selectObject({ type: "node", id: result.nextId }, { openEditor: false });
    }
  };

  const removeNode = (index: number) => {
    const next = removeTrussNodeCollections(value, index);
    if (next) commit(next);
  };

  const addMemberBetweenNodes = (startId: string, endId: string) => {
    const nextMember = createConnectedTrussMemberByNodeId(startId, endId, value.nodes, value.members, defaultMemberElasticityGPa, materialId, {
      sectionAreaCm2: defaultMemberSectionAreaCm2,
    });
    if (!nextMember) {
      return;
    }
    const nextMembers = [...value.members, nextMember];
    memberConnection.advanceAfterConnection({
      nodeIds,
      startNodeId: startId,
      endNodeId: endId,
      duplicateExists: (nextStartId, nextEndId) => trussMemberExists(nextMembers, nextStartId, nextEndId),
    });
    commit(keep({ members: nextMembers }));
    selectObject({ type: "member", id: nextMember.id }, { openEditor: false });
  };

  const updateMember = (index: number, patch: Partial<TrussMember>) => {
    const result = updateTrussMemberCollections(value, index, patch);
    if (!result) return;
    commit(result.next);
    if (result.renamed && resolvedSelectedObject.type === "member" && resolvedSelectedObject.id === result.previousId) {
      selectObject({ type: "member", id: result.nextId }, { openEditor: false });
    }
  };

  const removeMember = (index: number) => {
    const next = removeTrussMemberCollections(value, index);
    if (next) commit(next);
  };

  const addNodalLoad = () => {
    const nextLoads = [...value.loads, createTrussNodalLoadDraft(value.nodes)];
    commit(keep({ loads: nextLoads }));
    selectObject({ type: "load", id: `load-${nextLoads.length - 1}` });
  };

  const addMemberLoad = () => {
    if (value.members.length === 0) {
      return;
    }
    const preferredMemberId = resolvedSelectedObject.type === "member" ? resolvedSelectedObject.id : undefined;
    const nextLoads = [...value.loads, createTrussMemberLoadDraft(value.members, preferredMemberId)];
    commit(keep({ loads: nextLoads }));
    selectObject({ type: "load", id: `load-${nextLoads.length - 1}` });
  };

  const updateLoad = (index: number, patch: TrussLoadPatch | TrussLoad) => {
    const next = updateTrussLoadCollections(value, index, patch);
    if (next) commit(next);
  };

  const removeLoad = (index: number) => {
    commit(removeTrussLoadCollections(value, index));
  };

  const addLoadCase = () => {
    const id = nextTrussDraftId("LC", value.loadCases.map((loadCase) => loadCase.id));
    const defaultLoad = createTrussNodalLoadDraft(value.nodes);
    commit(keep({ loadCases: [...value.loadCases, { id, title: `工况 ${value.loadCases.length + 1}`, loads: [defaultLoad] }] }));
    selectObject({ type: "loadCases", id: "all" });
  };

  const updateLoadCase = (loadCaseIndex: number, patch: Partial<TrussLoadCase>) => {
    const result = updateTrussLoadCaseCollections(value, loadCaseIndex, patch);
    if (result) commit(result.next);
  };

  const removeLoadCase = (loadCaseIndex: number) => {
    const next = removeTrussLoadCaseCollections(value, loadCaseIndex);
    if (next) commit(next);
  };

  const addLoadToCase = (loadCaseIndex: number) => {
    const loadCase = value.loadCases[loadCaseIndex];
    if (!loadCase) return;
    const defaultLoad = createTrussNodalLoadDraft(value.nodes);
    updateLoadCase(loadCaseIndex, { loads: [...loadCase.loads, defaultLoad] });
  };

  const updateLoadInCase = (loadCaseIndex: number, loadIndex: number, patch: TrussLoadPatch | TrussLoad) => {
    const loadCase = value.loadCases[loadCaseIndex];
    if (!loadCase) return;
    const next = updateTrussLoadCollections(keep({ loads: loadCase.loads }), loadIndex, patch);
    if (!next) return;
    updateLoadCase(loadCaseIndex, { loads: next.loads });
  };

  const removeLoadFromCase = (loadCaseIndex: number, loadIndex: number) => {
    const loadCase = value.loadCases[loadCaseIndex];
    if (!loadCase) return;
    updateLoadCase(loadCaseIndex, { loads: loadCase.loads.filter((_, index) => index !== loadIndex) });
  };

  const addLoadCombination = () => {
    if (value.loadCases.length === 0) return;
    const id = nextTrussDraftId("COMB", value.loadCombinations.map((combination) => combination.id));
    commit(
      keep({
        loadCombinations: [
          ...value.loadCombinations,
          { id, title: `组合 ${value.loadCombinations.length + 1}`, factors: Object.fromEntries(value.loadCases.map((loadCase) => [loadCase.id, 1])) },
        ],
      }),
    );
    selectObject({ type: "loadCombinations", id: "all" });
  };

  const updateLoadCombination = (combinationIndex: number, patch: Partial<TrussLoadCombination>) => {
    const next = updateTrussLoadCombinationCollections(value, combinationIndex, patch);
    if (next) commit(next);
  };

  const fieldLabelClass = "text-[10px] font-black tracking-widest text-muted-foreground";
  const renderSelectedEditor = () => {
    if (resolvedSelectedObject.type === "loadCases") {
      return (
        <TrussLoadCaseSection
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
        <LoadCombinationSection<TrussLoadCombination>
          id="truss-custom-load-combinations"
          title="荷载组合"
          emptyCaseMessage="先定义桁架荷载工况后再编辑组合系数。"
          emptyCombinationMessage="未设置桁架荷载组合。"
          loadCases={value.loadCases}
          loadCombinations={value.loadCombinations}
          fieldLabelClass={fieldLabelClass}
          onAddLoadCombination={addLoadCombination}
          onUpdateLoadCombination={updateLoadCombination}
          onRemoveLoadCombination={(combinationIndex) => {
            const next = removeTrussLoadCombinationCollections(value, combinationIndex);
            if (next) commit(next);
          }}
        />
      );
    }

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
        <TrussMemberEditor compact={compact}
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

    const index = Number(resolvedSelectedObject.id.replace("load-", ""));
    const load = value.loads[index];
    if (!load) return null;
    return (
      <TrussLoadEditor compact={compact}
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
    <WorkbenchTabsLayout
      mode="truss"
      activeSectionId={activeSectionId}
      tabs={{
        template: (
          <TrussTemplateSection
            memberTerm={memberTerm}
            onApplyTemplate={applyTypicalCase}
            onApplyTemplateAndRun={applyTypicalCaseAndRun}
            onGenerateQuickModel={generateQuickModel}
            onGenerateQuickModelAndRun={generateQuickModelAndRun}
          />
        ),
        basic: (
          <TrussBasicSection compact={compact}
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
        ),
        object: (
          <>
            <TrussObjectNavigator
              nodes={value.nodes}
              members={value.members}
              loadCases={value.loadCases}
              loadCombinations={value.loadCombinations}
              materialLibrary={materialLibrary}
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
            <section id="truss-selected-editor" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="eyebrow flex items-center gap-2">
                  <Triangle className="h-3.5 w-3.5 text-primary" />
                  属性编辑
                </div>
              </div>
              {renderSelectedEditor()}
            </section>
          </>
        ),
        text: (
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
        ),
        table: (
          <TrussTableSection
            nodes={value.nodes}
            members={value.members}
            materialLibrary={materialLibrary}
            loads={value.loads}
            loadCases={value.loadCases}
            loadCombinations={value.loadCombinations}
            nodeOptions={nodeOptions}
            memberOptions={memberOptions}
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
          />
        ),
      }}
    />
  );
}
