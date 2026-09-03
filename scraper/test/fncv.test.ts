import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseMatchStats } from '../src/fncv'

const html = readFileSync(new URL('./fixtures/stats.html', import.meta.url), 'utf8')

describe('parseMatchStats', () => {
  const m = parseMatchStats(html)

  it('reads both team names and which side is Sharks', () => {
    expect(m.local).toBe('C.N. Godella B')
    expect(m.visitante).toBe('C.W. Sharks A')
    expect(m.sharks).toBe('visitante')
  })

  it('reads the score', () => {
    expect(m.golesLocal).toBe(11)
    expect(m.golesVisitante).toBe(7)
  })

  it('parses Sharks players with leverade ids', () => {
    const carlos = m.jugadores.find(p => p.nombre.includes('CARLOS FERRER'))
    expect(carlos).toBeTruthy()
    expect(carlos!.leveradeId).toBe('53861914')
    expect(carlos!.jugo).toBe(true)
    expect(carlos!.G).toBe(1)
    expect(carlos!.GP).toBe(1)
    expect(carlos!.EX).toBe(1)
  })

  it('parses a non-scoring Sharks player', () => {
    const hernan = m.jugadores.find(p => p.nombre.includes('HERNAN FRANCES'))
    expect(hernan!.EX).toBe(1)
    expect(hernan!.P).toBe(1)
    expect(hernan!.G).toBe(0)
  })

  it('treats dash cells as zero', () => {
    const andoni = m.jugadores.find(p => p.nombre.includes('ANDONI IRASTORZA'))
    expect(andoni!.G).toBe(0)
    expect(andoni!.EX).toBe(0)
    expect(andoni!.jugo).toBe(true)
  })

  it('returns exactly the 14 Sharks players, none from the other side', () => {
    expect(m.jugadores).toHaveLength(14)
    expect(m.jugadores.every(p => !p.nombre.includes('MILO MARABESE'))).toBe(true)
    expect(m.jugadores.every(p => p.leveradeId !== null)).toBe(true)
  })
})
