import { forwardRef, useImperativeHandle, useState } from "react";
import { Copy, Library, Pencil, Plus, Trash2 } from "lucide-react";
import { selectableMaterialPresets } from "../lib/material-presets";
import { PREDEFINED_MATERIALS, type Material } from "../types/material";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface ProjectMaterialPanelProps {
  customMaterials: Material[];
  onCustomMaterialsChange: (materials: Material[]) => void;
}

export interface ProjectMaterialPanelHandle {
  confirmPendingDraft: () => boolean;
}

const SYSTEM_MATERIAL_ITEMS = selectableMaterialPresets(PREDEFINED_MATERIALS);
const SYSTEM_MATERIAL_IDS = new Set(PREDEFINED_MATERIALS.map((material) => material.id.toLowerCase()));
const CUSTOM_MATERIAL_DRAFT = { id: "", name: "", youngModulus: "", sectionArea: "", momentOfInertia: "", density: "" };
const STATUS_LINE_CLASS = "rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-[11px] font-semibold leading-5 text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300";

function normalizeCustomMaterialId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

function formatMaterialSummary(material: Material) {
  return [
    `E=${material.youngModulus} GPa`,
    Number.isFinite(material.sectionAreaCm2) ? `A=${material.sectionAreaCm2} cm²` : null,
    Number.isFinite(material.momentOfInertiaCm4) ? `I=${material.momentOfInertiaCm4} cm⁴` : null,
    `密度=${material.density} kg/m³`,
  ].filter(Boolean).join(" · ");
}

function materialNameWithoutCode(material: Material) {
  const code = material.id.toUpperCase();
  const name = material.name.trim();
  const normalizedName = name.toUpperCase();
  if (normalizedName === code) return "";
  return normalizedName.startsWith(code) ? name.slice(code.length).trim() : name;
}

function formatMaterialTitle(material: Material) {
  const code = material.id.toUpperCase();
  const name = materialNameWithoutCode(material);
  return name ? `${code} · ${name}` : code;
}

function nextCopiedMaterialId(sourceId: string, customMaterials: Material[]): string {
  const usedIds = new Set([
    ...SYSTEM_MATERIAL_IDS,
    ...customMaterials.map((material) => material.id.toLowerCase()),
  ]);
  const baseId = normalizeCustomMaterialId(`${sourceId}-custom`);
  if (!usedIds.has(baseId)) return baseId;
  for (let index = 2; index < 100; index += 1) {
    const candidate = normalizeCustomMaterialId(`${baseId}-${index}`);
    if (!usedIds.has(candidate)) return candidate;
  }
  return normalizeCustomMaterialId(`${baseId}-${Date.now()}`);
}

