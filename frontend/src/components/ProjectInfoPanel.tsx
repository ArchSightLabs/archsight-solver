import { Building2 } from "lucide-react";
import { Input } from "./ui/input";
import type { ProjectInfo } from "../lib/solver-project";

interface ProjectInfoPanelProps {
  value: ProjectInfo;
  compact?: boolean;
  onChange: (next: ProjectInfo) => void;
}

const FIELD_CLASS = "space-y-1.5";
const LABEL_CLASS = "text-[11px] font-semibold leading-none text-slate-600 dark:text-slate-300";
const CONTROL_CLASS = "h-9 border-white/5 bg-primary/[0.03] font-sans text-[12px] font-medium";

const PROJECT_INFO_FIELDS: Array<{ key: keyof ProjectInfo; label: string; placeholder: string }> = [
  { key: "name", label: "项目名称", placeholder: "例如：某教学楼结构复核" },
  { key: "address", label: "项目地址", placeholder: "例如：上海市浦东新区" },
  { key: "projectType", label: "项目类型", placeholder: "例如：公共建筑 / 工业厂房" },
  { key: "scale", label: "项目规模", placeholder: "例如：地上 5 层，建筑面积 12000 m2" },
  { key: "projectManager", label: "项目经理", placeholder: "项目负责人姓名" },
  { key: "constructionUnit", label: "施工单位", placeholder: "施工总承包单位" },
  { key: "developerUnit", label: "建设单位", placeholder: "建设单位名称" },
  { key: "supervisionUnit", label: "监理单位", placeholder: "监理单位名称" },
];

export function ProjectInfoPanel({ value, compact = false, onChange }: ProjectInfoPanelProps) {
  const update = (key: keyof ProjectInfo, nextValue: string) => {
    onChange({ ...value, [key]: nextValue });
  };

  return (
    <section className={`rounded-2xl border border-white/10 bg-white/[0.04] ring-1 ring-white/5 ${compact ? "p-3" : "p-4 sm:p-5"}`}>
      <div className="mb-4 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-black uppercase tracking-widest opacity-50">项目信息</h3>
      </div>
      <div className={`grid grid-cols-1 gap-3 ${compact ? "" : "md:grid-cols-2"}`}>
        {PROJECT_INFO_FIELDS.map((field) => (
          <label key={field.key} className={FIELD_CLASS}>
            <span className={LABEL_CLASS}>{field.label}</span>
            <Input
              value={value[field.key]}
              onChange={(event) => update(field.key, event.target.value)}
              placeholder={field.placeholder}
              className={CONTROL_CLASS}
            />
          </label>
        ))}
      </div>
    </section>
  );
}
