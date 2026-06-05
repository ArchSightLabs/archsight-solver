import type { BeamWorkspaceState } from "../types/beam.ts";
import { PREDEFINED_MATERIALS } from "../types/material.ts";
import type { FrameLoad, FrameWorkspaceState, StructureMember, StructureNode, TrussLoad, TrussMember, TrussNode, TrussWorkspaceState } from "../types/structure.ts";
import templateBenchmarkMap from "../../../data/verification/template_benchmark_map.json" with { type: "json" };
import { modelObjectMemberTerm } from "./model-object-vocabulary.ts";

export interface TemplateValidationRef {
  caseId: string;
  relation: "对应" | "相近" | "相关";
  note: string;
}

export interface BeamModelTemplate {
  id: string;
  title: string;
  description: string;
  tags: string[];
  validationRefs: TemplateValidationRef[];
  state: Omit<BeamWorkspaceState, "compareEnabled" | "scenarios" | "materials" | "customLoadCases" | "customLoadCombinations">;
}

export interface FrameModelTemplate {
  id: string;
  title: string;
  description: string;
  tags: string[];
  validationRefs: TemplateValidationRef[];
  nodes: StructureNode[];
  members: StructureMember[];
  loads: FrameLoad[];
}

export interface TrussModelTemplate {
  id: string;
  title: string;
  description: string;
  tags: string[];
  validationRefs: TemplateValidationRef[];
  nodes: TrussNode[];
  members: TrussMember[];
  loads: TrussLoad[];
}

type TemplateModule = "beam" | "frame" | "truss";
type RawBeamModelTemplate = Omit<BeamModelTemplate, "validationRefs">;
type RawFrameModelTemplate = Omit<FrameModelTemplate, "validationRefs">;
type RawTrussModelTemplate = Omit<TrussModelTemplate, "validationRefs">;

interface TemplateBenchmarkMap {
  templates: Array<{
    module: TemplateModule;
    templateId: string;
    validationRefs: TemplateValidationRef[];
  }>;
}

const TEMPLATE_BENCHMARK_MAP = templateBenchmarkMap as TemplateBenchmarkMap;
const FRAME_MEMBER_TERM = modelObjectMemberTerm("frame");
const TRUSS_MEMBER_TERM = modelObjectMemberTerm("truss");

function validationRefsForTemplate(module: TemplateModule, templateId: string): TemplateValidationRef[] {
  const mapping = TEMPLATE_BENCHMARK_MAP.templates.find((item) => item.module === module && item.templateId === templateId);
  if (!mapping) {
    throw new Error(`模板 ${module}:${templateId} 缺少公开验证集映射。`);
  }
  return mapping.validationRefs.map((ref) => ({ ...ref }));
}

function withValidationRefs<TTemplate extends { id: string }, TResult extends TTemplate & { validationRefs: TemplateValidationRef[] }>(
  module: TemplateModule,
  templates: TTemplate[],
): TResult[] {
  return templates.map((template) => ({
    ...template,
    validationRefs: validationRefsForTemplate(module, template.id),
  })) as TResult[];
}

function cloneFrameNodes(nodes: StructureNode[]): StructureNode[] {
  return nodes.map((node) => ({
    ...node,
    condensedDofs: node.condensedDofs ? [...node.condensedDofs] : undefined,
    springs: node.springs?.map((spring) => ({ ...spring })),
    supportDisplacements: node.supportDisplacements?.map((displacement) => ({ ...displacement })),
  }));
}

function cloneFrameMembers(members: StructureMember[]): StructureMember[] {
  return members.map((member) => ({
    ...member,
    endReleases: member.endReleases
      ? {
          start: member.endReleases.start ? [...member.endReleases.start] : undefined,
          end: member.endReleases.end ? [...member.endReleases.end] : undefined,
        }
      : undefined,
    internalHinges: member.internalHinges?.map((hinge) => ({ ...hinge })),
  }));
}

function cloneFrameLoads(loads: FrameLoad[]): FrameLoad[] {
  return loads.map((load) => ({ ...load })) as FrameLoad[];
}

function cloneTrussNodes(nodes: TrussNode[]): TrussNode[] {
  return nodes.map((node) => ({ ...node }));
}

function cloneTrussMembers(members: TrussMember[]): TrussMember[] {
  return members.map((member) => ({ ...member }));
}

function cloneTrussLoads(loads: TrussLoad[]): TrussLoad[] {
  return loads.map((load) => ({ ...load })) as TrussLoad[];
}

