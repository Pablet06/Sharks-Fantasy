export interface ApuestaInput {
  tipo: string
  seleccion: string
  importe: number
}

export type ResultadoValidacionApuestas = { ok: true } | { ok: false; error: string }

/** Regla de apuestas válidas: todos los importes > 0, y la suma de todas
 * las apuestas de la jornada no supera el 20% del presupuesto disponible. */
export function validarApuestas(
  apuestas: ApuestaInput[],
  presupuesto: number,
): ResultadoValidacionApuestas {
  if (apuestas.some(a => a.importe <= 0)) {
    return { ok: false, error: 'El importe debe ser mayor que 0.' }
  }
  const total = apuestas.reduce((sum, a) => sum + a.importe, 0)
  const tope = presupuesto * 0.2
  if (total > tope) {
    return {
      ok: false,
      error: `El total apostado (${total}€) supera el 20% del presupuesto (${Math.round(tope)}€).`,
    }
  }
  return { ok: true }
}
