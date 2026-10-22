import type { HistorialEntry } from '../types'

/** € por cada punto de fantasy de media. Constante a recalibrar con datos reales. */
export const MULTIPLICADOR_PRECIO = 22
const PRECIO_MINIMO = 50
const VENTANA = 5

const jugadas = (h: HistorialEntry[]) =>
  h.filter(e => e.stats.partidos > 0).sort((a, b) => b.jornada - a.jornada)

/**
 * Precio de fantasy: máx(50, redondeo(50 + MULTIPLICADOR_PRECIO × media)) sobre
 * las últimas 5 jornadas jugadas (partidos > 0). Ventana mixta: primero las de
 * la temporada actual (más recientes primero), completada con las de la
 * temporada anterior hasta 5. Sin historial = 50€.
 */
export function calcPrecio(historial: HistorialEntry[], anterior: HistorialEntry[] = []): number {
  const ventana = [...jugadas(historial), ...jugadas(anterior)].slice(0, VENTANA)
  if (ventana.length === 0) return PRECIO_MINIMO
  const media = ventana.reduce((sum, h) => sum + h.puntos, 0) / ventana.length
  return Math.max(PRECIO_MINIMO, Math.round(50 + MULTIPLICADOR_PRECIO * media))
}
