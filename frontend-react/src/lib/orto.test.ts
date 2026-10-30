import { describe, expect, it } from 'vitest'
import { rutaOrto } from './orto'

describe('rutaOrto', () => {
  it('casos de siempre: vertical-vertical por la mitad, mixto en L', () => {
    expect(rutaOrto(0, 0, 'bottom', 100, 100, 'top')[0]).toBe('M0,0 V50 H100 V100')
    expect(rutaOrto(0, 0, 'bottom', 100, 100, 'left')[0]).toBe('M0,0 V100 H100')
    expect(rutaOrto(0, 0, 'right', 100, 100, 'left')[0]).toBe('M0,0 H50 V100 H100')
  })
  it('borne que mira hacia el lado contrario: sale 20 px y rodea, sin cruzar el símbolo', () => {
    // borne a la izquierda y la otra punta a la derecha
    expect(rutaOrto(40, 224, 'left', 161, 200, 'left')[0]).toBe('M40,224 H20 V200 H161')
    // borne arriba y la otra punta abajo
    expect(rutaOrto(0, 0, 'top', 0, 100, 'top')[0]).toBe('M0,0 V-20 H0 V100')
  })
  it('las dos puntas de espaldas', () => {
    expect(rutaOrto(0, 0, 'left', 100, 0, 'right')[0]).toBe('M0,0 H-20 H120 V0 H100')
  })
  it('entrada de espaldas desde abajo (bloque de sitio): sube antes de cruzar, no pasa por detrás', () => {
    // punto de barra mirando a la derecha, abajo a la izquierda; entrada del bloque arriba, a la derecha
    expect(rutaOrto(0, 100, 'right', 200, 0, 'top', 'p10', 'a')[0]).toBe('M0,100 V-20 H200 V0')
  })
  it('los puntos de barra (p0…) no salen: el cruce de una barra no molesta', () => {
    expect(rutaOrto(0, 0, 'bottom', 100, -100, 'left', 'p2')[0]).toBe('M0,0 V-100 H100')
  })
})
