import type { BeamCalculationResults } from "../types/beam";
import type { FrameCalculationResults, TrussCalculationResults } from "../types/structure";
import { formatEngineeringValue, formatLimitRatio, formatUtilizationPercent } from "../lib/engineering-format.ts";
import { modelObjectMemberTerm } from "../lib/model-object-vocabulary.ts";
import { summaryMetricLabel } from "../lib/result-metrics.ts";

export type SummaryRow = {
  label: string;
  value: string;
  detail?: string;
};

export type DataCurveOption = {
  id: string;
  title: string;
  unit: string;
  yLabel: string;
  color: string;
  xData: number[];
  yData: number[];
  xLabels?: string[];
  xAxisLabel?: string;
  tooltipXLabel?: string;
  valueScale?: number;
};

export function beamDataCurveOptions(results: BeamCalculationResults): DataCurveOption[] {
  return [
    {
      id: "deflection",
      title: "挠度曲线",
      unit: "mm",
      yLabel: "挠度（mm）",
      color: "#0ea5e9",
      xData: results.x_data,
      yData: results.v_data,
      tooltipXLabel: "位置",
      xAxisLabel: "m",
      valueScale: 1000,
    },
    {
      id: "moment",
      title: "弯矩曲线",
      unit: "kN·m",
      yLabel: "弯矩（kN·m）",
      color: "#16a34a",
      xData: results.x_data,
      yData: results.moment_data,
      tooltipXLabel: "位置",
      xAxisLabel: "m",
      valueScale: 1,
    },
    {
      id: "shear",
      title: "剪力曲线",
      unit: "kN",
      yLabel: "剪力（kN）",
      color: "#f59e0b",
      xData: results.x_data,
      yData: results.shear_data,
      tooltipXLabel: "位置",
      xAxisLabel: "m",
      valueScale: 1,
    },
  ];
}

export function trussDataCurveOptions(results: TrussCalculationResults): DataCurveOption[] {
  const memberTerm = modelObjectMemberTerm("truss");
  const nodeX = results.nodeIds.map((_, index) => index + 1);
  const memberX = results.memberIds.map((_, index) => index + 1);
  return [
    {
      id: "ux",
      title: "节点 X 向位移曲线",
      unit: "mm",
      yLabel: "X 向位移（mm）",
      color: "#22c55e",
      xData: nodeX,
      xLabels: results.nodeIds,
      yData: results.ux_data,
      xAxisLabel: "",
      tooltipXLabel: "节点",
      valueScale: 1,
    },
    {
      id: "uy",
      title: "节点 Y 向位移曲线",
      unit: "mm",
      yLabel: "Y 向位移（mm）",
      color: "#0ea5e9",
      xData: nodeX,
      xLabels: results.nodeIds,
      yData: results.uy_data,
      xAxisLabel: "",
      tooltipXLabel: "节点",
      valueScale: 1,
    },
    {
      id: "axial",
      title: `${memberTerm}轴力曲线`,
      unit: "kN",
      yLabel: `${memberTerm}轴力（kN）`,
      color: "#f59e0b",
      xData: memberX,
      xLabels: results.memberIds,
      yData: results.member_axial_data.map((item) => item.axialForceKn),
      xAxisLabel: "",
      tooltipXLabel: memberTerm,
      valueScale: 1,
    },
  ];
}

export function frameDataCurveOptions(results: FrameCalculationResults): DataCurveOption[] {
  const nodeX = results.nodeIds.map((_, index) => index + 1);
  return [
    {
      id: "ux",
      title: "节点 X 向位移曲线",
      unit: "mm",
      yLabel: "X 向位移（mm）",
      color: "#22c55e",
      xData: nodeX,
      xLabels: results.nodeIds,
      yData: results.ux_data,
      xAxisLabel: "",
      tooltipXLabel: "节点",
      valueScale: 1,
    },
    {
      id: "uy",
      title: "节点 Y 向位移曲线",
      unit: "mm",
      yLabel: "Y 向位移（mm）",
      color: "#0ea5e9",
      xData: nodeX,
      xLabels: results.nodeIds,
      yData: results.uy_data,
      xAxisLabel: "",
      tooltipXLabel: "节点",
      valueScale: 1,
    },
  ];
}

