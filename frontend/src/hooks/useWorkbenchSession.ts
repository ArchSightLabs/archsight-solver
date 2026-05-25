import { useState, useEffect } from "react";

export function useWorkbenchSession() {
  const [isDark, setIsDark] = useState(() => {
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
    document.documentElement.classList.toggle("dark", isDark);
    window.localStorage.setItem("archsight:theme", isDark ? "dark" : "light");
  }, [isDark]);

  return {
    isDark,
    setIsDark,
    clientId,
  };
}
