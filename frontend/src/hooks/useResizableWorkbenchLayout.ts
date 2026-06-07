import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useMediaQuery } from "./useMediaQuery";

const INSPECTOR_WIDTH_STORAGE_KEY = "archsight.inspectorWidth";
const INSPECTOR_COLLAPSED_STORAGE_KEY = "archsight.inspectorCollapsed";
const DEFAULT_INSPECTOR_WIDTH = 400;
const MIN_INSPECTOR_WIDTH = 360;
const MAX_INSPECTOR_WIDTH = 680;
const MODULE_NAV_WIDTH_STORAGE_KEY = "archsight.moduleNavWidth";
const MODULE_NAV_COLLAPSED_STORAGE_KEY = "archsight.moduleNavCollapsed";
const DEFAULT_MODULE_NAV_WIDTH = 248;
const MIN_MODULE_NAV_WIDTH = 232;
const MAX_MODULE_NAV_VIEWPORT_RATIO = 1 / 3;
const COLLAPSED_MODULE_NAV_WIDTH = 76;
const COLLAPSED_INSPECTOR_WIDTH = 68;
const SETTINGS_PANEL_WIDTH = 360;

function clampInspectorWidth(value: number) {
  return Math.min(MAX_INSPECTOR_WIDTH, Math.max(MIN_INSPECTOR_WIDTH, value));
}

function maxModuleNavWidth() {
  if (typeof window === "undefined") return DEFAULT_MODULE_NAV_WIDTH;
  return Math.max(MIN_MODULE_NAV_WIDTH, Math.floor(window.innerWidth * MAX_MODULE_NAV_VIEWPORT_RATIO));
}

function clampModuleNavWidth(value: number) {
  return Math.min(maxModuleNavWidth(), Math.max(MIN_MODULE_NAV_WIDTH, value));
}

function readStoredNumber(key: string) {
  const stored = window.localStorage.getItem(key);
  if (stored === null) return null;

  const value = Number(stored);
  return Number.isFinite(value) ? value : null;
}

export function useResizableWorkbenchLayout(isSystemSettingsDocked: boolean) {
  const [inspectorWidth, setInspectorWidth] = useState(() => {
    const stored = readStoredNumber(INSPECTOR_WIDTH_STORAGE_KEY);
    return stored === null ? DEFAULT_INSPECTOR_WIDTH : clampInspectorWidth(stored);
  });
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(
    () => window.localStorage.getItem(INSPECTOR_COLLAPSED_STORAGE_KEY) === "true"
  );
  const [moduleNavWidth, setModuleNavWidth] = useState(() => {
    const stored = readStoredNumber(MODULE_NAV_WIDTH_STORAGE_KEY);
    return stored === null ? DEFAULT_MODULE_NAV_WIDTH : clampModuleNavWidth(stored);
  });
  const [isModuleNavCollapsed, setIsModuleNavCollapsed] = useState(
    () => window.localStorage.getItem(MODULE_NAV_COLLAPSED_STORAGE_KEY) === "true"
  );
  const isCompactWorkbench = useMediaQuery("(max-width: 1023px)");
  const isWideWorkbench = useMediaQuery("(min-width: 1280px)");
  const showInspectorCollapsed = isWideWorkbench && isInspectorCollapsed;
  const effectiveInspectorWidth = isSystemSettingsDocked ? Math.min(inspectorWidth, DEFAULT_INSPECTOR_WIDTH) : inspectorWidth;
  const workbenchGridStyle: CSSProperties | undefined = isCompactWorkbench
    ? undefined
    : {
        gridTemplateColumns: `${
          isModuleNavCollapsed ? COLLAPSED_MODULE_NAV_WIDTH : moduleNavWidth
        }px minmax(0,1fr) ${showInspectorCollapsed ? COLLAPSED_INSPECTOR_WIDTH : effectiveInspectorWidth}px${
          isSystemSettingsDocked ? ` ${SETTINGS_PANEL_WIDTH}px` : ""
        }`,
      };

  useEffect(() => {
    window.localStorage.setItem(INSPECTOR_WIDTH_STORAGE_KEY, String(inspectorWidth));
  }, [inspectorWidth]);

  useEffect(() => {
    window.localStorage.setItem(INSPECTOR_COLLAPSED_STORAGE_KEY, String(isInspectorCollapsed));
  }, [isInspectorCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(MODULE_NAV_WIDTH_STORAGE_KEY, String(moduleNavWidth));
  }, [moduleNavWidth]);

  useEffect(() => {
    window.localStorage.setItem(MODULE_NAV_COLLAPSED_STORAGE_KEY, String(isModuleNavCollapsed));
  }, [isModuleNavCollapsed]);

  useEffect(() => {
    const handleResize = () => {
      setModuleNavWidth((current) => clampModuleNavWidth(current));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleModuleNavResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (isCompactWorkbench || isModuleNavCollapsed) return;
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = moduleNavWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setModuleNavWidth(clampModuleNavWidth(startWidth + moveEvent.clientX - startX));
    };
    const handlePointerUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handleInspectorResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (isCompactWorkbench || showInspectorCollapsed) return;
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = inspectorWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setInspectorWidth(clampInspectorWidth(startWidth + startX - moveEvent.clientX));
    };
    const handlePointerUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  return {
    handleInspectorResizeStart,
    handleModuleNavResizeStart,
    isCompactWorkbench,
    isModuleNavCollapsed,
    isSystemSettingsDocked,
    setIsInspectorCollapsed,
    setIsModuleNavCollapsed,
    showInspectorCollapsed,
    workbenchGridStyle,
  };
}
