import type { HistorialEntry, Jornada } from '../types'
import { etiquetaJornada } from './jornada'

/** € por cada punto de fantasy de media. Constante a recalibrar con datos reales. */
export const MULTIPLICADOR_PRECIO = 22
const PRECIO_MINIMO = 50
const VENTANA = 5

/** Jugadas, de la más reciente a la más antigua según `orden(numero de jornada)`. */
const jugadas = (h: HistorialEntry[], orden: (jornada: number) => number = n => n) =>
  h.filter(e => e.stats.partidos > 0).sort((a, b) => orden(b.jornada) - orden(a.jornada))

/**
 * Precio de fantasy: máx(50, redondeo(50 + MULTIPLICADOR_PRECIO × media)) sobre
 * las últimas 5 jornadas jugadas (partidos > 0). Ventana mixta: primero las de
 * la temporada actual (más recientes primero), completada con las de la
 * temporada anterior hasta 5. Sin historial = 50€.
 *
 * "Más reciente" se decide por `jornadas.orden` (el número de federación no es
 * cronológico tras la renumeración del calendario). `jornadas` solo ordena la
 * temporada actual: los números de la anterior no están en esa tabla y podrían
 * colisionar con los actuales.
 */
export function calcPrecio(
  historial: HistorialEntry[],
  anterior: HistorialEntry[] = [],
  jornadas: Pick<Jornada, 'numero' | 'orden'>[] = [],
): number {
  const ventana = [...jugadas(historial, n => etiquetaJornada(jornadas, n)), ...jugadas(anterior)].slice(0, VENTANA)
  if (ventana.length === 0) return PRECIO_MINIMO
  const media = ventana.reduce((sum, h) => sum + h.puntos, 0) / ventana.length
  return Math.max(PRECIO_MINIMO, Math.round(50 + MULTIPLICADOR_PRECIO * media))
}

export interface PuntoEvolucion {
  /** Número de federación (clave de `historial.jornada`). */
  jornada: number
  /** Número de jornada del Fantasy ("Jornada 1"); el eje X de la gráfica. */
  orden: number
  puntos: number
  /** false si el jugador no jugó (fila densa con partidos = 0). */
  jugada: boolean
  /** Precio (€) tras esta jornada. No hay precios guardados: se reconstruye con `calcPrecio`. */
  precio: number
}

/**
 * Puntos y precio del jugador tras cada jornada de su historial, por `orden`. El precio
 * de cada punto es `calcPrecio` con el historial hasta esa jornada, así que el último
 * coincide con el precio actual del Draft. Si se recalibra la fórmula, la serie pasada cambia.
 */
export function evolucionJugador(
  historial: HistorialEntry[],
  anterior: HistorialEntry[],
  jornadas: Pick<Jornada, 'numero' | 'orden'>[],
): PuntoEvolucion[] {
  const filas = historial
    .map(h => ({ h, orden: etiquetaJornada(jornadas, h.jornada) }))
    .sort((a, b) => a.orden - b.orden)
  return filas.map(({ h, orden }, i) => ({
    jornada: h.jornada,
    orden,
    puntos: h.puntos,
    jugada: h.stats.partidos > 0,
    precio: calcPrecio(filas.slice(0, i + 1).map(f => f.h), anterior, jornadas),
  }))
}
