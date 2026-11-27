/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: string
  readonly VITE_MQTT_URL?: string
  readonly VITE_API_BASE?: string
}

// Definidas en vite.config.ts (pantalla «Acerca de»)
declare const __APP_VERSION__: string
declare const __BUILD_DATE__: string

interface ImportMeta {
  readonly env: ImportMetaEnv
}
