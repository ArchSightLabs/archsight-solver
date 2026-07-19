import { useEffect, useState } from "react";
import type { ProjectTemplate, TemplateLibraryState, TemplateSnapshot } from "../types/beam.ts";
import {
  MAX_TEMPLATE_COUNT,
  LEGACY_TEMPLATE_LIBRARY_STORAGE_KEY,
  TEMPLATE_LIBRARY_STORAGE_KEY,
  createEmptyTemplateLibraryState,
  createTemplateLibraryStateFromStorage,
  deleteTemplateEntry,
  duplicateTemplateEntry,
  findTemplate,
  saveTemplateFromWorkspace,
  setBaselineTemplateEntry,
  type TemplateActionResult,
} from "../lib/template-library.ts";

interface UseTemplateLibraryReturn {
  templates: ProjectTemplate[];
  baselineTemplateId: string | null;
  isAtCapacity: boolean;
  saveTemplate: (name: string, snapshot: TemplateSnapshot) => TemplateActionResult<ProjectTemplate>;
  duplicateTemplate: (templateId: string) => TemplateActionResult<ProjectTemplate>;
  deleteTemplate: (templateId: string) => TemplateActionResult;
  setBaselineTemplate: (templateId: string | null) => TemplateActionResult;
  getTemplate: (templateId: string) => ProjectTemplate | null;
}

function readTemplateState(): TemplateLibraryState {
  if (typeof window === "undefined") {
    return createEmptyTemplateLibraryState();
  }

  try {
    return createTemplateLibraryStateFromStorage(
      window.localStorage.getItem(TEMPLATE_LIBRARY_STORAGE_KEY),
      window.localStorage.getItem(LEGACY_TEMPLATE_LIBRARY_STORAGE_KEY)
    );
  } catch {
    return createEmptyTemplateLibraryState();
  }
}

export function useTemplateLibrary({ localPersistenceEnabled = true }: { localPersistenceEnabled?: boolean } = {}): UseTemplateLibraryReturn {
  const [state, setState] = useState<TemplateLibraryState>(() => (
    localPersistenceEnabled ? readTemplateState() : createEmptyTemplateLibraryState()
  ));

  useEffect(() => {
    if (!localPersistenceEnabled || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(TEMPLATE_LIBRARY_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 本地存储不可用时保留内存态，避免影响主工作区。
    }
  }, [localPersistenceEnabled, state]);

  const saveTemplate = (name: string, snapshot: TemplateSnapshot): TemplateActionResult<ProjectTemplate> => {
    const result = saveTemplateFromWorkspace(state, name, snapshot);
    if (result.ok && result.state) {
      setState(result.state);
    }
    return result;
  };

  const duplicateTemplate = (templateId: string): TemplateActionResult<ProjectTemplate> => {
    const result = duplicateTemplateEntry(state, templateId);
    if (result.ok && result.state) {
      setState(result.state);
    }
    return result;
  };

  const deleteTemplate = (templateId: string): TemplateActionResult => {
    const result = deleteTemplateEntry(state, templateId);
    if (result.ok && result.state) {
      setState(result.state);
    }
    return result;
  };

  const setBaselineTemplate = (templateId: string | null): TemplateActionResult => {
    const result = setBaselineTemplateEntry(state, templateId);
    if (result.ok && result.state) {
      setState(result.state);
    }
    return result;
  };

  return {
    templates: state.templates,
    baselineTemplateId: state.baselineTemplateId,
    isAtCapacity: state.templates.length >= MAX_TEMPLATE_COUNT,
    saveTemplate,
    duplicateTemplate,
    deleteTemplate,
    setBaselineTemplate,
    getTemplate: (templateId: string) => findTemplate(state, templateId),
  };
}
