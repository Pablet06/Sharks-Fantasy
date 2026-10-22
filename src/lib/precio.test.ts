import { describe, it, expect } from 'vitest'
import { calcPrecio } from './precio'
import type { HistorialEntry } from '../types'

const entry = (jornada: number, puntos: number, partidos = 1): HistorialEntry => ({
  id: jornada,
  jugador_id: 1,
  jornada,
  stats: {
    partidos, goles: 0, goles_penalti: 0, penaltis_fallados: 0, faltas_penalti: 0,
    tarjetas: 0, expulsiones: 0, expulsiones_graves: 0, goles_contra: 0,
  },
  puntos,
  date: '2026-01-01',
})

describe('calcPrecio', () => {
  it('suelo de 50€ sin ninguna jornada jugada', () => {
    expect(calcPrecio([])).toBe(50)
  })

  it('ignora jornadas no jugadas (partidos = 0)', () => {
    expect(calcPrecio([entry(1, 20, 0)])).toBe(50)
  })

  it('solo promedia las últimas 5 jornadas jugadas, por número de jornada', () => {
    const hist = [
      entry(1, 100),                                   // fuera de las últimas 5
      entry(2, 4), entry(3, 5), entry(4, 6), entry(5, 7), entry(6, 8),
    ]
    // últimas 5 por jornada: 2,3,4,5,6 -> media (4+5+6+7+8)/5 = 6 -> 100+12*6=172
    expect(calcPrecio(hist)).toBe(172)
  })

  it('aplica el suelo de 50€ cuando la fórmula da menos', () => {
    // 100 + 12*(-10) = -20 -> suelo 50
    expect(calcPrecio([entry(1, -10)])).toBe(50)
  })
})
