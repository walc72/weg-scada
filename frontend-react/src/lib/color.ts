// Color de la marca → variables del tema (formato shadcn "h s% l%").
export function hexAHsl(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(v => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  let h = 0, s = 0
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1))
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h = (h * 60 + 360) % 360
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

// Texto blanco o oscuro según el contraste WCAG con el fondo
export function textoSobre(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.05) ? '0 0% 100%' : '217 29% 15%'
}

// null = el color del tema (claro/oscuro) que trae el CSS
export function aplicarColorPortal(hex: string | null) {
  const st = document.documentElement.style
  if (!hex) { for (const v of ['--primary', '--primary-foreground', '--ring']) st.removeProperty(v); return }
  const hsl = hexAHsl(hex)
  st.setProperty('--primary', hsl)
  st.setProperty('--ring', hsl)
  st.setProperty('--primary-foreground', textoSobre(hex))
}
