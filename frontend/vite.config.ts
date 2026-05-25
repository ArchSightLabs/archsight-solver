import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync, readFileSync } from 'fs'
import path from 'path'

type DefaultConfig = {
  server?: {
    frontendHost?: string
    frontendPort?: number
    backendTarget?: string
  }
}

type PackageJson = {
  version?: string
}

function loadDefaultConfig(): DefaultConfig {
  const configPath = path.resolve(__dirname, '../config/defaults.json')
  if (!existsSync(configPath)) {
    return {}
  }
  return JSON.parse(readFileSync(configPath, 'utf-8')) as DefaultConfig
}

function loadPackageVersion(): string {
  const packagePath = path.resolve(__dirname, 'package.json')
  if (!existsSync(packagePath)) {
    return '0.0.0'
  }
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8')) as PackageJson
  return packageJson.version ?? '0.0.0'
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const defaults = loadDefaultConfig()
  const frontendHost = env.BEAM_SOLVER_FRONTEND_HOST ?? defaults.server?.frontendHost ?? '127.0.0.1'
  const frontendPort = Number(env.BEAM_SOLVER_FRONTEND_PORT ?? defaults.server?.frontendPort ?? 6241)
  const backendTarget = env.BEAM_SOLVER_BACKEND_TARGET ?? defaults.server?.backendTarget ?? 'http://127.0.0.1:6240'
  const githubRepositoryUrl = env.VITE_GITHUB_REPOSITORY_URL ?? 'https://github.com/ArchSightLabs/archsight-solver'

  return {
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(loadPackageVersion()),
      'import.meta.env.VITE_GITHUB_REPOSITORY_URL': JSON.stringify(githubRepositoryUrl),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined
            }

            if (id.includes('echarts')) {
              return 'vendor-echarts'
            }
            if (id.includes('framer-motion')) {
              return 'vendor-motion'
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons'
            }
            if (id.includes('@radix-ui')) {
              return 'vendor-radix'
            }
            if (
              id.includes('class-variance-authority') ||
              id.includes('clsx') ||
              id.includes('tailwind-merge')
            ) {
              return 'vendor-utils'
            }

            return 'vendor'
          },
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: frontendHost,
      port: frontendPort,
      strictPort: true,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
