export const APP_VERSION = import.meta.env.VITE_APP_VERSION || "0.0.0";
export const GITHUB_REPOSITORY_URL =
  import.meta.env.VITE_GITHUB_REPOSITORY_URL || "https://github.com/ArchSightLabs/archsight-solver";
export const BUSUANZI_VISIT_STATS_ENABLED = import.meta.env.VITE_ENABLE_BUSUANZI === "true";
export const BUSUANZI_SCRIPT_SRC = "https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js";

export function loadBusuanziVisitStats() {
  if (typeof document === "undefined") return;
  if (document.querySelector("script[data-archsight-busuanzi]")) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = BUSUANZI_SCRIPT_SRC;
  script.dataset.archsightBusuanzi = "true";
  document.body.appendChild(script);
}
