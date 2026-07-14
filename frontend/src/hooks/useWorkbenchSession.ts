import { useState, useEffect } from "react";

import type { HostTheme } from "../lib/workbench-presentation";

export function useWorkbenchSession(forcedTheme: HostTheme = null) {
  const [isDark, setIsDark] = useState(() => {
    if (forcedTheme) return forcedTheme === "dark";
    if (typeof window === "undefined") return true;
    const storedTheme = window.localStorage.getItem("archsight:theme");
    return storedTheme ? storedTheme === "dark" : true;
  });

  const [clientId] = useState(() => {
    if (typeof window === "undefined") return "server-side";
    let id = window.localStorage.getItem("archsight:client-id");
    if (!id) {
      id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
      window.localStorage.setItem("archsight:client-id", id);
    }
    return id;
  });

  useEffect(() => {
    const nextIsDark = forcedTheme ? forcedTheme === "dark" : isDark;
    document.documentElement.classList.toggle("dark", nextIsDark);
    if (!forcedTheme) {
      window.localStorage.setItem("archsight:theme", nextIsDark ? "dark" : "light");
    }
  }, [forcedTheme, isDark]);

  return {
    isDark,
    setIsDark,
    clientId,
  };
}
