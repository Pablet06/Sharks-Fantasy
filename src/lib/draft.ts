import type { Position } from '../types'

export type ResultadoValidacion = { ok: true } | { ok: false; error: string }

/** Composición obligatoria del 7: 1 Portero, 2 Extremos, 2 Laterales, 1 Boya,
 * 1 Contraboya. Misma regla que el trigger de `alineaciones` en la base de datos. */
export const COMPOSICION: Record<Position, number> = {
  Portero: 1, Extremo: 2, Lateral: 2, Boya: 1, Contraboya: 1,
}

export function contarPosiciones(
  jugadores: number[],
  posiciones: Record<number, Position>,
): Record<Position, number> {
  const cuenta: Record<Position, number> = { Portero: 0, Extremo: 0, Lateral: 0, Boya: 0, Contraboya: 0 }
  for (const n of jugadores) {
    const pos = posiciones[n]
    if (pos) cuenta[pos]++
  }
  return cuenta
}

/** Reglas de un draft válido: exactamente 7 dorsales distintos, capitán
 * entre ellos, composición por posiciones y coste total dentro del
 * presupuesto disponible. */
export function validarDraft(
  jugadores: number[],
  capitan: number | null,
  precios: Record<number, number>,
  presupuesto: number,
  posiciones: Record<number, Position>,
): ResultadoValidacion {
  if (jugadores.length !== 7) return { ok: false, error: 'Elige exactamente 7 jugadores.' }
  if (new Set(jugadores).size !== 7) return { ok: false, error: 'No puedes repetir jugador.' }
  if (capitan === null || !jugadores.includes(capitan)) {
    return { ok: false, error: 'Elige un capitán de tu 7.' }
  }
  const cuenta = contarPosiciones(jugadores, posiciones)
  const mal = (Object.keys(COMPOSICION) as Position[]).filter(p => cuenta[p] !== COMPOSICION[p])
  if (mal.length > 0) {
    const detalle = mal.map(p => `${p} ${cuenta[p]}/${COMPOSICION[p]}`).join(', ')
    return {
      ok: false,
      error: `Composición incorrecta (${detalle}). Necesitas 1 Portero, 2 Extremos, 2 Laterales, 1 Boya y 1 Contraboya.`,
    }
  }
  const usado = jugadores.reduce((sum, n) => sum + (precios[n] ?? 0), 0)
  if (usado > presupuesto) {
    return { ok: false, error: `Te pasas del presupuesto (${usado}€ de ${presupuesto}€).` }
  }
  return { ok: true }
}
