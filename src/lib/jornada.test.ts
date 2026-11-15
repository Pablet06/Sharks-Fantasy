import { describe, it, expect } from 'vitest'
import {
  jornadaAbierta, jornadaEnCurso, faseJuego, etiquetaJornada, ultimaJornadaResuelta, ultimaAlineacionPuntuada,
} from './jornada'
import type { Jornada } from '../types'

const j = (numero: number, o: Partial<Jornada> = {}): Jornada => ({
  numero, orden: numero, fecha_partido: null, resultado: null, goles_favor: null,
  goles_contra: null, finalizado: false, ...o,
})

describe('etiquetaJornada', () => {
  it('devuelve el orden de la jornada', () => {
    expect(etiquetaJornada([j(7, { orden: 1 }), j(9, { orden: 2 })], 9)).toBe(2)
  })

  it('cae al número de federación si la fila no existe', () => {
    expect(etiquetaJornada([j(7, { orden: 1 })], 12)).toBe(12)
  })

  it('cae al número si orden aún no existe (migración sin aplicar)', () => {
    const sinOrden = { numero: 7 } as Jornada
    expect(etiquetaJornada([sinOrden], 7)).toBe(7)
  })
})

describe('jornadaAbierta', () => {
  it('null si no hay ninguna jornada', () => {
    expect(jornadaAbierta([])).toBeNull()
  })

  it('null si la única jornada no tiene fecha todavía', () => {
    expect(jornadaAbierta([j(5)])).toBeNull()
  })

  it('null si el partido es en menos de 24h', () => {
    const ahora = new Date('2026-01-01T00:00:00Z')
    const fecha = new Date('2026-01-01T20:00:00Z').toISOString() // 20h después
    expect(jornadaAbierta([j(5, { fecha_partido: fecha })], ahora)).toBeNull()
  })

  it('devuelve la jornada si faltan más de 24h', () => {
    const ahora = new Date('2026-01-01T00:00:00Z')
    const fecha = new Date('2026-01-05T00:00:00Z').toISOString()
    expect(jornadaAbierta([j(5, { fecha_partido: fecha })], ahora)).toBe(5)
  })

  it('ignora una jornada ya finalizada aunque su fecha sea futura por error de datos', () => {
    const ahora = new Date('2026-01-01T00:00:00Z')
    const fecha = new Date('2026-01-05T00:00:00Z').toISOString()
    expect(jornadaAbierta([j(5, { fecha_partido: fecha, finalizado: true })], ahora)).toBeNull()
  })

  it('con varias jornadas abiertas, devuelve la de fecha más próxima aunque su número sea mayor', () => {
    const ahora = new Date('2026-01-01T00:00:00Z')
    const antes = new Date('2026-01-10T00:00:00Z').toISOString()
    const despues = new Date('2026-02-10T00:00:00Z').toISOString()
    expect(jornadaAbierta([j(3, { fecha_partido: despues }), j(9, { fecha_partido: antes })], ahora)).toBe(9)
  })

  it('con la misma fecha, devuelve la de número más bajo', () => {
    const ahora = new Date('2026-01-01T00:00:00Z')
    const fecha = new Date('2026-01-10T00:00:00Z').toISOString()
    expect(jornadaAbierta([j(7, { fecha_partido: fecha }), j(6, { fecha_partido: fecha })], ahora)).toBe(6)
  })
})

describe('jornadaEnCurso', () => {
  const ahora = new Date('2026-10-23T18:00:00Z')

  it('devuelve la abierta si la hay', () => {
    const fecha = new Date('2026-11-10T00:00:00Z').toISOString()
    expect(jornadaEnCurso([j(9, { fecha_partido: fecha })], ahora)).toBe(9)
  })

  it('con el draft ya cerrado (<24h) devuelve esa jornada para verla en solo lectura', () => {
    const fecha = new Date('2026-10-24T15:45:00Z').toISOString()
    expect(jornadaEnCurso([j(7, { fecha_partido: fecha })], ahora)).toBe(7)
  })

  it('la jugada pero sin resolver también cuenta; la finalizada no', () => {
    const jugada = new Date('2026-10-20T15:45:00Z').toISOString()
    expect(jornadaEnCurso([j(7, { fecha_partido: jugada })], ahora)).toBe(7)
    expect(jornadaEnCurso([j(7, { fecha_partido: jugada, finalizado: true })], ahora)).toBeNull()
  })

  it('null si no hay jornadas con fecha', () => {
    expect(jornadaEnCurso([j(9)], ahora)).toBeNull()
  })
})

