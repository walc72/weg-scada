import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'

// Versión y fecha de compilación para «Acerca de» (marca HECIAN LC): el release pasa la etiqueta (vX.Y.Z) en
// APP_VERSION al construir la imagen; en desarrollo queda la del package.json con «-dev».
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const version = process.env.APP_VERSION || `${pkg.version}-dev`

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
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
