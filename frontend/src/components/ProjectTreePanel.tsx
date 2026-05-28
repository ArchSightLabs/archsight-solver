import { Building2, ExternalLink, Network, Plus, Ruler, ShieldCheck, Trash2, Triangle } from "lucide-react";
import type { AnalysisObject, SolverProject } from "../lib/solver-project";
import { Button } from "./ui/button";

interface ProjectTreePanelProps {
  project: SolverProject;
  collapsed?: boolean;
  compact?: boolean;
  onSelectObject: (objectId: string) => void;
  onCreateObject: () => void;
  onRemoveObject: (objectId: string) => void;
  onEditProjectInfo: () => void;
}

function objectTypeLabel(object: AnalysisObject) {
  if (object.type === "frame") return "框架";
  if (object.type === "truss") return "桁架";
  return "梁";
}

function ObjectIcon({ object }: { object: AnalysisObject }) {
  if (object.type === "frame") return <Network className="h-4 w-4" />;
  if (object.type === "truss") return <Triangle className="h-4 w-4" />;
  return <Ruler className="h-4 w-4" />;
}

export function ProjectTreePanel({ project, collapsed = false, compact = false, onSelectObject, onCreateObject, onRemoveObject, onEditProjectInfo }: ProjectTreePanelProps) {
  const activeObject = project.objects.find((object) => object.id === project.activeObjectId) ?? project.objects[0];
  if (collapsed) {
    return (
      <div className="space-y-2">
        {project.objects.map((object) => {
          const active = object.id === project.activeObjectId;
          return (
            <button
              key={object.id}
              type="button"
              onClick={() => onSelectObject(object.id)}
              title={object.name}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${
                active
                  ? "border-sky-500/55 bg-sky-400 text-slate-950"
                  : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-primary/5 hover:text-foreground"
              }`}
            >
              <ObjectIcon object={object} />
            </button>
          );
        })}
        <button
          type="button"
          onClick={onCreateObject}
          title="新建分析对象"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-primary/5 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="eyebrow min-w-0 text-slate-500 dark:text-slate-300">当前项目</div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onEditProjectInfo}
            aria-label="设置工程信息"
            title="设置工程信息"
            className="h-8 w-8 shrink-0 rounded-lg border-white/10 bg-white/[0.03]"
          >
            <Building2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="truncate text-sm font-black" title={project.name}>{project.name}</div>
      </div>
      {activeObject?.benchmark ? (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-foreground">
          <div className="mb-2 flex items-center gap-2 font-black text-emerald-700 dark:text-emerald-200">
            <ShieldCheck className="h-4 w-4" />
            公开验证算例
          </div>
          <div className="space-y-1.5 text-muted-foreground">
            <div className="font-mono text-[11px] text-foreground">{activeObject.benchmark.caseId}</div>
            <div>{activeObject.benchmark.sourceLabel}</div>
            {activeObject.benchmark.metricSummary ? <div>{activeObject.benchmark.metricSummary}</div> : null}
            {activeObject.benchmark.expectedSummary ? <div>{activeObject.benchmark.expectedSummary}</div> : null}
            {activeObject.benchmark.toleranceSummary ? <div>{activeObject.benchmark.toleranceSummary}</div> : null}
            {activeObject.benchmark.reference ? <div className="max-h-16 overflow-hidden">{activeObject.benchmark.reference}</div> : null}
            {activeObject.benchmark.sourceLinks.length ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {activeObject.benchmark.sourceLinks.slice(0, 3).map((link, index) => (
                  <a
                    key={link}
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-bold text-sky-700 hover:bg-sky-400/10 dark:text-sky-200"
                  >
                    出处 {index + 1}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-black text-muted-foreground">分析对象</div>
          <Button type="button" variant="outline" size="icon" onClick={onCreateObject} aria-label="新建分析对象" title="新建分析对象" className="h-8 w-8 rounded-lg border-white/10 bg-white/[0.03]">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2">
          {project.objects.map((object) => {
            const active = object.id === project.activeObjectId;
            return (
              <div
                key={object.id}
                className={`group flex items-center gap-2 rounded-lg border p-2 transition-colors ${
                  active
                    ? "border-sky-500/55 bg-sky-400 text-slate-950 shadow-sm shadow-sky-500/15"
                    : "border-white/10 bg-white/[0.03] text-foreground hover:border-sky-300/60 hover:bg-primary/5"
                }`}
              >
                <button type="button" onClick={() => onSelectObject(object.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-slate-950/10" : "bg-white/[0.04]"}`}>
                    <ObjectIcon object={object} />
                  </span>
                  <span className="min-w-0">
                    <span className={`block truncate font-bold ${compact ? "text-xs" : "text-sm"}`}>{object.name}</span>
                    <span className={`block text-[10px] font-bold ${active ? "text-slate-800" : "text-muted-foreground"}`}>{objectTypeLabel(object)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveObject(object.id)}
                  disabled={project.objects.length <= 1}
                  aria-label={`删除${object.name}`}
                  title={project.objects.length <= 1 ? "至少保留一个分析对象" : "删除分析对象"}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    active
                      ? "border-slate-950/10 bg-slate-950/5 text-slate-800 hover:bg-red-500 hover:text-white"
                      : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                  } disabled:cursor-not-allowed disabled:opacity-35`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
