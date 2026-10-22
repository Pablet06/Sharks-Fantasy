import { describe, it, expect } from 'vitest'
import { calcPrecio, MULTIPLICADOR_PRECIO } from './precio'
import type { HistorialEntry } from '../types'

// Precio esperado para una media dada, independiente del multiplicador.
const precio = (media: number) => Math.round(50 + MULTIPLICADOR_PRECIO * media)

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
    // últimas 5 por jornada: 2,3,4,5,6 -> media 6
    expect(calcPrecio(hist)).toBe(precio(6))
  })

  it('aplica el suelo de 50€ cuando la fórmula da menos', () => {
    // 50 + k*(-10) < 50 -> suelo 50
    expect(calcPrecio([entry(1, -10)])).toBe(50)
  })

  it('usa solo la temporada anterior si no hay actual', () => {
    expect(calcPrecio([], [entry(1, 5), entry(2, 7)])).toBe(precio(6)) // media 6
  })

  it('mezcla: 2 actuales + 3 anteriores más recientes', () => {
    const actual = [entry(1, 10), entry(2, 10)]
    const anterior = [entry(1, 0), entry(2, 0), entry(3, 0), entry(4, 5), entry(5, 5), entry(6, 5)]
    // ventana: 10,10 + anteriores j6,j5,j4 = 5,5,5 -> media 7
    expect(calcPrecio(actual, anterior)).toBe(precio(7))
  })

  it('con 5+ actuales ignora la anterior', () => {
    const actual = [1, 2, 3, 4, 5].map(j => entry(j, 2))
    expect(calcPrecio(actual, [entry(1, 100)])).toBe(precio(2))
  })

  it('salta filas con partidos = 0 en ambas temporadas', () => {
    expect(calcPrecio([entry(9, 50, 0), entry(1, 1)], [entry(9, 50, 0)])).toBe(precio(1))
  })
})
