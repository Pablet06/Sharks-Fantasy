import { describe, it, expect, vi } from 'vitest'

// sync.ts imports ./supabase, which throws at load without env vars. rawToStats
// touches no DB, so a bare stub is enough.
vi.mock('../src/supabase', () => ({ supabase: {} }))

import { rawToStats } from '../src/sync'
import type { RawPlayer } from '../src/fncv'

const raw = (o: Partial<RawPlayer>): RawPlayer => ({
  leveradeId: '1', nombre: 'X', jugo: true,
  G: 0, GP: 0, TA: 0, TR: 0, EX: 0, ED: 0, EB: 0, EN: 0, EP: 0, P: 0, PF: 0,
  ...o,
})

describe('rawToStats', () => {
  it('maps federation columns to the stat model', () => {
    const s = rawToStats(raw({ G: 2, GP: 1, TA: 1, TR: 1, EX: 2, ED: 1, EP: 1, P: 1, PF: 1, jugo: true }), 9)
    expect(s).toEqual({
      partidos: 1,
      goles: 2,
      goles_penalti: 1,
      penaltis_fallados: 1,
      faltas_penalti: 1,
      tarjetas: 2,          // TA + TR
      expulsiones: 2,       // EX
      expulsiones_graves: 2, // ED + EB + EN + EP = 1 + 0 + 0 + 1
      goles_contra: 9,
    })
  })

  it('sets partidos 0 when the player did not dress', () => {
    expect(rawToStats(raw({ jugo: false }), 9).partidos).toBe(0)
  })
})
