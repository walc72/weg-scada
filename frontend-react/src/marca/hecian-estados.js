// Símbolos de estado HECIAN LC · generado por estados/fuente/generar.py (no editar a mano).
// Siguen el tema si la app carga hecian-estados.css (variables --hlc-estado-*); si no, usan los colores claros.
//   simboloEstado('alta', 'sin-reconocer')      -> HTML del SVG
//   simboloEstado('invalido')                    -> sin comunicación / dato no válido
//   simboloEstado('suprimida') · simboloEstado('fuera-de-servicio')
//   const SimboloEstado = crearSimboloReact(React); <SimboloEstado prioridad="media" variante="reconocida" tamano={16} />
export const SIMBOLOS = {
  "alta-sin-reconocer": {
    "etiqueta": "Alarma alta, sin reconocer",
    "cuerpo": "<rect x=\"2.5\" y=\"2.5\" width=\"15\" height=\"15\" rx=\"0.5\" fill=\"var(--hlc-estado-alta, #C4122F)\" stroke=\"var(--hlc-estado-alta, #C4122F)\" stroke-width=\"1.2\" stroke-linejoin=\"round\"/><path d=\"M8.6 6.6 10.6 5v10\" transform=\"translate(10 10) scale(0.95) translate(-10 -10)\" fill=\"none\" stroke=\"var(--hlc-estado-alta-num, #FFFFFF)\" stroke-width=\"2.21\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"
  },
  "alta-reconocida": {
    "etiqueta": "Alarma alta, reconocida",
    "cuerpo": "<rect x=\"2.5\" y=\"2.5\" width=\"15\" height=\"15\" rx=\"0.5\" fill=\"none\" stroke=\"var(--hlc-estado-alta-trazo, #C4122F)\" stroke-width=\"1.6\" stroke-linejoin=\"round\"/><path d=\"M8.6 6.6 10.6 5v10\" transform=\"translate(10 10) scale(0.95) translate(-10 -10)\" fill=\"none\" stroke=\"var(--hlc-estado-alta-trazo, #C4122F)\" stroke-width=\"2.21\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"
  },
  "alta-normalizada": {
    "etiqueta": "Alarma alta, normalizada sin reconocer",
    "cuerpo": "<rect x=\"2.5\" y=\"2.5\" width=\"15\" height=\"15\" rx=\"0.5\" fill=\"none\" stroke=\"var(--hlc-estado-alta-trazo, #C4122F)\" stroke-width=\"1.6\" stroke-linejoin=\"round\" stroke-dasharray=\"2.6 2\"/><path d=\"M8.6 6.6 10.6 5v10\" transform=\"translate(10 10) scale(0.95) translate(-10 -10)\" fill=\"none\" stroke=\"var(--hlc-estado-alta-trazo, #C4122F)\" stroke-width=\"2.21\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"
  },
  "media-sin-reconocer": {
    "etiqueta": "Alarma media, sin reconocer",
    "cuerpo": "<path d=\"M10 1.8 18.6 17.2H1.4Z\" fill=\"var(--hlc-estado-media, #D96A00)\" stroke=\"var(--hlc-estado-contorno, #1D2228)\" stroke-width=\"1.2\" stroke-linejoin=\"round\"/><path d=\"M7.6 7.4c0-1.5 1.1-2.4 2.4-2.4 1.4 0 2.5.9 2.5 2.3 0 1.3-.8 2-1.8 2.9L7.6 15h5\" transform=\"translate(10 13.2) scale(0.68) translate(-10 -10)\" fill=\"none\" stroke=\"var(--hlc-estado-media-num, #1D2228)\" stroke-width=\"3.09\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"
  },
  "media-reconocida": {
    "etiqueta": "Alarma media, reconocida",
    "cuerpo": "<path d=\"M10 1.8 18.6 17.2H1.4Z\" fill=\"none\" stroke=\"var(--hlc-estado-media-trazo, #B35600)\" stroke-width=\"1.6\" stroke-linejoin=\"round\"/><path d=\"M7.6 7.4c0-1.5 1.1-2.4 2.4-2.4 1.4 0 2.5.9 2.5 2.3 0 1.3-.8 2-1.8 2.9L7.6 15h5\" transform=\"translate(10 13.2) scale(0.68) translate(-10 -10)\" fill=\"none\" stroke=\"var(--hlc-estado-media-trazo, #B35600)\" stroke-width=\"3.09\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"
  },
  "media-normalizada": {
    "etiqueta": "Alarma media, normalizada sin reconocer",
    "cuerpo": "<path d=\"M10 1.8 18.6 17.2H1.4Z\" fill=\"none\" stroke=\"var(--hlc-estado-media-trazo, #B35600)\" stroke-width=\"1.6\" stroke-linejoin=\"round\" stroke-dasharray=\"2.6 2\"/><path d=\"M7.6 7.4c0-1.5 1.1-2.4 2.4-2.4 1.4 0 2.5.9 2.5 2.3 0 1.3-.8 2-1.8 2.9L7.6 15h5\" transform=\"translate(10 13.2) scale(0.68) translate(-10 -10)\" fill=\"none\" stroke=\"var(--hlc-estado-media-trazo, #B35600)\" stroke-width=\"3.09\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"
  },
  "baja-sin-reconocer": {
    "etiqueta": "Alarma baja, sin reconocer",
    "cuerpo": "<path d=\"M10 1.2 18.8 10 10 18.8 1.2 10Z\" fill=\"var(--hlc-estado-baja, #E2B100)\" stroke=\"var(--hlc-estado-contorno, #1D2228)\" stroke-width=\"1.2\" stroke-linejoin=\"round\"/><path d=\"M7.7 6c.6-.7 1.4-1 2.3-1 1.3 0 2.4.8 2.4 2.1 0 1.2-1 2-2.4 2 1.6 0 2.6.9 2.6 2.3 0 1.5-1.2 2.6-2.7 2.6-1 0-1.9-.4-2.5-1.1\" transform=\"translate(10 10) scale(0.72) translate(-10 -10)\" fill=\"none\" stroke=\"var(--hlc-estado-baja-num, #1D2228)\" stroke-width=\"2.92\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"
  },
  "baja-reconocida": {
    "etiqueta": "Alarma baja, reconocida",
    "cuerpo": "<path d=\"M10 1.2 18.8 10 10 18.8 1.2 10Z\" fill=\"none\" stroke=\"var(--hlc-estado-baja-trazo, #8F7000)\" stroke-width=\"1.6\" stroke-linejoin=\"round\"/><path d=\"M7.7 6c.6-.7 1.4-1 2.3-1 1.3 0 2.4.8 2.4 2.1 0 1.2-1 2-2.4 2 1.6 0 2.6.9 2.6 2.3 0 1.5-1.2 2.6-2.7 2.6-1 0-1.9-.4-2.5-1.1\" transform=\"translate(10 10) scale(0.72) translate(-10 -10)\" fill=\"none\" stroke=\"var(--hlc-estado-baja-trazo, #8F7000)\" stroke-width=\"2.92\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"
  },
  "baja-normalizada": {
    "etiqueta": "Alarma baja, normalizada sin reconocer",
    "cuerpo": "<path d=\"M10 1.2 18.8 10 10 18.8 1.2 10Z\" fill=\"none\" stroke=\"var(--hlc-estado-baja-trazo, #8F7000)\" stroke-width=\"1.6\" stroke-linejoin=\"round\" stroke-dasharray=\"2.6 2\"/><path d=\"M7.7 6c.6-.7 1.4-1 2.3-1 1.3 0 2.4.8 2.4 2.1 0 1.2-1 2-2.4 2 1.6 0 2.6.9 2.6 2.3 0 1.5-1.2 2.6-2.7 2.6-1 0-1.9-.4-2.5-1.1\" transform=\"translate(10 10) scale(0.72) translate(-10 -10)\" fill=\"none\" stroke=\"var(--hlc-estado-baja-trazo, #8F7000)\" stroke-width=\"2.92\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"
  },
  "invalido": {
    "etiqueta": "Sin comunicación / dato no válido",
    "cuerpo": "<circle cx=\"10\" cy=\"10\" r=\"8\" fill=\"var(--hlc-estado-invalido, #6A3FA0)\" stroke=\"var(--hlc-estado-invalido, #6A3FA0)\" stroke-width=\"1.2\" stroke-linejoin=\"round\"/><path d=\"M7.9 7.4c0-1.4 1-2.4 2.2-2.4 1.3 0 2.3.9 2.3 2.1 0 1.8-2.4 2.1-2.4 4.1M10 14.6h.01\" transform=\"translate(10 10) scale(0.9) translate(-10 -10)\" fill=\"none\" stroke=\"var(--hlc-estado-invalido-num, #FFFFFF)\" stroke-width=\"2.33\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"
  },
  "suprimida": {
    "etiqueta": "Suprimida",
    "cuerpo": "<circle cx=\"10\" cy=\"10\" r=\"7.6\" fill=\"none\" stroke=\"var(--hlc-estado-neutro, #6B7177)\" stroke-width=\"1.6\"/><path d=\"M4.8 15.2 15.2 4.8\" stroke=\"var(--hlc-estado-neutro, #6B7177)\" stroke-width=\"1.6\" stroke-linecap=\"round\"/>"
  },
  "fuera-de-servicio": {
    "etiqueta": "Fuera de servicio",
    "cuerpo": "<rect x=\"2.8\" y=\"2.8\" width=\"14.4\" height=\"14.4\" rx=\"0.5\" fill=\"none\" stroke=\"var(--hlc-estado-neutro, #6B7177)\" stroke-width=\"1.6\"/><path d=\"M6 10h8\" stroke=\"var(--hlc-estado-neutro, #6B7177)\" stroke-width=\"2\" stroke-linecap=\"round\"/>"
  }
};

