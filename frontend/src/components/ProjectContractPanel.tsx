import { FileJson, Link2, ShieldCheck } from "lucide-react";
import type { ProjectContractSummary, ProjectHealthStatus } from "../lib/project-health";

interface ProjectContractPanelProps {
  value: ProjectContractSummary;
}

const STATUS_LABELS: Record<ProjectHealthStatus, string> = {
  ready: "可托管",
  review: "需复核",
  blocked: "不可用",
};

const STATUS_CLASS: Record<ProjectHealthStatus, string> = {
  ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  review: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  blocked: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200",
};

const PANEL_CLASS = "rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]";
const LABEL_CLASS = "text-[11px] font-black uppercase text-slate-500 dark:text-slate-400";
const VALUE_CLASS = "mt-1 break-words font-mono text-xs font-bold text-slate-900 dark:text-slate-100";

function SummaryCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={PANEL_CLASS}>
      <div className={LABEL_CLASS}>{label}</div>
      <div className={VALUE_CLASS}>{value}</div>
    </div>
  );
}

function objectTypeLabel(key: string) {
  if (key === "beam") return "梁系";
  if (key === "frame") return "平面框架";
  if (key === "truss") return "平面桁架";
  return "未知对象";
}

export function ProjectContractPanel({ value }: ProjectContractPanelProps) {
  const objectTypeSummary = Object.entries(value.objectTypeCounts)
    .map(([key, count]) => `${objectTypeLabel(key)} ${count}`)
    .join(" / ") || "无分析对象";
  const diagnosticSummary = [
    value.diagnosticSeverityCounts.error ? `错误 ${value.diagnosticSeverityCounts.error}` : "",
    value.diagnosticSeverityCounts.warning ? `警告 ${value.diagnosticSeverityCounts.warning}` : "",
    value.diagnosticSeverityCounts.info ? `提示 ${value.diagnosticSeverityCounts.info}` : "",
  ].filter(Boolean).join(" / ") || "无迁移诊断";

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 ring-1 ring-white/5 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileJson className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-black uppercase tracking-widest opacity-50">项目契约</h3>
        </div>
        <span className={`rounded-lg border px-2.5 py-1 text-xs font-black ${STATUS_CLASS[value.healthStatus]}`}>
          {STATUS_LABELS[value.healthStatus]}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCell label="项目文件" value={`${value.schemaVersion} / ${value.projectFileKind}`} />
        <SummaryCell label="ASMS-JSON" value={value.asmsJsonSchemaVersion} />
        <SummaryCell label="Manifest" value={`${value.manifestVersion} / ${value.containerVersion}`} />
        <SummaryCell label="分析对象" value={`${value.objectCount} 个`} />
        <SummaryCell label="对象分布" value={objectTypeSummary} />
        <SummaryCell label="活动对象" value={value.activeObject ? `${value.activeObject.name} / ${objectTypeLabel(value.activeObject.type)}` : "未选择"} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className={PANEL_CLASS}>
          <div className="mb-2 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-sky-600 dark:text-sky-300" />
            <div className={LABEL_CLASS}>宿主托管状态</div>
          </div>
          <div className="space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <div>项目持久化：{value.hostReadiness.canHostPersist ? "可用" : "不可用"}</div>
            <div>单 JSON 文件：{value.hostReadiness.canUseSingleJson ? "可用" : "不可用"}</div>
            <div>迁移复核：{value.hostReadiness.requiresMigration ? "需要" : "不需要"}</div>
          </div>
        </div>
        <div className={PANEL_CLASS}>
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
            <div className={LABEL_CLASS}>迁移诊断</div>
          </div>
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">{diagnosticSummary}</div>
          {value.diagnostics.length ? (
            <ul className="mt-2 space-y-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              {value.diagnostics.map((item) => (
                <li key={item.code}>{item.title}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}
