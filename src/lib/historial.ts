import type { Jornada, Alineacion, Apuesta } from '../types'

export interface FilaHistorial {
  numero: number
  orden: number
  resultado: Jornada['resultado']
  golesFavor: number | null
  golesContra: number | null
  puntos: number
  acumulado: number
  presupuesto: number
  apostado: number
  /** Suma de `ganancia` de las apuestas resueltas; null si no hubo apuestas resueltas. */
  neto: number | null
}

const PRESUPUESTO_BASE = 1000

/** Una fila por jornada finalizada (por `orden`) con puntos, presupuesto y resultado de apuestas. */
export function construirHistorial(
  jornadas: Jornada[],
  alineaciones: Pick<Alineacion, 'jornada' | 'puntos_jornada'>[],
  presupuestos: { jornada: number; presupuesto: number }[],
  apuestas: Pick<Apuesta, 'jornada' | 'importe' | 'resuelto' | 'ganancia'>[],
): FilaHistorial[] {
  let acumulado = 0
  return jornadas
    .filter(j => j.finalizado)
    .sort((a, b) => a.orden - b.orden)
    .map(j => {
      const puntos = alineaciones.find(a => a.jornada === j.numero)?.puntos_jornada ?? 0
      acumulado += puntos
      const ap = apuestas.filter(a => a.jornada === j.numero)
      const resueltas = ap.filter(a => a.resuelto)
      return {
        numero: j.numero,
        orden: j.orden,
        resultado: j.resultado,
        golesFavor: j.goles_favor,
        golesContra: j.goles_contra,
        puntos,
        acumulado,
        presupuesto: presupuestos.find(p => p.jornada === j.numero)?.presupuesto ?? PRESUPUESTO_BASE,
        apostado: ap.reduce((s, a) => s + a.importe, 0),
        neto: resueltas.length ? resueltas.reduce((s, a) => s + (a.ganancia ?? 0), 0) : null,
      }
    })
}
