import { Link2, MapPin, Plus, Triangle } from "lucide-react";
import type { TrussLoad, TrussMember, TrussNode } from "../types/structure.ts";
import { Button } from "./ui/button";
import { TrussLoadEditor } from "./TrussLoadEditor";
import { TrussMemberEditor } from "./TrussMemberEditor";
import { TrussNodeEditor } from "./TrussNodeEditor";
import { MemberConnectionPanel } from "./MemberConnectionPanel";
import { modelObjectLoadLabel, modelObjectVocabulary } from "../lib/model-object-vocabulary.ts";

export type TrussAdvancedSection = "nodes" | "members" | "loads";

type TrussSelectOption = { value: string; label: string };

interface TrussTableSectionProps {
  nodes: TrussNode[];
  members: TrussMember[];
  loads: TrussLoad[];
  nodeOptions: TrussSelectOption[];
  memberOptions: TrussSelectOption[];
  fieldLabelClass: string;
  activeSectionId: TrussAdvancedSection;
  memberConnectionStartId: string;
  memberConnectionEndId: string;
  memberConnectionDisabledReason?: string;
  onSectionChange: (next: TrussAdvancedSection) => void;
  onMemberConnectionStartChange: (nextId: string) => void;
  onMemberConnectionEndChange: (nextId: string) => void;
  onUpdateNode: (index: number, patch: Partial<TrussNode>) => void;
  onRemoveNode: (index: number) => void;
  onAddMember: () => void;
  onUpdateMember: (index: number, patch: Partial<TrussMember>) => void;
  onRemoveMember: (index: number) => void;
  onAddNodalLoad: () => void;
  onAddMemberLoad: () => void;
  onUpdateLoad: (index: number, patch: Partial<TrussLoad>) => void;
  onRemoveLoad: (index: number) => void;
}

export function TrussTableSection({
  nodes,
  members,
  loads,
  nodeOptions,
  memberOptions,
  fieldLabelClass,
  activeSectionId,
  memberConnectionStartId,
  memberConnectionEndId,
  memberConnectionDisabledReason,
  onSectionChange,
  onMemberConnectionStartChange,
  onMemberConnectionEndChange,
  onUpdateNode,
  onRemoveNode,
  onAddMember,
  onUpdateMember,
  onRemoveMember,
  onAddNodalLoad,
  onAddMemberLoad,
  onUpdateLoad,
  onRemoveLoad,
}: TrussTableSectionProps) {
  const vocabulary = modelObjectVocabulary("truss");
  const nodeLoadLabel = modelObjectLoadLabel("truss", "node");
  const memberLoadLabel = modelObjectLoadLabel("truss", "member");
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
      <div className="mt-4 space-y-5">
        {activeSectionId === "nodes" ? (
          <section id="truss-custom-nodes" className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="eyebrow flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                {vocabulary.nodeGroupLabel}
              </div>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">节点编号 / 坐标 / 支座类型</span>
            </div>
            <div className="space-y-3">
              {nodes.map((node, index) => (
                <TrussNodeEditor
                  key={`truss-node-${index}`}
                  node={node}
                  nodeIndex={index}
                  nodeCount={nodes.length}
                  nodeOptions={nodeOptions}
                  fieldLabelClass={fieldLabelClass}
                  onUpdate={(patch) => onUpdateNode(index, patch)}
                  onRemove={() => onRemoveNode(index)}
                  variant="table"
                />
              ))}
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
            </div>
            <MemberConnectionPanel
              fieldLabelClass={fieldLabelClass}
              memberTerm={vocabulary.memberGroupLabel}
              nodeOptions={nodeOptions}
              startNodeId={memberConnectionStartId}
              endNodeId={memberConnectionEndId}
              disabledReason={memberConnectionDisabledReason}
              onStartNodeChange={onMemberConnectionStartChange}
              onEndNodeChange={onMemberConnectionEndChange}
              onAddConnection={onAddMember}
            />
            <div className="space-y-3">
              {members.map((member, index) => (
                <TrussMemberEditor
                  key={`truss-member-${index}`}
                  member={member}
                  memberIndex={index}
                  nodeOptions={nodeOptions}
                  fieldLabelClass={fieldLabelClass}
                  onUpdate={(patch) => onUpdateMember(index, patch)}
                  onRemove={() => onRemoveMember(index)}
                  variant="table"
                />
              ))}
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
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={onAddNodalLoad} className="h-8 rounded-xl">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  新增{nodeLoadLabel}
                </Button>
                <Button variant="outline" size="sm" onClick={onAddMemberLoad} disabled={members.length === 0} className="h-8 rounded-xl">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  新增{memberLoadLabel}
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              {loads.map((load, index) => (
                <TrussLoadEditor
                  key={`truss-load-${index}`}
                  load={load}
                  index={index}
                  nodes={nodes}
                  members={members}
                  nodeOptions={nodeOptions}
                  memberOptions={memberOptions}
                  fieldLabelClass={fieldLabelClass}
                  onUpdate={(patch) => onUpdateLoad(index, patch)}
                  onRemove={() => onRemoveLoad(index)}
                  variant="table"
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
