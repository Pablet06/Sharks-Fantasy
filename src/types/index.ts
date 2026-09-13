export interface PlayerStats {
  partidos: number
  goles: number
  goles_penalti: number
  penaltis_fallados: number
  faltas_penalti: number
  tarjetas: number
  expulsiones: number
  expulsiones_graves: number
  goles_contra: number
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
  leverade_id: number | null
  stats: PlayerStats
  historial?: HistorialEntry[]
}

export interface Usuario {
  id: string
  nombre: string
  equipo: number[]
  puntos: number
  created_at: string
  is_admin: boolean
}

export interface Jornada {
  numero: number
  fecha_partido: string | null
  resultado: 'gana' | 'pierde' | 'empata' | null
  goles_favor: number | null
  goles_contra: number | null
  finalizado: boolean
}

export interface Alineacion {
  id: number
  usuario_id: string
  jornada: number
  jugadores: number[] | null
  capitan: number | null
  presupuesto_usado: number | null
  puntos_jornada: number | null
  creado_en: string
  actualizado_en: string
}

export interface Apuesta {
  id: number
  usuario_id: string
  jornada: number
  tipo: 'resultado' | 'goleador' | 'expulsado' | 'porteria'
  seleccion: string
  importe: number
  cuota: number | null
  resuelto: boolean
  acierto: boolean | null
  ganancia: number | null
  creado_en: string
}
