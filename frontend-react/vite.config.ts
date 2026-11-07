import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  test: { include: ['src/**/*.test.ts'] },
  build: {
    rollupOptions: {
      output: {
        // Por ruta del paquete (con la lista de nombres, react-dom y sus dependencias quedaban
        // repartidas entre chunks y aparecía un ciclo vendor-ui <-> vendor-react)
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler|react-router|cookie|set-cookie-parser)\//.test(id)) return 'vendor-react'
          if (/node_modules\/(lucide-react|sonner|zustand|use-sync-external-store)\//.test(id)) return 'vendor-ui'
        }
      }
    }
  }
})