function frameControlMomentMemberId(results: FrameCalculationResults): string | null {
  const control = results.memberResults.reduce<{ memberId: string; value: number } | null>((current, member) => {
    const value = member.maxAbsMomentKnM ?? Math.max(Math.abs(member.momentStartKnM), Math.abs(member.momentEndKnM));
    if (!current || value > current.value) return { memberId: member.memberId, value };
    return current;
  }, null);
  return control?.memberId ?? null;
}

function formatCompactLimitRatio(value: number | null | undefined) {
  return formatLimitRatio(value).replace(/^限值\s+/u, "");
}

export function beamSummaryRows(results: BeamCalculationResults): SummaryRow[] {
  return [
    {
      label: summaryMetricLabel("beam", "allowable_deflection", "允许挠度"),
      value: formatEngineeringValue(results.summary?.allowableMm, "mm"),
      detail: `${formatCompactLimitRatio(results.summary?.allowableRatio)} · ${formatUtilizationPercent(results.summary?.maxDeflectionMm, results.summary?.allowableMm)} · ${results.summary?.statusCode ?? "PENDING"}`,
    },
    {
      label: summaryMetricLabel("beam", "max_deflection", "最大挠度"),
      value: formatEngineeringValue(results.summary?.maxDeflectionMm, "mm"),
      detail: `x=${formatEngineeringValue(results.summary?.maxDeflectionPositionM, "m")}`,
    },
    {
      label: summaryMetricLabel("beam", "span_count", "跨段数量"),
      value: `${results.payload?.spans.length ?? 0} 跨`,
      detail: results.beam?.beamTypeLabel ?? "参数化梁系",
    },
    {
      label: summaryMetricLabel("beam", "calculation_status", "计算结论"),
      value: results.summary?.status ?? "待计算",
      detail: "梁单元",
    },
  ];
}

export function trussSummaryRows(results: TrussCalculationResults): SummaryRow[] {
  const memberTerm = modelObjectMemberTerm("truss");
  return [
    {
      label: summaryMetricLabel("truss", "allowable_displacement", "允许位移"),
      value: formatEngineeringValue(results.summary.allowableMm, "mm"),
      detail: `${formatCompactLimitRatio(results.summary.allowableRatio)} · ${formatUtilizationPercent(results.summary.maxDisplacementMm, results.summary.allowableMm)} · ${results.summary.statusCode}`,
    },
    {
      label: summaryMetricLabel("truss", "max_node_displacement", "最大节点位移"),
      value: formatEngineeringValue(results.summary.maxDisplacementMm, "mm"),
      detail: `节点 ${results.summary.maxDisplacementNodeId ?? "—"}`,
    },
    {
      label: summaryMetricLabel("truss", "max_member_axial", `最大${memberTerm}轴力`),
      value: formatEngineeringValue(results.summary.maxAxialForceKn, "kN"),
      detail: `${memberTerm} ${results.summary.maxAxialForceMemberId ?? "—"}`,
    },
    {
      label: summaryMetricLabel("truss", "calculation_status", "计算结论"),
      value: results.summary.status,
      detail: "桁架杆单元",
    },
  ];
}

export function frameSummaryRows(results: FrameCalculationResults): SummaryRow[] {
  const memberTerm = modelObjectMemberTerm("frame");
  const controlMomentMemberId = frameControlMomentMemberId(results);
  return [
    {
      label: summaryMetricLabel("frame", "allowable_displacement", "允许位移"),
      value: formatEngineeringValue(results.summary.allowableMm, "mm"),
      detail: `节点 ${results.summary.maxDisplacementNodeId ?? "—"} · ${results.summary.statusCode}`,
    },
    {
      label: summaryMetricLabel("frame", "max_node_displacement", "最大节点位移"),
      value: formatEngineeringValue(results.summary.maxDisplacementMm, "mm"),
      detail: `竖向 ${formatEngineeringValue(results.summary.maxVerticalMm, "mm")}`,
    },
    {
      label: summaryMetricLabel("frame", "max_member_moment", `最大${memberTerm}弯矩`),
      value: formatEngineeringValue(results.summary.maxMomentKnM, "kN·m"),
      detail: `${memberTerm} ${controlMomentMemberId ?? "—"}`,
    },
    {
      label: summaryMetricLabel("frame", "calculation_status", "计算结论"),
      value: results.summary.status,
      detail: "平面框架杆单元",
    },
  ];
}