describe('faseJuego', () => {
  const ahora = new Date('2026-10-23T18:00:00Z')
  const f = (iso: string, o: Partial<Jornada> = {}) => j(7, { orden: 1, fecha_partido: iso, ...o })

  it('fichajes abiertos con tiempo hasta el cierre', () => {
    const r = faseJuego([f('2026-10-30T18:00:00Z')], ahora)
    expect(r.fase).toBe('abiertos')
    expect(r.detalle).toContain('6 d 0 h')
  })

  it('fichajes cerrados a <24h del partido', () => {
    const r = faseJuego([f('2026-10-24T15:45:00Z')], ahora)
    expect(r.fase).toBe('cerrados')
    expect(r.detalle).toContain('21 h 45 min')
  })

  it('partido en juego en las primeras 3h y post-partido después', () => {
    expect(faseJuego([f('2026-10-23T16:00:00Z')], ahora).fase).toBe('en_juego')
    expect(faseJuego([f('2026-10-23T10:00:00Z')], ahora).fase).toBe('resolviendo')
  })

  it('esperando fecha cuando la última está resuelta y no hay siguiente', () => {
    const r = faseJuego([f('2026-10-20T15:00:00Z', { finalizado: true })], ahora)
    expect(r.fase).toBe('esperando')
    expect(r.detalle).toContain('Jornada 1 resuelta')
  })

  it('esperando fecha sin ninguna jornada', () => {
    expect(faseJuego([], ahora).fase).toBe('esperando')
  })
})

describe('ultimaJornadaResuelta', () => {
  it('elige por orden, no por número de federación', () => {
    const r = ultimaJornadaResuelta([
      j(9, { orden: 2, finalizado: true }),
      j(3, { orden: 3, finalizado: true }),
    ])
    expect(r?.numero).toBe(3)
  })

  it('ignora las no finalizadas', () => {
    expect(ultimaJornadaResuelta([j(1, { finalizado: true }), j(2, { orden: 2 })])?.numero).toBe(1)
  })

  it('null si no hay ninguna resuelta', () => {
    expect(ultimaJornadaResuelta([j(1)])).toBeNull()
  })
})

describe('ultimaAlineacionPuntuada', () => {
  // Calendario tras la renumeración: federación 15 = J1, 18 = J2, 10 = J3 (el número no es cronológico).
  const jornadas = [{ numero: 15, orden: 1 }, { numero: 18, orden: 2 }, { numero: 10, orden: 3 }]
  const al = (jornada: number, puntos_jornada: number | null) => ({ jornada, puntos_jornada })

  it('elige la más reciente por orden, no por número de federación', () => {
    const r = ultimaAlineacionPuntuada([al(15, 8), al(18, 5), al(10, 3)], jornadas)
    expect(r?.jornada).toBe(10) // J3; por número habría salido la 18 (J2)
  })

  it('ignora las alineaciones aún sin puntuar aunque sean más recientes', () => {
    expect(ultimaAlineacionPuntuada([al(15, 8), al(18, 5), al(10, null)], jornadas)?.jornada).toBe(18)
  })

  it('null si ninguna está puntuada o no hay alineaciones', () => {
    expect(ultimaAlineacionPuntuada([al(15, null)], jornadas)).toBeNull()
    expect(ultimaAlineacionPuntuada([], jornadas)).toBeNull()
  })

  it('sin jornadas cargadas cae al número de federación', () => {
    expect(ultimaAlineacionPuntuada([al(15, 8), al(18, 5)], [])?.jornada).toBe(18)
  })

  it('una alineación con 0 puntos cuenta como puntuada', () => {
    expect(ultimaAlineacionPuntuada([al(15, 8), al(10, 0)], jornadas)?.jornada).toBe(10)
  })
})
