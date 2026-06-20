import { Plus, Settings2 } from "lucide-react";

import { Button } from "./ui/button";
import { MemberConnectionPanel } from "./MemberConnectionPanel";
import { ModelObjectGuide } from "./ModelObjectGuide";
import { materialLabelForId, materialIdForMember } from "../lib/material-presets.ts";
import { memberSectionSummary } from "../lib/member-property-vocabulary.ts";
import { modelObjectVocabulary } from "../lib/model-object-vocabulary.ts";
import { frameNodeSupportSummary, hasFrameSupportBoundary, nodeSupportLabel } from "../lib/support-vocabulary.ts";
import { PREDEFINED_MATERIALS, type Material } from "../types/material.ts";
import type { StructureMember, StructureNode } from "../types/structure.ts";

export type FrameSelectedObject =
  | { type: "node"; id: string }
  | { type: "member"; id: string }
  | { type: "load"; id: string }
  | { type: "loadCases"; id: "all" }
  | { type: "loadCombinations"; id: "all" };

interface FrameObjectNavigatorProps {
  nodes: StructureNode[];
  members: StructureMember[];
  materialLibrary?: Material[];
  nodeOptions: Array<{ value: string; label: string }>;
  loadOptions: Array<{ value: string; label: string }>;
  selectedObject: FrameSelectedObject;
  fieldLabelClass: string;
  memberConnectionStartId: string;
  memberConnectionEndId: string;
  memberConnectionDisabledReason?: string;
  onSelectObject: (next: FrameSelectedObject) => void;
  onMemberConnectionStartChange: (nextId: string) => void;
  onMemberConnectionEndChange: (nextId: string) => void;
  onAddMemberConnection: () => void;
  onAddNode: () => void;
  onAddLoad: () => void;
}

function objectChipClass(isActive: boolean) {
  return `rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
    isActive
      ? "border-primary/40 bg-primary/10 text-primary"
      : "border-white/8 bg-slate-950/20 text-muted-foreground hover:text-foreground"
  }`;
}

function formatCoordinate(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}

export function frameMemberChipSummary(member: StructureMember, materialLibrary: Material[] = PREDEFINED_MATERIALS): string {
  return memberSectionSummary("frame", {
    E_GPa: member.E_GPa,
    A_cm2: member.A_cm2,
    I_cm4: member.I_cm4,
    materialLabel: materialLabelForId(materialIdForMember(member, materialLibrary), materialLibrary),
  });
}

export function FrameObjectNavigator({
  nodes,
  members,
  materialLibrary = PREDEFINED_MATERIALS,
  nodeOptions,
  loadOptions,
  selectedObject,
  fieldLabelClass,
  memberConnectionStartId,
  memberConnectionEndId,
  memberConnectionDisabledReason,
  onSelectObject,
  onMemberConnectionStartChange,
  onMemberConnectionEndChange,
  onAddMemberConnection,
  onAddNode,
  onAddLoad,
}: FrameObjectNavigatorProps) {
  const supportNodes = nodes.filter(hasFrameSupportBoundary);
  const vocabulary = modelObjectVocabulary("frame");

  return (
    <section id="frame-object" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
      <ModelObjectGuide mode="frame" />
      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className={fieldLabelClass}>{vocabulary.nodeGroupLabel}</div>
            <Button variant="outline" size="sm" onClick={onAddNode} className="h-8 rounded-lg px-2 text-[10px]">
              <Plus className="mr-1 h-3 w-3" />
              新增节点
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => onSelectObject({ type: "node", id: node.id })}
                className={objectChipClass(selectedObject.type === "node" && selectedObject.id === node.id)}
              >
                {node.id} · ({formatCoordinate(node.x)}, {formatCoordinate(node.y)})
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <div className={fieldLabelClass}>{vocabulary.supportGroupLabel}</div>
          <div className="flex flex-wrap gap-2">
            {supportNodes.map((node) => (
              <button
                key={`support-${node.id}`}
                type="button"
                onClick={() => onSelectObject({ type: "node", id: node.id })}
                className={objectChipClass(selectedObject.type === "node" && selectedObject.id === node.id)}
                title={frameNodeSupportSummary(node)}
              >
                {node.id} · {nodeSupportLabel(node.supportType)}
              </button>
            ))}
            {supportNodes.length === 0 ? (
              <span className="rounded-lg border border-dashed border-white/10 px-2.5 py-1.5 text-xs text-muted-foreground">{vocabulary.noSupportLabel}</span>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          <div className={fieldLabelClass}>{vocabulary.memberGroupLabel}</div>
          <MemberConnectionPanel
            fieldLabelClass={fieldLabelClass}
            memberTerm={vocabulary.memberGroupLabel}
            nodeOptions={nodeOptions}
            startNodeId={memberConnectionStartId}
            endNodeId={memberConnectionEndId}
            disabledReason={memberConnectionDisabledReason}
            onStartNodeChange={onMemberConnectionStartChange}
            onEndNodeChange={onMemberConnectionEndChange}
            onAddConnection={onAddMemberConnection}
          />
          <div className="flex flex-wrap gap-2">
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => onSelectObject({ type: "member", id: member.id })}
                className={objectChipClass(selectedObject.type === "member" && selectedObject.id === member.id)}
                title={`${member.start}-${member.end} · ${frameMemberChipSummary(member, materialLibrary)}`}
              >
                <span>{member.id}</span>
              </button>
            ))}
            {members.length === 0 ? (
              <span className="rounded-lg border border-dashed border-white/10 px-2.5 py-1.5 text-xs text-muted-foreground">{vocabulary.noMemberLabel}</span>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          <div className={fieldLabelClass}>{vocabulary.loadGroupLabel}</div>
          <div className="flex flex-wrap gap-2">
            {loadOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onSelectObject({ type: "load", id: option.value })}
                className={objectChipClass(selectedObject.type === "load" && selectedObject.id === option.value)}
              >
                {option.label}
              </button>
            ))}
            <Button variant="outline" size="sm" onClick={onAddLoad} className="h-8 rounded-lg px-2 text-[10px]">
              <Plus className="mr-1 h-3 w-3" />
              {vocabulary.addLoadLabel}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <div className={fieldLabelClass}>荷载工况与组合</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSelectObject({ type: "loadCases", id: "all" })}
              className={objectChipClass(selectedObject.type === "loadCases")}
            >
              <Settings2 className="mr-1.5 inline-block h-3.5 w-3.5" />
              荷载工况
            </button>
            <button
              type="button"
              onClick={() => onSelectObject({ type: "loadCombinations", id: "all" })}
              className={objectChipClass(selectedObject.type === "loadCombinations")}
            >
              <Settings2 className="mr-1.5 inline-block h-3.5 w-3.5" />
              荷载组合
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
