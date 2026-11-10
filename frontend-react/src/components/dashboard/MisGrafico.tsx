import { useMemo } from 'react'
import { usePrefs } from '../../store/prefs'
import GraficoUsuario from '../GraficoUsuario'
import { useSeriesVentana } from '@/lib/useSeriesVentana'
import { Seccion, type GadgetProps } from './GadgetMarco'

// ponytail: ventana fija de 24 h (la de Históricos por defecto); opción `ventanaH` si se pide
export default function MisGrafico({ opciones }: GadgetProps<{ grafico: string }>) {
  const graficos = usePrefs(s => s.misGraficos)
  const g = graficos?.find(x => x.id === opciones.grafico)
  const { datos: data } = useSeriesVentana(24)   // null (no live, cargando o Influx caído) → buffer en memoria
  // se corre con cada refresco; sin InfluxDB el buffer en memoria ya es corto: sin recorte
  const since = useMemo(() => (data ? Date.now() - 24 * 3600_000 : 0), [data])
  if (!g) return <Seccion titulo="MIS GRÁFICOS"><p className="text-sm text-muted-foreground">Este gráfico ya no existe.</p></Seccion>
  return <GraficoUsuario grafico={g} data={data} since={since} until={Infinity} />
}
