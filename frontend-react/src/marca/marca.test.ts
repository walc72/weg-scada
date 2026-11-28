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

  // Símbolos de estado unificados (repo de marca, estados/ en main 4aefb43): copias sin cambios y en uso
  it('los símbolos de estado copiados son los generados por la marca', () => {
    const css = leer('./hecian-estados.css'), js = leer('./hecian-estados.js')
    expect(css).toContain('generado por estados/fuente/generar.py')
    expect(js).toContain('generado por estados/fuente/generar.py')
    expect(css).toMatch(/--hlc-estado-alta: #C4122F/)
    expect(css).toMatch(/--hlc-estado-invalido: #6A3FA0/)
    expect(css).toContain(':root[data-theme="dark"]')
    for (const id of ['alta-sin-reconocer', 'media-reconocida', 'baja-normalizada', 'invalido', 'suprimida', 'fuera-de-servicio']) {
      expect(js).toContain(`"${id}"`)
    }
  })

  it('el CSS de estados se importa una vez y los tokens viejos apuntan a la marca, sin verde para la marcha', () => {
    const index = leer('../index.css')
    expect(index.match(/@import '\.\/marca\/hecian-estados\.css'/g)).toHaveLength(1)
    expect(index).toMatch(/--p1: var\(--hlc-estado-alta\)/)
    expect(index).toMatch(/--p2: var\(--hlc-estado-media\)/)
    expect(index).toMatch(/--p3: var\(--hlc-estado-baja\)/)
    expect(index).toMatch(/--st-com: var\(--hlc-estado-invalido\)/)
    expect(index).not.toMatch(/--st-run: #/)
    expect(index).not.toMatch(/#1A8544|#3DBE6B|#146A96|#4FB3E8/)
    // naranja y amarillo no van como color de texto
    expect(index).toMatch(/--p2-text: hsl\(var\(--foreground\)\)/)
    expect(index).toMatch(/--p3-text: hsl\(var\(--foreground\)\)/)
  })

  it('no quedan los rótulos viejos P1/P2/P3 de colores ni las insignias ONLINE/OFFLINE', () => {
    const chip = leer('../components/CampoBase.tsx')
    expect(chip).toContain('SimboloEstado')
    expect(chip).not.toMatch(/background: 'var\(--p[123]\)'/)
    for (const f of ['../components/AlarmBanner.tsx', '../components/StatusBar.tsx', '../views/Alarmas.tsx', '../components/MotorStrip.tsx', '../components/DriveCard.tsx']) {
      const src = leer(f)
      expect(src, f).toContain('SimboloEstado')
      expect(src, f).not.toMatch(/'P[123]'|>P3</)
      expect(src, f).not.toContain('#16191C')
    }
    for (const f of ['../views/config/CampoSection.tsx', '../views/config/CommsSection.tsx', '../views/config/FlowmetersSection.tsx', '../components/CampoBase.tsx']) {
      expect(leer(f), f).not.toMatch(/>(ONLINE|OFFLINE)</)
    }
  })
})
