import { describe, it, expect } from 'vitest'
import { jornadaAbierta } from './jornada'
import type { Jornada } from '../types'

const j = (numero: number, o: Partial<Jornada> = {}): Jornada => ({
  numero, fecha_partido: null, resultado: null, goles_favor: null,
  goles_contra: null, finalizado: false, ...o,
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

  it('con varias jornadas abiertas, devuelve la de número más bajo', () => {
    const ahora = new Date('2026-01-01T00:00:00Z')
    const fecha = new Date('2026-01-10T00:00:00Z').toISOString()
    expect(jornadaAbierta([j(7, { fecha_partido: fecha }), j(6, { fecha_partido: fecha })], ahora)).toBe(6)
  })
})
