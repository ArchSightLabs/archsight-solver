import { useEffect, useState } from "react";
import { BUSUANZI_VISIT_STATS_ENABLED, loadBusuanziVisitStats } from "../lib/app-metadata";

export interface VisitStats {
  pageViews: string;
  uniqueVisitors: string;
}

export function useVisitStats() {
  const [visitStats, setVisitStats] = useState<VisitStats>({ pageViews: "", uniqueVisitors: "" });

  useEffect(() => {
    if (!BUSUANZI_VISIT_STATS_ENABLED) return;

    const syncVisitStats = () => {
      const pageViews = document.getElementById("busuanzi_value_site_pv")?.textContent?.trim() || "";
      const uniqueVisitors = document.getElementById("busuanzi_value_site_uv")?.textContent?.trim() || "";
      setVisitStats({ pageViews, uniqueVisitors });
    };

    const observer = new window.MutationObserver(syncVisitStats);
    const observedNodes = [
      document.getElementById("busuanzi_value_site_pv"),
      document.getElementById("busuanzi_value_site_uv"),
    ].filter((node): node is HTMLElement => Boolean(node));

    observedNodes.forEach((node) => observer.observe(node, { childList: true, characterData: true, subtree: true }));
    syncVisitStats();
    loadBusuanziVisitStats();

    const fallbackTimer = window.setTimeout(syncVisitStats, 2500);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  return visitStats;
}
