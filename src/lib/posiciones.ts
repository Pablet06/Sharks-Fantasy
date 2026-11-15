import type { Alineacion, Jornada } from '../types'
import { posicionRanking } from './ranking'

export interface PosicionUsuario {
  usuarioId: string
  /** Puntos de la jornada; null = «No jugó» (sin alineación puntuada). */
  puntos: number | null
  /** Suma de `puntos_jornada` hasta esta jornada incluida (por `orden`). */
  acumulado: number
  /** Puesto en la jornada entre quienes jugaron; null = «No jugó». */
  posJornada: number | null
  /** Puesto en el acumulado entre todos los usuarios (el de la última jornada = Clasificación general). */
  posAcumulado: number
}

export interface PosicionesJornada {
  /** Número de federación, la clave con la que se cruza `alineaciones.jornada`. */
  numero: number
  /** Etiqueta visible ("Jornada 1"). */
  orden: number
  /** Usuarios con alineación puntuada: el total de «N.º de M» en la jornada. */
  jugaron: number
  /** Todos los usuarios: el total de «N.º de M» en el acumulado. */
  total: number
  /** Una fila por usuario, sin ordenar. */
  filas: PosicionUsuario[]
}

/**
 * Puestos de cada usuario en cada jornada finalizada, por puntos de la jornada y por acumulado.
 * Ordena por `orden`, nunca por `numero` (la federación renumeró y no es cronológico). Los empates
 * comparten puesto (1, 2, 2, 4), igual que la clasificación general (`posicionRanking`).
 */
export function posicionesPorJornada(
  usuarios: { id: string }[],
  alineaciones: Pick<Alineacion, 'usuario_id' | 'jornada' | 'puntos_jornada'>[],
  jornadas: Pick<Jornada, 'numero' | 'orden' | 'finalizado'>[],
): PosicionesJornada[] {
  const acumulado = new Map(usuarios.map(u => [u.id, 0]))
  return jornadas
    .filter(j => j.finalizado)
    .sort((a, b) => a.orden - b.orden)
    .map(j => {
      const puntos = new Map<string, number>()
      for (const a of alineaciones) {
        if (a.jornada === j.numero && a.puntos_jornada !== null && acumulado.has(a.usuario_id)) {
          puntos.set(a.usuario_id, a.puntos_jornada)
        }
      }
      for (const [id, p] of puntos) acumulado.set(id, acumulado.get(id)! + p)
      const jugaron = [...puntos.values()].map(p => ({ puntos: p }))
      const todos = [...acumulado.values()].map(p => ({ puntos: p }))
      return {
        numero: j.numero,
        orden: j.orden,
        jugaron: jugaron.length,
        total: usuarios.length,
        filas: usuarios.map(u => {
          const p = puntos.get(u.id) ?? null
          const acum = acumulado.get(u.id)!
          return {
            usuarioId: u.id,
            puntos: p,
            acumulado: acum,
            posJornada: p === null ? null : posicionRanking(jugaron, p),
            posAcumulado: posicionRanking(todos, acum),
          }
        }),
      }
    })
}

/** «3.º de 17». */
export function formatoPuesto(pos: number, total: number): string {
  return `${pos}.º de ${total}`
}
