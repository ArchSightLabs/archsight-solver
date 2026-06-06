import { Link2, MapPin, Triangle } from "lucide-react";
import type { TrussLoad, TrussLoadPatch, TrussMember, TrussNode } from "../types/structure.ts";
import { modelObjectVocabulary } from "../lib/model-object-vocabulary.ts";
import { PREDEFINED_MATERIALS, type Material } from "../types/material.ts";
import { TrussLoadEditor } from "./TrussLoadEditor";
import { TrussMemberEditor } from "./TrussMemberEditor";
import { TrussNodeEditor } from "./TrussNodeEditor";
import { GridSnapControls } from "./GridSnapControls";

export type TrussAdvancedSection = "nodes" | "members" | "loads";

interface TrussTableSectionProps {
  nodes: TrussNode[];
  members: TrussMember[];
  materialLibrary?: Material[];
  loads: TrussLoad[];
  nodeOptions: Array<{ value: string; label: string }>;
  memberOptions: Array<{ value: string; label: string }>;
  activeSectionId: TrussAdvancedSection;
  onSectionChange: (next: TrussAdvancedSection) => void;
  onNodeUpdate: (index: number, patch: Partial<TrussNode>) => void;
  onNodeRemove: (index: number) => void;
  onMemberUpdate: (index: number, patch: Partial<TrussMember>) => void;
  onMemberRemove: (index: number) => void;
  onLoadUpdate: (index: number, patch: TrussLoadPatch | TrussLoad) => void;
  onLoadRemove: (index: number) => void;
  gridSnapEnabled: boolean;
  gridSnapStepM: number;
  onGridSnapEnabledChange: (enabled: boolean) => void;
  onGridSnapStepChange: (stepM: number) => void;
}

export function TrussTableSection({
  nodes,
  members,
  materialLibrary = PREDEFINED_MATERIALS,
  loads,
  nodeOptions,
  memberOptions,
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
}: TrussTableSectionProps) {
  const vocabulary = modelObjectVocabulary("truss");
  const fieldLabelClass = "text-[10px] font-black tracking-widest text-muted-foreground";
  const sections: Array<{ id: TrussAdvancedSection; label: string; count: number }> = [
    { id: "nodes", label: vocabulary.nodeGroupLabel, count: nodes.length },
    { id: "members", label: vocabulary.memberGroupLabel, count: members.length },
    { id: "loads", label: vocabulary.loadGroupLabel, count: loads.length },
  ];

  return (
    <section id="truss-table" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="桁架高级表格分组">
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
          <section id="truss-custom-nodes" className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="eyebrow flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                {vocabulary.nodeGroupLabel}
              </div>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">表格批量编辑</span>
            </div>
            <div className="space-y-2">
              {nodes.map((node, index) => (
                <TrussNodeEditor
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
          <section id="truss-custom-members" className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="eyebrow flex items-center gap-2">
                <Triangle className="h-3.5 w-3.5 text-primary" />
                {vocabulary.memberGroupLabel}
              </div>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">表格批量编辑</span>
            </div>
            <div className="space-y-2">
              {members.map((member, index) => (
                <TrussMemberEditor
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
          <section id="truss-custom-loads" className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="eyebrow flex items-center gap-2">
                <Link2 className="h-3.5 w-3.5 text-primary" />
                {vocabulary.loadGroupLabel}
              </div>
            </div>
            <div className="space-y-2">
              {loads.map((load, index) => (
                <TrussLoadEditor
                  key={`${load.type}-${index}`}
                  load={load}
                  index={index}
                  nodes={nodes}
                  members={members}
                  nodeOptions={nodeOptions}
                  memberOptions={memberOptions}
                  fieldLabelClass={fieldLabelClass}
                  onUpdate={(patch) => onLoadUpdate(index, patch)}
                  onRemove={() => onLoadRemove(index)}
                  variant="table"
                />
              ))}
              {loads.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">暂无荷载</div>}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