export const ProjectMaterialPanel = forwardRef<ProjectMaterialPanelHandle, ProjectMaterialPanelProps>(function ProjectMaterialPanel(
  { customMaterials, onCustomMaterialsChange },
  ref,
) {
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [materialDraft, setMaterialDraft] = useState(CUSTOM_MATERIAL_DRAFT);
  const [materialMessage, setMaterialMessage] = useState<string | null>(null);

  const updateMaterialDraft = (field: keyof typeof CUSTOM_MATERIAL_DRAFT, value: string) => {
    setMaterialDraft((current) => ({ ...current, [field]: value }));
    setMaterialMessage(null);
  };
  const resetDraft = () => {
    setEditingMaterialId(null);
    setMaterialDraft(CUSTOM_MATERIAL_DRAFT);
    setMaterialMessage(null);
  };
  const hasMaterialDraftContent = () => Object.values(materialDraft).some((value) => value.trim());
  const editCustomMaterial = (material: Material) => {
    setEditingMaterialId(material.id);
    setMaterialDraft({
      id: material.id,
      name: material.name,
      youngModulus: String(material.youngModulus),
      sectionArea: material.sectionAreaCm2 ? String(material.sectionAreaCm2) : "",
      momentOfInertia: material.momentOfInertiaCm4 ? String(material.momentOfInertiaCm4) : "",
      density: String(material.density),
    });
    setMaterialMessage(null);
  };
  const copySystemMaterial = (material: Material) => {
    const id = nextCopiedMaterialId(material.id, customMaterials);
    setEditingMaterialId(null);
    setMaterialDraft({
      id,
      name: `${material.name}（自定义）`,
      youngModulus: String(material.youngModulus),
      sectionArea: material.sectionAreaCm2 ? String(material.sectionAreaCm2) : "",
      momentOfInertia: material.momentOfInertiaCm4 ? String(material.momentOfInertiaCm4) : "",
      density: String(material.density),
    });
    setMaterialMessage(`已复制 ${material.id.toUpperCase()}，请按当前工程需要调整后保存。`);
  };
  const saveCustomMaterial = () => {
    const id = normalizeCustomMaterialId(materialDraft.id);
    const name = materialDraft.name.trim();
    const youngModulus = Number(materialDraft.youngModulus);
    const sectionArea = Number(materialDraft.sectionArea);
    const momentOfInertia = Number(materialDraft.momentOfInertia);
    const density = Number(materialDraft.density);
    if (!id || SYSTEM_MATERIAL_IDS.has(id)) {
      setMaterialMessage("材料编号不能为空，且不能覆盖系统内置材料。");
      return false;
    }
    if (!name || !Number.isFinite(youngModulus) || youngModulus <= 0 || !Number.isFinite(density) || density <= 0) {
      setMaterialMessage("请填写材料名称、正值弹性模量 E 和正值密度。");
      return false;
    }
    if (materialDraft.sectionArea.trim() && (!Number.isFinite(sectionArea) || sectionArea <= 0)) {
      setMaterialMessage("截面面积 A 需要为正值，或留空。");
      return false;
    }
    if (materialDraft.momentOfInertia.trim() && (!Number.isFinite(momentOfInertia) || momentOfInertia <= 0)) {
      setMaterialMessage("截面惯性矩 I 需要为正值，或留空。");
      return false;
    }
    const nextMaterial: Material = {
      id,
      name,
      youngModulus,
      density,
      ...(Number.isFinite(sectionArea) && sectionArea > 0 ? { sectionAreaCm2: sectionArea } : {}),
      ...(Number.isFinite(momentOfInertia) && momentOfInertia > 0 ? { momentOfInertiaCm4: momentOfInertia } : {}),
      category: "custom",
    };
    const replacedIds = new Set([id, editingMaterialId].filter(Boolean));
    onCustomMaterialsChange([...customMaterials.filter((material) => !replacedIds.has(material.id)), nextMaterial]);
    setEditingMaterialId(null);
    setMaterialDraft(CUSTOM_MATERIAL_DRAFT);
    setMaterialMessage(`已保存工程材料 ${id.toUpperCase()}。`);
    return true;
  };
  const deleteCustomMaterial = (materialId: string) => {
    onCustomMaterialsChange(customMaterials.filter((material) => material.id !== materialId));
    if (editingMaterialId === materialId) resetDraft();
    setMaterialMessage(`已从工程材料库移除 ${materialId.toUpperCase()}。`);
  };

  useImperativeHandle(ref, () => ({
    confirmPendingDraft: () => {
      if (!hasMaterialDraftContent()) return true;
      return saveCustomMaterial();
    },
  }));

  return (
    <section className="space-y-4" aria-label="工程材料">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="text-[10px] font-black tracking-widest text-muted-foreground">系统内置材料</div>
          <div className="mt-1 text-2xl font-black">{SYSTEM_MATERIAL_ITEMS.length}</div>
        </div>
        <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="text-[10px] font-black tracking-widest text-muted-foreground">工程自定义材料</div>
          <div className="mt-1 text-2xl font-black">{customMaterials.length}</div>
        </div>
        <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="text-[10px] font-black tracking-widest text-muted-foreground">保存范围</div>
          <div className="mt-1 text-sm font-black">当前工程文件</div>
        </div>
      </div>

      <div className={STATUS_LINE_CLASS}>
        工程材料随当前项目文件保存；系统内置材料只读。构件、杆件和跨段的材料下拉会用“自定义”标记显示工程材料。
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
        <section className="rounded-lg border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-black">
              <Library className="h-4 w-4 text-sky-500" />
              材料目录
            </h3>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
              系统只读
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {SYSTEM_MATERIAL_ITEMS.map((material) => (
              <div key={material.id} className="rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.035]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-black text-foreground">{formatMaterialTitle(material)}</div>
                    <div className="mt-1 font-mono text-[11px] font-semibold text-muted-foreground">{formatMaterialSummary(material)}</div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => copySystemMaterial(material)}
                    aria-label={`复制 ${material.id.toUpperCase()} 为工程材料`}
                    title={`复制 ${material.id.toUpperCase()} 为工程材料`}
                    className="h-8 w-8 shrink-0 rounded-lg"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-black">工程自定义材料</h3>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
              {customMaterials.length} 个
            </span>
          </div>
          {customMaterials.length ? (
            <div className="space-y-2">
              {customMaterials.map((material) => (
                <div
                  key={material.id}
                  className="rounded-lg border border-sky-200/80 bg-sky-50 px-3 py-2 dark:border-sky-400/20 dark:bg-sky-400/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-black text-foreground">
                        {formatMaterialTitle(material)}
                      </div>
                      <div className="mt-1 font-mono text-[11px] font-semibold text-muted-foreground">
                        {formatMaterialSummary(material)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => editCustomMaterial(material)}
                        aria-label={`编辑 ${material.id}`}
                        title={`编辑 ${material.id}`}
                        className="h-8 w-8 rounded-lg"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => deleteCustomMaterial(material.id)}
                        aria-label={`删除 ${material.id}`}
                        title={`删除 ${material.id}`}
                        className="h-8 w-8 rounded-lg"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={STATUS_LINE_CLASS}>当前工程尚未定义自定义材料。</div>
          )}

          <div className="mt-4 rounded-lg border border-slate-200/80 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.035]">
            <div className="mb-3 flex items-center gap-2 text-xs font-black">
              <Plus className="h-3.5 w-3.5 text-sky-500" />
              {editingMaterialId ? "更新工程材料" : "新增工程材料"}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                value={materialDraft.id}
                onChange={(event) => updateMaterialDraft("id", event.target.value)}
                placeholder="编号，如 timber-c24"
                className="h-9 font-mono text-xs"
              />
              <Input
                value={materialDraft.name}
                onChange={(event) => updateMaterialDraft("name", event.target.value)}
                placeholder="材料名称"
                className="h-9 text-xs"
              />
              <Input
                type="number"
                value={materialDraft.youngModulus}
                onChange={(event) => updateMaterialDraft("youngModulus", event.target.value)}
                placeholder="E（GPa）"
                className="h-9 font-mono text-xs"
              />
              <Input
                type="number"
                value={materialDraft.sectionArea}
                onChange={(event) => updateMaterialDraft("sectionArea", event.target.value)}
                placeholder="A（cm²，默认截面面积）"
                className="h-9 font-mono text-xs"
              />
              <Input
                type="number"
                value={materialDraft.momentOfInertia}
                onChange={(event) => updateMaterialDraft("momentOfInertia", event.target.value)}
                placeholder="I（cm⁴，默认截面惯性矩）"
                className="h-9 font-mono text-xs"
              />
              <Input
                type="number"
                value={materialDraft.density}
                onChange={(event) => updateMaterialDraft("density", event.target.value)}
                placeholder="密度（kg/m³，辅助）"
                className="h-9 font-mono text-xs"
              />
            </div>
            <div className="mt-3 text-[10px] font-semibold leading-4 text-muted-foreground">
              A/I 是选择该工程材料时回填到构件或跨段的默认截面参数；密度仅作为自重/说明的辅助信息。
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1 text-[11px] font-semibold leading-5 text-muted-foreground">
                {materialMessage ?? "编号只允许英文、数字、短横线和下划线。保存工程设置时也会先保存当前材料草稿。"}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button type="button" variant="outline" onClick={resetDraft} className="h-9 rounded-lg px-4 text-xs font-semibold">
                  清空草稿
                </Button>
                <Button type="button" onClick={saveCustomMaterial} className="h-9 rounded-lg px-4 text-xs font-semibold">
                  保存材料
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
});
