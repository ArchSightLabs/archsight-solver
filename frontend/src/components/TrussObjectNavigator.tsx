import { Plus } from "lucide-react";

import { Button } from "./ui/button";
import { MemberConnectionPanel } from "./MemberConnectionPanel";
import { ModelObjectGuide } from "./ModelObjectGuide";
import { modelObjectLoadLabel, modelObjectVocabulary } from "../lib/model-object-vocabulary.ts";
import { trussSupportSummary } from "../lib/support-vocabulary.ts";
import type { TrussMember, TrussNode } from "../types/structure.ts";

export type TrussSelectedObject =
  | { type: "node"; id: string }
  | { type: "member"; id: string }
  | { type: "load"; id: string };

interface TrussObjectNavigatorProps {
  nodes: TrussNode[];
  members: TrussMember[];
  nodeOptions: Array<{ value: string; label: string }>;
  loadOptions: Array<{ value: string; label: string }>;
  selectedObject: TrussSelectedObject;
  supportCount: number;
  fieldLabelClass: string;
  memberConnectionStartId: string;
  memberConnectionEndId: string;
  memberConnectionDisabledReason?: string;
  onSelectObject: (next: TrussSelectedObject) => void;
  onMemberConnectionStartChange: (nextId: string) => void;
  onMemberConnectionEndChange: (nextId: string) => void;
  onAddMemberConnection: () => void;
  onAddNodalLoad: () => void;
  onAddMemberLoad: () => void;
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

export function TrussObjectNavigator({
  nodes,
  members,
  nodeOptions,
  loadOptions,
  selectedObject,
  supportCount,
  fieldLabelClass,
  memberConnectionStartId,
  memberConnectionEndId,
  memberConnectionDisabledReason,
  onSelectObject,
  onMemberConnectionStartChange,
  onMemberConnectionEndChange,
  onAddMemberConnection,
  onAddNodalLoad,
  onAddMemberLoad,
}: TrussObjectNavigatorProps) {
  const supportNodes = nodes.filter((node) => (node.supportType ?? "free") !== "free");
  const vocabulary = modelObjectVocabulary("truss");
  const nodeLoadLabel = modelObjectLoadLabel("truss", "node");
  const memberLoadLabel = modelObjectLoadLabel("truss", "member");

  return (
    <section id="truss-object" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
      <ModelObjectGuide mode="truss" />
      <div className="space-y-3">
        <div className="space-y-2">
          <div className={fieldLabelClass}>{vocabulary.nodeGroupLabel}</div>
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
              >
                {node.id} · {trussSupportSummary(node.supportType)}
              </button>
            ))}
            {supportCount === 0 ? (
              <span className="rounded-lg border border-dashed border-white/10 px-2.5 py-1.5 text-xs text-muted-foreground">{vocabulary.noSupportLabel}</span>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          <div className={fieldLabelClass}>{vocabulary.memberGroupLabel}</div>
          <MemberConnectionPanel
            fieldLabelClass={fieldLabelClass}
            memberTerm="杆件"
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
              >
                {member.id} · {member.start}-{member.end}
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
            <Button variant="outline" size="sm" onClick={onAddNodalLoad} className="h-8 rounded-lg px-2 text-[10px]">
              <Plus className="mr-1 h-3 w-3" />
              新增{nodeLoadLabel}
            </Button>
            <Button variant="outline" size="sm" onClick={onAddMemberLoad} disabled={members.length === 0} className="h-8 rounded-lg px-2 text-[10px]">
              <Plus className="mr-1 h-3 w-3" />
              新增{memberLoadLabel}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
