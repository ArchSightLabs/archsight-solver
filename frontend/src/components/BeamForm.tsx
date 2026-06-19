import { useMemo, useState } from "react";
import { WorkbenchTabsLayout } from "./layout/WorkbenchTabsLayout";
import { BeamBasicSection } from "./BeamBasicSection";
import { BeamLoadCaseSection, createDefaultBeamCaseLoad } from "./BeamLoadCaseSection";
import { BeamLoadEditor } from "./BeamLoadEditor";
import {
  BeamObjectNavigator,
  beamSpanMemberId,
  spanId,
  spanIndexFromId,
  supportId,
  supportIndexFromId,
  type BeamSelectedObject,
} from "./BeamObjectNavigator";
import { BeamSpanEditor } from "./BeamSpanEditor";
import { BeamSupportEditor } from "./BeamSupportEditor";
import { BeamTableSection } from "./BeamTableSection";
import { BeamTemplateSection } from "./BeamTemplateSection";
import { BeamTextModelSection } from "./BeamTextModelSection";
import { LoadCombinationSection } from "./LoadCombinationSection";
import { formatBeamLoadSummary } from "../lib/beam-loads.ts";
import { materialDropdownOptions, materialIdentityLabelForId } from "../lib/material-presets.ts";
import { canonicalEditorId } from "../lib/model-edit-utils.ts";
import { PREDEFINED_MATERIALS, type Material } from "../types/material.ts";
import type { BeamLoadCase, BeamLoadCombination, BeamLoadInput, BeamSpanConfig, BeamSupportConfig, BeamWorkspaceState } from "../types/beam.ts";
import type { BeamWorkbenchSelection, WorkbenchSelectionOptions } from "../types/workbench-selection.ts";
import { createDefaultBeamWorkspaceState, mergeDefaultBeamSupportLayout, renumberDefaultBeamSpanIds } from "../lib/workspace-state.ts";
import { applyBeamModelTemplate, type BeamModelTemplate } from "../lib/workbench-model-templates.ts";
import { useBeamTextModel } from "../hooks/useBeamTextModel.ts";
import { MAX_BEAM_SPANS } from "../lib/solver-limits.ts";

interface BeamFormProps {
  value: BeamWorkspaceState;
  materialLibrary?: Material[];
  onMaterialLibraryChange?: (nextMaterials: Material[]) => void;
  onChange: (next: BeamWorkspaceState) => void;
  activeSectionId?: string;
  selection?: BeamWorkbenchSelection | null;
  onSelectionChange?: (next: BeamWorkbenchSelection, options?: WorkbenchSelectionOptions) => void;
  compact?: boolean;
}

const DEFAULT_SPAN: BeamSpanConfig = { id: "(1)", length: 4, E: 210, I: 4500, materialId: "q345" };
const DEFAULT_BEAM_STATE = createDefaultBeamWorkspaceState();
const FORM_LABEL_CLASS = "text-[11px] font-semibold leading-none text-slate-600 dark:text-slate-300";
const FORM_CONTROL_CLASS = "border-white/5 bg-primary/[0.03] font-sans text-[12px] font-medium";
const FORM_SELECT_MENU_CLASS = "font-sans text-[12px]";
const FORM_SELECT_OPTION_CLASS = "py-2 text-[12px] font-medium";
const FIELD_LABEL_CLASS = "text-[10px] font-black tracking-widest text-muted-foreground";

