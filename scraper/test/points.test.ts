import { describe, it, expect } from 'vitest'
import { calcMatchPoints, EMPTY_STATS } from '../src/points'

const stats = (o: Partial<typeof EMPTY_STATS>) => ({ ...EMPTY_STATS, ...o })

describe('calcMatchPoints', () => {
  it('field player: appearance + goals + penalty goals', () => {
    // 1 + 4*5 + 1*3 = 24
    expect(calcMatchPoints('Boya', stats({ partidos: 1, goles: 4, goles_penalti: 1 }))).toBe(24)
  })

  it('field player: missed penalty and conceded penalty foul', () => {
    // 1 + (-2) + (-1) = -2
    expect(calcMatchPoints('Lateral', stats({ partidos: 1, penaltis_fallados: 1, faltas_penalti: 1 }))).toBe(-2)
  })

  it('field player: card -3, minor exclusion -1, grave exclusion -5', () => {
    // 1 + (-3) + (-1) + (-5) = -8
    expect(calcMatchPoints('Extremo', stats({
      partidos: 1, tarjetas: 1, expulsiones: 1, expulsiones_graves: 1,
    }))).toBe(-8)
  })

  it('goalkeeper: appearance + start bonus + defensive bonus (7 conceded)', () => {
    // 1 + 2 + max(0, 10-7) = 6
    expect(calcMatchPoints('Portero', stats({ partidos: 1, goles_contra: 7 }))).toBe(6)
  })

  it('goalkeeper: defensive bonus floors at 0 (15 conceded)', () => {
    // 1 + 2 + 0 = 3
    expect(calcMatchPoints('Portero', stats({ partidos: 1, goles_contra: 15 }))).toBe(3)
  })

  it('goalkeeper who did not play scores 0', () => {
    expect(calcMatchPoints('Portero', stats({ partidos: 0, goles_contra: 12 }))).toBe(0)
  })

  it('goalkeeper still loses points for their own cards/exclusions', () => {
    // 1 + 2 + max(0,10-5) + (-3) = 5
    expect(calcMatchPoints('Portero', stats({ partidos: 1, goles_contra: 5, tarjetas: 1 }))).toBe(5)
  })
})
