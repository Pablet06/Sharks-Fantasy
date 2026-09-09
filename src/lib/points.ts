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

export function calcTotalPoints(historial: { puntos: number }[]): number {
  return historial.reduce((sum, h) => sum + h.puntos, 0)
}
