import { useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { WorkbenchView } from "../lib/solver-project.ts";

interface UseWorkbenchAppChromeOptions {
  canDeleteSelection: boolean;
  onDeleteSelection?: () => void;
  onRedoWorkspace: () => void;
  onSaveProject: (forceSaveAs?: boolean) => void;
  onUndoWorkspace: () => void;
  workbenchView: WorkbenchView;
}

interface UseWorkbenchAppChromeResult {
  fileMenuRef: RefObject<HTMLDivElement | null>;
  isFileMenuOpen: boolean;
  setIsFileMenuOpen: Dispatch<SetStateAction<boolean>>;
}

function isEditableTarget(target: globalThis.EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function useWorkbenchAppChrome({
  canDeleteSelection,
  onDeleteSelection,
  onRedoWorkspace,
  onSaveProject,
  onUndoWorkspace,
  workbenchView,
}: UseWorkbenchAppChromeOptions): UseWorkbenchAppChromeResult {
  const fileMenuRef = useRef<HTMLDivElement | null>(null);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isFileMenuOpen) {
      return;
    }

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as globalThis.Node | null;
      if (target && !fileMenuRef.current?.contains(target)) {
        setIsFileMenuOpen(false);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFileMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFileMenuOpen]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === "s" || event.key === "S")) {
        event.preventDefault();
        onSaveProject(event.shiftKey);
        return;
      }
      if (isEditableTarget(event.target) || workbenchView !== "model" || (event.key !== "Delete" && event.key !== "Backspace")) {
        return;
      }
      if (!canDeleteSelection) {
        return;
      }
      event.preventDefault();
      onDeleteSelection?.();
    };
    const handleUndoRedoKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isEditableTarget(event.target) || !(event.ctrlKey || event.metaKey)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        onRedoWorkspace();
        return;
      }
      if (key === "z") {
        event.preventDefault();
        onUndoWorkspace();
        return;
      }
      if (key === "y") {
        event.preventDefault();
        onRedoWorkspace();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keydown", handleUndoRedoKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keydown", handleUndoRedoKeyDown);
    };
  }, [canDeleteSelection, onDeleteSelection, onRedoWorkspace, onSaveProject, onUndoWorkspace, workbenchView]);

  return {
    fileMenuRef,
    isFileMenuOpen,
    setIsFileMenuOpen,
  };
}
