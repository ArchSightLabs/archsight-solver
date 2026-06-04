import { Layers3, Link2, MapPin, Settings2 } from "lucide-react";
import type { FrameLoad, FrameLoadCase, FrameLoadCombination, StructureMember, StructureNode } from "../types/structure.ts";
import { modelObjectVocabulary } from "../lib/model-object-vocabulary.ts";
import { PREDEFINED_MATERIALS, type Material } from "../types/material.ts";
import { FrameLoadEditor } from "./FrameLoadEditor";
import { FrameMemberEditor } from "./FrameMemberEditor";
import { FrameNodeEditor } from "./FrameNodeEditor";
import { GridSnapControls } from "./GridSnapControls";

export type FrameAdvancedSection = "nodes" | "members" | "loads" | "loadCases" | "loadCombinations";

interface FrameTableSectionProps {
  nodes: StructureNode[];
  members: StructureMember[];
  materialLibrary?: Material[];
  loads: FrameLoad[];
  nodeOptions: Array<{ value: string; label: string }>;
  memberOptions: Array<{ value: string; label: string }>;
  loadCases: FrameLoadCase[];
  loadCombinations: FrameLoadCombination[];
  activeSectionId: FrameAdvancedSection;
  onSectionChange: (next: FrameAdvancedSection) => void;
  onNodeUpdate: (index: number, patch: Partial<StructureNode>) => void;
  onNodeRemove: (index: number) => void;
  onMemberUpdate: (index: number, patch: Partial<StructureMember>) => void;
  onMemberRemove: (index: number) => void;
  onLoadUpdate: (index: number, patch: Partial<FrameLoad>) => void;
  onLoadRemove: (index: number) => void;
  gridSnapEnabled: boolean;
  gridSnapStepM: number;
  onGridSnapEnabledChange: (enabled: boolean) => void;
  onGridSnapStepChange: (stepM: number) => void;
}

