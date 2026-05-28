import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, ExternalLink, FolderOpen, Loader2, ShieldCheck, X } from "lucide-react";
import { getAnalysisObjectDisplayName, type SolverProject } from "../lib/solver-project";
import { Button } from "./ui/button";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;
const EMPTY_SELECTION: string[] = [];

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

function createSelectedProject(project: SolverProject, selectedObjects: SolverProject["objects"]): SolverProject {
  if (selectedObjects.length === project.objects.length) {
    return project;
  }
  const selectedName = `${project.name}（已选 ${selectedObjects.length} 项）`;
  return {
    ...project,
    name: selectedName,
    activeObjectId: selectedObjects[0]?.id ?? project.activeObjectId,
    objects: selectedObjects,
    settings: {
      ...project.settings,
      projectInfo: {
        ...project.settings.projectInfo,
        name: selectedName,
        scale: `${selectedObjects.length} 个公开验证分析对象`,
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

export function PublicExamplesDialog({ onClose, onOpenProject }: PublicExamplesDialogProps) {
  const [catalog, setCatalog] = useState<PublicExampleCatalog | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedObjectIdsByProject, setSelectedObjectIdsByProject] = useState<Record<string, string[]>>({});
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
        setSelectedObjectIdsByProject(Object.fromEntries(
          data.projects.map((project) => [
            project.id,
            project.project.objects[0]?.id ? [project.project.objects[0].id] : [],
          ]),
        ));
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
  const defaultSelectedObjectIds = useMemo(() => {
    const firstObjectId = selectedProject?.project.objects[0]?.id;
    return firstObjectId ? [firstObjectId] : [];
  }, [selectedProject]);
  const selectedObjectIds = useMemo(() => {
    if (!selectedProject) return EMPTY_SELECTION;
    return selectedObjectIdsByProject[selectedProject.id] ?? defaultSelectedObjectIds;
  }, [defaultSelectedObjectIds, selectedObjectIdsByProject, selectedProject]);
  const selectedObjects = useMemo(() => {
    if (!selectedProject) return [];
    const selectedSet = new Set(selectedObjectIds);
    return selectedProject.project.objects.filter((object) => selectedSet.has(object.id));
  }, [selectedObjectIds, selectedProject]);
  const allSelected = Boolean(selectedProject?.project.objects.length) && selectedObjects.length === selectedProject?.project.objects.length;

  const setSelectedObjectIdsForCurrentProject = (updater: (current: string[]) => string[]) => {
    if (!selectedProject) return;
    setSelectedObjectIdsByProject((current) => ({
      ...current,
      [selectedProject.id]: updater(current[selectedProject.id] ?? defaultSelectedObjectIds),
    }));
  };

  const toggleObjectSelection = (objectId: string) => {
    setSelectedObjectIdsForCurrentProject((current) => current.includes(objectId) ? current.filter((id) => id !== objectId) : [...current, objectId]);
  };

  const selectFirstObject = () => {
    setSelectedObjectIdsForCurrentProject(() => defaultSelectedObjectIds);
  };

  const selectAllObjects = () => {
    setSelectedObjectIdsForCurrentProject(() => selectedProject?.project.objects.map((object) => object.id) ?? []);
  };

  const openSelectedObjects = () => {
    if (!selectedProject || selectedObjects.length === 0) return;
    const project = createSelectedProject(selectedProject.project, selectedObjects);
    const title = selectedObjects.length === selectedProject.project.objects.length
      ? selectedProject.title
      : `${selectedProject.title}（已选 ${selectedObjects.length} 个对象）`;
    onOpenProject(project, title);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 p-3 backdrop-blur-md sm:p-6">
      <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white text-slate-950 shadow-2xl shadow-black/35 dark:border-slate-600/80 dark:bg-slate-950 dark:text-slate-50">
        <div className="flex items-start justify-between gap-4 border-b border-slate-300 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950 sm:px-5">
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
            <aside className="border-b border-slate-300 bg-slate-100/80 p-3 dark:border-slate-700 dark:bg-slate-900/70 lg:border-b-0 lg:border-r">
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
                          ? "border-sky-500 bg-sky-100 text-slate-950 shadow-sm shadow-sky-500/15 dark:border-sky-400 dark:bg-sky-950/80 dark:text-sky-50"
                          : "border-slate-300 bg-white text-slate-800 hover:border-sky-400 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:border-sky-500 dark:hover:bg-slate-900"
                      }`}
                    >
                      <div className="font-black">{project.title}</div>
                      <div className="mt-1 text-xs font-bold text-muted-foreground">{project.caseCount} 个分析对象</div>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="min-h-0 overflow-auto bg-slate-50 p-4 dark:bg-slate-950 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-black tracking-tight">{selectedProject.title}</h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{selectedProject.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                    {selectedProject.sourceTypes.map((sourceType) => (
                      <span key={sourceType} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
                        {sourceTypeLabel(sourceType)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <span className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-black text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    已选 {selectedObjects.length}/{selectedProject.project.objects.length}
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={selectFirstObject} className="rounded-lg font-black">
                    仅选首个
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={selectAllObjects} disabled={allSelected} className="rounded-lg font-black">
                    全选当前工程
                  </Button>
                  <Button
                    type="button"
                    onClick={openSelectedObjects}
                    disabled={selectedObjects.length === 0}
                    className="rounded-lg font-black"
                  >
                    <FolderOpen className="mr-2 h-4 w-4" />
                    打开已选对象
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                {selectedProject.project.objects.map((object, index) => {
                  const displayName = getAnalysisObjectDisplayName(object, index);
                  const selected = selectedObjectIds.includes(object.id);
                  return (
                    <div
                      key={object.id}
                      className={`relative overflow-hidden rounded-lg border p-3 transition-colors ${
                        selected
                          ? "border-sky-500 bg-sky-100 text-slate-950 shadow-[0_0_0_1px_rgba(14,165,233,0.28),0_12px_28px_rgba(14,165,233,0.12)] dark:border-sky-400 dark:bg-sky-950/75 dark:text-sky-50"
                          : "border-slate-300 bg-white text-slate-900 shadow-sm hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900/88 dark:text-slate-100 dark:hover:border-slate-500"
                      }`}
                    >
                      {selected ? <span className="absolute inset-y-0 left-0 w-1.5 bg-sky-500 dark:bg-sky-400" /> : null}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2">
                          <input
                            id={`public-example-object-${object.id}`}
                            name="public-example-object"
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleObjectSelection(object.id)}
                            aria-label={`选择${displayName}`}
                            className="mt-1 h-4 w-4 shrink-0 accent-sky-500"
                          />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black" title={displayName}>{displayName}</div>
                            <div className="mt-1 font-mono text-[11px] font-bold text-muted-foreground">{object.benchmark?.caseId}</div>
                          </div>
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
                            {object.benchmark.sourceLinks.slice(0, 2).map((link, sourceIndex) => (
                              <a
                                key={link}
                                href={link}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-bold text-sky-700 hover:bg-sky-400/10 dark:text-sky-200"
                              >
                                出处 {sourceIndex + 1}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
