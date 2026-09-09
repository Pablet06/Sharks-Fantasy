import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { getRounds, getRoundMatches } from '../src/leverade'
import { setMinDelayMs, setRetryBackoffMs } from '../src/http'

const group = readFileSync(new URL('./fixtures/group.json', import.meta.url), 'utf8')
const round = readFileSync(new URL('./fixtures/round.json', import.meta.url), 'utf8')

beforeEach(() => {
  setMinDelayMs(0)
  setRetryBackoffMs(0)
})

// tournament -> groups call returns a minimal shape; group call returns the fixture
function stubFetch(map: Record<string, string>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    for (const [frag, body] of Object.entries(map)) {
      if (url.includes(frag)) return new Response(body, { status: 200 })
    }
    throw new Error(`unexpected url ${url}`)
  }))
}

describe('getRounds', () => {
  it('returns rounds sorted by jornada', async () => {
    stubFetch({
      '/tournaments/1324114': JSON.stringify({
        data: { relationships: { groups: { data: [{ id: '3652217' }] } } },
      }),
      '/groups/3652217': group,
    })
    const rounds = await getRounds('1324114')
    expect(rounds.length).toBe(18)
    expect(rounds[0]).toEqual({ id: expect.any(String), jornada: 1 })
    expect(rounds.map(r => r.jornada)).toEqual([...Array(18)].map((_, i) => i + 1))
  })
})

describe('getRoundMatches', () => {
  it('extracts match id / date / finished', async () => {
    stubFetch({ '/rounds/': round })
    const matches = await getRoundMatches('19460842')
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0]).toHaveProperty('finished')
    expect(matches.some(m => m.finished)).toBe(true)
  })
})
