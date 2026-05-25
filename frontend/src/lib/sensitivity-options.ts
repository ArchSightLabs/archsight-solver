import type { SensitivityResponseOption } from "../types/beam";
import type { AnalysisMode } from "../types/structure";

export const BEAM_SENSITIVITY_OPTIONS: SensitivityResponseOption[] = [
  { value: "max_deflection", label: "最大挠度" },
  { value: "max_moment", label: "最大弯矩" },
  { value: "max_shear", label: "最大剪力" },
];

export const FRAME_SENSITIVITY_OPTIONS: SensitivityResponseOption[] = [
  { value: "max_ux", label: "最大水平位移" },
  { value: "max_uy", label: "最大竖向位移" },
  { value: "max_member_moment", label: "最大构件弯矩" },
];

export const TRUSS_SENSITIVITY_OPTIONS: SensitivityResponseOption[] = [
  { value: "max_node_displacement", label: "最大节点位移" },
  { value: "max_member_axial", label: "最大杆件轴力" },
  { value: "max_member_stress", label: "最大杆件轴应力" },
];

export function sensitivityOptionsForMode(mode: AnalysisMode): SensitivityResponseOption[] {
  if (mode === "frame") return FRAME_SENSITIVITY_OPTIONS;
  if (mode === "truss") return TRUSS_SENSITIVITY_OPTIONS;
  return BEAM_SENSITIVITY_OPTIONS;
}

export function defaultSensitivityMetricForMode(mode: AnalysisMode): string {
  return sensitivityOptionsForMode(mode)[0]?.value ?? "max_deflection";
}
