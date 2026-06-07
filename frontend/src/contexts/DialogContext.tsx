import React, { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface DialogContextValue {
  isNewAnalysisObjectDialogOpen: boolean;
  setIsNewAnalysisObjectDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  
  projectInfoDialogMode: "create" | "edit" | null;
  setProjectInfoDialogMode: React.Dispatch<React.SetStateAction<"create" | "edit" | null>>;
  
  isSystemSettingsOpen: boolean;
  setIsSystemSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  
  isTemplateLibraryOpen: boolean;
  setIsTemplateLibraryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  
  isPublicExamplesOpen: boolean;
  setIsPublicExamplesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  
  isBenchmarkSubmissionOpen: boolean;
  setIsBenchmarkSubmissionOpen: React.Dispatch<React.SetStateAction<boolean>>;

  isSystemSettingsDocked: boolean;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialogs() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useDialogs must be used within a DialogProvider");
  }
  return context;
}



import { useMediaQuery } from "../hooks/useMediaQuery";

export function DialogProvider({ children }: { children: ReactNode }) {
  const [isNewAnalysisObjectDialogOpen, setIsNewAnalysisObjectDialogOpen] = useState(false);
  const [projectInfoDialogMode, setProjectInfoDialogMode] = useState<"create" | "edit" | null>(null);
  const [isSystemSettingsOpen, setIsSystemSettingsOpen] = useState(false);
  const [isTemplateLibraryOpen, setIsTemplateLibraryOpen] = useState(false);
  const [isPublicExamplesOpen, setIsPublicExamplesOpen] = useState(false);
  const [isBenchmarkSubmissionOpen, setIsBenchmarkSubmissionOpen] = useState(false);

  const isWideWorkbench = useMediaQuery("(min-width: 1280px)");
  const isSystemSettingsDocked = isSystemSettingsOpen && isWideWorkbench;

  useEffect(() => {
    if (
      !isTemplateLibraryOpen &&
      !isSystemSettingsOpen &&
      !isNewAnalysisObjectDialogOpen &&
      !isPublicExamplesOpen &&
      !isBenchmarkSubmissionOpen &&
      projectInfoDialogMode === null
    ) {
      return;
    }
    const shouldLockScroll =
      isTemplateLibraryOpen ||
      isPublicExamplesOpen ||
      isBenchmarkSubmissionOpen ||
      (isSystemSettingsOpen && !isSystemSettingsDocked) ||
      isNewAnalysisObjectDialogOpen ||
      projectInfoDialogMode !== null;

    const handleKeyDown = (event: { key: string }) => {
      if (event.key === "Escape") {
        setIsTemplateLibraryOpen(false);
        setIsPublicExamplesOpen(false);
        setIsBenchmarkSubmissionOpen(false);
        setIsSystemSettingsOpen(false);
        setIsNewAnalysisObjectDialogOpen(false);
        setProjectInfoDialogMode(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    if (shouldLockScroll) {
      document.body.style.overflow = "hidden";
    }
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (shouldLockScroll) {
        document.body.style.overflow = previousOverflow;
      }
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isSystemSettingsDocked,
    isTemplateLibraryOpen,
    isPublicExamplesOpen,
    isBenchmarkSubmissionOpen,
    isSystemSettingsOpen,
    isNewAnalysisObjectDialogOpen,
    projectInfoDialogMode,
  ]);

  return (
    <DialogContext.Provider
      value={{
        isNewAnalysisObjectDialogOpen,
        setIsNewAnalysisObjectDialogOpen,
        projectInfoDialogMode,
        setProjectInfoDialogMode,
        isSystemSettingsOpen,
        setIsSystemSettingsOpen,
        isTemplateLibraryOpen,
        setIsTemplateLibraryOpen,
        isPublicExamplesOpen,
        setIsPublicExamplesOpen,
        isBenchmarkSubmissionOpen,
        setIsBenchmarkSubmissionOpen,
        isSystemSettingsDocked,
      }}
    >
      {children}
    </DialogContext.Provider>
  );
}
