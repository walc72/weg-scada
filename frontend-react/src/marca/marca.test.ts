import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Marca HECIAN LC v0.2.0 en el portal: botones, fuentes locales, firma e íconos (plantillas/ESTANDAR.md)
const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8')
const existe = (ruta: string) => existsSync(new URL(ruta, import.meta.url))

describe('marca HECIAN LC', () => {
  it('los botones copiados son los de la v0.2.0 y el deshabilitado no lleva relleno', () => {
    const css = leer('./hecian-botones.css')
    expect(css).toContain('HECIAN LC · botones · v0.2.0')
    const regla = css.slice(css.indexOf('.hlc-btn:disabled'), css.indexOf('}', css.indexOf('.hlc-btn:disabled')))
    expect(regla).toContain('background: transparent')
    expect(regla).toContain('dashed var(--hlc-off-borde)')
  })

  it('el destructivo va en contorno burdeos, nunca relleno', () => {
    const css = leer('./hecian-botones.css')
    expect(css).toMatch(/--hlc-destr: #8C1C2B/)
    const regla = css.slice(css.indexOf('.hlc-btn--destructivo {'), css.indexOf('}', css.indexOf('.hlc-btn--destructivo {')))
    expect(regla).toContain('background: var(--hlc-sec-fondo)')
    expect(regla).toContain('border-color: var(--hlc-destr)')
    const boton = leer('../components/ui/button.tsx')
    expect(boton).toContain("destructiveSolid: 'hlc-btn--destructivo'")
  })

  it('están los SVG de la firma y del isotipo en claro y oscuro', () => {
    for (const f of ['firma-claro.svg', 'firma-oscuro.svg', 'isotipo-positivo.svg', 'isotipo-negativo.svg']) {
      expect(existe(`./${f}`), f).toBe(true)
    }
  })

  it('las fuentes se sirven del portal, con su licencia OFL y sin Google Fonts', () => {
    const css = leer('./fuentes.css') + leer('../index.css')
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic/)
    for (const familia of ['inter', 'barlow-condensed', 'jetbrains-mono']) {
      const dir = new URL(`../../public/fuentes/${familia}/`, import.meta.url)
      expect(readFileSync(new URL('OFL.txt', dir), 'utf8')).toContain('SIL Open Font License')
      for (const f of readdirSync(dir).filter(f => f.endsWith('.woff2'))) expect(css).toContain(`/fuentes/${familia}/${f}`)
    }
  })

  it('package.json declara la licencia propietaria', () => {
    const pkg = JSON.parse(leer('../../package.json'))
    expect(pkg).toMatchObject({ license: 'UNLICENSED', private: true, author: 'HECIAN LC' })
  })

  it('el favicon y los íconos de la PWA son los del isotipo', () => {
    const html = leer('../../index.html')
    expect(html).toContain('href="/favicon.svg"')
    expect(html).toContain('href="/favicon.ico"')
    expect(html).toContain('data-theme="light"')
    for (const f of ['favicon.ico', 'favicon.svg', 'favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png']) {
      expect(existe(`../../public/${f}`), f).toBe(true)
    }
    const manifest = JSON.parse(leer('../../public/manifest.webmanifest'))
    expect(manifest.icons.filter((i: { purpose: string }) => i.purpose === 'maskable').map((i: { src: string }) => i.src))
      .toEqual(['/icon-maskable-192.png', '/icon-maskable-512.png'])
  })
})
