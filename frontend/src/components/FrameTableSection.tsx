import { Layers3, Link2, MapPin, Plus } from "lucide-react";
import type { FrameLoad, FrameLoadCase, FrameLoadCombination, StructureMember, StructureNode } from "../types/structure.ts";
import { Button } from "./ui/button";
import { FrameLoadCaseSection } from "./FrameLoadCaseSection";
import { FrameLoadCombinationSection } from "./FrameLoadCombinationSection";
import { FrameLoadEditor } from "./FrameLoadEditor";
import { FrameMemberEditor } from "./FrameMemberEditor";
import { FrameNodeEditor } from "./FrameNodeEditor";
import { MemberConnectionPanel } from "./MemberConnectionPanel";
import { modelObjectVocabulary } from "../lib/model-object-vocabulary.ts";

export type FrameAdvancedSection = "nodes" | "members" | "loads" | "loadCases" | "loadCombinations";

type FrameSelectOption = { value: string; label: string };

interface FrameTableSectionProps {
  nodes: StructureNode[];
  members: StructureMember[];
  loads: FrameLoad[];
  loadCases: FrameLoadCase[];
  loadCombinations: FrameLoadCombination[];
  nodeOptions: FrameSelectOption[];
  memberOptions: FrameSelectOption[];
  fieldLabelClass: string;
  activeSectionId: FrameAdvancedSection;
  memberConnectionStartId: string;
  memberConnectionEndId: string;
  memberConnectionDisabledReason?: string;
  onSectionChange: (next: FrameAdvancedSection) => void;
  onMemberConnectionStartChange: (nextId: string) => void;
  onMemberConnectionEndChange: (nextId: string) => void;
  onAddMember: () => void;
  onUpdateNode: (index: number, patch: Partial<StructureNode>) => void;
  onRemoveNode: (index: number) => void;
  onUpdateMember: (index: number, patch: Partial<StructureMember>) => void;
  onRemoveMember: (index: number) => void;
  onAddLoad: () => void;
  onUpdateLoad: (index: number, patch: Partial<FrameLoad>) => void;
  onRemoveLoad: (index: number) => void;
  onAddLoadCase: () => void;
  onUpdateLoadCase: (index: number, patch: Partial<FrameLoadCase>) => void;
  onRemoveLoadCase: (index: number) => void;
  onAddLoadToCase: (loadCaseIndex: number) => void;
  onUpdateLoadInCase: (loadCaseIndex: number, loadIndex: number, patch: Partial<FrameLoad>) => void;
  onRemoveLoadFromCase: (loadCaseIndex: number, loadIndex: number) => void;
  onAddLoadCombination: () => void;
  onUpdateLoadCombination: (index: number, patch: Partial<FrameLoadCombination>) => void;
  onRemoveLoadCombination: (index: number) => void;
}

export function FrameTableSection({
  nodes,
  members,
  loads,
  loadCases,
  loadCombinations,
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
  onAddMember,
  onUpdateNode,
  onRemoveNode,
  onUpdateMember,
  onRemoveMember,
  onAddLoad,
  onUpdateLoad,
  onRemoveLoad,
  onAddLoadCase,
  onUpdateLoadCase,
  onRemoveLoadCase,
  onAddLoadToCase,
  onUpdateLoadInCase,
  onRemoveLoadFromCase,
  onAddLoadCombination,
  onUpdateLoadCombination,
  onRemoveLoadCombination,
}: FrameTableSectionProps) {
  const vocabulary = modelObjectVocabulary("frame");
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
      <div className="mt-4 space-y-5">
        {activeSectionId === "nodes" ? (
          <section id="frame-custom-nodes" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-4 scroll-mt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="eyebrow flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                {vocabulary.nodeGroupLabel}
              </div>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">节点编号 / 横坐标 / 纵坐标 / 支座约束</span>
            </div>
            <div className="space-y-3">
              {nodes.map((node, index) => (
                <FrameNodeEditor
                  key={`frame-node-${index}`}
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
          <section id="frame-custom-members" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-4 scroll-mt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="eyebrow flex items-center gap-2">
                <Layers3 className="h-3.5 w-3.5 text-primary" />
                {vocabulary.memberGroupLabel}
              </div>
            </div>
            <MemberConnectionPanel
              fieldLabelClass={fieldLabelClass}
              memberTerm="构件"
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
                <FrameMemberEditor
                  key={`frame-member-${index}`}
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
          <section id="frame-custom-loads" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-4 scroll-mt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="eyebrow flex items-center gap-2">
                <Link2 className="h-3.5 w-3.5 text-primary" />
                {vocabulary.loadGroupLabel}
              </div>
              <Button variant="outline" size="sm" onClick={onAddLoad} className="h-8 rounded-xl">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {vocabulary.addLoadLabel}
              </Button>
            </div>
            <div className="space-y-3">
              {loads.map((load, index) => (
                <FrameLoadEditor
                  key={`frame-load-${index}`}
                  load={load}
                  index={index}
                  nodes={nodes}
                  members={members}
                  nodeOptions={nodeOptions}
                  memberOptions={memberOptions}
                  fieldLabelClass={fieldLabelClass}
                  onUpdate={(patch) => onUpdateLoad(index, patch)}
                  onRemove={() => onRemoveLoad(index)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {activeSectionId === "loadCases" ? (
          <FrameLoadCaseSection
            loadCases={loadCases}
            nodes={nodes}
            members={members}
            nodeOptions={nodeOptions}
            memberOptions={memberOptions}
            fieldLabelClass={fieldLabelClass}
            onAddLoadCase={onAddLoadCase}
            onUpdateLoadCase={onUpdateLoadCase}
            onRemoveLoadCase={onRemoveLoadCase}
            onAddLoadToCase={onAddLoadToCase}
            onUpdateLoadInCase={onUpdateLoadInCase}
            onRemoveLoadFromCase={onRemoveLoadFromCase}
          />
        ) : null}

        {activeSectionId === "loadCombinations" ? (
          <FrameLoadCombinationSection
            loadCases={loadCases}
            loadCombinations={loadCombinations}
            fieldLabelClass={fieldLabelClass}
            onAddLoadCombination={onAddLoadCombination}
            onUpdateLoadCombination={onUpdateLoadCombination}
            onRemoveLoadCombination={onRemoveLoadCombination}
          />
        ) : null}
      </div>
    </section>
  );
}
