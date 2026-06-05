import type { ReactNode } from "react";
import type { AnalysisMode } from "../../types/structure";
import type { ModuleSectionKey } from "../../lib/workbench-navigation";
import { moduleSectionId, normalizeModuleSectionId } from "../../lib/workbench-navigation";

interface WorkbenchTabsLayoutProps {
  mode: AnalysisMode;
  activeSectionId?: string;
  tabs: Partial<Record<ModuleSectionKey, ReactNode>>;
}

export function WorkbenchTabsLayout({ mode, activeSectionId, tabs }: WorkbenchTabsLayoutProps) {
  const visibleSectionId = normalizeModuleSectionId(mode, activeSectionId) ?? moduleSectionId(mode, "template");

  // Determine the active key by comparing the resolved section ID.
  const sectionKeys: ModuleSectionKey[] = ["template", "basic", "object", "text", "table"];
  const activeKey = sectionKeys.find((key) => moduleSectionId(mode, key) === visibleSectionId) ?? "template";

  return <div className="space-y-4">{tabs[activeKey] || null}</div>;
}
