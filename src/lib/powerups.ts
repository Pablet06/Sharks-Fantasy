import type { TipoPowerup } from '../types'

export type ResultadoValidacionPowerup = { ok: true } | { ok: false; error: string }

const REQUIERE_OBJETIVO: TipoPowerup[] = ['puntos_extra', 'blindaje']

/** Un power-up con objetivo (+2 puntos / blindaje) exige un dorsal de la
 * propia alineación de esa jornada; el resto no admite objetivo. */
export function validarPowerup(
  tipo: TipoPowerup,
  objetivo: number | null,
  misJugadores: number[],
): ResultadoValidacionPowerup {
  const requiere = REQUIERE_OBJETIVO.includes(tipo)
  if (requiere && objetivo === null) {
    return { ok: false, error: 'Elige un jugador objetivo.' }
  }
  if (requiere && objetivo !== null && !misJugadores.includes(objetivo)) {
    return { ok: false, error: 'El jugador objetivo debe estar en tu alineación de esta jornada.' }
  }
  if (!requiere && objetivo !== null) {
    return { ok: false, error: 'Este power-up no necesita un jugador objetivo.' }
  }
  return { ok: true }
}
