import { Plus } from "lucide-react";

import { Button } from "./ui/button";
import { ModelObjectGuide } from "./ModelObjectGuide";
import { modelObjectVocabulary } from "../lib/model-object-vocabulary.ts";
import { nodeSupportSummary } from "../lib/support-vocabulary.ts";
import type { StructureMember, StructureNode } from "../types/structure.ts";

export type FrameSelectedObject =
  | { type: "node"; id: string }
  | { type: "member"; id: string }
  | { type: "load"; id: string };

interface FrameObjectNavigatorProps {
  nodes: StructureNode[];
  members: StructureMember[];
  loadOptions: Array<{ value: string; label: string }>;
  selectedObject: FrameSelectedObject;
  fieldLabelClass: string;
  onSelectObject: (next: FrameSelectedObject) => void;
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

export function FrameObjectNavigator({
  nodes,
  members,
  loadOptions,
  selectedObject,
  fieldLabelClass,
  onSelectObject,
  onAddLoad,
}: FrameObjectNavigatorProps) {
  const supportNodes = nodes.filter((node) => (node.supportType ?? "free") !== "free");
  const vocabulary = modelObjectVocabulary("frame");

  return (
    <section id="frame-object" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
      <ModelObjectGuide mode="frame" />
      <div className="grid grid-cols-1 gap-3">
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
                {node.id} · {nodeSupportSummary(node.supportType)}
              </button>
            ))}
            {supportNodes.length === 0 ? (
              <span className="rounded-lg border border-dashed border-white/10 px-2.5 py-1.5 text-xs text-muted-foreground">{vocabulary.noSupportLabel}</span>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          <div className={fieldLabelClass}>{vocabulary.memberGroupLabel}</div>
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
            <Button variant="outline" size="sm" onClick={onAddLoad} className="h-8 rounded-lg px-2 text-[10px]">
              <Plus className="mr-1 h-3 w-3" />
              {vocabulary.addLoadLabel}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
