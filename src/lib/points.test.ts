import { describe, it, expect } from 'vitest'
import { calcMatchPoints, calcTotalPoints } from './points'

describe('calcMatchPoints', () => {
  it('field player: counts goals, shots, appearance', () => {
    expect(calcMatchPoints('Boya', {
      partidos: 1, goles: 2, penaltis: 0, tarjetas: 0,
      expulsiones: 0, tiros: 1, penaltis_fallados: 0,
      paradas: 0, goles_contra: 0, penaltis_parados: 0
    })).toBe(15) // 1 + 12 + 2
  })

  it('goalkeeper: saves, goals against, penalty saved', () => {
    expect(calcMatchPoints('Portero', {
      partidos: 1, goles: 0, penaltis: 0, tarjetas: 0,
      expulsiones: 0, tiros: 0, penaltis_fallados: 0,
      paradas: 5, goles_contra: 2, penaltis_parados: 1
    })).toBe(12) // 1 + 10 - 2 + 3
  })

  it('yellow card applies -5', () => {
    expect(calcMatchPoints('Lateral', {
      partidos: 1, goles: 0, penaltis: 0, tarjetas: 1,
      expulsiones: 0, tiros: 0, penaltis_fallados: 0,
      paradas: 0, goles_contra: 0, penaltis_parados: 0
    })).toBe(-4) // 1 - 5
  })

  it('missed penalty applies -3', () => {
    expect(calcMatchPoints('Extremo', {
      partidos: 1, goles: 0, penaltis: 0, tarjetas: 0,
      expulsiones: 0, tiros: 0, penaltis_fallados: 1,
      paradas: 0, goles_contra: 0, penaltis_parados: 0
    })).toBe(-2) // 1 - 3
  })
})

describe('calcTotalPoints', () => {
  it('sums puntos from historial', () => {
    expect(calcTotalPoints([
      { puntos: 5 },
      { puntos: -2 },
      { puntos: 10 }
    ])).toBe(13)
  })

  it('returns 0 for empty historial', () => {
    expect(calcTotalPoints([])).toBe(0)
  })
})
