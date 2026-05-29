import { useMemo, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { DropdownSelect } from "./ui/DropdownSelect";
import { Plus, Minus, Layers, RotateCcw, SlidersHorizontal, FileText, CheckCircle2 } from "lucide-react";
import { TextModelCheckPanel, type TextModelPreviewMetric } from "./TextModelCheckPanel";
import { PREDEFINED_MATERIALS, type BeamSpanConfig, type BeamSupportConfig, type BeamSupportDof, type BeamSupportSpring, type BeamSupportType, type BeamWorkspaceState } from "../types/beam.ts";
import type { BeamWorkbenchSelection, WorkbenchSelectionOptions } from "../types/workbench-selection.ts";
import { createDefaultBeamSupports, createDefaultBeamWorkspaceState } from "../lib/workspace-state.ts";
import { BEAM_MODEL_TEMPLATES, applyBeamModelTemplate } from "../lib/workbench-model-templates.ts";
import { parseBeamTextModel, serializeBeamTextModel } from "../lib/beam-text-model.ts";
import { MAX_BEAM_SPANS } from "../lib/solver-limits.ts";

interface BeamFormProps {
  value: BeamWorkspaceState;
  onChange: (next: BeamWorkspaceState) => void;
  activeSectionId?: string;
  selection?: BeamWorkbenchSelection | null;
  onSelectionChange?: (next: BeamWorkbenchSelection, options?: WorkbenchSelectionOptions) => void;
}

type BeamSelectedObject =
  | { type: "span"; id: string }
  | { type: "support"; id: string }
  | { type: "load"; id: "primary" };

const DEFAULT_SPAN: BeamSpanConfig = { id: "(1)", length: 4, E: 210, I: 4500, materialId: "q345" };
const DEFAULT_BEAM_STATE = createDefaultBeamWorkspaceState();
const FORM_LABEL_CLASS = "text-[11px] font-semibold leading-none text-slate-600 dark:text-slate-300";
const FORM_CONTROL_CLASS = "h-9 border-white/5 bg-primary/[0.03] font-sans text-[12px] font-medium";
const FORM_SELECT_MENU_CLASS = "font-sans text-[12px]";
const FORM_SELECT_OPTION_CLASS = "py-2.5 text-[12px] font-medium";
const FIELD_LABEL_CLASS = "text-[10px] font-black tracking-widest text-muted-foreground";
const SEGMENTED_OPTION_ACTIVE_CLASS =
  "border-transparent bg-sky-400 text-slate-950 shadow-[0_10px_24px_rgba(56,189,248,0.22)] hover:bg-sky-300 focus-visible:ring-sky-300/70 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300";
const SEGMENTED_OPTION_IDLE_CLASS =
  "border-white/10 bg-white/[0.03] text-foreground/70 hover:border-sky-300/35 hover:bg-sky-400/10 hover:text-foreground dark:hover:bg-sky-400/10";
const SUPPORT_TYPE_OPTIONS: Array<{ label: string; value: BeamSupportType }> = [
  { label: "铰支座", value: "pinned" },
  { label: "滚动支座", value: "roller" },
  { label: "固结支座", value: "fixed" },
  { label: "自由端", value: "free" },
];
type SupportDofMode = "fixed" | "spring" | "free";
const SUPPORT_DOF_MODE_OPTIONS: Array<{ label: string; value: SupportDofMode }> = [
  { label: "约束", value: "fixed" },
  { label: "弹簧", value: "spring" },
  { label: "释放", value: "free" },
];
function LoadStatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-black ${
        enabled
          ? "border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300"
          : "border-slate-300/80 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-emerald-500" : "bg-slate-400"}`} />
      {enabled ? "已启用" : "已停用"}
    </span>
  );
}

function spanId(index: number) {
  return `span-${index}`;
}

function spanIndexFromId(id: string) {
  const index = Number(id.replace("span-", ""));
  return Number.isInteger(index) && index >= 0 ? index : 0;
}

function supportLabel(type: BeamSupportType) {
  return SUPPORT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? "铰支座";
}

function supportShortLabel(type: BeamSupportType) {
  if (type === "pinned") return "铰";
  if (type === "roller") return "滚动";
  if (type === "fixed") return "固结";
  return "自由";
}

function beamSpanMemberId(index: number, span?: BeamSpanConfig) {
  return span?.id?.trim() || `(${index + 1})`;
}

function beamNodeLabel(index: number) {
  return `${index + 1}`;
}

function beamSpanSemanticLabel(index: number) {
  return `第 ${index + 1} 跨 · 节点 ${beamNodeLabel(index)}-${beamNodeLabel(index + 1)}`;
}

function beamSpanChipLabel(index: number, span: BeamSpanConfig) {
  return `${beamSpanMemberId(index, span)} · 节点 ${beamNodeLabel(index)}-${beamNodeLabel(index + 1)}`;
}

function beamSupportChipLabel(support: BeamSupportConfig, index: number) {
  return `${support.id} · 节点 ${beamNodeLabel(index)} · ${supportShortLabel(support.type)} · x=${support.x.toFixed(2)} m`;
}

function constraintsFromType(type: BeamSupportType): BeamSupportDof[] {
  if (type === "fixed") return ["v", "rz"];
  if (type === "pinned" || type === "roller") return ["v"];
  return [];
}

function supportConstraints(support: BeamSupportConfig): BeamSupportDof[] {
  return support.constraints ?? constraintsFromType(support.type);
}

function deriveSupportType(constraints: BeamSupportDof[], springs: BeamSupportSpring[] | undefined, prior: BeamSupportType): BeamSupportType {
  const hasV = constraints.includes("v");
  const hasRz = constraints.includes("rz");
  if (hasV && hasRz) return "fixed";
  if (hasV) return prior === "roller" ? "roller" : "pinned";
  if ((springs ?? []).length > 0) return "free";
  return "free";
}

function dofMode(support: BeamSupportConfig, dof: BeamSupportDof): SupportDofMode {
  if (supportConstraints(support).includes(dof)) return "fixed";
  if (support.springs?.some((spring) => spring.dof === dof)) return "spring";
  return "free";
}

function defaultSpring(dof: BeamSupportDof): BeamSupportSpring {
  return dof === "rz" ? { dof, stiffnessKnMPerRad: 10000 } : { dof, stiffnessKnPerM: 50000 };
}

function DeferredIdInput({
  ariaLabel,
  value,
  onCommit,
  className,
}: {
  ariaLabel: string;
  value: string;
  onCommit: (nextId: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);

  const commitDraft = () => {
    const nextId = draft.trim();
    if (!nextId) {
      setDraft(value);
      return;
    }
    if (nextId !== value) {
      onCommit(nextId);
    }
  };

  return (
    <Input
      aria-label={ariaLabel}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commitDraft}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}

function supportId(index: number) {
  return `support-${index}`;
}

function supportIndexFromId(id: string) {
  const index = Number(id.replace("support-", ""));
  return Number.isInteger(index) && index >= 0 ? index : 0;
}

function formatLoadSummary(value: BeamWorkspaceState) {
  const linearLoads = activeBeamLinearLoads(value);
  const uniformRange = normalizedBeamRatioRange(value.uniformLoadStartRatio, value.uniformLoadEndRatio);
  const uniformRangeLabel = uniformRange.startRatio <= 1e-9 && uniformRange.endRatio >= 1 - 1e-9
    ? "全跨"
    : `${uniformRange.startRatio.toFixed(2)}-${uniformRange.endRatio.toFixed(2)}`;
  const parts = [
    value.uniformLoadEnabled ? `q=${value.q.toFixed(1)} kN/m · ${uniformRangeLabel}` : null,
    linearLoads.length === 1 ? `线性 q=${linearLoads[0].qStartKnPerM.toFixed(1)}→${linearLoads[0].qEndKnPerM.toFixed(1)} kN/m` : null,
    linearLoads.length > 1 ? `线性荷载 ${linearLoads.length} 条` : null,
    value.pointLoads.length ? `集中力 ${value.pointLoads.length} 个` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" + ") : "无荷载";
}

function normalizedBeamRatioRange(startValue: number, endValue: number) {
  let startRatio = Number.isFinite(startValue) ? Math.min(Math.max(startValue, 0), 1) : 0;
  let endRatio = Number.isFinite(endValue) ? Math.min(Math.max(endValue, 0), 1) : 1;
  if (endRatio < startRatio) {
    [startRatio, endRatio] = [endRatio, startRatio];
  }
  if (Math.abs(endRatio - startRatio) < 1e-9) {
    if (endRatio < 1) {
      endRatio = Math.min(1, endRatio + 0.01);
    } else {
      startRatio = Math.max(0, startRatio - 0.01);
    }
  }
  return { startRatio, endRatio };
}

function activeBeamLinearLoads(value: BeamWorkspaceState): BeamWorkspaceState["linearLoads"] {
  if (!value.linearLoadEnabled) {
    return [];
  }
  if (value.linearLoads.length) {
    return value.linearLoads;
  }
  return [{
    id: "L1",
    qStartKnPerM: value.distributedLoadStart,
    qEndKnPerM: value.distributedLoadEnd,
    startRatio: value.distributedLoadStartRatio,
    endRatio: value.distributedLoadEndRatio,
  }];
}

export function BeamForm({ value, onChange, activeSectionId, selection, onSelectionChange }: BeamFormProps) {
  const [selectedObject, setSelectedObject] = useState<BeamSelectedObject>({ type: "span", id: spanId(0) });
  const [textModelDraft, setTextModelDraft] = useState("");
  const [textModelMessage, setTextModelMessage] = useState<string | null>(null);
  const [textModelDiagnostics, setTextModelDiagnostics] = useState<string[]>([]);
  const [textModelPreviewMetrics, setTextModelPreviewMetrics] = useState<TextModelPreviewMetric[]>([]);
  const textModelTextareaRef = useRef<globalThis.HTMLTextAreaElement | null>(null);
  const textModelLineNumberRef = useRef<HTMLDivElement | null>(null);
  const visibleSectionId = activeSectionId ?? "beam-basic";
  const isSectionVisible = (sectionId: string) => visibleSectionId === sectionId;
  const materialLibrary = value.materials?.length ? value.materials : PREDEFINED_MATERIALS;
  const materialOptions = useMemo(
    () => materialLibrary.map((material) => ({ value: material.id, label: material.name })),
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

  const syncLoadType = (patch: Partial<BeamWorkspaceState>): BeamWorkspaceState["loadType"] => {
    const next = { ...value, ...patch };
    const activeTypeCount = (next.uniformLoadEnabled ? 1 : 0) + activeBeamLinearLoads(next).length + next.pointLoads.length;
    if (activeTypeCount === 0) return "none";
    if (activeTypeCount > 1) return "combined";
    if (next.uniformLoadEnabled) return "uniform";
    if (activeBeamLinearLoads(next).length) return "linear";
    return "point";
  };

  const patchLoadState = (patch: Partial<BeamWorkspaceState>) => {
    const currentLinearLoads = activeBeamLinearLoads(value);
    const shouldEnableLinear = patch.linearLoadEnabled === true;
    const linearLoadsPatch = shouldEnableLinear && !patch.linearLoads && currentLinearLoads.length === 0
      ? {
          linearLoads: [{
            id: "L1",
            qStartKnPerM: value.distributedLoadStart,
            qEndKnPerM: value.distributedLoadEnd,
            startRatio: value.distributedLoadStartRatio,
            endRatio: value.distributedLoadEndRatio,
          }],
        }
      : {};
    onChange({
      ...value,
      ...linearLoadsPatch,
      ...patch,
      loadType: syncLoadType({ ...linearLoadsPatch, ...patch }),
    });
  };

  const updatePrimaryLinearLoad = (patch: Partial<BeamWorkspaceState["linearLoads"][number]>) => {
    const [current, ...rest] = activeBeamLinearLoads(value);
    const baseLoad = current ?? {
      id: "L1",
      qStartKnPerM: value.distributedLoadStart,
      qEndKnPerM: value.distributedLoadEnd,
      startRatio: value.distributedLoadStartRatio,
      endRatio: value.distributedLoadEndRatio,
    };
    const nextLoad = { ...baseLoad, ...patch };
    patchLoadState({
      linearLoadEnabled: true,
      linearLoads: [nextLoad, ...rest],
      distributedLoadStart: nextLoad.qStartKnPerM,
      distributedLoadEnd: nextLoad.qEndKnPerM,
      distributedLoadStartRatio: nextLoad.startRatio,
      distributedLoadEndRatio: nextLoad.endRatio,
    });
  };

  const updateUniformLoadRange = (patch: Partial<Pick<BeamWorkspaceState, "uniformLoadStartRatio" | "uniformLoadEndRatio">>) => {
    const range = normalizedBeamRatioRange(
      patch.uniformLoadStartRatio ?? value.uniformLoadStartRatio,
      patch.uniformLoadEndRatio ?? value.uniformLoadEndRatio
    );
    patchLoadState({
      uniformLoadStartRatio: range.startRatio,
      uniformLoadEndRatio: range.endRatio,
    });
  };

  const addPointLoad = () => {
    const nextIndex = value.pointLoads.length;
    const pointLoads = [
      ...value.pointLoads,
      {
        id: `P${nextIndex + 1}`,
        magnitudeKn: value.pointLoad || 10,
        positionRatio: nextIndex === 0 ? value.pointLoadPositionRatio : (nextIndex + 1) / (nextIndex + 2),
      },
    ];
    patchLoadState({ pointLoads, pointLoad: pointLoads[0]?.magnitudeKn ?? value.pointLoad, pointLoadPositionRatio: pointLoads[0]?.positionRatio ?? value.pointLoadPositionRatio });
  };

  const updatePointLoad = (index: number, patch: Partial<BeamWorkspaceState["pointLoads"][number]>) => {
    const pointLoads = value.pointLoads.map((load, loadIndex) => loadIndex === index ? { ...load, ...patch } : load);
    patchLoadState({ pointLoads, pointLoad: pointLoads[0]?.magnitudeKn ?? value.pointLoad, pointLoadPositionRatio: pointLoads[0]?.positionRatio ?? value.pointLoadPositionRatio });
  };

  const removePointLoad = (index: number) => {
    const pointLoads = value.pointLoads.filter((_, loadIndex) => loadIndex !== index).map((load, loadIndex) => ({ ...load, id: load.id || `P${loadIndex + 1}` }));
    patchLoadState({ pointLoads, pointLoad: pointLoads[0]?.magnitudeKn ?? 0, pointLoadPositionRatio: pointLoads[0]?.positionRatio ?? 0.5 });
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

  const withBeamSpanIds = (spans: BeamSpanConfig[]) => {
    const seen = new Set<string>();
    return spans.map((span, index) => {
      const rawId = span.id?.trim();
      const fallback = `(${index + 1})`;
      const baseId = rawId && !seen.has(rawId) ? rawId : fallback;
      let nextId = baseId;
      let suffix = index + 1;
      while (seen.has(nextId)) {
        suffix += 1;
        nextId = `(${suffix})`;
      }
      seen.add(nextId);
      return { ...span, id: nextId };
    });
  };

  const normalizeSpansForBeamType = (beamType: BeamWorkspaceState["beamType"], spans: BeamSpanConfig[]) => {
    if (beamType === "continuous") {
      if (spans.length >= 2) return withBeamSpanIds(spans.map((span) => ({ ...span })));
      const span = spans[0] ?? DEFAULT_SPAN;
      const splitLength = Math.max(span.length / 2, 0.1);
      return withBeamSpanIds([
        { ...span, id: "(1)", length: splitLength },
        { ...span, id: "(2)", length: splitLength },
      ]);
    }

    if (spans.length <= 1) return withBeamSpanIds(spans.map((span) => ({ ...span })));
    const totalLength = spans.reduce((sum, span) => sum + span.length, 0);
    const firstSpan = spans[0] ?? DEFAULT_SPAN;
    return withBeamSpanIds([{ ...firstSpan, length: Math.max(totalLength, 0.1) }]);
  };

  const updateBeamType = (beamType: BeamWorkspaceState["beamType"]) => {
    const spans = normalizeSpansForBeamType(beamType, value.spans);
    onChange({
      ...value,
      beamType,
      spans,
      supports: mergeDefaultSupportLayout(beamType, spans),
    });
    selectObject({ type: "support", id: supportId(0) }, { openEditor: false });
  };

  const updateSupport = (index: number, patch: Partial<BeamSupportConfig>) => {
    const supports = value.supports.map((support, supportIndex) =>
      supportIndex === index ? { ...support, ...patch } : support
    );
    onChange({
      ...value,
      supports,
    });
  };

  const updateSupportType = (index: number, type: BeamSupportType) => {
    updateSupport(index, { type, constraints: constraintsFromType(type), springs: [] });
  };

  const updateSupportDofMode = (index: number, dof: BeamSupportDof, mode: SupportDofMode) => {
    const support = value.supports[index];
    if (!support) return;
    let constraints = supportConstraints(support).filter((item) => item !== dof);
    let springs = (support.springs ?? []).filter((spring) => spring.dof !== dof);
    if (mode === "fixed") {
      constraints = [...constraints, dof];
    } else if (mode === "spring") {
      springs = [...springs, defaultSpring(dof)];
    }
    updateSupport(index, {
      constraints,
      springs: springs.length ? springs : undefined,
      type: deriveSupportType(constraints, springs, support.type),
    });
  };

  const updateSupportSpring = (index: number, dof: BeamSupportDof, stiffness: number) => {
    const support = value.supports[index];
    if (!support) return;
    const springs = (support.springs ?? []).map((spring) => {
      if (spring.dof !== dof) return spring;
      return dof === "rz" ? { dof, stiffnessKnMPerRad: stiffness } : { dof, stiffnessKnPerM: stiffness };
    });
    updateSupport(index, { springs });
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

  const applyTypicalCase = (templateId: string) => {
    const template = BEAM_MODEL_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    onChange(applyBeamModelTemplate(value, template));
    selectObject({ type: "span", id: spanId(0) }, { openEditor: false });
  };

  const exportTextModel = () => {
    setTextModelDraft(serializeBeamTextModel(value));
    setTextModelDiagnostics([]);
    setTextModelPreviewMetrics([]);
    setTextModelMessage("已按当前支座、杆件与荷载生成梁系文本模型，可编辑后先检查再应用。");
  };

  const previewTextModelDraft = (draft: string) => {
    setTextModelDraft(draft);
    if (draft.trim().length === 0) {
      setTextModelDiagnostics([]);
      setTextModelPreviewMetrics([]);
      setTextModelMessage(null);
      return;
    }

    const result = parseBeamTextModel(draft);
    setTextModelDiagnostics(result.diagnostics);
    if (!result.patch || result.diagnostics.length > 0) {
      setTextModelPreviewMetrics([]);
      setTextModelMessage(null);
      return;
    }

    const nextSpans = result.patch.spans ?? value.spans;
    const nextSupports = result.patch.supports ?? createDefaultBeamSupports(result.patch.beamType ?? value.beamType, nextSpans);
    const previewState = {
      ...value,
      ...result.patch,
      spans: nextSpans,
      supports: nextSupports,
    };
    const changedParts = [
      result.patch.materialId ? `默认材料：${result.patch.materialId}` : null,
      result.patch.materials ? `${result.patch.materials.length} 个材料编号` : null,
      result.patch.beamType ? "梁型" : null,
      result.patch.spans ? `${nextSpans.length} 个杆件` : null,
      result.patch.supports ? `${nextSupports.length} 个支座` : null,
      result.patch.loadType ? `荷载：${formatLoadSummary(previewState)}` : null,
    ].filter(Boolean);
    setTextModelPreviewMetrics([
      { label: "杆件", value: `${nextSpans.length}` },
      { label: "支座", value: `${nextSupports.length}` },
      { label: "总长", value: `${nextSpans.reduce((sum, span) => sum + span.length, 0).toFixed(2)} m` },
      { label: "默认材料", value: previewState.materialId },
      { label: "荷载", value: formatLoadSummary(previewState) },
    ]);
    setTextModelMessage(`检查通过：将更新${changedParts.length ? changedParts.join("、") : "梁系参数"}。点击“应用文本模型”后写入正式模型。`);
  };

  const checkTextModelDraft = () => {
    if (!textModelDraft.trim()) {
      setTextModelDiagnostics(["请先生成或输入文本模型。"]);
      setTextModelPreviewMetrics([]);
      setTextModelMessage(null);
      return;
    }
    previewTextModelDraft(textModelDraft);
  };

  const importTextModel = () => {
    const result = parseBeamTextModel(textModelDraft);
    setTextModelDiagnostics(result.diagnostics);
    if (result.diagnostics.length > 0) {
      setTextModelDiagnostics(["存在诊断，未写入正式模型。", ...result.diagnostics]);
      setTextModelPreviewMetrics([]);
      setTextModelMessage(null);
      return;
    }
    if (!result.patch) {
      setTextModelMessage("文本模型未导入。");
      return;
    }
    const nextSpans = result.patch.spans ?? value.spans;
    const nextSupports = result.patch.supports ?? createDefaultBeamSupports(result.patch.beamType ?? value.beamType, nextSpans);
    onChange({
      ...value,
      ...result.patch,
      spans: nextSpans,
      supports: nextSupports,
    });
    setTextModelPreviewMetrics([
      { label: "杆件", value: `${nextSpans.length}` },
      { label: "支座", value: `${nextSupports.length}` },
      { label: "总长", value: `${nextSpans.reduce((sum, span) => sum + span.length, 0).toFixed(2)} m` },
      { label: "默认材料", value: String(result.patch.materialId ?? value.materialId) },
      { label: "荷载", value: formatLoadSummary({ ...value, ...result.patch, spans: nextSpans, supports: nextSupports }) },
    ]);
    setTextModelMessage(`已导入 ${nextSpans.length} 个杆件、${nextSupports.length} 个支座，默认材料 ${result.patch.materialId ?? value.materialId}。`);
    selectObject({ type: "span", id: spanId(0) });
  };

  const derivedNodeCount = value.beamType === "continuous" ? value.spans.length + 1 : 2;
  const totalLength = value.spans.reduce((sum, span) => sum + span.length, 0);
  const loadSummary = formatLoadSummary(value);
  const activeLinearLoads = activeBeamLinearLoads(value);
  const uniformRange = normalizedBeamRatioRange(value.uniformLoadStartRatio, value.uniformLoadEndRatio);
  const uniformLoadLength = totalLength * (uniformRange.endRatio - uniformRange.startRatio);
  const primaryLinearLoad = activeLinearLoads[0] ?? {
    id: "L1",
    qStartKnPerM: value.distributedLoadStart,
    qEndKnPerM: value.distributedLoadEnd,
    startRatio: value.distributedLoadStartRatio,
    endRatio: value.distributedLoadEndRatio,
  };
  const textModelLineNumbers = Array.from({ length: Math.max(textModelDraft.split(/\r?\n/).length, 1) }, (_, index) => index + 1);
  const syncTextModelLineNumbers = () => {
    if (textModelLineNumberRef.current && textModelTextareaRef.current) {
      textModelLineNumberRef.current.scrollTop = textModelTextareaRef.current.scrollTop;
    }
  };

  const renderBeamDefinitionEditor = () => (
    <section className="space-y-4 rounded-lg border border-white/8 bg-slate-950/20 p-4">
      <div className="eyebrow flex items-center gap-2">
        <Layers className="h-3.5 w-3.5 text-primary" />
        梁系定义
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className={FORM_LABEL_CLASS}>默认材料编号（新增杆件）</label>
          <DropdownSelect value={value.materialId} onChange={(nextValue) => updateWorkspace("materialId", nextValue)} options={materialOptions} className={FORM_CONTROL_CLASS} menuClassName={FORM_SELECT_MENU_CLASS} optionClassName={FORM_SELECT_OPTION_CLASS} ariaLabel="默认材料编号（新增杆件）" />
          <div className="font-mono text-[10px] text-muted-foreground">
            当前材料库 {materialLibrary.length} 项；每一跨可在“对象”页单独引用材料编号。
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className={FORM_LABEL_CLASS}>梁型</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "简支梁", value: "simply_supported" },
            { label: "悬臂梁", value: "cantilever" },
            { label: "连续梁", value: "continuous" },
          ].map((option) => {
            const isActive = value.beamType === option.value;
            return (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                aria-pressed={isActive}
                className={`relative h-11 overflow-hidden rounded-md text-[12px] font-bold transition-all ${
                  isActive
                    ? "border-sky-300 bg-sky-400 text-slate-950 shadow-[0_0_0_1px_rgba(125,211,252,0.5),0_10px_24px_rgba(14,165,233,0.22)] hover:bg-sky-300"
                    : "border-white/10 bg-white/[0.03] text-foreground/70 hover:border-sky-400/40 hover:bg-sky-400/10 hover:text-foreground"
                }`}
                onClick={() => updateBeamType(option.value as BeamWorkspaceState["beamType"])}
              >
                {isActive ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>

    </section>
  );

  const renderLoadEditor = () => (
    <div className="space-y-3 rounded-lg border border-white/8 bg-slate-950/20 p-3">
      <div className="grid grid-cols-1 gap-3">
        <section className="space-y-3 rounded-lg border border-white/8 bg-background/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className={FIELD_LABEL_CLASS}>均布荷载</div>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">q = {value.q.toFixed(1)} kN/m</div>
            </div>
            <div className="flex items-center gap-2">
              <LoadStatusBadge enabled={value.uniformLoadEnabled} />
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-lg border-white/10 bg-white/[0.03] px-3 text-[11px] font-semibold text-foreground/70 hover:border-sky-300/35 hover:bg-sky-400/10 hover:text-foreground"
                onClick={() => patchLoadState({ uniformLoadEnabled: !value.uniformLoadEnabled })}
              >
                {value.uniformLoadEnabled ? "停用荷载" : "启用荷载"}
              </Button>
            </div>
          </div>
          {value.uniformLoadEnabled ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <div className={FIELD_LABEL_CLASS}>均布荷载 q（kN/m）</div>
                <Input aria-label="均布荷载 q（kN/m）" type="number" step="0.1" value={value.q} onChange={(event) => updateWorkspace("q", Number(event.target.value) || 0)} className="h-10 min-w-0 font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className={FIELD_LABEL_CLASS}>起点位置比例（0-1）</div>
                <Input aria-label="均布荷载起点位置比例（0-1）" type="number" step="0.05" min="0" max="1" value={uniformRange.startRatio} onChange={(event) => updateUniformLoadRange({ uniformLoadStartRatio: Number(event.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className={FIELD_LABEL_CLASS}>终点位置比例（0-1）</div>
                <Input aria-label="均布荷载终点位置比例（0-1）" type="number" step="0.05" min="0" max="1" value={uniformRange.endRatio} onChange={(event) => updateUniformLoadRange({ uniformLoadEndRatio: Number(event.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
              </div>
              <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 font-mono text-[11px] text-muted-foreground sm:col-span-2">
                作用区间 {uniformRange.startRatio.toFixed(2)}-{uniformRange.endRatio.toFixed(2)}，长度 {uniformLoadLength.toFixed(2)} m
              </div>
            </div>
          ) : null}
        </section>

        <section className="space-y-3 rounded-lg border border-white/8 bg-background/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className={FIELD_LABEL_CLASS}>线性分布荷载</div>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                n = {activeLinearLoads.length || 1}，q1/q2 = {primaryLinearLoad.qStartKnPerM.toFixed(1)}/{primaryLinearLoad.qEndKnPerM.toFixed(1)} kN/m
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LoadStatusBadge enabled={value.linearLoadEnabled} />
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-lg border-white/10 bg-white/[0.03] px-3 text-[11px] font-semibold text-foreground/70 hover:border-sky-300/35 hover:bg-sky-400/10 hover:text-foreground"
                onClick={() => patchLoadState({ linearLoadEnabled: !value.linearLoadEnabled })}
              >
                {value.linearLoadEnabled ? "停用荷载" : "启用荷载"}
              </Button>
            </div>
          </div>
          {value.linearLoadEnabled ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className={FIELD_LABEL_CLASS}>起点荷载（kN/m）</div>
                <Input aria-label="线性分布荷载起点荷载（kN/m）" type="number" step="0.1" value={primaryLinearLoad.qStartKnPerM} onChange={(event) => updatePrimaryLinearLoad({ qStartKnPerM: Number(event.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className={FIELD_LABEL_CLASS}>终点荷载（kN/m）</div>
                <Input aria-label="线性分布荷载终点荷载（kN/m）" type="number" step="0.1" value={primaryLinearLoad.qEndKnPerM} onChange={(event) => updatePrimaryLinearLoad({ qEndKnPerM: Number(event.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className={FIELD_LABEL_CLASS}>起点位置比例（0-1）</div>
                <Input aria-label="线性分布荷载起点位置比例（0-1）" type="number" step="0.05" min="0" max="1" value={primaryLinearLoad.startRatio} onChange={(event) => updatePrimaryLinearLoad({ startRatio: Number(event.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className={FIELD_LABEL_CLASS}>终点位置比例（0-1）</div>
                <Input aria-label="线性分布荷载终点位置比例（0-1）" type="number" step="0.05" min="0" max="1" value={primaryLinearLoad.endRatio} onChange={(event) => updatePrimaryLinearLoad({ endRatio: Number(event.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
              </div>
            </div>
          ) : null}
        </section>

        <section className="space-y-3 rounded-lg border border-white/8 bg-background/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className={FIELD_LABEL_CLASS}>集中力</div>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">n = {value.pointLoads.length}</div>
            </div>
            <Button type="button" variant="outline" className="h-8 rounded-lg px-3 text-[11px] font-semibold" onClick={addPointLoad}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              新增集中力
            </Button>
          </div>
          {value.pointLoads.length ? (
            <div className="space-y-2">
              {value.pointLoads.map((load, index) => (
                <div key={load.id} className="grid grid-cols-1 gap-3 rounded-lg border border-white/8 bg-white/[0.02] p-3 sm:grid-cols-[1fr_1fr_auto]">
                  <div className="space-y-1">
                    <div className={FIELD_LABEL_CLASS}>{load.id} 集中力（kN）</div>
                    <Input aria-label={`${load.id} 集中力（kN）`} type="number" step="0.1" value={load.magnitudeKn} onChange={(event) => updatePointLoad(index, { magnitudeKn: Number(event.target.value) || 0 })} className="h-9 min-w-0 font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <div className={FIELD_LABEL_CLASS}>作用位置比例（0-1）</div>
                    <Input aria-label={`${load.id} 作用位置比例（0-1）`} type="number" step="0.05" min="0" max="1" value={load.positionRatio} onChange={(event) => updatePointLoad(index, { positionRatio: Number(event.target.value) || 0 })} className="h-9 min-w-0 font-mono text-xs" />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="self-end justify-self-end text-rose-300 hover:bg-rose-500/10" onClick={() => removePointLoad(index)} aria-label={`删除 ${load.id}`}>
                    <Minus className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-xs text-muted-foreground">暂无集中力。</div>
          )}
        </section>
      </div>
    </div>
  );

  const renderSupportEditor = (index: number, support: BeamSupportConfig) => (
    <div className="space-y-3 rounded-xl border border-white/8 bg-slate-950/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={FIELD_LABEL_CLASS}>当前支座</div>
          <div className="mt-1 text-sm font-bold">{support.id}</div>
          <div className="mt-1 text-[10px] font-semibold text-muted-foreground">节点 {beamNodeLabel(index)} · 支座约束：{supportLabel(support.type)}</div>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-muted-foreground">
          x = {support.x.toFixed(2)} m
        </span>
      </div>
      <div className="space-y-2">
        <div className={FIELD_LABEL_CLASS}>支座约束</div>
        <div className="grid grid-cols-2 gap-2">
          {SUPPORT_TYPE_OPTIONS.map((option) => {
            const isActive = support.type === option.value;
            return (
              <Button
                key={option.value}
                type="button"
                variant="ghost"
                aria-pressed={isActive}
                className={`h-9 rounded-lg border text-[12px] font-semibold ${isActive ? SEGMENTED_OPTION_ACTIVE_CLASS : SEGMENTED_OPTION_IDLE_CLASS}`}
                onClick={() => updateSupportType(index, option.value)}
              >
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>
      <div className="space-y-3 rounded-xl border border-white/8 bg-background/20 p-3">
        <div className={FIELD_LABEL_CLASS}>自由度约束</div>
        {([
          { dof: "v" as const, label: "竖向位移 v", springLabel: "竖向弹簧刚度（kN/m）" },
          { dof: "rz" as const, label: "转角 θz", springLabel: "转动弹簧刚度（kN·m/rad）" },
        ]).map((item) => {
          const mode = dofMode(support, item.dof);
          const spring = support.springs?.find((candidate) => candidate.dof === item.dof);
          const stiffness = spring?.dof === "rz" ? spring.stiffnessKnMPerRad : spring?.dof === "v" ? spring.stiffnessKnPerM : item.dof === "rz" ? 10000 : 50000;
          return (
            <div key={item.dof} className="space-y-2 rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold">{item.label}</div>
                <div className="grid grid-cols-3 gap-1">
                  {SUPPORT_DOF_MODE_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant="ghost"
                      aria-pressed={mode === option.value}
                      className={`h-7 rounded-md border px-2 text-[10px] font-semibold ${mode === option.value ? SEGMENTED_OPTION_ACTIVE_CLASS : SEGMENTED_OPTION_IDLE_CLASS}`}
                      onClick={() => updateSupportDofMode(index, item.dof, option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
              {mode === "spring" ? (
                <div className="space-y-1">
                  <div className={FIELD_LABEL_CLASS}>{item.springLabel}</div>
                  <Input
                    aria-label={item.springLabel}
                    type="number"
                    min="0"
                    step={item.dof === "rz" ? "1000" : "1000"}
                    value={stiffness}
                    onChange={(event) => updateSupportSpring(index, item.dof, Math.max(Number(event.target.value) || 0, 0))}
                    className="h-9 min-w-0 font-mono text-xs"
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <div className={FIELD_LABEL_CLASS}>节点位置 x（m）</div>
          <Input
            aria-label="节点位置 x（m）"
            type="number"
            step="0.1"
            min="0"
            max={totalLength}
            value={support.x}
            onChange={(event) => updateSupport(index, { x: Math.min(Math.max(Number(event.target.value) || 0, 0), totalLength) })}
            className="h-10 min-w-0 font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <div className={FIELD_LABEL_CLASS}>支座编号</div>
          <DeferredIdInput key={`beam-support-id-${support.id}`} ariaLabel="支座编号" value={support.id} onCommit={(nextId) => updateSupportId(index, nextId)} className="h-10 min-w-0 font-mono text-xs" />
        </div>
      </div>
      <div className="rounded-xl border border-white/8 bg-background/20 px-4 py-3 text-xs leading-relaxed text-foreground/55">
        梁节点自由度为竖向位移 v 与转角 θz。支座约束作为节点边界条件进入整体刚度矩阵：铰支座/滚动支座通常约束 v、释放 θz；固结支座同时约束 v 与 θz。
      </div>
    </div>
  );

  const renderSelectedEditor = () => {
    if (resolvedSelectedObject.type === "load") {
      return renderLoadEditor();
    }

    if (resolvedSelectedObject.type === "support") {
      const index = supportIndexFromId(resolvedSelectedObject.id);
      const support = value.supports[index];
      return support ? renderSupportEditor(index, support) : null;
    }

    const index = spanIndexFromId(resolvedSelectedObject.id);
    const span = value.spans[index];
    if (!span) return null;
    const spanMaterial = findMaterial(span.materialId);
    const memberId = beamSpanMemberId(index, span);
    return (
      <div className="space-y-3 rounded-xl border border-white/8 bg-slate-950/20 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className={FIELD_LABEL_CLASS}>当前杆件</div>
            <div className="mt-1 text-sm font-bold">{memberId}</div>
            <div className="mt-1 font-mono text-[10px] text-muted-foreground">
              {beamSpanSemanticLabel(index)} · 材料 {spanMaterial?.id ?? "手动 E"} · E = {span.E} GPa
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeSpan(index)} disabled={value.spans.length <= 1} aria-label={`删除 ${memberId}`}>
            <Minus className="h-4 w-4 text-rose-300" />
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <div className={FIELD_LABEL_CLASS}>杆件编号</div>
            <DeferredIdInput key={`beam-member-id-${memberId}`} ariaLabel="杆件编号" value={memberId} onCommit={(nextId) => updateSpanId(index, nextId)} className="h-10 min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <div className={FIELD_LABEL_CLASS}>杆件材料编号</div>
            <DropdownSelect
              value={span.materialId ?? ""}
              onChange={(nextMaterialId) => updateSpanMaterial(index, nextMaterialId)}
              options={materialOptions}
              placeholder="手动输入 E"
              ariaLabel="杆件材料编号"
              className={FORM_CONTROL_CLASS}
              menuClassName={FORM_SELECT_MENU_CLASS}
              optionClassName={FORM_SELECT_OPTION_CLASS}
            />
          </div>
          <div className="space-y-1">
            <div className={FIELD_LABEL_CLASS}>杆件长度（m）</div>
            <Input aria-label="杆件长度（m）" type="number" step="0.1" value={span.length} onChange={(e) => updateSpan(index, "length", Number(e.target.value) || 0)} className="h-10 min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={FIELD_LABEL_CLASS}>弹性模量（GPa）</div>
            <Input aria-label="弹性模量（GPa）" type="number" value={span.E} onChange={(e) => updateSpan(index, "E", Number(e.target.value) || 0)} className="h-10 min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <div className={FIELD_LABEL_CLASS}>截面惯性矩（cm4）</div>
            <Input aria-label="截面惯性矩（cm4）" type="number" value={span.I} onChange={(e) => updateSpan(index, "I", Number(e.target.value) || 0)} className="h-10 min-w-0 font-mono text-xs" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {isSectionVisible("beam-basic") ? (
      <section id="beam-basic" className="scroll-mt-4 space-y-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(DEFAULT_BEAM_STATE)}
            aria-label="重置梁系参数"
            className="h-8 w-8 px-0 text-primary hover:bg-primary/10 sm:w-auto sm:px-3"
          >
            <RotateCcw className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden text-[10px] font-bold sm:inline">重置</span>
          </Button>
        </div>

        <div className="space-y-3 rounded-lg border border-white/8 bg-white/[0.04] p-4">
          <div className="eyebrow">模型概览</div>
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-white/8 bg-white/8">
            {[
              ["节点", `${derivedNodeCount}`],
              ["杆件", `${value.spans.length}`],
              ["总长", `${totalLength.toFixed(2)} m`],
            ].map(([label, metric]) => (
              <div key={label} className="bg-background/35 px-3 py-2">
                <div className="text-[10px] font-bold text-muted-foreground">{label}</div>
                <div className="mt-1 font-mono text-xs font-bold text-foreground/85">{metric}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-2 text-xs text-foreground/70">
            <div className="flex items-center justify-between gap-3 rounded-md bg-white/[0.03] px-3 py-2">
              <span className="text-muted-foreground">求解模型</span>
              <span className="font-semibold">矩阵位移法 / 三弯矩方程校核</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md bg-white/[0.03] px-3 py-2">
              <span className="text-muted-foreground">输入单位</span>
              <span className="font-mono font-semibold">E:GPa · I:cm4 · q:kN/m · P:kN</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md bg-white/[0.03] px-3 py-2">
              <span className="text-muted-foreground">主要结果</span>
              <span className="font-semibold">挠度、弯矩、剪力、支座反力</span>
            </div>
          </div>
        </div>

        {renderBeamDefinitionEditor()}
      </section>
      ) : null}

      {isSectionVisible("beam-typical-cases") ? (
      <section id="beam-typical-cases" className="scroll-mt-4 space-y-3 rounded-lg border border-white/8 bg-white/[0.03] p-3">
        <div className="eyebrow">模板</div>
        <div className="grid grid-cols-1 gap-2">
          {BEAM_MODEL_TEMPLATES.map((template) => (
            <button key={template.id} type="button" onClick={() => applyTypicalCase(template.id)} className="rounded-lg border border-white/8 bg-slate-950/20 p-3 text-left transition-colors hover:border-primary/35 hover:bg-primary/5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold">{template.title}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {template.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded border border-white/8 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {template.state.spans.length} 跨
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

      {isSectionVisible("beam-object-navigator") ? (
      <section id="beam-object-navigator" className="scroll-mt-4 space-y-4 rounded-lg border border-white/8 bg-white/[0.03] p-4">
        <div className="space-y-4">
          <div className="space-y-3 rounded-lg border border-white/8 bg-slate-950/20 p-3">
            <div className="eyebrow">模型对象</div>
          <div className="space-y-2">
            <div className={FIELD_LABEL_CLASS}>支座</div>
            <div className="flex flex-wrap gap-2">
              {value.supports.map((support, index) => (
                <button
                  key={supportId(index)}
                  type="button"
                  onClick={() => selectObject({ type: "support", id: supportId(index) })}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${resolvedSelectedObject.type === "support" && resolvedSelectedObject.id === supportId(index) ? "border-sky-300 bg-sky-400 text-slate-950 shadow-sm shadow-sky-500/15" : "border-white/8 bg-slate-950/20 text-muted-foreground hover:text-foreground"}`}
                >
                  {beamSupportChipLabel(support, index)}
                </button>
              ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className={FIELD_LABEL_CLASS}>杆件</div>
              <div className="flex flex-wrap gap-2">
              {value.spans.map((span, index) => (
                <button key={spanId(index)} type="button" onClick={() => selectObject({ type: "span", id: spanId(index) })} className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${resolvedSelectedObject.type === "span" && resolvedSelectedObject.id === spanId(index) ? "border-sky-300 bg-sky-400 text-slate-950 shadow-sm shadow-sky-500/15" : "border-white/8 bg-slate-950/20 text-muted-foreground hover:text-foreground"}`}>
                    {beamSpanChipLabel(index, span)}
                  </button>
                ))}
                <Button variant="outline" size="sm" onClick={addSpan} disabled={value.spans.length >= MAX_BEAM_SPANS} className="h-8 rounded-lg px-2 text-[10px]">
                  <Plus className="mr-1 h-3 w-3" />
                  {value.spans.length >= MAX_BEAM_SPANS ? `已达 ${MAX_BEAM_SPANS} 跨` : "新增杆件"}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <div className={FIELD_LABEL_CLASS}>荷载</div>
              <button type="button" onClick={() => selectObject({ type: "load", id: "primary" })} className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${resolvedSelectedObject.type === "load" ? "border-sky-300 bg-sky-400 text-slate-950 shadow-sm shadow-sky-500/15" : "border-white/8 bg-slate-950/20 text-muted-foreground hover:text-foreground"}`}>
                {loadSummary}
              </button>
            </div>
          </div>
          <div className="space-y-3 rounded-lg border border-white/8 bg-background/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="eyebrow flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                属性编辑
              </div>
              <span className="max-w-[12rem] truncate rounded-full border border-primary/10 bg-primary/10 px-3 py-1 text-[10px] font-bold text-primary/80">
                {resolvedSelectedObject.type === "load"
                  ? loadSummary
                  : resolvedSelectedObject.type === "support"
                    ? beamSupportChipLabel(value.supports[supportIndexFromId(resolvedSelectedObject.id)] ?? { id: "S?", x: 0, type: "pinned" }, supportIndexFromId(resolvedSelectedObject.id))
                    : beamSpanChipLabel(spanIndexFromId(resolvedSelectedObject.id), value.spans[spanIndexFromId(resolvedSelectedObject.id)] ?? DEFAULT_SPAN)}
              </span>
            </div>
            {renderSelectedEditor()}
          </div>
        </div>
      </section>
      ) : null}

      {isSectionVisible("beam-text-model") ? (
      <section id="beam-text-model" className="scroll-mt-4 space-y-4 rounded-lg border border-white/8 bg-white/[0.03] p-4">
        <section className="space-y-3 rounded-lg border border-white/8 bg-slate-950/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="eyebrow flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-primary" />
              梁系文本模型
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={exportTextModel} className="h-7 rounded-lg px-2 text-[10px]">
                生成当前模型文本
              </Button>
              <Button variant="outline" size="sm" onClick={checkTextModelDraft} className="h-7 rounded-lg px-2 text-[10px]" disabled={!textModelDraft.trim()}>
                检查文本模型
              </Button>
              <Button size="sm" onClick={importTextModel} className="h-7 rounded-lg px-2 text-[10px]" disabled={!textModelDraft.trim()}>
                应用文本模型
              </Button>
            </div>
          </div>
          <div className="flex min-h-[32rem] overflow-hidden rounded-xl border border-slate-200 bg-white font-mono text-[11px] leading-5 focus-within:border-primary/60 dark:border-white/10 dark:bg-slate-950/70">
            <div
              ref={textModelLineNumberRef}
              aria-hidden="true"
              className="custom-scrollbar max-h-[32rem] w-11 shrink-0 overflow-hidden border-r border-slate-200 bg-slate-50 px-2 py-3 text-right text-slate-400 dark:border-white/10 dark:bg-slate-950/80 dark:text-slate-500"
            >
              {textModelLineNumbers.map((lineNumber) => (
                <div key={lineNumber} className="h-5 leading-5">
                  {lineNumber}
                </div>
              ))}
            </div>
            <textarea
              ref={textModelTextareaRef}
              value={textModelDraft}
              onChange={(event) => previewTextModelDraft(event.target.value)}
              onScroll={syncTextModelLineNumbers}
              spellCheck={false}
              wrap="off"
              className="min-h-[32rem] w-full resize-y border-0 bg-transparent p-3 font-mono text-[11px] leading-5 text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder={"BEAM,continuous\nMATERIAL,q345\nSPAN,(1),6,q345,85000\nSUPPORT,S1,0,pinned\nSUPPORT,S2,6,roller\nLOAD,uniform,12"}
            />
          </div>
          <TextModelCheckPanel
            message={textModelMessage}
            diagnostics={textModelDiagnostics}
            metrics={textModelPreviewMetrics}
          />
        </section>
      </section>
      ) : null}

      {isSectionVisible("beam-advanced-tables") ? (
      <section id="beam-advanced-tables" className="scroll-mt-4 space-y-4 rounded-lg border border-white/8 bg-white/[0.03] p-4">
        <div className="eyebrow">表格</div>
        <div className="space-y-3">
          <div className="space-y-2 rounded-lg border border-white/8 bg-slate-950/20 p-3">
            <div className={FIELD_LABEL_CLASS}>杆件</div>
            <div className="space-y-2">
              {value.spans.map((span, index) => (
                <div key={spanId(index)} className="grid grid-cols-4 gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-xs">
                  <span className="font-bold">{beamSpanMemberId(index, span)}</span>
                  <span>{beamSpanSemanticLabel(index)}</span>
                  <span className="font-mono">L = {span.length.toFixed(2)} m</span>
                  <span className="font-mono">{findMaterial(span.materialId)?.id ?? "手动 E"} · E {span.E} GPa / I {span.I} cm4</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2 rounded-lg border border-white/8 bg-slate-950/20 p-3">
            <div className={FIELD_LABEL_CLASS}>支座</div>
            <div className="space-y-2">
              {value.supports.map((support, index) => (
                <div key={supportId(index)} className="grid grid-cols-3 gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-xs">
                  <span className="font-bold">{support.id} / 节点 {beamNodeLabel(index)}</span>
                  <span>{supportLabel(support.type)}</span>
                  <span className="font-mono">x = {support.x.toFixed(2)} m</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-white/8 bg-slate-950/20 p-3 text-xs">
            <div className={FIELD_LABEL_CLASS}>荷载</div>
            <div className="mt-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 font-semibold">
              {loadSummary}
            </div>
          </div>
        </div>
      </section>
      ) : null}
    </div>
  );
}
