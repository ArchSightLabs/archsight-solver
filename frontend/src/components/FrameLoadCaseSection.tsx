import { GitBranch, Plus, Trash2 } from "lucide-react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { FrameLoadEditor } from "./FrameLoadEditor";
import type { DropdownOption } from "./ui/DropdownSelect";
import type { FrameLoad, FrameLoadCase, StructureMember, StructureNode } from "../types/structure.ts";

interface FrameLoadCaseSectionProps {
  loadCases: FrameLoadCase[];
  nodes: StructureNode[];
  members: StructureMember[];
  nodeOptions: DropdownOption[];
  memberOptions: DropdownOption[];
  fieldLabelClass: string;
  onAddLoadCase: () => void;
  onUpdateLoadCase: (loadCaseIndex: number, patch: Partial<FrameLoadCase>) => void;
  onRemoveLoadCase: (loadCaseIndex: number) => void;
  onAddLoadToCase: (loadCaseIndex: number) => void;
  onUpdateLoadInCase: (loadCaseIndex: number, loadIndex: number, patch: Partial<FrameLoad>) => void;
  onRemoveLoadFromCase: (loadCaseIndex: number, loadIndex: number) => void;
}

export function FrameLoadCaseSection({
  loadCases,
  nodes,
  members,
  nodeOptions,
  memberOptions,
  fieldLabelClass,
  onAddLoadCase,
  onUpdateLoadCase,
  onRemoveLoadCase,
  onAddLoadToCase,
  onUpdateLoadInCase,
  onRemoveLoadFromCase,
}: FrameLoadCaseSectionProps) {
  return (
    <section id="frame-custom-load-cases" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-4 scroll-mt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="eyebrow flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 text-primary" />
          荷载工况
        </div>
        <Button variant="outline" size="sm" onClick={onAddLoadCase} className="h-8 rounded-xl">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          新增工况
        </Button>
      </div>
      {loadCases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-muted-foreground">未设置独立荷载工况，求解器将使用上方基本荷载。</div>
      ) : (
        <div className="space-y-3">
          {loadCases.map((loadCase, loadCaseIndex) => (
            <div key={loadCase.id} className="space-y-3 rounded-2xl border border-white/8 bg-slate-950/20 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]">
                <div className="space-y-1">
                  <div className={fieldLabelClass}>工况编号</div>
                  <Input aria-label={`第 ${loadCaseIndex + 1} 个工况编号`} value={loadCase.id} onChange={(event) => onUpdateLoadCase(loadCaseIndex, { id: event.target.value })} className="h-10 min-w-0 font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <div className={fieldLabelClass}>工况名称</div>
                  <Input aria-label={`第 ${loadCaseIndex + 1} 个工况名称`} value={loadCase.title} onChange={(event) => onUpdateLoadCase(loadCaseIndex, { title: event.target.value })} className="h-10 min-w-0 text-xs" />
                </div>
                <div className="flex items-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => onAddLoadToCase(loadCaseIndex)} className="h-10 rounded-xl">
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    荷载
                  </Button>
                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => onRemoveLoadCase(loadCaseIndex)} aria-label={`删除第 ${loadCaseIndex + 1} 个工况`}>
                    <Trash2 className="h-4 w-4 text-rose-300" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {loadCase.loads.map((load, loadIndex) => (
                  <FrameLoadEditor
                    key={`frame-load-case-${loadCaseIndex}-load-${loadIndex}`}
                    load={load}
                    index={loadIndex}
                    nodes={nodes}
                    members={members}
                    nodeOptions={nodeOptions}
                    memberOptions={memberOptions}
                    fieldLabelClass={fieldLabelClass}
                    onUpdate={(patch) => onUpdateLoadInCase(loadCaseIndex, loadIndex, patch)}
                    onRemove={() => onRemoveLoadFromCase(loadCaseIndex, loadIndex)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
