import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, ExternalLink, FolderOpen, Loader2, ShieldCheck, X } from "lucide-react";
import type { SolverProject } from "../lib/solver-project";
import { Button } from "./ui/button";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

interface PublicExampleCatalog {
  schemaVersion: number;
  catalogUpdatedAt: string;
  caseCount: number;
  projects: PublicExampleProject[];
}

interface PublicExampleProject {
  id: string;
  title: string;
  description: string;
  analysisTypes: string[];
  caseCategories: string[];
  caseCount: number;
  sourceTypes: string[];
  project: SolverProject;
}

interface PublicExamplesDialogProps {
  onClose: () => void;
  onOpenProject: (project: SolverProject, title: string) => void;
}

function sourceTypeLabel(sourceType: string) {
  if (sourceType === "textbook-analytical") return "教材解析解";
  if (sourceType === "independent-stiffness-baseline") return "独立刚度法基准";
  if (sourceType === "internal-regression") return "内部回归";
  return sourceType;
}

function objectTypeLabel(type: string) {
  if (type === "frame") return "平面框架";
  if (type === "truss") return "平面桁架";
  return "梁系";
}

export function PublicExamplesDialog({ onClose, onOpenProject }: PublicExamplesDialogProps) {
  const [catalog, setCatalog] = useState<PublicExampleCatalog | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl("/api/examples/projects"))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error((await response.text()) || "公开案例读取失败");
        }
        return response.json() as Promise<PublicExampleCatalog>;
      })
      .then((data) => {
        if (cancelled) return;
        setCatalog(data);
        setSelectedProjectId(data.projects[0]?.id ?? null);
        setError(null);
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : "公开案例读取失败");
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProject = useMemo(
    () => catalog?.projects.find((project) => project.id === selectedProjectId) ?? catalog?.projects[0] ?? null,
    [catalog, selectedProjectId]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6">
      <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-2xl shadow-black/30">
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-base font-black">
              <BookOpenCheck className="h-5 w-5 text-sky-600 dark:text-sky-300" />
              公开工程案例
            </div>
            <div className="mt-1 text-xs font-bold text-muted-foreground">
              {catalog ? `${catalog.caseCount} 个验证算例 · 目录版本 ${catalog.catalogUpdatedAt}` : "从公开验证集生成可打开工程"}
            </div>
          </div>
          <Button type="button" variant="outline" size="icon" onClick={onClose} aria-label="关闭公开工程案例" className="h-9 w-9 shrink-0 rounded-lg">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="flex min-h-72 items-center justify-center gap-2 text-sm font-bold text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在读取公开案例...
          </div>
        ) : error ? (
          <div className="m-5 rounded-lg border border-red-500/25 bg-red-500/10 p-4 text-sm font-bold text-red-700 dark:text-red-200">
            {error}
          </div>
        ) : catalog && selectedProject ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[20rem_minmax(0,1fr)]">
            <aside className="border-b border-border p-3 lg:border-b-0 lg:border-r">
              <div className="space-y-2">
                {catalog.projects.map((project) => {
                  const active = project.id === selectedProject.id;
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        active
                          ? "border-sky-500/50 bg-sky-400/12"
                          : "border-white/10 bg-white/[0.03] hover:border-sky-300/60 hover:bg-primary/5"
                      }`}
                    >
                      <div className="font-black">{project.title}</div>
                      <div className="mt-1 text-xs font-bold text-muted-foreground">{project.caseCount} 个分析对象</div>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="min-h-0 overflow-auto p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-black tracking-tight">{selectedProject.title}</h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{selectedProject.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                    {selectedProject.sourceTypes.map((sourceType) => (
                      <span key={sourceType} className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1">
                        {sourceTypeLabel(sourceType)}
                      </span>
                    ))}
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => onOpenProject(selectedProject.project, selectedProject.title)}
                  className="shrink-0 rounded-lg font-black"
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  打开工程
                </Button>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                {selectedProject.project.objects.map((object) => (
                  <div key={object.id} className="rounded-lg border border-border bg-white/[0.025] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black" title={object.name}>{object.name}</div>
                        <div className="mt-1 font-mono text-[11px] font-bold text-muted-foreground">{object.benchmark?.caseId}</div>
                      </div>
                      <span className="shrink-0 rounded-md border border-sky-400/25 bg-sky-400/10 px-2 py-1 text-[11px] font-black text-sky-700 dark:text-sky-200">
                        {objectTypeLabel(object.type)}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1.5 text-xs leading-5 text-muted-foreground">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-200">
                        <ShieldCheck className="h-3.5 w-3.5" />
                      {object.benchmark?.sourceLabel}
                      </div>
                      {object.benchmark?.purpose ? <div>{object.benchmark.purpose}</div> : null}
                      {object.benchmark?.metricSummary ? <div>{object.benchmark.metricSummary}</div> : null}
                      {object.benchmark?.expectedSummary ? <div>{object.benchmark.expectedSummary}</div> : null}
                      {object.benchmark?.toleranceSummary ? <div>{object.benchmark.toleranceSummary}</div> : null}
                      {object.benchmark?.sourceLinks?.length ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {object.benchmark.sourceLinks.slice(0, 2).map((link, index) => (
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
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
