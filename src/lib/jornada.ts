import type { Jornada } from '../types'

const VEINTICUATRO_HORAS_MS = 24 * 60 * 60 * 1000

/**
 * Número de jornada del Fantasy ("Jornada 1") para un número de federación.
 * Cae a `numero` si la fila no existe o aún no tiene `orden` (migración sin aplicar).
 */
export function etiquetaJornada(
  jornadas: Pick<Jornada, 'numero' | 'orden'>[],
  numero: number,
): number {
  return jornadas.find(j => j.numero === numero)?.orden ?? numero
}

/**
 * La jornada abierta para draftear: la de número más bajo con fecha de
 * partido conocida, no finalizada, y a más de 24h vista. Sin fecha
 * conocida no cuenta como abierta (coincide con el fail-closed de la RLS
 * de `alineaciones`).
 */
export function jornadaAbierta(jornadas: Jornada[], ahora: Date = new Date()): number | null {
  const candidatas = jornadas.filter(j =>
    !j.finalizado &&
    j.fecha_partido !== null &&
    new Date(j.fecha_partido).getTime() - ahora.getTime() > VEINTICUATRO_HORAS_MS
  )
  if (candidatas.length === 0) return null
  return Math.min(...candidatas.map(j => j.numero))
}
