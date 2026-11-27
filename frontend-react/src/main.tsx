import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { ThemeProvider } from './lib/theme'
import { Toaster } from 'sonner'
import App from './App'
// Estilos: index.css trae las fuentes de la marca HECIAN LC (woff2 locales en public/fuentes/, sin Google),
// la paleta y los botones (src/marca/)
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
        <Toaster richColors position="top-right" />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)

// PWA: registrar el service worker (instalable + shell offline)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* PWA opcional */ })
  })
}
