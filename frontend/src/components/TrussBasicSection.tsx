import { Plus, RotateCw } from "lucide-react";

import { supportSystemHint } from "../lib/support-vocabulary.ts";
import { WorkbenchModelBasicSection } from "./WorkbenchModelBasicSection";

interface TrussBasicSectionProps {
  materialId: string;
  memberElasticitySummary: string;
  nodeCount: number;
  memberCount: number;
  supportCount: number;
  loadCount: number;
  modelWarnings: string[];
  onResetToBenchmark: () => void;
  onAddNode: () => void;
}

export function TrussBasicSection({
  materialId,
  memberElasticitySummary,
  nodeCount,
  memberCount,
  supportCount,
  loadCount,
  modelWarnings,
  onResetToBenchmark,
  onAddNode,
}: TrussBasicSectionProps) {
  return (
    <WorkbenchModelBasicSection
      id="truss-basic"
      title="自定义平面桁架建模"
      description="先套用桁架参数模板或选择当前对象，再在属性检查器中修改节点、杆件、支座、材料与截面、荷载；批量字段保留在表格页。"
      metrics={[
        { label: "节点", value: nodeCount },
        { label: "杆件", value: memberCount },
        { label: "支座", value: supportCount },
        { label: "荷载", value: loadCount },
      ]}
      modelWarnings={modelWarnings}
      successMessage="当前桁架节点、杆件、荷载引用完整，可继续复核节点位移、杆件轴力与支座反力。"
      detailRows={[
        { label: "支座自由度", value: supportSystemHint("truss") },
        {
          label: "默认材料",
          value: `${materialId.toUpperCase()} 用于项目材料说明；实际刚度按下方杆件 E / A 输入参与整体刚度矩阵。`,
        },
        { label: "弹性模量分布", value: memberElasticitySummary },
        {
          label: "材料与截面",
          value: "按杆件维护 E / A；材料预设只回填弹性模量 E，截面面积仍由杆件截面控制。",
        },
        { label: "主要结果", value: "节点位移、杆件轴力、杆件轴应力、支座反力" },
      ]}
      actions={[
        { label: "恢复默认屋架", icon: <RotateCw className="h-3.5 w-3.5" />, onClick: onResetToBenchmark },
        { label: "新增节点", icon: <Plus className="h-3.5 w-3.5" />, onClick: onAddNode, variant: "default" },
      ]}
    />
  );
}
