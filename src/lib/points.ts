import type { PlayerStats, Position } from '../types'

export const EMPTY_STATS: PlayerStats = {
  partidos: 0, goles: 0, goles_penalti: 0, penaltis_fallados: 0,
  faltas_penalti: 0, tarjetas: 0, expulsiones: 0, expulsiones_graves: 0,
  goles_contra: 0,
}

export function calcMatchPoints(pos: Position, s: PlayerStats): number {
  let pts = s.partidos * 1
  pts += s.faltas_penalti * -1
  pts += s.expulsiones * -1
  pts += s.tarjetas * -3
  pts += s.expulsiones_graves * -5

  if (pos === 'Portero') {
    if (s.partidos > 0) {
      pts += 2
      pts += Math.max(0, 10 - s.goles_contra)
    }
  } else {
    pts += s.goles * 5
    pts += s.goles_penalti * 3
    pts += s.penaltis_fallados * -2
  }
  return pts
}

/**
 * Estadísticas acumuladas de un jugador: suma de `historial.stats`. Es la fuente de verdad
 * de las "Estadísticas generales"; la columna `jugadores.stats` solo la refresca la RPC
 * admin `recalc_puntos()` y se queda atrasada tras cada sync. `goles_contra` es una cifra
 * por partido y no se acumula (igual que en `recalc_puntos`).
 */
export function sumarStats(historial: { stats: PlayerStats }[]): PlayerStats {
  const total = { ...EMPTY_STATS }
  for (const { stats } of historial) {
    for (const k of Object.keys(total) as (keyof PlayerStats)[]) {
      if (k !== 'goles_contra') total[k] += stats[k] ?? 0
    }
  }
  return total
}

export function calcTotalPoints(historial: { puntos: number }[]): number {
  return historial.reduce((sum, h) => sum + h.puntos, 0)
}

/** Estadística por la que se puede ordenar la lista de Jugadores. */
export type ClaveEstadistica = 'puntos' | Exclude<keyof PlayerStats, 'goles_contra'>

/** Las de la ficha (sin goles_contra, que es por partido) más Puntos, que es el orden por defecto. */
export const ESTADISTICAS: { clave: ClaveEstadistica; etiqueta: string; unidad: string }[] = [
  { clave: 'puntos', etiqueta: 'Puntos', unidad: 'pts' },
  { clave: 'partidos', etiqueta: 'Partidos', unidad: 'part.' },
  { clave: 'goles', etiqueta: 'Goles', unidad: 'goles' },
  { clave: 'goles_penalti', etiqueta: 'Goles penalti', unidad: 'pen.' },
  { clave: 'penaltis_fallados', etiqueta: 'P. fallados', unidad: 'fall.' },
  { clave: 'faltas_penalti', etiqueta: 'Faltas penalti', unidad: 'faltas' },
  { clave: 'tarjetas', etiqueta: 'Tarjetas', unidad: 'tarj.' },
  { clave: 'expulsiones', etiqueta: 'Expulsiones', unidad: 'exp.' },
  { clave: 'expulsiones_graves', etiqueta: 'Expuls. graves', unidad: 'graves' },
]

type FilaHistorial = { stats: PlayerStats; puntos: number }

/** Valor acumulado de una estadística en todo el historial (igual que las "Estadísticas generales" de la ficha). */
export function valorEstadistica(historial: FilaHistorial[], clave: ClaveEstadistica): number {
  return clave === 'puntos' ? calcTotalPoints(historial) : sumarStats(historial)[clave]
}

/** Jugadores de mayor a menor por la estadística elegida; a igualdad, por puntos totales. No muta la lista. */
export function ordenarPorEstadistica<T extends { historial?: FilaHistorial[] }>(
  jugadores: T[],
  clave: ClaveEstadistica,
): T[] {
  const v = (j: T, c: ClaveEstadistica) => valorEstadistica(j.historial ?? [], c)
  return [...jugadores].sort((a, b) => v(b, clave) - v(a, clave) || v(b, 'puntos') - v(a, 'puntos'))
}
