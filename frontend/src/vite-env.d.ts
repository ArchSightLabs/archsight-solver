/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
  readonly VITE_GITHUB_REPOSITORY_URL?: string;
  readonly VITE_BENCHMARK_SUBMISSION_EMAIL?: string;
  readonly VITE_ENABLE_BUSUANZI?: string;
  readonly VITE_SOLVER_HOST_ALLOWED_ORIGINS?: string;
}

interface Window {
  __ARCHSIGHT_SOLVER_RUNTIME_CONFIG__?: {
    hostAllowedOrigins?: string;
  };
}