export function idEstado(prioridad, variante = 'sin-reconocer') {
  if (prioridad === 'invalido' || prioridad === 'suprimida' || prioridad === 'fuera-de-servicio') return prioridad;
  return `${prioridad}-${variante}`;
}

export function simboloEstado(prioridad, variante = 'sin-reconocer', { tamano = 16, titulo } = {}) {
  const s = SIMBOLOS[idEstado(prioridad, variante)];
  if (!s) throw new Error(`Estado desconocido: ${prioridad} / ${variante}`);
  const t = titulo ?? s.etiqueta;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="${tamano}" height="${tamano}" role="img" aria-label="${t}"><title>${t}</title>${s.cuerpo}</svg>`;
}

export function crearSimboloReact(React) {
  return function SimboloEstado({ prioridad, variante = 'sin-reconocer', tamano = 16, titulo, className = '', ...resto }) {
    const s = SIMBOLOS[idEstado(prioridad, variante)];
    if (!s) return null;
    return React.createElement('svg', {
      xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 20 20', width: tamano, height: tamano,
      role: 'img', 'aria-label': titulo ?? s.etiqueta, className: `hlc-simbolo ${className}`.trim(),
      dangerouslySetInnerHTML: { __html: s.cuerpo }, ...resto,
    });
  };
}
