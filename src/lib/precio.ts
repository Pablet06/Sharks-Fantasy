import type { HistorialEntry } from '../types'

/**
 * Precio de fantasy de un jugador: base 100€ + 12€ por cada punto de fantasy
 * de media en sus últimas 5 jornadas jugadas (partidos > 0), con un suelo de
 * 50€. El multiplicador (12) es una constante a recalibrar si el "mejor 7"
 * no queda claramente por encima del presupuesto base de 1000€ — ver
 * docs/superpowers/specs/2026-09-11-fantasy-dinamico-design.md.
 */
export function calcPrecio(historial: HistorialEntry[]): number {
  const jugadas = historial
    .filter(h => h.stats.partidos > 0)
    .sort((a, b) => b.jornada - a.jornada)
    .slice(0, 5)
  if (jugadas.length === 0) return 50
  const media = jugadas.reduce((sum, h) => sum + h.puntos, 0) / jugadas.length
  return Math.max(50, Math.round(100 + 12 * media))
}
