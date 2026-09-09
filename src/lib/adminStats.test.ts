import { describe, it, expect } from 'vitest'
import { sumStats } from './adminStats'
import { EMPTY_STATS } from './points'

const e = (o: Partial<typeof EMPTY_STATS>) => ({ stats: { ...EMPTY_STATS, ...o } })

describe('sumStats', () => {
  it('sums fields element-wise', () => {
    expect(sumStats([e({ goles: 2, partidos: 1 }), e({ goles: 3, partidos: 1, tarjetas: 1 })]))
      .toEqual({ ...EMPTY_STATS, goles: 5, partidos: 2, tarjetas: 1 })
  })

  it('forces goles_contra to 0 (per-match figure only)', () => {
    expect(sumStats([e({ goles_contra: 8 }), e({ goles_contra: 5 })]).goles_contra).toBe(0)
  })

  it('returns EMPTY_STATS for no entries', () => {
    expect(sumStats([])).toEqual(EMPTY_STATS)
  })
})
