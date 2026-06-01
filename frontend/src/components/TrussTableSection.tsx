import { Link2, MapPin, Triangle } from "lucide-react";
import type { TrussLoad, TrussMember, TrussNode } from "../types/structure.ts";
import { modelObjectLoadLabel, modelObjectVocabulary } from "../lib/model-object-vocabulary.ts";
import { trussSupportLabel } from "../lib/support-vocabulary.ts";
import { materialIdentityLabelForId, materialIdForMember } from "../lib/material-presets.ts";
import { PREDEFINED_MATERIALS, type Material } from "../types/material.ts";

export type TrussAdvancedSection = "nodes" | "members" | "loads";

interface TrussTableSectionProps {
  nodes: TrussNode[];
  members: TrussMember[];
  materialLibrary?: Material[];
  loads: TrussLoad[];
  activeSectionId: TrussAdvancedSection;
  onSectionChange: (next: TrussAdvancedSection) => void;
}

export function TrussTableSection({
  nodes,
  members,
  materialLibrary = PREDEFINED_MATERIALS,
  loads,
  activeSectionId,
  onSectionChange,
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
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">节点编号 / 坐标 / 支座</span>
            </div>
            <div className="space-y-2">
              {nodes.map((node) => (
                <div key={node.id} className="grid grid-cols-3 gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-xs">
                  <span className="font-bold">{node.id}</span>
                  <span className="font-mono">({node.x.toFixed(2)}, {node.y.toFixed(2)}) m</span>
                  <span>{node.supportType && node.supportType !== "free" ? trussSupportLabel(node.supportType) : "自由"}</span>
                </div>
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
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">编号 / 连接 / 材料</span>
            </div>
            <div className="space-y-2">
              {members.map((member) => (
                <div key={member.id} className="grid grid-cols-3 gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-xs">
                  <span className="font-bold">{member.id}</span>
                  <span className="font-mono">{member.start} - {member.end}</span>
                  <span className="truncate text-muted-foreground">{materialIdentityLabelForId(materialIdForMember(member, materialLibrary), materialLibrary)}</span>
                </div>
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
                <div key={index} className="grid grid-cols-3 gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-xs">
                  <span className="font-bold">荷载 {index + 1}</span>
                  <span>{load.type === "nodal" ? `${nodeLoadLabel} (${load.node})` : `${memberLoadLabel} (${load.member})`}</span>
                  <span className="font-mono">
                    {load.type === "nodal"
                      ? `Fx: ${load.fxKn ?? 0} kN, Fy: ${load.fyKn ?? 0} kN`
                      : load.wyKnPerM !== undefined
                        ? `q: ${load.wyKnPerM} kN/m`
                        : `q: ${load.qStartKnPerM ?? 0} ~ ${load.qEndKnPerM ?? 0} kN/m`}
                  </span>
                </div>
              ))}
              {loads.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">暂无荷载</div>}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
