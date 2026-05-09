export interface PlayerStats {
  partidos: number
  goles: number
  penaltis: number
  tarjetas: number
  expulsiones: number
  tiros: number
  penaltis_fallados: number
  paradas: number
  goles_contra: number
  penaltis_parados: number
}

export type Position = 'Portero' | 'Boya' | 'Extremo' | 'Lateral' | 'Contraboya'

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
