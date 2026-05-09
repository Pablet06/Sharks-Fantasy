import type { PlayerStats, Position } from '../types'

export function calcMatchPoints(pos: Position, s: PlayerStats): number {
  let pts = s.partidos * 1
  pts += s.tarjetas * -5
  pts += s.expulsiones * -1

  if (pos === 'Portero') {
    pts += s.paradas * 2
    pts += s.goles_contra * -1
    pts += s.penaltis_parados * 3
  } else {
    pts += s.goles * 6
    pts += s.penaltis * 4
    pts += s.tiros * 2
    pts += s.penaltis_fallados * -3
  }
  return pts
}

export function calcTotalPoints(historial: { puntos: number }[]): number {
  return historial.reduce((sum, h) => sum + h.puntos, 0)
}
