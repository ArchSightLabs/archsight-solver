import frontendPackage from "../../package.json" with { type: "json" };

type ViteRuntimeEnv = {
  readonly VITE_APP_VERSION?: string;
  readonly VITE_GITHUB_REPOSITORY_URL?: string;
  readonly VITE_BENCHMARK_SUBMISSION_EMAIL?: string;
  readonly VITE_ENABLE_BUSUANZI?: string;
};

const frontendPackageVersion = (frontendPackage as { version?: string }).version ?? "0.0.0";
const viteEnv = (import.meta as ImportMeta & { env?: ViteRuntimeEnv }).env ?? {};

export const APP_VERSION = viteEnv.VITE_APP_VERSION || frontendPackageVersion;
export const GITHUB_REPOSITORY_URL =
  viteEnv.VITE_GITHUB_REPOSITORY_URL || "https://github.com/ArchSightLabs/archsight-solver";
export const BENCHMARK_SUBMISSION_EMAIL =
  viteEnv.VITE_BENCHMARK_SUBMISSION_EMAIL || "archsight-labs@qq.com";
export const BUSUANZI_VISIT_STATS_ENABLED = viteEnv.VITE_ENABLE_BUSUANZI === "true";
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