export const BEAM_MODEL_TEMPLATES: BeamModelTemplate[] = withValidationRefs<RawBeamModelTemplate, BeamModelTemplate>("beam", [
  {
    id: "simple-span-uniform",
    title: "简支梁均布荷载",
    description: "单跨简支梁承受全跨均布荷载，适合校核跨中挠度与支座反力。",
    tags: ["简支梁", "均布荷载", "单跨"],
    state: {
      projectName: "简支梁均布荷载",
      materialId: "q345",
      beamType: "simply_supported",
      loadType: "uniform",
      uniformLoadEnabled: true,
      linearLoadEnabled: false,
      linearLoads: [],
      pointLoads: [],
      q: 12,
      uniformLoadStartRatio: 0,
      uniformLoadEndRatio: 1,
      pointLoad: 40,
      pointLoadPositionRatio: 0.5,
      distributedLoadStart: 8,
      distributedLoadEnd: 14,
      distributedLoadStartRatio: 0,
      distributedLoadEndRatio: 1,
      freq: 1.2,
      duration: 5,
      spans: [{ id: "(1)", length: 6, E: 210, I: 8000 }],
      supports: [
        { id: "S1", x: 0, type: "pinned" },
        { id: "S2", x: 6, type: "roller" },
      ],
    },
  },
  {
    id: "simple-span-center-point",
    title: "简支梁跨中集中荷载",
    description: "单跨简支梁跨中集中力，适合复核跨中挠度、剪力突变与两端反力。",
    tags: ["简支梁", "集中荷载", "单跨"],
    state: {
      projectName: "简支梁跨中集中荷载",
      materialId: "q235",
      beamType: "simply_supported",
      loadType: "point",
      uniformLoadEnabled: false,
      linearLoadEnabled: false,
      linearLoads: [],
      pointLoads: [{ id: "P1", magnitudeKn: 80, positionRatio: 0.5 }],
      q: 10,
      uniformLoadStartRatio: 0,
      uniformLoadEndRatio: 1,
      pointLoad: 80,
      pointLoadPositionRatio: 0.5,
      distributedLoadStart: 8,
      distributedLoadEnd: 14,
      distributedLoadStartRatio: 0,
      distributedLoadEndRatio: 1,
      freq: 1.2,
      duration: 5,
      spans: [{ id: "(1)", length: 6, E: 206, I: 20000 }],
      supports: [
        { id: "S1", x: 0, type: "pinned" },
        { id: "S2", x: 6, type: "roller" },
      ],
    },
  },
  {
    id: "cantilever-uniform",
    title: "悬臂梁均布荷载",
    description: "左端固结、全跨均布荷载，适合复核自由端挠度与固定端弯矩。",
    tags: ["悬臂梁", "均布荷载", "单跨"],
    state: {
      projectName: "悬臂梁均布荷载",
      materialId: "q235",
      beamType: "cantilever",
      loadType: "uniform",
      uniformLoadEnabled: true,
      linearLoadEnabled: false,
      linearLoads: [],
      pointLoads: [],
      q: 10,
      uniformLoadStartRatio: 0,
      uniformLoadEndRatio: 1,
      pointLoad: 30,
      pointLoadPositionRatio: 1,
      distributedLoadStart: 0,
      distributedLoadEnd: 0,
      distributedLoadStartRatio: 0,
      distributedLoadEndRatio: 1,
      freq: 1.2,
      duration: 5,
      spans: [{ id: "(1)", length: 5, E: 206, I: 6200 }],
      supports: [{ id: "S1", x: 0, type: "fixed" }],
    },
  },
  {
    id: "cantilever-tip-load",
    title: "悬臂梁自由端集中力",
    description: "左端固结、自由端集中荷载，适合验证悬臂梁端位移与固定端弯矩。",
    tags: ["悬臂梁", "集中荷载", "位移"],
    state: {
      projectName: "悬臂梁自由端集中力",
      materialId: "q235",
      beamType: "cantilever",
      loadType: "point",
      uniformLoadEnabled: false,
      linearLoadEnabled: false,
      linearLoads: [],
      pointLoads: [{ id: "P1", magnitudeKn: 35, positionRatio: 1 }],
      q: 8,
      uniformLoadStartRatio: 0,
      uniformLoadEndRatio: 1,
      pointLoad: 35,
      pointLoadPositionRatio: 1,
      distributedLoadStart: 0,
      distributedLoadEnd: 0,
      distributedLoadStartRatio: 0,
      distributedLoadEndRatio: 1,
      freq: 1.2,
      duration: 5,
      spans: [{ id: "(1)", length: 4, E: 206, I: 5200 }],
      supports: [{ id: "S1", x: 0, type: "fixed" }],
    },
  },
  {
    id: "two-span-continuous",
    title: "两跨连续梁均布荷载",
    description: "两跨等截面连续梁承受均布荷载，适合复核中间支座负弯矩。",
    tags: ["连续梁", "两跨", "均布荷载"],
    state: {
      projectName: "两跨连续梁均布荷载",
      materialId: "q345",
      beamType: "continuous",
      loadType: "uniform",
      uniformLoadEnabled: true,
      linearLoadEnabled: false,
      linearLoads: [],
      pointLoads: [],
      q: 16,
      uniformLoadStartRatio: 0,
      uniformLoadEndRatio: 1,
      pointLoad: 50,
      pointLoadPositionRatio: 0.5,
      distributedLoadStart: 10,
      distributedLoadEnd: 18,
      distributedLoadStartRatio: 0,
      distributedLoadEndRatio: 1,
      freq: 1.2,
      duration: 5,
      spans: [
        { id: "(1)", length: 5, E: 210, I: 9000 },
        { id: "(2)", length: 5, E: 210, I: 9000 },
      ],
      supports: [
        { id: "S1", x: 0, type: "pinned" },
        { id: "S2", x: 5, type: "pinned" },
        { id: "S3", x: 10, type: "roller" },
      ],
    },
  },
  {
    id: "three-span-continuous-uniform",
    title: "三跨连续梁均布荷载",
    description: "三跨连续梁承受全跨均布荷载，适合复核多内支座连续梁变形与支座反力。",
    tags: ["连续梁", "三跨", "均布荷载"],
    state: {
      projectName: "三跨连续梁均布荷载",
      materialId: "q345",
      beamType: "continuous",
      loadType: "uniform",
      uniformLoadEnabled: true,
      linearLoadEnabled: false,
      linearLoads: [],
      pointLoads: [],
      q: 12,
      uniformLoadStartRatio: 0,
      uniformLoadEndRatio: 1,
      pointLoad: 45,
      pointLoadPositionRatio: 0.5,
      distributedLoadStart: 8,
      distributedLoadEnd: 14,
      distributedLoadStartRatio: 0,
      distributedLoadEndRatio: 1,
      freq: 1.2,
      duration: 5,
      spans: [
        { id: "(1)", length: 4, E: 210, I: 8500 },
        { id: "(2)", length: 4, E: 210, I: 8500 },
        { id: "(3)", length: 4, E: 210, I: 8500 },
      ],
      supports: [
        { id: "S1", x: 0, type: "pinned" },
        { id: "S2", x: 4, type: "pinned" },
        { id: "S3", x: 8, type: "pinned" },
        { id: "S4", x: 12, type: "roller" },
      ],
    },
  },
  {
    id: "three-span-linear",
    title: "三跨连续梁线性分布荷载",
    description: "三跨连续梁局部线性分布荷载，适合观察荷载范围变化对变形响应的影响。",
    tags: ["连续梁", "三跨", "线性分布"],
    state: {
      projectName: "三跨连续梁线性分布荷载",
      materialId: "c40",
      beamType: "continuous",
      loadType: "linear",
      uniformLoadEnabled: false,
      linearLoadEnabled: true,
      linearLoads: [{ id: "L1", qStartKnPerM: 6, qEndKnPerM: 18, startRatio: 0.15, endRatio: 0.85 }],
      pointLoads: [],
      q: 10,
      uniformLoadStartRatio: 0,
      uniformLoadEndRatio: 1,
      pointLoad: 45,
      pointLoadPositionRatio: 0.5,
      distributedLoadStart: 6,
      distributedLoadEnd: 18,
      distributedLoadStartRatio: 0.15,
      distributedLoadEndRatio: 0.85,
      freq: 1.2,
      duration: 5,
      spans: [
        { id: "(1)", length: 4, E: 32.5, I: 12000 },
        { id: "(2)", length: 5, E: 32.5, I: 14000 },
        { id: "(3)", length: 4, E: 32.5, I: 12000 },
      ],
      supports: [
        { id: "S1", x: 0, type: "pinned" },
        { id: "S2", x: 4, type: "pinned" },
        { id: "S3", x: 9, type: "pinned" },
        { id: "S4", x: 13, type: "roller" },
      ],
    },
  },
  {
    id: "unequal-span-continuous-point",
    title: "不等跨连续梁集中荷载",
    description: "三跨不等跨连续梁承受集中荷载，适合观察非对称跨长下的峰值位置与支座反力。",
    tags: ["连续梁", "不等跨", "集中荷载"],
    state: {
      projectName: "不等跨连续梁集中荷载",
      materialId: "q235",
      beamType: "continuous",
      loadType: "point",
      uniformLoadEnabled: false,
      linearLoadEnabled: false,
      linearLoads: [],
      pointLoads: [{ id: "P1", magnitudeKn: 45, positionRatio: 0.44 }],
      q: 10,
      uniformLoadStartRatio: 0,
      uniformLoadEndRatio: 1,
      pointLoad: 45,
      pointLoadPositionRatio: 0.44,
      distributedLoadStart: 8,
      distributedLoadEnd: 14,
      distributedLoadStartRatio: 0,
      distributedLoadEndRatio: 1,
      freq: 1.2,
      duration: 5,
      spans: [
        { id: "(1)", length: 3.5, E: 206, I: 6500 },
        { id: "(2)", length: 5, E: 206, I: 6500 },
        { id: "(3)", length: 4, E: 206, I: 6500 },
      ],
      supports: [
        { id: "S1", x: 0, type: "pinned" },
        { id: "S2", x: 3.5, type: "pinned" },
        { id: "S3", x: 8.5, type: "pinned" },
        { id: "S4", x: 12.5, type: "roller" },
      ],
    },
  },
  {
    id: "fixed-fixed-uniform",
    title: "两端固结均布荷载",
    description: "两端固结的单跨梁，承受全跨均布荷载，适合复核超静定梁端部弯矩与跨中挠度。",
    tags: ["固端梁", "均布荷载", "超静定"],
    state: {
      projectName: "两端固结均布荷载",
      materialId: "q235",
      beamType: "continuous",
      loadType: "uniform",
      uniformLoadEnabled: true,
      linearLoadEnabled: false,
      linearLoads: [],
      pointLoads: [],
      q: 15,
      uniformLoadStartRatio: 0,
      uniformLoadEndRatio: 1,
      pointLoad: 40,
      pointLoadPositionRatio: 0.5,
      distributedLoadStart: 8,
      distributedLoadEnd: 14,
      distributedLoadStartRatio: 0,
      distributedLoadEndRatio: 1,
      freq: 1.2,
      duration: 5,
      spans: [{ id: "(1)", length: 6, E: 206, I: 10000 }],
      supports: [
        { id: "S1", x: 0, type: "fixed" },
        { id: "S2", x: 6, type: "fixed" },
      ],
    },
  },
  {
    id: "propped-cantilever-point",
    title: "一端固结一端简支",
    description: "左端固结、右端简支，承受跨中集中荷载，典型的一阶超静定结构。",
    tags: ["超静定", "集中荷载", "单跨"],
    state: {
      projectName: "一端固结一端简支",
      materialId: "q235",
      beamType: "continuous",
      loadType: "point",
      uniformLoadEnabled: false,
      linearLoadEnabled: false,
      linearLoads: [],
      pointLoads: [{ id: "P1", magnitudeKn: 50, positionRatio: 0.5 }],
      q: 10,
      uniformLoadStartRatio: 0,
      uniformLoadEndRatio: 1,
      pointLoad: 50,
      pointLoadPositionRatio: 0.5,
      distributedLoadStart: 8,
      distributedLoadEnd: 14,
      distributedLoadStartRatio: 0,
      distributedLoadEndRatio: 1,
      freq: 1.2,
      duration: 5,
      spans: [{ id: "(1)", length: 5, E: 206, I: 8000 }],
      supports: [
        { id: "S1", x: 0, type: "fixed" },
        { id: "S2", x: 5, type: "roller" },
      ],
    },
  },
]);

