// Paleta de colores de gráficos: tokens CSS (index.css) + personalización de la marca.
export type Fase = 'A' | 'B' | 'C' | 'N'
export type Magnitud = 'tension' | 'corriente' | 'potencia' | 'fp' | 'caudal' | 'energia'

export interface Paleta {
  fase: Record<'a' | 'b' | 'c' | 'n', string>
  magnitud: Record<Magnitud, string>
  consigna: string
  series: string[] // 8
}
export type PaletaParcial = {
  fase?: Partial<Paleta['fase']>
  magnitud?: Partial<Paleta['magnitud']>
  consigna?: string
  series?: (string | null)[]
}

// Debe coincidir con los tokens de index.css
export const PALETA_DEFECTO: Paleta = {
  fase: { a: '#4C8BD6', b: '#2BA59A', c: '#8E72D6', n: '#7D8B99' },
  magnitud: {
    tension: '#8E72D6', corriente: '#4C8BD6', potencia: '#2BA59A',
    fp: '#D0679B', caudal: '#5FA35F', energia: '#B5835A',
  },
  consigna: '#C9932E',
  series: ['#4C8BD6', '#2BA59A', '#8E72D6', '#C9932E', '#7D8B99', '#D0679B', '#5FA35F', '#B5835A'],
}

const N_SERIES = 8
const HEX = /^#[0-9a-f]{6}$/i
const ok = (c: unknown): c is string => typeof c === 'string' && HEX.test(c)

export const colorFase = (f: Fase) => `var(--fase-${f.toLowerCase()})`
export const colorMagnitud = (m: Magnitud) => `var(--mag-${m})`
export const colorSerie = (i: number) => `var(--serie-${(((i % N_SERIES) + N_SERIES) % N_SERIES) + 1})`
export const colorConsigna = () => 'var(--consigna)'

// Regla: fase → magnitud → serie
export function colorDeSerie(s: { fase?: Fase; magnitud?: Magnitud; indice: number }): string {
  if (s.fase) return colorFase(s.fase)
  if (s.magnitud) return colorMagnitud(s.magnitud)
  return colorSerie(s.indice)
}

export const faseDeIndice = (i: number): Fase => (['A', 'B', 'C'] as const)[((i % 3) + 3) % 3]

// Lista plana [propiedad CSS, color personalizado o undefined] de los 20 tokens
function tokens(p?: PaletaParcial | null): [string, string | undefined][] {
  const v = (c: unknown) => (ok(c) ? c : undefined)
  return [
    ...(['a', 'b', 'c', 'n'] as const).map((k): [string, string | undefined] => [`--fase-${k}`, v(p?.fase?.[k])]),
    ...(Object.keys(PALETA_DEFECTO.magnitud) as Magnitud[]).map((k): [string, string | undefined] => [`--mag-${k}`, v(p?.magnitud?.[k])]),
    ['--consigna', v(p?.consigna)],
    ...Array.from({ length: N_SERIES }, (_, i): [string, string | undefined] => [`--serie-${i + 1}`, v(p?.series?.[i])]),
  ]
}

// Defectos + personalizados válidos
export function paletaEfectiva(p?: PaletaParcial | null): Paleta {
  const d = PALETA_DEFECTO
  const f = (c: unknown, def: string) => (ok(c) ? c : def)
  return {
    fase: { a: f(p?.fase?.a, d.fase.a), b: f(p?.fase?.b, d.fase.b), c: f(p?.fase?.c, d.fase.c), n: f(p?.fase?.n, d.fase.n) },
    magnitud: Object.fromEntries(
      (Object.keys(d.magnitud) as Magnitud[]).map((k) => [k, f(p?.magnitud?.[k], d.magnitud[k])]),
    ) as Paleta['magnitud'],
    consigna: f(p?.consigna, d.consigna),
    series: d.series.map((def, i) => f(p?.series?.[i], def)),
  }
}

// Escribe solo los tokens personalizados; quita los demás para volver al defecto del CSS
export function aplicarPaleta(
  p?: PaletaParcial | null,
  st: Pick<CSSStyleDeclaration, 'setProperty' | 'removeProperty'> = document.documentElement.style,
): void {
  for (const [prop, color] of tokens(p)) {
    if (color) st.setProperty(prop, color)
    else st.removeProperty(prop)
  }
}
