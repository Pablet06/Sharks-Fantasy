export type ResultadoValidacion = { ok: true } | { ok: false; error: string }

/** Reglas de un draft válido: exactamente 7 dorsales distintos, capitán
 * entre ellos, coste total dentro del presupuesto disponible. */
export function validarDraft(
  jugadores: number[],
  capitan: number | null,
  precios: Record<number, number>,
  presupuesto: number,
): ResultadoValidacion {
  if (jugadores.length !== 7) return { ok: false, error: 'Elige exactamente 7 jugadores.' }
  if (new Set(jugadores).size !== 7) return { ok: false, error: 'No puedes repetir jugador.' }
  if (capitan === null || !jugadores.includes(capitan)) {
    return { ok: false, error: 'Elige un capitán de tu 7.' }
  }
  const usado = jugadores.reduce((sum, n) => sum + (precios[n] ?? 0), 0)
  if (usado > presupuesto) {
    return { ok: false, error: `Te pasas del presupuesto (${usado}€ de ${presupuesto}€).` }
  }
  return { ok: true }
}