export const FRAME_MODEL_TEMPLATES: FrameModelTemplate[] = withValidationRefs<RawFrameModelTemplate, FrameModelTemplate>("frame", [
  {
    id: "portal-single-bay",
    title: "单跨单层刚架",
    description: "固定柱脚、梁面均布荷载和右上节点竖向荷载，适合门式刚架起算。",
    tags: ["刚架", "单跨", "均布荷载"],
    nodes: [
      { id: "N1", x: 0, y: 0, supportType: "fixed" },
      { id: "N2", x: 6, y: 0, supportType: "fixed" },
      { id: "N3", x: 0, y: 4, supportType: "free" },
      { id: "N4", x: 6, y: 4, supportType: "free" },
    ],
    members: [
      { id: "C1", start: "N1", end: "N3", elementType: "frame", E_GPa: 210, A_cm2: 240, I_cm4: 12000, kind: "column" },
      { id: "B1", start: "N3", end: "N4", elementType: "frame", E_GPa: 210, A_cm2: 220, I_cm4: 15000, kind: "beam" },
      { id: "C2", start: "N2", end: "N4", elementType: "frame", E_GPa: 210, A_cm2: 240, I_cm4: 12000, kind: "column" },
    ],
    loads: [
      { type: "distributed", member: "B1", direction: "global_y", qStartKnPerM: -18, qEndKnPerM: -18 },
      { type: "nodal", node: "N4", fxKn: 0, fyKn: -24, mzKnM: 0 },
    ],
  },
  {
    id: "portal-rotational-spring",
    title: "弹性柱脚门式刚架",
    description: "柱脚采用竖向与水平约束、转动弹簧释放的半刚性边界，适合观察柱脚转动刚度对侧移和弯矩的影响。",
    tags: ["门式刚架", "弹性柱脚", "半刚性"],
    nodes: [
      { id: "N1", x: 0, y: 0, supportType: "pinned", springs: [{ dof: "rz", stiffnessKnMPerRad: 50000 }] },
      { id: "N2", x: 4, y: 0, supportType: "pinned", springs: [{ dof: "rz", stiffnessKnMPerRad: 50000 }] },
      { id: "N3", x: 0, y: 3, supportType: "free" },
      { id: "N4", x: 4, y: 3, supportType: "free" },
    ],
    members: [
      { id: "C1", start: "N1", end: "N3", elementType: "frame", E_GPa: 210, A_cm2: 240, I_cm4: 12000, kind: "column" },
      { id: "B1", start: "N3", end: "N4", elementType: "frame", E_GPa: 210, A_cm2: 220, I_cm4: 15000, kind: "beam" },
      { id: "C2", start: "N2", end: "N4", elementType: "frame", E_GPa: 210, A_cm2: 240, I_cm4: 12000, kind: "column" },
    ],
    loads: [
      { type: "distributed", member: "B1", direction: "local_y", qStartKnPerM: -10, qEndKnPerM: -10 },
      { type: "nodal", node: "N4", fxKn: 18, fyKn: 0, mzKnM: 0 },
    ],
  },
  {
    id: "frame-two-bay",
    title: "两跨单层框架",
    description: "三榀柱、两跨梁，适合连续梁柱体系和跨中荷载校核。",
    tags: ["框架", "两跨", "连续梁"],
    nodes: [
      { id: "N1", x: 0, y: 0, supportType: "fixed" },
      { id: "N2", x: 5, y: 0, supportType: "fixed" },
      { id: "N3", x: 10, y: 0, supportType: "fixed" },
      { id: "N4", x: 0, y: 4, supportType: "free" },
      { id: "N5", x: 5, y: 4, supportType: "free" },
      { id: "N6", x: 10, y: 4, supportType: "free" },
    ],
    members: [
      { id: "C1", start: "N1", end: "N4", elementType: "frame", E_GPa: 210, A_cm2: 260, I_cm4: 13000, kind: "column" },
      { id: "C2", start: "N2", end: "N5", elementType: "frame", E_GPa: 210, A_cm2: 260, I_cm4: 13000, kind: "column" },
      { id: "C3", start: "N3", end: "N6", elementType: "frame", E_GPa: 210, A_cm2: 260, I_cm4: 13000, kind: "column" },
      { id: "B1", start: "N4", end: "N5", elementType: "frame", E_GPa: 210, A_cm2: 220, I_cm4: 15000, kind: "beam" },
      { id: "B2", start: "N5", end: "N6", elementType: "frame", E_GPa: 210, A_cm2: 220, I_cm4: 15000, kind: "beam" },
    ],
    loads: [
      { type: "distributed", member: "B1", direction: "global_y", qStartKnPerM: -16, qEndKnPerM: -16 },
      { type: "distributed", member: "B2", direction: "global_y", qStartKnPerM: -16, qEndKnPerM: -16 },
    ],
  },
  {
    id: "frame-two-story",
    title: "两层两跨框架",
    description: "两层两跨规则框架，适合节点水平位移与梁柱内力分布演示。",
    tags: ["框架", "两层", "侧向荷载"],
    nodes: [
      { id: "N1", x: 0, y: 0, supportType: "fixed" },
      { id: "N2", x: 5, y: 0, supportType: "fixed" },
      { id: "N3", x: 10, y: 0, supportType: "fixed" },
      { id: "N4", x: 0, y: 3.6, supportType: "free" },
      { id: "N5", x: 5, y: 3.6, supportType: "free" },
      { id: "N6", x: 10, y: 3.6, supportType: "free" },
      { id: "N7", x: 0, y: 7.2, supportType: "free" },
      { id: "N8", x: 5, y: 7.2, supportType: "free" },
      { id: "N9", x: 10, y: 7.2, supportType: "free" },
    ],
    members: [
      { id: "C1", start: "N1", end: "N4", elementType: "frame", E_GPa: 210, A_cm2: 280, I_cm4: 15000, kind: "column" },
      { id: "C2", start: "N2", end: "N5", elementType: "frame", E_GPa: 210, A_cm2: 280, I_cm4: 15000, kind: "column" },
      { id: "C3", start: "N3", end: "N6", elementType: "frame", E_GPa: 210, A_cm2: 280, I_cm4: 15000, kind: "column" },
      { id: "C4", start: "N4", end: "N7", elementType: "frame", E_GPa: 210, A_cm2: 240, I_cm4: 12000, kind: "column" },
      { id: "C5", start: "N5", end: "N8", elementType: "frame", E_GPa: 210, A_cm2: 240, I_cm4: 12000, kind: "column" },
      { id: "C6", start: "N6", end: "N9", elementType: "frame", E_GPa: 210, A_cm2: 240, I_cm4: 12000, kind: "column" },
      { id: "B1", start: "N4", end: "N5", elementType: "frame", E_GPa: 210, A_cm2: 220, I_cm4: 14000, kind: "beam" },
      { id: "B2", start: "N5", end: "N6", elementType: "frame", E_GPa: 210, A_cm2: 220, I_cm4: 14000, kind: "beam" },
      { id: "B3", start: "N7", end: "N8", elementType: "frame", E_GPa: 210, A_cm2: 200, I_cm4: 12000, kind: "beam" },
      { id: "B4", start: "N8", end: "N9", elementType: "frame", E_GPa: 210, A_cm2: 200, I_cm4: 12000, kind: "beam" },
    ],
    loads: [
      { type: "distributed", member: "B1", direction: "global_y", qStartKnPerM: -14, qEndKnPerM: -14 },
      { type: "distributed", member: "B2", direction: "global_y", qStartKnPerM: -14, qEndKnPerM: -14 },
      { type: "nodal", node: "N9", fxKn: 18, fyKn: 0, mzKnM: 0 },
    ],
  },
  {
    id: "braced-frame",
    title: "带斜撑框架",
    description: `单跨框架含交叉斜撑，用于比较斜撑${FRAME_MEMBER_TERM}对水平位移和${FRAME_MEMBER_TERM}轴力的影响。`,
    tags: ["斜撑", "抗侧", "轴力"],
    nodes: [
      { id: "N1", x: 0, y: 0, supportType: "fixed" },
      { id: "N2", x: 6, y: 0, supportType: "fixed" },
      { id: "N3", x: 0, y: 4, supportType: "free" },
      { id: "N4", x: 6, y: 4, supportType: "free" },
    ],
    members: [
      { id: "C1", start: "N1", end: "N3", elementType: "frame", E_GPa: 210, A_cm2: 240, I_cm4: 12000, kind: "column" },
      { id: "B1", start: "N3", end: "N4", elementType: "frame", E_GPa: 210, A_cm2: 220, I_cm4: 15000, kind: "beam" },
      { id: "C2", start: "N2", end: "N4", elementType: "frame", E_GPa: 210, A_cm2: 240, I_cm4: 12000, kind: "column" },
      { id: "BR1", start: "N1", end: "N4", elementType: "frame", E_GPa: 210, A_cm2: 80, I_cm4: 1200, kind: "brace", endReleases: { start: ["rz"], end: ["rz"] } },
      { id: "BR2", start: "N2", end: "N3", elementType: "frame", E_GPa: 210, A_cm2: 80, I_cm4: 1200, kind: "brace", endReleases: { start: ["rz"], end: ["rz"] } },
    ],
    loads: [
      { type: "distributed", member: "B1", direction: "global_y", qStartKnPerM: -12, qEndKnPerM: -12 },
      { type: "nodal", node: "N4", fxKn: 20, fyKn: 0, mzKnM: 0 },
    ],
  },
  {
    id: "inclined-member-local-load",
    title: "斜梁门式刚架局部荷载",
    description: "两根斜梁按构件局部坐标承受分布荷载，适合坡屋面或斜构件荷载转换校核。",
    tags: ["斜梁", "局部坐标", "分布荷载"],
    nodes: [
      { id: "N1", x: 0, y: 0, supportType: "fixed" },
      { id: "N2", x: 5, y: 0, supportType: "roller" },
      { id: "N3", x: 2.5, y: 3.5, supportType: "free" },
    ],
    members: [
      { id: "R1", start: "N1", end: "N3", elementType: "frame", E_GPa: 210, A_cm2: 220, I_cm4: 11000, kind: "rafter" },
      { id: "R2", start: "N3", end: "N2", elementType: "frame", E_GPa: 210, A_cm2: 220, I_cm4: 11000, kind: "rafter" },
    ],
    loads: [
      { type: "distributed", member: "R1", direction: "local_y", qStartKnPerM: -8, qEndKnPerM: -8 },
      { type: "distributed", member: "R2", direction: "local_y", qStartKnPerM: -8, qEndKnPerM: -8 },
    ],
  },
  {
    id: "frame-member-point-load",
    title: "框架梁构件内集中荷载",
    description: "门式刚架梁跨内施加集中荷载，并叠加水平节点荷载，适合校核构件内集中力转换与杆端力。",
    tags: ["构件荷载", "集中荷载", "刚架"],
    nodes: [
      { id: "N1", x: 0, y: 0, supportType: "fixed" },
      { id: "N2", x: 6, y: 0, supportType: "fixed" },
      { id: "N3", x: 0, y: 4, supportType: "free" },
      { id: "N4", x: 6, y: 4, supportType: "free" },
    ],
    members: [
      { id: "C1", start: "N1", end: "N3", elementType: "frame", E_GPa: 210, A_cm2: 240, I_cm4: 12000, kind: "column" },
      { id: "B1", start: "N3", end: "N4", elementType: "frame", E_GPa: 210, A_cm2: 220, I_cm4: 15000, kind: "beam" },
      { id: "C2", start: "N2", end: "N4", elementType: "frame", E_GPa: 210, A_cm2: 240, I_cm4: 12000, kind: "column" },
    ],
    loads: [
      { type: "member_point", member: "B1", direction: "local_y", forceKn: -35, positionRatio: 0.4 },
      { type: "nodal", node: "N4", fxKn: 16, fyKn: 0, mzKnM: 0 },
    ],
  },
  {
    id: "gable-frame",
    title: "坡屋面门式刚架",
    description: "带坡度的轻钢门式刚架，适合演示工业厂房屋面斜梁的受力特征。",
    tags: ["门式刚架", "坡屋面", "工业建筑"],
    nodes: [
      { id: "N1", x: 0, y: 0, supportType: "pinned" },
      { id: "N2", x: 12, y: 0, supportType: "pinned" },
      { id: "N3", x: 0, y: 5, supportType: "free" },
      { id: "N4", x: 6, y: 7, supportType: "free" },
      { id: "N5", x: 12, y: 5, supportType: "free" },
    ],
    members: [
      { id: "C1", start: "N1", end: "N3", elementType: "frame", E_GPa: 210, A_cm2: 300, I_cm4: 20000, kind: "column" },
      { id: "C2", start: "N2", end: "N5", elementType: "frame", E_GPa: 210, A_cm2: 300, I_cm4: 20000, kind: "column" },
      { id: "R1", start: "N3", end: "N4", elementType: "frame", E_GPa: 210, A_cm2: 250, I_cm4: 16000, kind: "rafter" },
      { id: "R2", start: "N4", end: "N5", elementType: "frame", E_GPa: 210, A_cm2: 250, I_cm4: 16000, kind: "rafter" },
    ],
    loads: [
      { type: "distributed", member: "R1", direction: "global_y", qStartKnPerM: -10, qEndKnPerM: -10 },
      { type: "distributed", member: "R2", direction: "global_y", qStartKnPerM: -10, qEndKnPerM: -10 },
    ],
  },
]);

