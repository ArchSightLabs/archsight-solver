import { Plus, RotateCw, Wand2 } from "lucide-react";

import { supportSystemHint } from "../lib/support-vocabulary.ts";
import { WorkbenchModelBasicSection } from "./WorkbenchModelBasicSection";

interface FrameBasicSectionProps {
  materialId: string;
  memberElasticitySummary: string;
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
  materialId,
  memberElasticitySummary,
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
    <WorkbenchModelBasicSection
      id="frame-basic"
      title="自定义平面框架建模"
      description="先套用参数模板或选择当前对象，再在属性检查器中修改节点、构件、支座、材料与截面、荷载；批量字段保留在表格页。"
      metrics={[
        { label: "节点", value: nodeCount },
        { label: "构件", value: memberCount },
        { label: "支座", value: supportCount },
        { label: "荷载", value: loadCount },
      ]}
      modelWarnings={modelWarnings}
      successMessage="当前模型对象引用完整，可继续复核截面、节点约束与荷载参数。"
      detailRows={[
        { label: "支座自由度", value: supportSystemHint("frame") },
        {
          label: "默认材料",
          value: `${materialId.toUpperCase()} 用于项目材料说明；实际刚度按下方构件 E / A / I 输入参与整体刚度矩阵。`,
        },
        { label: "弹性模量分布", value: memberElasticitySummary },
        {
          label: "材料与截面",
          value: "按构件维护 E / A / I；材料预设只回填弹性模量 E，截面面积和截面惯性矩仍由构件截面控制。",
        },
        { label: "主要结果", value: "节点位移、构件轴力 / 剪力 / 弯矩、支座反力" },
      ]}
      actions={[
        { label: "恢复单跨刚架", icon: <RotateCw className="h-3.5 w-3.5" />, onClick: onResetToPortal },
        { label: "补全同轴构件", icon: <Wand2 className="h-3.5 w-3.5" />, onClick: onCompleteAxisMembers },
        { label: "新增节点并连接", icon: <Plus className="h-3.5 w-3.5" />, onClick: onAddNode, variant: "default" },
      ]}
    />
  );
}
