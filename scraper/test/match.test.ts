import { describe, it, expect } from 'vitest'
import { resolvePlayer, normalize, type DbPlayer } from '../src/match'

const db: DbPlayer[] = [
  { id: 6,  name: 'Carlos Ferrer',   nick: 'Carlos', leverade_id: 111 },
  { id: 13, name: 'Pablo Ferrer',    nick: 'Pablo',  leverade_id: null },
  { id: 9,  name: 'Hernan Frances',  nick: 'Hernan', leverade_id: null },
]

describe('normalize', () => {
  it('strips accents and lowercases', () => {
    expect(normalize('HERNÁN  FRANCÉS')).toBe('hernan frances')
  })

  it('strips a trailing (c) captain suffix', () => {
    expect(normalize('CARLOS FERRER BAIXAULI (c)')).toBe('carlos ferrer baixauli')
  })
})

describe('resolvePlayer', () => {
  it('matches by leverade id when present', () => {
    expect(resolvePlayer({ leveradeId: '111', nombre: 'WHATEVER' }, db)?.id).toBe(6)
  })

  it('falls back to given + first surname', () => {
    expect(resolvePlayer({ leveradeId: null, nombre: 'PABLO FERRER BAIXAULI' }, db)?.id).toBe(13)
  })

  it('does not confuse two players sharing a surname', () => {
    expect(resolvePlayer({ leveradeId: null, nombre: 'CARLOS FERRER BAIXAULI' }, db)?.id).toBe(6)
  })

  it('matches a captain name carrying the (c) suffix', () => {
    expect(resolvePlayer({ leveradeId: null, nombre: 'CARLOS FERRER BAIXAULI (c)' }, db)?.id).toBe(6)
  })

  it('returns null when nothing matches', () => {
    expect(resolvePlayer({ leveradeId: null, nombre: 'NUEVO FICHAJE GARCIA' }, db)).toBeNull()
  })
})
