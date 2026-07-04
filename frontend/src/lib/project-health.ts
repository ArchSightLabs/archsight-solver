import {
  createArchSightSolverProjectFile,
  type ProjectFileDiagnostic,
  type ProjectFileDiagnosticSeverity,
} from "./project-file.ts";
import type { AnalysisObjectType, SolverProject } from "./solver-project.ts";

export type ProjectHealthStatus = "ready" | "review" | "blocked";

export interface ProjectContractSummary {
  healthStatus: ProjectHealthStatus;
  schema: string;
  schemaVersion: string;
  appVersion: string;
  projectFileSchemaVersion: string;
  asmsJsonSchemaVersion: string;
  manifestVersion: string;
  projectFileKind: string;
  containerVersion: string;
  objectCount: number;
  objectTypeCounts: Partial<Record<AnalysisObjectType | "unknown", number>>;
  activeObject: {
    id: string;
    name: string;
    type: AnalysisObjectType | "unknown";
  } | null;
  diagnostics: ProjectFileDiagnostic[];
  diagnosticSeverityCounts: Partial<Record<ProjectFileDiagnosticSeverity, number>>;
  hostReadiness: {
    canHostPersist: boolean;
    canUseSingleJson: boolean;
    requiresMigration: boolean;
  };
}

function countDiagnostics(diagnostics: readonly ProjectFileDiagnostic[]) {
  return diagnostics.reduce<Partial<Record<ProjectFileDiagnosticSeverity, number>>>((counts, item) => {
    counts[item.severity] = (counts[item.severity] ?? 0) + 1;
    return counts;
  }, {});
}

function healthStatusFromDiagnostics(diagnostics: readonly ProjectFileDiagnostic[]): ProjectHealthStatus {
  if (diagnostics.some((item) => item.severity === "error")) return "blocked";
  if (diagnostics.some((item) => item.severity === "warning")) return "review";
  return "ready";
}

export function buildProjectContractSummary(project: SolverProject, now = new Date()): ProjectContractSummary {
  const projectFile = createArchSightSolverProjectFile(project, now);
  const diagnostics = projectFile.diagnostics ?? [];
  const objectTypeCounts = projectFile.project.objects.reduce<Partial<Record<AnalysisObjectType | "unknown", number>>>((counts, item) => {
    const type = item.type || "unknown";
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});
  const active = projectFile.project.objects.find((item) => item.id === projectFile.project.activeObjectId);

  return {
    healthStatus: healthStatusFromDiagnostics(diagnostics),
    schema: projectFile.schema,
    schemaVersion: projectFile.schemaVersion,
    appVersion: projectFile.appVersion,
    projectFileSchemaVersion: projectFile.contract.projectFileSchemaVersion,
    asmsJsonSchemaVersion: projectFile.contract.asmsJsonSchemaVersion,
    manifestVersion: projectFile.manifest.manifestVersion,
    projectFileKind: projectFile.manifest.projectFileKind,
    containerVersion: projectFile.manifest.containerVersion,
    objectCount: projectFile.project.objects.length,
    objectTypeCounts,
    activeObject: active ? { id: active.id, name: active.name, type: active.type || "unknown" } : null,
    diagnostics,
    diagnosticSeverityCounts: countDiagnostics(diagnostics),
    hostReadiness: {
      canHostPersist: projectFile.schema === "archsight-solver.project",
      canUseSingleJson: Boolean(projectFile.manifest.containerCapabilities["single-json"]),
      requiresMigration: diagnostics.length > 0,
    },
  };
}