export const TRUSS_MODEL_TEMPLATES: TrussModelTemplate[] = withValidationRefs<RawTrussModelTemplate, TrussModelTemplate>("truss", [
  {
    id: "simple-roof-truss",
    title: "简支三角屋架",
    description: "两端简支、上弦受竖向节点荷载，适合作为平面桁架基础案例。",
    tags: ["屋架", "简支", "节点荷载"],
    nodes: [
      { id: "N1", x: 0, y: 0, supportType: "pinned" },
      { id: "N2", x: 6, y: 0, supportType: "roller" },
      { id: "N3", x: 2, y: 3, supportType: "free" },
      { id: "N4", x: 4, y: 3, supportType: "free" },
    ],
    members: [
      { id: "M1", start: "N1", end: "N3", elementType: "truss", E_GPa: 210, A_cm2: 24, kind: "upper_chord" },
      { id: "M2", start: "N3", end: "N4", elementType: "truss", E_GPa: 210, A_cm2: 24, kind: "upper_chord" },
      { id: "M3", start: "N4", end: "N2", elementType: "truss", E_GPa: 210, A_cm2: 24, kind: "upper_chord" },
      { id: "M4", start: "N1", end: "N4", elementType: "truss", E_GPa: 210, A_cm2: 20, kind: "diagonal" },
      { id: "M5", start: "N3", end: "N2", elementType: "truss", E_GPa: 210, A_cm2: 20, kind: "diagonal" },
    ],
    loads: [
      { type: "nodal", node: "N3", fxKn: 0, fyKn: -50 },
      { type: "nodal", node: "N4", fxKn: 0, fyKn: -50 },
    ],
  },
  {
    id: "pratt-truss",
    title: "Pratt 桁架",
    description: "下弦连续、腹杆向跨中倾斜，适合桥式桁架轴力教学。",
    tags: ["Pratt", "桥式", "腹杆"],
    nodes: [
      { id: "N1", x: 0, y: 0, supportType: "pinned" },
      { id: "N2", x: 3, y: 0, supportType: "free" },
      { id: "N3", x: 6, y: 0, supportType: "free" },
      { id: "N4", x: 9, y: 0, supportType: "free" },
      { id: "N5", x: 12, y: 0, supportType: "roller" },
      { id: "N6", x: 3, y: 3, supportType: "free" },
      { id: "N7", x: 6, y: 3, supportType: "free" },
      { id: "N8", x: 9, y: 3, supportType: "free" },
    ],
    members: [
      { id: "L1", start: "N1", end: "N2", elementType: "truss", E_GPa: 210, A_cm2: 30, kind: "lower_chord" },
      { id: "L2", start: "N2", end: "N3", elementType: "truss", E_GPa: 210, A_cm2: 30, kind: "lower_chord" },
      { id: "L3", start: "N3", end: "N4", elementType: "truss", E_GPa: 210, A_cm2: 30, kind: "lower_chord" },
      { id: "L4", start: "N4", end: "N5", elementType: "truss", E_GPa: 210, A_cm2: 30, kind: "lower_chord" },
      { id: "U1", start: "N6", end: "N7", elementType: "truss", E_GPa: 210, A_cm2: 26, kind: "upper_chord" },
      { id: "U2", start: "N7", end: "N8", elementType: "truss", E_GPa: 210, A_cm2: 26, kind: "upper_chord" },
      { id: "V1", start: "N2", end: "N6", elementType: "truss", E_GPa: 210, A_cm2: 20, kind: "diagonal" },
      { id: "V2", start: "N3", end: "N7", elementType: "truss", E_GPa: 210, A_cm2: 20, kind: "diagonal" },
      { id: "V3", start: "N4", end: "N8", elementType: "truss", E_GPa: 210, A_cm2: 20, kind: "diagonal" },
      { id: "D1", start: "N1", end: "N6", elementType: "truss", E_GPa: 210, A_cm2: 18, kind: "diagonal" },
      { id: "D2", start: "N6", end: "N3", elementType: "truss", E_GPa: 210, A_cm2: 18, kind: "diagonal" },
      { id: "D3", start: "N3", end: "N8", elementType: "truss", E_GPa: 210, A_cm2: 18, kind: "diagonal" },
      { id: "D4", start: "N8", end: "N5", elementType: "truss", E_GPa: 210, A_cm2: 18, kind: "diagonal" },
    ],
    loads: [
      { type: "nodal", node: "N6", fxKn: 0, fyKn: -40 },
      { type: "nodal", node: "N7", fxKn: 0, fyKn: -60 },
      { type: "nodal", node: "N8", fxKn: 0, fyKn: -40 },
    ],
  },
  {
    id: "warren-truss",
    title: "Warren 桁架",
    description: `等距三角腹杆布置，适合比较拉压${TRUSS_MEMBER_TERM}交替分布。`,
    tags: ["Warren", "等距", "桥式"],
    nodes: [
      { id: "N1", x: 0, y: 0, supportType: "pinned" },
      { id: "N2", x: 4, y: 0, supportType: "free" },
      { id: "N3", x: 8, y: 0, supportType: "free" },
      { id: "N4", x: 12, y: 0, supportType: "roller" },
      { id: "N5", x: 2, y: 3, supportType: "free" },
      { id: "N6", x: 6, y: 3, supportType: "free" },
      { id: "N7", x: 10, y: 3, supportType: "free" },
    ],
    members: [
      { id: "L1", start: "N1", end: "N2", elementType: "truss", E_GPa: 210, A_cm2: 28, kind: "lower_chord" },
      { id: "L2", start: "N2", end: "N3", elementType: "truss", E_GPa: 210, A_cm2: 28, kind: "lower_chord" },
      { id: "L3", start: "N3", end: "N4", elementType: "truss", E_GPa: 210, A_cm2: 28, kind: "lower_chord" },
      { id: "U1", start: "N5", end: "N6", elementType: "truss", E_GPa: 210, A_cm2: 24, kind: "upper_chord" },
      { id: "U2", start: "N6", end: "N7", elementType: "truss", E_GPa: 210, A_cm2: 24, kind: "upper_chord" },
      { id: "D1", start: "N1", end: "N5", elementType: "truss", E_GPa: 210, A_cm2: 18, kind: "diagonal" },
      { id: "D2", start: "N5", end: "N2", elementType: "truss", E_GPa: 210, A_cm2: 18, kind: "diagonal" },
      { id: "D3", start: "N2", end: "N6", elementType: "truss", E_GPa: 210, A_cm2: 18, kind: "diagonal" },
      { id: "D4", start: "N6", end: "N3", elementType: "truss", E_GPa: 210, A_cm2: 18, kind: "diagonal" },
      { id: "D5", start: "N3", end: "N7", elementType: "truss", E_GPa: 210, A_cm2: 18, kind: "diagonal" },
      { id: "D6", start: "N7", end: "N4", elementType: "truss", E_GPa: 210, A_cm2: 18, kind: "diagonal" },
    ],
    loads: [
      { type: "nodal", node: "N5", fxKn: 0, fyKn: -35 },
      { type: "nodal", node: "N6", fxKn: 0, fyKn: -50 },
      { type: "nodal", node: "N7", fxKn: 0, fyKn: -35 },
    ],
  },
  {
    id: "howe-roof-truss",
    title: "Howe 型屋架",
    description: "竖杆配合反向斜腹杆布置，适合与 Pratt 型屋架比较腹杆拉压分布。",
    tags: ["Howe", "屋架", "腹杆"],
    nodes: [
      { id: "N1", x: 0, y: 0, supportType: "pinned" },
      { id: "N2", x: 4, y: 0, supportType: "free" },
      { id: "N3", x: 8, y: 0, supportType: "free" },
      { id: "N4", x: 12, y: 0, supportType: "roller" },
      { id: "N5", x: 2, y: 3, supportType: "free" },
      { id: "N6", x: 6, y: 4, supportType: "free" },
      { id: "N7", x: 10, y: 3, supportType: "free" },
    ],
    members: [
      { id: "L1", start: "N1", end: "N2", elementType: "truss", E_GPa: 210, A_cm2: 30, kind: "lower_chord" },
      { id: "L2", start: "N2", end: "N3", elementType: "truss", E_GPa: 210, A_cm2: 30, kind: "lower_chord" },
      { id: "L3", start: "N3", end: "N4", elementType: "truss", E_GPa: 210, A_cm2: 30, kind: "lower_chord" },
      { id: "U1", start: "N1", end: "N5", elementType: "truss", E_GPa: 210, A_cm2: 24, kind: "upper_chord" },
      { id: "U2", start: "N5", end: "N6", elementType: "truss", E_GPa: 210, A_cm2: 24, kind: "upper_chord" },
      { id: "U3", start: "N6", end: "N7", elementType: "truss", E_GPa: 210, A_cm2: 24, kind: "upper_chord" },
      { id: "U4", start: "N7", end: "N4", elementType: "truss", E_GPa: 210, A_cm2: 24, kind: "upper_chord" },
      { id: "V1", start: "N2", end: "N5", elementType: "truss", E_GPa: 210, A_cm2: 20, kind: "vertical" },
      { id: "V2", start: "N3", end: "N7", elementType: "truss", E_GPa: 210, A_cm2: 20, kind: "vertical" },
      { id: "D1", start: "N5", end: "N3", elementType: "truss", E_GPa: 210, A_cm2: 20, kind: "diagonal" },
      { id: "D2", start: "N2", end: "N6", elementType: "truss", E_GPa: 210, A_cm2: 20, kind: "diagonal" },
    ],
    loads: [
      { type: "nodal", node: "N5", fxKn: 0, fyKn: -25 },
      { type: "nodal", node: "N6", fxKn: 0, fyKn: -35 },
      { type: "nodal", node: "N7", fxKn: 0, fyKn: -25 },
    ],
  },
  {
    id: "cantilever-truss",
    title: "悬臂桁架",
    description: "左端双节点铰约束等效固定边界、右端节点竖向荷载，适合观察悬臂体系位移。",
    tags: ["悬臂", "位移", "支座反力"],
    nodes: [
      { id: "N1", x: 0, y: 0, supportType: "pinned" },
      { id: "N2", x: 0, y: 3, supportType: "pinned" },
      { id: "N3", x: 4, y: 0, supportType: "free" },
      { id: "N4", x: 4, y: 3, supportType: "free" },
      { id: "N5", x: 8, y: 0, supportType: "free" },
      { id: "N6", x: 8, y: 3, supportType: "free" },
    ],
    members: [
      { id: "L1", start: "N1", end: "N3", elementType: "truss", E_GPa: 210, A_cm2: 30, kind: "lower_chord" },
      { id: "L2", start: "N3", end: "N5", elementType: "truss", E_GPa: 210, A_cm2: 30, kind: "lower_chord" },
      { id: "U1", start: "N2", end: "N4", elementType: "truss", E_GPa: 210, A_cm2: 26, kind: "upper_chord" },
      { id: "U2", start: "N4", end: "N6", elementType: "truss", E_GPa: 210, A_cm2: 26, kind: "upper_chord" },
      { id: "V1", start: "N1", end: "N2", elementType: "truss", E_GPa: 210, A_cm2: 24, kind: "generic" },
      { id: "V2", start: "N3", end: "N4", elementType: "truss", E_GPa: 210, A_cm2: 24, kind: "generic" },
      { id: "V3", start: "N5", end: "N6", elementType: "truss", E_GPa: 210, A_cm2: 24, kind: "generic" },
      { id: "D1", start: "N2", end: "N3", elementType: "truss", E_GPa: 210, A_cm2: 18, kind: "diagonal" },
      { id: "D2", start: "N3", end: "N6", elementType: "truss", E_GPa: 210, A_cm2: 18, kind: "diagonal" },
    ],
    loads: [
      { type: "nodal", node: "N5", fxKn: 0, fyKn: -30 },
      { type: "nodal", node: "N6", fxKn: 0, fyKn: -30 },
    ],
  },
  {
    id: "parallel-chord-truss",
    title: "平行弦桁架",
    description: "上下弦平行、竖杆与斜腹杆组合，适合演示桥式桁架节点位移与杆件轴力分布。",
    tags: ["平行弦", "桥式", "节点荷载"],
    nodes: [
      { id: "N1", x: 0, y: 0, supportType: "pinned" },
      { id: "N2", x: 4, y: 0, supportType: "free" },
      { id: "N3", x: 8, y: 0, supportType: "free" },
      { id: "N4", x: 12, y: 0, supportType: "roller" },
      { id: "N5", x: 0, y: 3, supportType: "free" },
      { id: "N6", x: 4, y: 3, supportType: "free" },
      { id: "N7", x: 8, y: 3, supportType: "free" },
      { id: "N8", x: 12, y: 3, supportType: "free" },
    ],
    members: [
      { id: "L1", start: "N1", end: "N2", elementType: "truss", E_GPa: 210, A_cm2: 30, kind: "lower_chord" },
      { id: "L2", start: "N2", end: "N3", elementType: "truss", E_GPa: 210, A_cm2: 30, kind: "lower_chord" },
      { id: "L3", start: "N3", end: "N4", elementType: "truss", E_GPa: 210, A_cm2: 30, kind: "lower_chord" },
      { id: "U1", start: "N5", end: "N6", elementType: "truss", E_GPa: 210, A_cm2: 26, kind: "upper_chord" },
      { id: "U2", start: "N6", end: "N7", elementType: "truss", E_GPa: 210, A_cm2: 26, kind: "upper_chord" },
      { id: "U3", start: "N7", end: "N8", elementType: "truss", E_GPa: 210, A_cm2: 26, kind: "upper_chord" },
      { id: "V1", start: "N1", end: "N5", elementType: "truss", E_GPa: 210, A_cm2: 20, kind: "vertical" },
      { id: "V2", start: "N2", end: "N6", elementType: "truss", E_GPa: 210, A_cm2: 20, kind: "vertical" },
      { id: "V3", start: "N3", end: "N7", elementType: "truss", E_GPa: 210, A_cm2: 20, kind: "vertical" },
      { id: "V4", start: "N4", end: "N8", elementType: "truss", E_GPa: 210, A_cm2: 20, kind: "vertical" },
      { id: "D1", start: "N1", end: "N6", elementType: "truss", E_GPa: 210, A_cm2: 18, kind: "diagonal" },
      { id: "D2", start: "N2", end: "N7", elementType: "truss", E_GPa: 210, A_cm2: 18, kind: "diagonal" },
      { id: "D3", start: "N3", end: "N8", elementType: "truss", E_GPa: 210, A_cm2: 18, kind: "diagonal" },
    ],
    loads: [
      { type: "nodal", node: "N6", fxKn: 0, fyKn: -30 },
      { type: "nodal", node: "N7", fxKn: 0, fyKn: -30 },
    ],
  },
]);