export function FrameTableSection({
  nodes,
  members,
  materialLibrary = PREDEFINED_MATERIALS,
  loads,
  nodeOptions,
  memberOptions,
  loadCases,
  loadCombinations,
  activeSectionId,
  onSectionChange,
  onNodeUpdate,
  onNodeRemove,
  onMemberUpdate,
  onMemberRemove,
  onLoadUpdate,
  onLoadRemove,
  gridSnapEnabled,
  gridSnapStepM,
  onGridSnapEnabledChange,
  onGridSnapStepChange,
}: FrameTableSectionProps) {
  const vocabulary = modelObjectVocabulary("frame");
  const fieldLabelClass = "text-[10px] font-black tracking-widest text-muted-foreground";
  const sections: Array<{ id: FrameAdvancedSection; label: string; count: number }> = [
    { id: "nodes", label: vocabulary.nodeGroupLabel, count: nodes.length },
    { id: "members", label: vocabulary.memberGroupLabel, count: members.length },
    { id: "loads", label: vocabulary.loadGroupLabel, count: loads.length },
    { id: "loadCases", label: "工况", count: loadCases.length },
    { id: "loadCombinations", label: "组合", count: loadCombinations.length },
  ];

  return (
    <section id="frame-table" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="框架高级表格分组">
        {sections.map((section) => {
          const active = activeSectionId === section.id;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSectionChange(section.id)}
              className={`inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-bold transition-colors ${
                active
                  ? "border-primary/50 bg-primary/12 text-primary"
                  : "border-white/8 bg-slate-950/20 text-muted-foreground hover:border-white/18 hover:text-foreground"
              }`}
            >
              <span>{section.label}</span>
              <span className="font-mono text-[10px] opacity-70">{section.count}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4">
        <GridSnapControls
          enabled={gridSnapEnabled}
          stepM={gridSnapStepM}
          onEnabledChange={onGridSnapEnabledChange}
          onStepChange={onGridSnapStepChange}
        />
      </div>
      <div className="mt-4 space-y-5">
        {activeSectionId === "nodes" ? (
          <section id="frame-custom-nodes" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-4 scroll-mt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="eyebrow flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                {vocabulary.nodeGroupLabel}
              </div>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">表格批量编辑</span>
            </div>
            <div className="space-y-2">
              {nodes.map((node, index) => (
                <FrameNodeEditor
                  key={node.id}
                  node={node}
                  nodeIndex={index}
                  nodeCount={nodes.length}
                  nodeOptions={nodeOptions}
                  fieldLabelClass={fieldLabelClass}
                  onUpdate={(patch) => onNodeUpdate(index, patch)}
                  onRemove={() => onNodeRemove(index)}
                  variant="table"
                  gridSnapEnabled={gridSnapEnabled}
                  gridSnapStepM={gridSnapStepM}
                />
              ))}
              {nodes.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">暂无节点</div>}
            </div>
          </section>
        ) : null}

        {activeSectionId === "members" ? (
          <section id="frame-custom-members" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-4 scroll-mt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="eyebrow flex items-center gap-2">
                <Layers3 className="h-3.5 w-3.5 text-primary" />
                {vocabulary.memberGroupLabel}
              </div>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">表格批量编辑</span>
            </div>
            <div className="space-y-2">
              {members.map((member, index) => (
                <FrameMemberEditor
                  key={member.id}
                  member={member}
                  memberIndex={index}
                  nodeOptions={nodeOptions}
                  materialLibrary={materialLibrary}
                  fieldLabelClass={fieldLabelClass}
                  onUpdate={(patch) => onMemberUpdate(index, patch)}
                  onRemove={() => onMemberRemove(index)}
                  variant="table"
                />
              ))}
              {members.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">暂无{vocabulary.memberGroupLabel}</div>}
            </div>
          </section>
        ) : null}

        {activeSectionId === "loads" ? (
          <section id="frame-custom-loads" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-4 scroll-mt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="eyebrow flex items-center gap-2">
                <Link2 className="h-3.5 w-3.5 text-primary" />
                {vocabulary.loadGroupLabel}
              </div>
            </div>
            <div className="space-y-2">
              {loads.map((load, index) => (
                <FrameLoadEditor
                  key={`${load.type}-${index}`}
                  load={load}
                  index={index}
                  nodes={nodes}
                  members={members}
                  materialLibrary={materialLibrary}
                  nodeOptions={nodeOptions}
                  memberOptions={memberOptions}
                  fieldLabelClass={fieldLabelClass}
                  onUpdate={(patch) => onLoadUpdate(index, patch)}
                  onRemove={() => onLoadRemove(index)}
                />
              ))}
              {loads.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">暂无基本荷载</div>}
            </div>
          </section>
        ) : null}

        {activeSectionId === "loadCases" ? (
          <section id="frame-custom-load-cases" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-4 scroll-mt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="eyebrow flex items-center gap-2">
                <Settings2 className="h-3.5 w-3.5 text-primary" />
                荷载工况
              </div>
            </div>
            <div className="space-y-2">
              {loadCases.map((loadCase) => (
                <div key={loadCase.id} className="grid grid-cols-2 gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-xs">
                  <span className="font-bold">{loadCase.id} ({loadCase.title})</span>
                  <span className="text-muted-foreground">包含 {loadCase.loads.length} 个荷载</span>
                </div>
              ))}
              {loadCases.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">暂无工况</div>}
            </div>
          </section>
        ) : null}

        {activeSectionId === "loadCombinations" ? (
          <section id="frame-custom-load-combinations" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-4 scroll-mt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="eyebrow flex items-center gap-2">
                <Settings2 className="h-3.5 w-3.5 text-primary" />
                荷载组合
              </div>
            </div>
            <div className="space-y-2">
              {loadCombinations.map((combination) => (
                <div key={combination.id} className="grid grid-cols-2 gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-xs">
                  <span className="font-bold">{combination.id} ({combination.title})</span>
                  <span className="text-muted-foreground">
                    {Object.entries(combination.factors).map(([caseId, factor]) => `${factor}×${caseId}`).join(" + ")}
                  </span>
                </div>
              ))}
              {loadCombinations.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">暂无组合</div>}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
