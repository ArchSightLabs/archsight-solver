import { useId, useState } from "react";
import { ChevronDown, Library, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { selectableMaterialPresets } from "../lib/material-presets";
import { PREDEFINED_MATERIALS, type Material } from "../types/material";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface ProjectMaterialManagerProps {
  compact?: boolean;
  customMaterials: Material[];
  onCustomMaterialsChange: (materials: Material[]) => void;
}

const SYSTEM_MATERIAL_ITEMS = selectableMaterialPresets(PREDEFINED_MATERIALS);
const SYSTEM_MATERIAL_IDS = new Set(PREDEFINED_MATERIALS.map((material) => material.id.toLowerCase()));
const CUSTOM_MATERIAL_DRAFT = { id: "", name: "", youngModulus: "", density: "" };
const STATUS_LINE_CLASS = "rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold leading-5 text-muted-foreground";

function normalizeCustomMaterialId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

function formatMaterialSummary(material: Material) {
  return `E=${material.youngModulus} GPa · ρ=${material.density} kg/m³`;
}

export function ProjectMaterialManager({ compact = false, customMaterials, onCustomMaterialsChange }: ProjectMaterialManagerProps) {
  const panelId = useId();
  const [isOpen, setIsOpen] = useState(false);
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
  const editCustomMaterial = (material: Material) => {
    setEditingMaterialId(material.id);
    setMaterialDraft({
      id: material.id,
      name: material.name,
      youngModulus: String(material.youngModulus),
      density: String(material.density),
    });
    setMaterialMessage(null);
  };
  const saveCustomMaterial = () => {
    const id = normalizeCustomMaterialId(materialDraft.id);
    const name = materialDraft.name.trim();
    const youngModulus = Number(materialDraft.youngModulus);
    const density = Number(materialDraft.density);
    if (!id || SYSTEM_MATERIAL_IDS.has(id)) {
      setMaterialMessage("材料编号不能为空，且不能覆盖系统内置材料。");
      return;
    }
    if (!name || !Number.isFinite(youngModulus) || youngModulus <= 0 || !Number.isFinite(density) || density <= 0) {
      setMaterialMessage("请填写材料名称、正值弹性模量 E 和正值密度。");
      return;
    }
    const nextMaterial: Material = { id, name, youngModulus, density, category: "custom" };
    const replacedIds = new Set([id, editingMaterialId].filter(Boolean));
    onCustomMaterialsChange([...customMaterials.filter((material) => !replacedIds.has(material.id)), nextMaterial]);
    setEditingMaterialId(null);
    setMaterialDraft(CUSTOM_MATERIAL_DRAFT);
    setMaterialMessage(`已保存工程材料 ${id.toUpperCase()}。`);
  };
  const deleteCustomMaterial = (materialId: string) => {
    onCustomMaterialsChange(customMaterials.filter((material) => material.id !== materialId));
    if (editingMaterialId === materialId) resetDraft();
    setMaterialMessage(`已从工程材料库移除 ${materialId.toUpperCase()}。`);
  };

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.03] p-1.5">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Library className="h-4 w-4 shrink-0 text-sky-500" />
          <span className={`truncate font-black text-foreground ${compact ? "text-xs" : "text-sm"}`}>工程材料库</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {customMaterials.length} 个
          </span>
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </span>
      </button>
      {isOpen ? (
        <div id={panelId} className="space-y-3 px-1.5 pb-2 pt-2">
          <div className={STATUS_LINE_CLASS}>
            工程材料随当前项目文件保存；系统内置材料只读，仅作为构件材料选择的基础库。
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-black text-foreground">系统内置材料</div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                只读 {SYSTEM_MATERIAL_ITEMS.length} 个
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SYSTEM_MATERIAL_ITEMS.map((material) => (
                <span
                  key={material.id}
                  title={`${material.name} · ${formatMaterialSummary(material)}`}
                  className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] font-black text-muted-foreground"
                >
                  {material.id.toUpperCase()}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-black text-foreground">工程自定义材料</div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                {customMaterials.length} 个
              </span>
            </div>
            {customMaterials.length ? (
              <div className="space-y-2">
                {customMaterials.map((material) => (
                  <div
                    key={material.id}
                    className="rounded-lg border border-sky-400/25 bg-sky-400/10 px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-black text-foreground">
                          {material.id.toUpperCase()} · {material.name}
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
                          className="h-7 w-7 rounded-lg border-white/10 bg-white/[0.04]"
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
                          className="h-7 w-7 rounded-lg border-white/10 bg-white/[0.04]"
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
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-black text-foreground">
              <Plus className="h-3.5 w-3.5 text-sky-500" />
              {editingMaterialId ? "更新工程材料" : "新增工程材料"}
            </div>
            <div className="grid grid-cols-1 gap-2">
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
                value={materialDraft.density}
                onChange={(event) => updateMaterialDraft("density", event.target.value)}
                placeholder="密度（kg/m³）"
                className="h-9 font-mono text-xs"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1 text-[10px] font-semibold leading-4 text-muted-foreground">
                {materialMessage ?? "编号只允许英文、数字、短横线和下划线。"}
              </div>
              {editingMaterialId ? (
                <Button type="button" variant="outline" size="sm" onClick={resetDraft} className="h-8 rounded-lg px-2.5 text-[11px]">
                  取消
                </Button>
              ) : null}
              <Button type="button" size="sm" onClick={saveCustomMaterial} className="h-8 rounded-lg px-2.5 text-[11px]">
                <Save className="mr-1 h-3.5 w-3.5" />
                保存
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
