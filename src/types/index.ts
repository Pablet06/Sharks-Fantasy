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

export interface HistorialEntry {
  id: number
  jugador_id: number
  jornada: number
  stats: PlayerStats
  puntos: number
  date: string
}

export interface Jugador {
  id: number
  numero: number
  name: string
  nick: string | null
  pos: Position
  phrase: string | null
  photo: string | null
  stats: PlayerStats
  historial?: HistorialEntry[]
}

export interface Usuario {
  id: string
  nombre: string
  equipo: number[]
  puntos: number
  created_at: string
}
