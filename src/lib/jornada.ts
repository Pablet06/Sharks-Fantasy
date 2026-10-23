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
 * La jornada abierta para draftear: la de partido más próximo con fecha
 * conocida, no finalizada, y a más de 24h vista (empate de fecha: número más
 * bajo). Los números de federación no siguen el orden del calendario (la
 * ronda 3 puede jugarse después de la 9), así que se ordena por fecha, no por
 * número. Sin fecha conocida no cuenta como abierta (coincide con el
 * fail-closed de la RLS de `alineaciones`).
 */
export function jornadaAbierta(jornadas: Jornada[], ahora: Date = new Date()): number | null {
  const candidatas = jornadas.filter(j =>
    !j.finalizado &&
    j.fecha_partido !== null &&
    new Date(j.fecha_partido).getTime() - ahora.getTime() > VEINTICUATRO_HORAS_MS
  )
  if (candidatas.length === 0) return null
  candidatas.sort((a, b) =>
    new Date(a.fecha_partido!).getTime() - new Date(b.fecha_partido!).getTime() || a.numero - b.numero)
  return candidatas[0].numero
}

/**
 * La jornada a mostrar en Draft y Apuestas: la abierta si la hay; si no, la
 * próxima sin finalizar con fecha (ya cerrada, a <24h o jugada y sin resolver),
 * para enseñar en solo lectura lo que el usuario envió en vez de un hueco.
 * Devuelve el número, o null si no hay ninguna.
 */
export function jornadaEnCurso(jornadas: Jornada[], ahora: Date = new Date()): number | null {
  const abierta = jornadaAbierta(jornadas, ahora)
  if (abierta !== null) return abierta
  const cerradas = jornadas
    .filter(j => !j.finalizado && j.fecha_partido !== null)
    .sort((a, b) =>
      new Date(a.fecha_partido!).getTime() - new Date(b.fecha_partido!).getTime() || a.numero - b.numero)
  return cerradas[0]?.numero ?? null
}

export type Fase = 'abiertos' | 'cerrados' | 'en_juego' | 'resolviendo' | 'esperando'

export interface FaseJuego {
  fase: Fase
  etiqueta: string
  detalle: string
}

const TRES_HORAS_MS = 3 * 60 * 60 * 1000

/** "2 d 4 h", "5 h 10 min", "40 min". */
export function duracionCorta(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000))
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d > 0) return `${d} d ${h} h`
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}

/**
 * En qué punto del ciclo está el juego, para la cabecera:
 * fichajes abiertos -> fichajes cerrados (<24h) -> partido en juego (primeras 3h)
 * -> post-partido (jugado, sin resolver) -> esperando fecha de la siguiente.
 */
export function faseJuego(jornadas: Jornada[], ahora: Date = new Date()): FaseJuego {
  const n = jornadaEnCurso(jornadas, ahora)
  const actual = n === null ? undefined : jornadas.find(j => j.numero === n)
  if (!actual || actual.fecha_partido === null) {
    const ultima = jornadas.filter(j => j.finalizado).sort((a, b) => b.orden - a.orden)[0]
    return {
      fase: 'esperando',
      etiqueta: 'Esperando fecha',
      detalle: ultima ? `Jornada ${ultima.orden} resuelta · falta la fecha de la siguiente` : 'Aún no hay jornadas con fecha',
    }
  }
  const orden = actual.orden ?? actual.numero
  const falta = new Date(actual.fecha_partido).getTime() - ahora.getTime()
  if (jornadaAbierta(jornadas, ahora) === n) {
    return { fase: 'abiertos', etiqueta: 'Fichajes abiertos', detalle: `Jornada ${orden} · cierran en ${duracionCorta(falta - VEINTICUATRO_HORAS_MS)}` }
  }
  if (falta > 0) {
    return { fase: 'cerrados', etiqueta: 'Fichajes cerrados', detalle: `Jornada ${orden} · partido en ${duracionCorta(falta)}` }
  }
  if (-falta < TRES_HORAS_MS) {
    return { fase: 'en_juego', etiqueta: 'Partido en juego', detalle: `Jornada ${orden}` }
  }
  return { fase: 'resolviendo', etiqueta: 'Post-partido', detalle: `Jornada ${orden} · calculando puntos y apuestas` }
}
