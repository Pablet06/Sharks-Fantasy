import { describe, it, expect } from 'vitest'
import { posicionRanking } from './ranking'

const usuarios = (...puntos: number[]) => puntos.map(p => ({ puntos: p }))

describe('posicionRanking', () => {
  it('el que más puntos tiene es el 1', () => {
    expect(posicionRanking(usuarios(30, 20, 10), 30)).toBe(1)
  })

  it('sin empates es el lugar en la lista ordenada', () => {
    expect(posicionRanking(usuarios(30, 20, 10), 20)).toBe(2)
    expect(posicionRanking(usuarios(30, 20, 10), 10)).toBe(3)
  })

  it('los empatados comparten posición y el siguiente salta (1, 2, 2, 4)', () => {
    const lista = usuarios(103, 88, 88, 50)
    expect([103, 88, 88, 50].map(p => posicionRanking(lista, p))).toEqual([1, 2, 2, 4])
  })

  it('no depende del orden de la lista', () => {
    expect(posicionRanking(usuarios(50, 88, 103, 88), 88)).toBe(2)
  })

  it('empate en cabeza: los dos son el 1', () => {
    expect(posicionRanking(usuarios(10, 10, 5), 10)).toBe(1)
  })
})
