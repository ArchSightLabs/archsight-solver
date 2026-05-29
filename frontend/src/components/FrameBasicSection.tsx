import { AlertTriangle, CheckCircle2, Plus, RotateCw, Sparkles, Wand2 } from "lucide-react";
import { Button } from "./ui/button";

interface FrameBasicSectionProps {
  nodeCount: number;
  memberCount: number;
  supportCount: number;
  loadCount: number;
  modelWarnings: string[];
  onResetToPortal: () => void;
  onCompleteAxisMembers: () => void;
  onAddNode: () => void;
}

export function FrameBasicSection({
  nodeCount,
  memberCount,
  supportCount,
  loadCount,
  modelWarnings,
  onResetToPortal,
  onCompleteAxisMembers,
  onAddNode,
}: FrameBasicSectionProps) {
  return (
    <>
      <div id="frame-basic" className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="eyebrow flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              自定义平面框架建模
            </div>
            <p className="text-xs text-muted-foreground">
              先套用参数模板或选择当前对象，再在属性检查器中修改节点、构件、支座、材料截面与荷载；批量字段保留在表格页。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onResetToPortal} className="h-8 rounded-xl">
              <RotateCw className="mr-1.5 h-3.5 w-3.5" />
              恢复单跨刚架
            </Button>
            <Button variant="outline" size="sm" onClick={onCompleteAxisMembers} className="h-8 rounded-xl">
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              补全同轴构件
            </Button>
            <Button size="sm" onClick={onAddNode} className="h-8 rounded-xl">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              新增节点并连接
            </Button>
          </div>
        </div>
      </div>

      <section className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "节点", value: nodeCount },
            { label: "构件", value: memberCount },
            { label: "支座", value: supportCount },
            { label: "荷载", value: loadCount },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-white/8 bg-slate-950/20 p-3">
              <div className="text-[10px] font-black tracking-widest text-muted-foreground">{item.label}</div>
              <div className="mt-1 font-mono text-lg font-black">{item.value}</div>
            </div>
          ))}
        </div>
        {modelWarnings.length === 0 ? (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-400/15 bg-emerald-500/8 p-3 text-xs text-emerald-700 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            当前模型对象引用完整，可继续复核截面、节点约束与荷载参数。
          </div>
        ) : (
          <div className="space-y-1 rounded-xl border border-amber-400/15 bg-amber-500/8 p-3 text-xs text-amber-700 dark:text-amber-200">
            {modelWarnings.map((warning) => (
              <div key={warning} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-2 text-xs text-foreground/70">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
            <span className="text-muted-foreground">材料与截面</span>
            <span className="font-semibold">按构件维护 E / A / I；斜撑构件可通过类型标记与端部释放表达铰接连接</span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
            <span className="text-muted-foreground">主要结果</span>
            <span className="font-semibold">节点位移、构件轴力 / 剪力 / 弯矩、支座反力</span>
          </div>
        </div>
      </section>
    </>
  );
}