export function BeamForm({ value, materialLibrary: projectMaterialLibrary, onMaterialLibraryChange, onChange, activeSectionId, selection, onSelectionChange, compact = false }: BeamFormProps) {
  const [selectedObject, setSelectedObject] = useState<BeamSelectedObject>({ type: "span", id: spanId(0) });
  const materialLibrary = projectMaterialLibrary?.length ? projectMaterialLibrary : value.materials?.length ? value.materials : PREDEFINED_MATERIALS;
  const materialOptions = useMemo(
    () => materialDropdownOptions(materialLibrary),
    [materialLibrary]
  );
  const findMaterial = (materialId: string | undefined) =>
    materialLibrary.find((material) => material.id === materialId);
  const findMaterialByYoungModulus = (youngModulus: number) =>
    materialLibrary.find((material) => material.id !== "custom" && Math.abs(material.youngModulus - youngModulus) < 1e-9)
    ?? materialLibrary.find((material) => Math.abs(material.youngModulus - youngModulus) < 1e-9);
  const defaultSpanMaterial = findMaterial(value.materialId) ?? findMaterial(DEFAULT_SPAN.materialId) ?? materialLibrary[0] ?? PREDEFINED_MATERIALS[0];

  const updateWorkspace = <K extends keyof BeamWorkspaceState>(field: K, nextValue: BeamWorkspaceState[K]) => {
    onChange({
      ...value,
      [field]: nextValue,
    });
  };

  const mergeDefaultSupportLayout = (
    beamType: BeamWorkspaceState["beamType"],
    spans: BeamSpanConfig[],
    priorSupports: BeamSupportConfig[] = value.supports
  ) => mergeDefaultBeamSupportLayout(beamType, spans, priorSupports);

  const updateSupport = (index: number, patch: Partial<BeamSupportConfig>) => {
    const supports = value.supports.map((support, supportIndex) =>
      supportIndex === index ? { ...support, ...patch } : support
    );
    onChange({
      ...value,
      supports,
    });
  };

  const selectObject = (next: BeamSelectedObject, options?: WorkbenchSelectionOptions) => {
    setSelectedObject(next);
    onSelectionChange?.(
      next.type === "span"
        ? { mode: "beam", type: "span", id: next.id }
        : next.type === "support"
          ? { mode: "beam", type: "support", id: next.id }
          : next.type === "loadCases"
            ? { mode: "beam", type: "loadCases", id: "all" }
            : next.type === "loadCombinations"
              ? { mode: "beam", type: "loadCombinations", id: "all" }
              : { mode: "beam", type: "load", id: "primary" },
      options
    );
  };

  const beamTextModel = useBeamTextModel({
    value,
    materialLibrary,
    onMaterialLibraryChange,
    onApplyWorkspace: onChange,
    onImportApplied: () => selectObject({ type: "span", id: spanId(0) }),
  });

  const resolvedSelectedObject = useMemo<BeamSelectedObject>(() => {
    const current = selection
      ? selection.type === "span"
        ? { type: "span" as const, id: selection.id }
        : selection.type === "support"
          ? { type: "support" as const, id: selection.id }
          : selection.type === "loadCases"
            ? { type: "loadCases" as const, id: "all" as const }
            : selection.type === "loadCombinations"
              ? { type: "loadCombinations" as const, id: "all" as const }
              : { type: "load" as const, id: "primary" as const }
      : selectedObject;
    if (current.type === "span" && value.spans.at(spanIndexFromId(current.id))) {
      return current;
    }
    if (current.type === "support" && value.supports.at(supportIndexFromId(current.id))) {
      return current;
    }
    if (current.type === "load") return current;
    if (current.type === "loadCases") return current;
    if (current.type === "loadCombinations") return current;
    return value.spans[0] ? { type: "span", id: spanId(0) } : value.supports[0] ? { type: "support", id: supportId(0) } : { type: "load", id: "primary" };
  }, [selectedObject, selection, value.spans, value.supports]);

  const addSpan = () => {
    if (value.spans.length >= MAX_BEAM_SPANS) return;
    const nextIndex = value.spans.length;
    const existingIds = new Set(value.spans.map((span, index) => beamSpanMemberId(index, span)));
    let nextSpanId = `(${nextIndex + 1})`;
    let suffix = nextIndex + 1;
    while (existingIds.has(nextSpanId)) {
      suffix += 1;
      nextSpanId = `(${suffix})`;
    }
    const nextSpans = [
      ...value.spans,
      {
        ...DEFAULT_SPAN,
        id: nextSpanId,
        E: defaultSpanMaterial?.youngModulus ?? DEFAULT_SPAN.E,
        I: defaultSpanMaterial?.momentOfInertiaCm4 ?? DEFAULT_SPAN.I,
        materialId: defaultSpanMaterial?.id ?? DEFAULT_SPAN.materialId,
      },
    ];
    const nextBeamType = value.beamType === "simply_supported" ? "continuous" : value.beamType;
    onChange({
      ...value,
      beamType: nextBeamType,
      spans: nextSpans,
      supports: mergeDefaultSupportLayout(nextBeamType, nextSpans),
    });
    selectObject({ type: "span", id: spanId(nextIndex) });
  };

  const removeSpan = (index: number) => {
    if (value.spans.length <= 1) return;
    const nextSpans = renumberDefaultBeamSpanIds(value.spans.filter((_, i) => i !== index));
    const nextBeamType = value.beamType === "continuous" && nextSpans.length === 1 ? "simply_supported" : value.beamType;
    onChange({
      ...value,
      spans: nextSpans,
      beamType: nextBeamType,
      supports: mergeDefaultSupportLayout(nextBeamType, nextSpans, value.supports.filter((_, supportIndex) => supportIndex !== index)),
    });
    selectObject({ type: "span", id: spanId(Math.max(0, index - 1)) });
  };

  const updateSpanPatch = (index: number, patch: Partial<BeamSpanConfig>) => {
    const spans = value.spans.map((span, spanIndex) =>
      spanIndex === index ? { ...span, ...patch } : span
    );
    onChange({
      ...value,
      spans,
      supports: mergeDefaultSupportLayout(value.beamType, spans),
    });
  };

  const updateSpanId = (index: number, nextId: string) => {
    updateSpanPatch(index, { id: nextId.trim() || `(${index + 1})` });
  };

  const updateSupportId = (index: number, nextId: string) => {
    updateSupport(index, { id: nextId.trim() || `S${index + 1}` });
  };

  const updateSpan = (index: number, field: "length" | "E" | "I", nextValue: number) => {
    const patch: Partial<BeamSpanConfig> = { [field]: nextValue };
    if (field === "E") {
      patch.materialId = findMaterialByYoungModulus(nextValue)?.id;
    }
    updateSpanPatch(index, patch);
  };

  const updateSpanMaterial = (index: number, materialId: string) => {
    const material = findMaterial(materialId);
    updateSpanPatch(index, {
      materialId,
      E: material?.youngModulus ?? value.spans.at(index)?.E ?? DEFAULT_SPAN.E,
      I: material?.momentOfInertiaCm4 ?? value.spans.at(index)?.I ?? DEFAULT_SPAN.I,
    });
  };

  const applyTypicalCase = (template: BeamModelTemplate) => {
    onChange(applyBeamModelTemplate(value, template));
    selectObject({ type: "span", id: spanId(0) }, { openEditor: false });
  };

  const totalLength = value.spans.reduce((sum, span) => sum + span.length, 0);
  const loadSummary = formatBeamLoadSummary(value);
  const materialIdentityForSpan = (span: BeamSpanConfig) =>
    materialIdentityLabelForId(findMaterial(span.materialId)?.id ?? findMaterialByYoungModulus(span.E)?.id ?? span.materialId, materialLibrary);
  const nextDraftId = (prefix: string, existingIds: string[]) => {
    const used = new Set(existingIds);
    let maxSuffix = 0;
    for (const id of existingIds) {
      const match = new RegExp(`^${prefix}(\\d+)$`).exec(id);
      if (!match) continue;
      maxSuffix = Math.max(maxSuffix, Number(match[1]) || 0);
    }
    let candidate = `${prefix}${maxSuffix + 1}`;
    while (used.has(candidate)) {
      maxSuffix += 1;
      candidate = `${prefix}${maxSuffix + 1}`;
    }
    return candidate;
  };

  const keepLoadCases = (patch: Partial<Pick<BeamWorkspaceState, "customLoadCases" | "customLoadCombinations">>) => {
    onChange({
      ...value,
      customLoadCases: patch.customLoadCases ?? value.customLoadCases,
      customLoadCombinations: patch.customLoadCombinations ?? value.customLoadCombinations,
    });
  };

  const addLoadCase = () => {
    const id = nextDraftId("LC", value.customLoadCases.map((loadCase) => loadCase.id));
    keepLoadCases({
      customLoadCases: [
        ...value.customLoadCases,
        { id, title: `工况 ${value.customLoadCases.length + 1}`, loads: [createDefaultBeamCaseLoad(totalLength)] },
      ],
    });
    selectObject({ type: "loadCases", id: "all" });
  };

  const updateLoadCase = (index: number, patch: Partial<BeamLoadCase>) => {
    const current = value.customLoadCases[index];
    if (!current) return;
    const nextId = patch.id !== undefined ? canonicalEditorId(patch.id, current.id) : current.id;
    const nextPatch = patch.id !== undefined ? { ...patch, id: nextId } : patch;
    const renamed = nextId !== current.id;
    keepLoadCases({
      customLoadCases: value.customLoadCases.map((loadCase, loadCaseIndex) => (loadCaseIndex === index ? { ...loadCase, ...nextPatch } : loadCase)),
      customLoadCombinations: renamed
        ? value.customLoadCombinations.map((combination) => {
            if (!(current.id in combination.factors)) return combination;
            const { [current.id]: factor, ...rest } = combination.factors;
            return { ...combination, factors: { ...rest, [nextId]: factor } };
          })
        : value.customLoadCombinations,
    });
  };

  const removeLoadCase = (index: number) => {
    const removed = value.customLoadCases[index];
    if (!removed) return;
    keepLoadCases({
      customLoadCases: value.customLoadCases.filter((_, loadCaseIndex) => loadCaseIndex !== index),
      customLoadCombinations: value.customLoadCombinations
        .map((combination) => {
          const factors = { ...combination.factors };
          delete factors[removed.id];
          return { ...combination, factors };
        })
        .filter((combination) => Object.keys(combination.factors).length > 0),
    });
  };

  const addLoadToCase = (loadCaseIndex: number) => {
    const loadCase = value.customLoadCases[loadCaseIndex];
    if (!loadCase) return;
    updateLoadCase(loadCaseIndex, { loads: [...loadCase.loads, createDefaultBeamCaseLoad(totalLength)] });
  };

  const updateLoadInCase = (loadCaseIndex: number, loadIndex: number, nextLoad: BeamLoadInput) => {
    const loadCase = value.customLoadCases[loadCaseIndex];
    if (!loadCase) return;
    updateLoadCase(loadCaseIndex, {
      loads: loadCase.loads.map((load, index) => (index === loadIndex ? nextLoad : load)),
    });
  };

  const removeLoadFromCase = (loadCaseIndex: number, loadIndex: number) => {
    const loadCase = value.customLoadCases[loadCaseIndex];
    if (!loadCase) return;
    updateLoadCase(loadCaseIndex, { loads: loadCase.loads.filter((_, index) => index !== loadIndex) });
  };

  const addLoadCombination = () => {
    const id = nextDraftId("COMB", value.customLoadCombinations.map((combination) => combination.id));
    keepLoadCases({
      customLoadCombinations: [
        ...value.customLoadCombinations,
        {
          id,
          title: `组合 ${value.customLoadCombinations.length + 1}`,
          factors: Object.fromEntries(value.customLoadCases.map((loadCase) => [loadCase.id, 1.0])),
          tags: [],
        },
      ],
    });
    selectObject({ type: "loadCombinations", id: "all" });
  };

  const updateLoadCombination = (index: number, patch: Partial<BeamLoadCombination>) => {
    const current = value.customLoadCombinations[index];
    if (!current) return;
    const nextPatch = patch.id !== undefined ? { ...patch, id: canonicalEditorId(patch.id, current.id) } : patch;
    keepLoadCases({
      customLoadCombinations: value.customLoadCombinations.map((combination, combinationIndex) => (combinationIndex === index ? { ...combination, ...nextPatch } : combination)),
    });
  };

  const removeLoadCombination = (index: number) => {
    keepLoadCases({
      customLoadCombinations: value.customLoadCombinations.filter((_, combinationIndex) => combinationIndex !== index),
    });
  };

  const renderSelectedEditor = () => {
    if (resolvedSelectedObject.type === "load") {
      return <BeamLoadEditor value={value} totalLength={totalLength} fieldLabelClass={FIELD_LABEL_CLASS} onChange={onChange} compact={compact} />;
    }

    if (resolvedSelectedObject.type === "loadCases") {
      return (
        <BeamLoadCaseSection
          loadCases={value.customLoadCases}
          totalLength={totalLength}
          fieldLabelClass={FIELD_LABEL_CLASS}
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
        <LoadCombinationSection<BeamLoadCombination>
          id="beam-custom-load-combinations"
          loadCases={value.customLoadCases}
          loadCombinations={value.customLoadCombinations}
          fieldLabelClass={FIELD_LABEL_CLASS}
          onAddLoadCombination={addLoadCombination}
          onUpdateLoadCombination={updateLoadCombination}
          onRemoveLoadCombination={removeLoadCombination}
        />
      );
    }

    if (resolvedSelectedObject.type === "support") {
      const index = supportIndexFromId(resolvedSelectedObject.id);
      const support = value.supports.at(index);
      return support ? (
        <BeamSupportEditor
          support={support}
          supportIndex={index}
          totalLength={totalLength}
          fieldLabelClass={FIELD_LABEL_CLASS}
          onUpdate={(patch) => updateSupport(index, patch)}
          onUpdateId={(nextId) => updateSupportId(index, nextId)}
          compact={compact}
        />
      ) : null;
    }

    const index = spanIndexFromId(resolvedSelectedObject.id);
    const span = value.spans.at(index);
    if (!span) return null;
    const memberId = beamSpanMemberId(index, span);
    return (
      <BeamSpanEditor
        span={span}
        spanIndex={index}
        spanCount={value.spans.length}
        memberId={memberId}
        materialOptions={materialOptions}
        fieldLabelClass={FIELD_LABEL_CLASS}
        formControlClass={FORM_CONTROL_CLASS}
        formSelectMenuClass={FORM_SELECT_MENU_CLASS}
        formSelectOptionClass={FORM_SELECT_OPTION_CLASS}
        onUpdateId={(nextId) => updateSpanId(index, nextId)}
        onUpdateMaterial={(nextMaterialId) => updateSpanMaterial(index, nextMaterialId)}
        onUpdateNumber={(field, nextValue) => updateSpan(index, field, nextValue)}
        onRemove={() => removeSpan(index)}
        compact={compact}
      />
    );
  };

  return (
    <WorkbenchTabsLayout
      mode="beam"
      activeSectionId={activeSectionId}
      tabs={{
        template: <BeamTemplateSection onApplyTemplate={applyTypicalCase} />,
        basic: (
          <BeamBasicSection
            materialId={value.materialId}
            materialLibrary={materialLibrary}
            materialOptions={materialOptions}
            spanCount={value.spans.length}
            supportCount={value.supports.length}
            totalLength={totalLength}
            formLabelClass={FORM_LABEL_CLASS}
            formControlClass={FORM_CONTROL_CLASS}
            formSelectMenuClass={FORM_SELECT_MENU_CLASS}
            formSelectOptionClass={FORM_SELECT_OPTION_CLASS}
            onMaterialChange={(nextValue) => updateWorkspace("materialId", nextValue)}
            onReset={() => onChange(DEFAULT_BEAM_STATE)}
            compact={compact}
          />
        ),
        object: (
          <BeamObjectNavigator
            spans={value.spans}
            supports={value.supports}
            selectedObject={resolvedSelectedObject}
            loadSummary={loadSummary}
            loadCases={value.customLoadCases}
            loadCombinations={value.customLoadCombinations}
            maxSpans={MAX_BEAM_SPANS}
            fieldLabelClass={FIELD_LABEL_CLASS}
            selectedEditor={renderSelectedEditor()}
            materialLabelForSpan={materialIdentityForSpan}
            onSelectObject={(next) => selectObject(next)}
            onAddSpan={addSpan}
          />
        ),
        text: (
          <BeamTextModelSection
            draft={beamTextModel.draft}
            message={beamTextModel.message}
            diagnostics={beamTextModel.diagnostics}
            metrics={beamTextModel.metrics}
            onDraftChange={beamTextModel.previewDraft}
            onExport={beamTextModel.exportTextModel}
            onCheck={beamTextModel.checkDraft}
            onImport={beamTextModel.importDraft}
          />
        ),
        table: (
          <BeamTableSection
            spans={value.spans}
            supports={value.supports}
            loadSummary={loadSummary}
            loadCases={value.customLoadCases}
            loadCombinations={value.customLoadCombinations}
            fieldLabelClass={FIELD_LABEL_CLASS}
            materialLabelForSpan={materialIdentityForSpan}
          />
        ),
      }}
    />
  );
}
