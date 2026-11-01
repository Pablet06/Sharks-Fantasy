import type { Alineacion, Jornada, Position } from '../types'
import { etiquetaJornada } from './jornada'

export type ResultadoValidacion = { ok: true } | { ok: false; error: string }

/** Máximo de jugadores que se pueden repetir de la alineación anterior.
 * Misma cifra que el trigger `alineaciones_repeticion` de la base de datos. */
export const MAX_REPETIDOS = 4

export type AlineacionPrevia = Pick<Alineacion, 'jugadores' | 'capitan'>

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

/** Cuántos de `jugadores` ya estaban en la alineación anterior (0 sin anterior). */
export function contarRepetidos(jugadores: number[], anterior: AlineacionPrevia | null): number {
  const previos = anterior?.jugadores ?? []
  return jugadores.filter(n => previos.includes(n)).length
}

/** Con `MAX_REPETIDOS` ya elegidos, el resto de la alineación anterior no se
 * puede añadir (los jugadores nuevos siguen libres). */
export function repetidoBloqueado(
  numero: number,
  elegidos: number[],
  anterior: AlineacionPrevia | null,
): boolean {
  return (anterior?.jugadores ?? []).includes(numero) && contarRepetidos(elegidos, anterior) >= MAX_REPETIDOS
}

/** La última alineación del usuario antes de `numeroActual`: la de mayor `orden`
 * estrictamente menor (el `numero` de federación no sigue el calendario). */
export function alineacionAnterior(
  jornadas: Pick<Jornada, 'numero' | 'orden'>[],
  alineaciones: Pick<Alineacion, 'jornada' | 'jugadores' | 'capitan'>[],
  numeroActual: number,
): AlineacionPrevia | null {
  const orden = (numero: number) => etiquetaJornada(jornadas, numero)
  const actual = orden(numeroActual)
  return alineaciones
    .filter(a => orden(a.jornada) < actual)
    .sort((a, b) => orden(b.jornada) - orden(a.jornada))[0] ?? null
}

/** Filas de la piscina de arriba abajo: Contraboya / Laterales /
 * Extremo + Boya + Extremo (boya en el centro) / Portero. */
export function filasFormacion<T extends { pos: Position }>(js: T[]): T[][] {
  const de = (pos: Position) => js.filter(j => j.pos === pos)
  const extremos = de('Extremo')
  return [de('Contraboya'), de('Lateral'), [...extremos.slice(0, 1), ...de('Boya'), ...extremos.slice(1)], de('Portero')]
}

/** Reglas de un draft válido: exactamente 7 dorsales distintos, capitán
 * entre ellos, composición por posiciones, no repetir capitán ni más de
 * `MAX_REPETIDOS` jugadores de la alineación anterior (si se pasa) y coste
 * total dentro del presupuesto disponible. */
export function validarDraft(
  jugadores: number[],
  capitan: number | null,
  precios: Record<number, number>,
  presupuesto: number,
  posiciones: Record<number, Position>,
  anterior: AlineacionPrevia | null = null,
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
  if (anterior?.capitan != null && capitan === anterior.capitan) {
    return { ok: false, error: 'No puedes repetir el capitán de tu alineación anterior.' }
  }
  const repetidos = contarRepetidos(jugadores, anterior)
  if (repetidos > MAX_REPETIDOS) {
    return {
      ok: false,
      error: `Repites ${repetidos} jugadores de tu alineación anterior (máximo ${MAX_REPETIDOS}): cambia al menos ${7 - MAX_REPETIDOS}.`,
    }
  }
  const usado = jugadores.reduce((sum, n) => sum + (precios[n] ?? 0), 0)
  if (usado > presupuesto) {
    return { ok: false, error: `Te pasas del presupuesto (${usado}€ de ${presupuesto}€).` }
  }
  return { ok: true }
}

/** Fila de `alineaciones` que escribe el admin (Admin > Usuarios). Mismas reglas
 * que el Draft pero sin tope de presupuesto: los precios de hoy no son los de esa
 * jornada, así que `presupuesto_usado` va a null (nadie lo lee). Si la jornada ya
 * está puntuada, vacía `puntos_jornada` para que `resolver_jornada` la recalcule:
 * si no, una alineación que deja de estar completa conservaría los puntos viejos. */
export function filaAlineacionAdmin(
  usuarioId: string,
  jornada: number,
  yaPuntuada: boolean,
  jugadores: (number | null)[],
  capitan: number | null,
  posiciones: Record<number, Position>,
) {
  const elegidos = jugadores.filter((n): n is number => n !== null)
  const v = validarDraft(elegidos, capitan, {}, Infinity, posiciones)
  if (!v.ok) return v
  const fila = {
    usuario_id: usuarioId, jornada, jugadores: elegidos, capitan, presupuesto_usado: null,
    ...(yaPuntuada ? { puntos_jornada: null } : {}),
  }
  return { ok: true as const, fila, reprocesar: yaPuntuada }
}
