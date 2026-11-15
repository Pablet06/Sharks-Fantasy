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
