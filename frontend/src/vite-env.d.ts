/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
  readonly VITE_GITHUB_REPOSITORY_URL?: string;
  readonly VITE_BENCHMARK_SUBMISSION_EMAIL?: string;
  readonly VITE_ENABLE_BUSUANZI?: string;
}
