import { Plus, RotateCw, Wand2 } from "lucide-react";

import { materialDropdownOptions, materialEngineeringNote, type MaterialDropdownOption } from "../lib/material-presets.ts";
import { supportSystemHint } from "../lib/support-vocabulary.ts";
import type { Material } from "../types/material.ts";
import { DropdownSelect } from "./ui/DropdownSelect";
import { WorkbenchModelBasicSection } from "./WorkbenchModelBasicSection";

interface FrameBasicSectionProps {
  materialId: string;
  materialLibrary: Material[];
  materialOptions?: MaterialDropdownOption[];
  memberElasticitySummary: string;
  nodeCount: number;
  memberCount: number;
  supportCount: number;
  loadCount: number;
  modelWarnings: string[];
  onResetToPortal: () => void;
  onCompleteAxisMembers: () => void;
  onAddNode: () => void;
  onMaterialChange: (nextMaterialId: string) => void;
}

export function FrameBasicSection({
  materialId,
  materialLibrary,
  materialOptions = materialDropdownOptions(materialLibrary),
  memberElasticitySummary,
  nodeCount,
  memberCount,
  supportCount,
  loadCount,
  modelWarnings,
  onResetToPortal,
  onCompleteAxisMembers,
  onAddNode,
  onMaterialChange,
}: FrameBasicSectionProps) {
  const formLabelClass = "text-[10px] font-black tracking-widest text-muted-foreground";

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
          value: `${materialId.toUpperCase()} 用于项目材料说明和新增构件 E 回填；实际刚度按各构件 E / A / I 输入参与整体刚度矩阵。`,
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
      controls={
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <label className={formLabelClass}>默认材料编号（新增构件 E）</label>
            <DropdownSelect
              value={materialId}
              onChange={onMaterialChange}
              options={materialOptions}
              className="h-10 text-xs font-mono"
              menuClassName="text-xs font-mono"
              ariaLabel="框架默认材料编号（新增构件 E）"
            />
            <div className="text-[10px] font-semibold leading-relaxed text-muted-foreground">
              {materialEngineeringNote(materialId, materialLibrary)} 已有构件不会被静默改写；需要统一材料时，在“对象”或“表格”页批量检查构件 E。
            </div>
          </div>
        </div>
      }
    />
  );
}