export function cloneFrameModelTemplate(template: FrameModelTemplate) {
  return {
    nodes: cloneFrameNodes(template.nodes),
    members: cloneFrameMembers(template.members),
    loads: cloneFrameLoads(template.loads),
  };
}

export function cloneBeamModelTemplate(template: BeamModelTemplate): BeamWorkspaceState {
  return {
    ...template.state,
    materials: PREDEFINED_MATERIALS.map((material) => ({ ...material })),
    spans: template.state.spans.map((span, index) => ({ id: span.id ?? `(${index + 1})`, materialId: template.state.materialId, ...span })),
    supports: template.state.supports.map((support) => ({
      ...support,
      constraints: support.constraints ? [...support.constraints] : undefined,
      springs: support.springs?.map((spring) => ({ ...spring })),
    })),
    compareEnabled: false,
    scenarios: [],
    customLoadCases: [],
    customLoadCombinations: [],
  };
}

export function cloneTrussModelTemplate(template: TrussModelTemplate) {
  return {
    nodes: cloneTrussNodes(template.nodes),
    members: cloneTrussMembers(template.members),
    loads: cloneTrussLoads(template.loads),
  };
}

export function applyBeamModelTemplate(workspace: BeamWorkspaceState, template: BeamModelTemplate): BeamWorkspaceState {
  return {
    ...workspace,
    ...cloneBeamModelTemplate(template),
  };
}

export function applyFrameModelTemplate(workspace: FrameWorkspaceState, template: FrameModelTemplate): FrameWorkspaceState {
  const collections = cloneFrameModelTemplate(template);
  return {
    ...workspace,
    frameMode: "custom",
    customNodes: collections.nodes,
    customMembers: collections.members,
    customLoads: collections.loads,
    customLoadCases: [],
    customLoadCombinations: [],
  };
}

export function applyTrussModelTemplate(workspace: TrussWorkspaceState, template: TrussModelTemplate): TrussWorkspaceState {
  const collections = cloneTrussModelTemplate(template);
  return {
    ...workspace,
    customNodes: collections.nodes,
    customMembers: collections.members,
    customLoads: collections.loads,
    customLoadCases: [],
    customLoadCombinations: [],
  };
}
