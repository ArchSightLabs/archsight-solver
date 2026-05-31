import { Plus, Trash2 } from "lucide-react";
import { modelObjectMemberTerm } from "../lib/model-object-vocabulary.ts";
import type { StructureMember } from "../types/structure.ts";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type FrameMemberPatch = Pick<StructureMember, "endReleases" | "internalHinges">;

interface FrameMemberReleaseFieldProps {
  member: StructureMember;
  memberLabel: string;
  fieldLabelClass: string;
  onChange: (patch: Partial<FrameMemberPatch>) => void;
  showHint?: boolean;
}

export function FrameMemberReleaseField({
  member,
  memberLabel,
  fieldLabelClass,
  onChange,
  showHint = false,
}: FrameMemberReleaseFieldProps) {
  const hinges = member.internalHinges ?? [];
  const memberTerm = modelObjectMemberTerm("frame");

  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3 lg:grid-cols-2">
      <div className="space-y-2">
        <div>
          <div className={fieldLabelClass}>端部转角释放</div>
          {showHint ? (
            <div className="mt-1 text-[11px] text-muted-foreground">当前仅释放局部 z 转角，不释放平动自由度。</div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              name={`${member.id}-start-rz-release`}
              checked={Boolean(member.endReleases?.start?.includes("rz"))}
              onChange={(event) =>
                onChange({
                  endReleases: {
                    ...member.endReleases,
                    start: event.target.checked ? ["rz"] : undefined,
                  },
                })
              }
            />
            起端 rz 释放
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              name={`${member.id}-end-rz-release`}
              checked={Boolean(member.endReleases?.end?.includes("rz"))}
              onChange={(event) =>
                onChange({
                  endReleases: {
                    ...member.endReleases,
                    end: event.target.checked ? ["rz"] : undefined,
                  },
                })
              }
            />
            终端 rz 释放
          </label>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className={fieldLabelClass}>{memberTerm}内部铰</div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange({ internalHinges: [...hinges, { ratio: 0.5 }] })}
            className="h-7 rounded-lg px-2 text-[10px]"
          >
            <Plus className="mr-1 h-3 w-3" />
            新增铰点
          </Button>
        </div>
        {hinges.length === 0 ? (
          <div className="text-xs text-muted-foreground">未设置内部铰</div>
        ) : (
          <div className="space-y-2">
            {hinges.map((hinge, hingeIndex) => (
              <div key={`${member.id}-hinge-${hingeIndex}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Input
                  aria-label={`${memberLabel} 第 ${hingeIndex + 1} 个内部铰位置比`}
                  name={`${member.id}-hinge-${hingeIndex + 1}-ratio`}
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="0.99"
                  value={hinge.ratio}
                  onChange={(event) =>
                    onChange({
                      internalHinges: hinges.map((item, itemIndex) =>
                        itemIndex === hingeIndex ? { ratio: Number(event.target.value) || 0.5 } : item
                      ),
                    })
                  }
                  className="h-10 min-w-0 font-mono text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10"
                  aria-label={`删除${memberLabel} 第 ${hingeIndex + 1} 个内部铰`}
                  onClick={() =>
                    onChange({
                      internalHinges: hinges.filter((_, itemIndex) => itemIndex !== hingeIndex),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4 text-rose-300" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
