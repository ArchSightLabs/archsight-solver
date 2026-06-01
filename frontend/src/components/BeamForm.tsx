import { useMemo, useState } from "react";
import { BeamBasicSection } from "./BeamBasicSection";
import { BeamLoadEditor } from "./BeamLoadEditor";
import {
  BeamObjectNavigator,
  beamSpanMemberId,
  beamSpanSemanticLabel,
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
import { formatBeamLoadSummary } from "../lib/beam-loads.ts";
import { materialDropdownOptions, materialEngineeringNote } from "../lib/material-presets.ts";
import { PREDEFINED_MATERIALS } from "../types/material.ts";
import type { BeamSpanConfig, BeamSupportConfig, BeamWorkspaceState } from "../types/beam.ts";
import type { BeamWorkbenchSelection, WorkbenchSelectionOptions } from "../types/workbench-selection.ts";
import { createDefaultBeamSupports, createDefaultBeamWorkspaceState } from "../lib/workspace-state.ts";
import { applyBeamModelTemplate, type BeamModelTemplate } from "../lib/workbench-model-templates.ts";
import { useBeamTextModel } from "../hooks/useBeamTextModel.ts";
import { MAX_BEAM_SPANS } from "../lib/solver-limits.ts";
import { normalizeModuleSectionId } from "../lib/workbench-navigation.ts";

interface BeamFormProps {
  value: BeamWorkspaceState;
  onChange: (next: BeamWorkspaceState) => void;
  activeSectionId?: string;
  selection?: BeamWorkbenchSelection | null;
  onSelectionChange?: (next: BeamWorkbenchSelection, options?: WorkbenchSelectionOptions) => void;
}

const DEFAULT_SPAN: BeamSpanConfig = { id: "(1)", length: 4, E: 210, I: 4500, materialId: "q345" };
const DEFAULT_BEAM_STATE = createDefaultBeamWorkspaceState();
const FORM_LABEL_CLASS = "text-[11px] font-semibold leading-none text-slate-600 dark:text-slate-300";
const FORM_CONTROL_CLASS = "h-9 border-white/5 bg-primary/[0.03] font-sans text-[12px] font-medium";
const FORM_SELECT_MENU_CLASS = "font-sans text-[12px]";
const FORM_SELECT_OPTION_CLASS = "py-2 text-[12px] font-medium";
const FIELD_LABEL_CLASS = "text-[10px] font-black tracking-widest text-muted-foreground";

export function BeamForm({ value, onChange, activeSectionId, selection, onSelectionChange }: BeamFormProps) {
  const [selectedObject, setSelectedObject] = useState<BeamSelectedObject>({ type: "span", id: spanId(0) });
  const visibleSectionId = normalizeModuleSectionId("beam", activeSectionId) ?? "beam-template";
  const isSectionVisible = (sectionId: string) => visibleSectionId === sectionId;
  const materialLibrary = value.materials?.length ? value.materials : PREDEFINED_MATERIALS;
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
  ) =>
    createDefaultBeamSupports(beamType, spans).map((support, index, defaults) => {
      const prior = priorSupports[index];
      const isLastSupport = index === defaults.length - 1;
      const shouldKeepPriorType = prior && !(beamType === "continuous" && isLastSupport && prior.type === "pinned");
      return {
        ...support,
        id: prior?.id?.trim() || support.id,
        type: shouldKeepPriorType ? prior.type : support.type,
        constraints: prior?.constraints ? [...prior.constraints] : support.constraints ? [...support.constraints] : undefined,
        springs: prior?.springs?.map((spring) => ({ ...spring })),
      };
    });

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
          : { mode: "beam", type: "load", id: "primary" },
      options
    );
  };

  const beamTextModel = useBeamTextModel({
    value,
    onApplyWorkspace: onChange,
    onImportApplied: () => selectObject({ type: "span", id: spanId(0) }),
  });

  const resolvedSelectedObject = useMemo<BeamSelectedObject>(() => {
    const current = selection
      ? selection.type === "span"
        ? { type: "span" as const, id: selection.id }
        : selection.type === "support"
          ? { type: "support" as const, id: selection.id }
          : { type: "load" as const, id: "primary" as const }
      : selectedObject;
    if (current.type === "span" && value.spans[spanIndexFromId(current.id)]) {
      return current;
    }
    if (current.type === "support" && value.supports[supportIndexFromId(current.id)]) {
      return current;
    }
    if (current.type === "load") return current;
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
    const nextSpans = value.spans.filter((_, i) => i !== index);
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
      E: material?.youngModulus ?? value.spans[index]?.E ?? DEFAULT_SPAN.E,
    });
  };

  const applyTypicalCase = (template: BeamModelTemplate) => {
    onChange(applyBeamModelTemplate(value, template));
    selectObject({ type: "span", id: spanId(0) }, { openEditor: false });
  };

  const totalLength = value.spans.reduce((sum, span) => sum + span.length, 0);
  const loadSummary = formatBeamLoadSummary(value);

  const renderSelectedEditor = () => {
    if (resolvedSelectedObject.type === "load") {
      return <BeamLoadEditor value={value} totalLength={totalLength} fieldLabelClass={FIELD_LABEL_CLASS} onChange={onChange} />;
    }

    if (resolvedSelectedObject.type === "support") {
      const index = supportIndexFromId(resolvedSelectedObject.id);
      const support = value.supports[index];
      return support ? (
        <BeamSupportEditor
          support={support}
          supportIndex={index}
          totalLength={totalLength}
          fieldLabelClass={FIELD_LABEL_CLASS}
          onUpdate={(patch) => updateSupport(index, patch)}
          onUpdateId={(nextId) => updateSupportId(index, nextId)}
        />
      ) : null;
    }

    const index = spanIndexFromId(resolvedSelectedObject.id);
    const span = value.spans[index];
    if (!span) return null;
    const memberId = beamSpanMemberId(index, span);
    return (
      <BeamSpanEditor
        span={span}
        spanIndex={index}
        spanCount={value.spans.length}
        memberId={memberId}
        semanticLabel={beamSpanSemanticLabel(index)}
        materialLabel={findMaterial(span.materialId)?.id ?? "手动 E"}
        materialNote={materialEngineeringNote(span.materialId, materialLibrary)}
        materialOptions={materialOptions}
        fieldLabelClass={FIELD_LABEL_CLASS}
        formControlClass={FORM_CONTROL_CLASS}
        formSelectMenuClass={FORM_SELECT_MENU_CLASS}
        formSelectOptionClass={FORM_SELECT_OPTION_CLASS}
        onUpdateId={(nextId) => updateSpanId(index, nextId)}
        onUpdateMaterial={(nextMaterialId) => updateSpanMaterial(index, nextMaterialId)}
        onUpdateNumber={(field, nextValue) => updateSpan(index, field, nextValue)}
        onRemove={() => removeSpan(index)}
      />
    );
  };

  return (
    <div className="space-y-4">
      {isSectionVisible("beam-basic") ? (
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
      />
      ) : null}

      {isSectionVisible("beam-template") ? (
      <BeamTemplateSection onApplyTemplate={applyTypicalCase} />
      ) : null}

      {isSectionVisible("beam-object") ? (
      <BeamObjectNavigator
        spans={value.spans}
        supports={value.supports}
        selectedObject={resolvedSelectedObject}
        loadSummary={loadSummary}
        maxSpans={MAX_BEAM_SPANS}
        fieldLabelClass={FIELD_LABEL_CLASS}
        selectedEditor={renderSelectedEditor()}
        materialLabelForSpan={(span) => findMaterial(span.materialId)?.id ?? "手动 E"}
        onSelectObject={(next) => selectObject(next)}
        onAddSpan={addSpan}
      />
      ) : null}

      {isSectionVisible("beam-text") ? (
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
      ) : null}

      {isSectionVisible("beam-table") ? (
      <BeamTableSection
        spans={value.spans}
        supports={value.supports}
        loadSummary={loadSummary}
        fieldLabelClass={FIELD_LABEL_CLASS}
        materialLabelForSpan={(span) => findMaterial(span.materialId)?.id ?? "手动 E"}
      />
      ) : null}
    </div>
  );
}
