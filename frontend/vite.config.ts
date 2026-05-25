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

function loadDefaultConfig(): DefaultConfig {
  const configPath = path.resolve(__dirname, '../config/defaults.json')
  if (!existsSync(configPath)) {
    return {}
  }
  return JSON.parse(readFileSync(configPath, 'utf-8')) as DefaultConfig
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const defaults = loadDefaultConfig()
  const frontendHost = env.BEAM_SOLVER_FRONTEND_HOST ?? defaults.server?.frontendHost ?? '127.0.0.1'
  const frontendPort = Number(env.BEAM_SOLVER_FRONTEND_PORT ?? defaults.server?.frontendPort ?? 6241)
  const backendTarget = env.BEAM_SOLVER_BACKEND_TARGET ?? defaults.server?.backendTarget ?? 'http://127.0.0.1:6240'

  return {
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
