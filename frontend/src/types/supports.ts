export const BEAM_SUPPORT_TYPE_VALUES = ["pinned", "roller", "fixed", "free"] as const;
export const FRAME_SUPPORT_TYPE_VALUES = ["fixed", "pinned", "roller", "free"] as const;
export const TRUSS_SUPPORT_TYPE_VALUES = ["pinned", "roller", "free"] as const;

export const BEAM_SUPPORT_DOF_VALUES = ["v", "rz"] as const;
export const FRAME_SUPPORT_DOF_VALUES = ["ux", "uy", "rz"] as const;
export const TRUSS_SUPPORT_DOF_VALUES = ["ux", "uy"] as const;

export type BeamSupportType = (typeof BEAM_SUPPORT_TYPE_VALUES)[number];
export type FrameSupportType = (typeof FRAME_SUPPORT_TYPE_VALUES)[number];
export type TrussSupportType = (typeof TRUSS_SUPPORT_TYPE_VALUES)[number];

export type BeamSupportDof = (typeof BEAM_SUPPORT_DOF_VALUES)[number];
export type FrameSupportDof = (typeof FRAME_SUPPORT_DOF_VALUES)[number];
export type TrussSupportDof = (typeof TRUSS_SUPPORT_DOF_VALUES)[number];

export type SupportType = FrameSupportType;
