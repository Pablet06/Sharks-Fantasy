import { describe, it, expect } from 'vitest'
import { calcPrecio, evolucionJugador, MULTIPLICADOR_PRECIO } from './precio'
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

  // La federación renumeró el calendario: el número de jornada no es cronológico, el orden real es `orden`.
  it('con jornadas, las últimas 5 se eligen por orden y no por número de federación', () => {
    const jornadas = [
      { numero: 20, orden: 1 }, // la más antigua, aunque tenga el número más alto
      { numero: 3, orden: 2 }, { numero: 4, orden: 3 }, { numero: 5, orden: 4 },
      { numero: 6, orden: 5 }, { numero: 7, orden: 6 },
    ]
    const hist = [entry(20, 100), entry(3, 4), entry(4, 5), entry(5, 6), entry(6, 7), entry(7, 8)]
    // últimas 5 por orden: 3..7 -> media 6 (por número habría entrado la 20 y se habría caído la 3)
    expect(calcPrecio(hist, [], jornadas)).toBe(precio(6))
  })

  it('el orden de las jornadas actuales no se aplica a la temporada anterior', () => {
    // El número 6 de la temporada anterior coincide con una jornada actual de orden 1: no debe reordenarse.
    const anterior = [entry(1, 0), entry(2, 0), entry(3, 0), entry(4, 0), entry(5, 0), entry(6, 100)]
    expect(calcPrecio([], anterior, [{ numero: 6, orden: 1 }])).toBe(precio(20)) // ventana 6,5,4,3,2
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

describe('evolucionJugador', () => {
  // Calendario tras la renumeración: 15 = 1.ª jornada, 18 = 2.ª, 10 = 3.ª (el número no es cronológico).
  const jornadas = [{ numero: 15, orden: 1 }, { numero: 18, orden: 2 }, { numero: 10, orden: 3 }]

  it('una fila por jornada del historial, ordenadas por orden y no por número', () => {
    const hist = [entry(10, 3), entry(15, 6), entry(18, 11)]
    const serie = evolucionJugador(hist, [], jornadas)
    expect(serie.map(p => p.orden)).toEqual([1, 2, 3])
    expect(serie.map(p => p.jornada)).toEqual([15, 18, 10])
    expect(serie.map(p => p.puntos)).toEqual([6, 11, 3])
  })

  it('el precio es el de después de cada jornada (media acumulada) y el último punto es el precio actual', () => {
    const hist = [entry(15, 6), entry(18, 11), entry(10, 3)]
    const serie = evolucionJugador(hist, [], jornadas)
    expect(serie.map(p => p.precio)).toEqual([precio(6), precio(8.5), precio((6 + 11 + 3) / 3)])
    expect(serie[serie.length - 1].precio).toBe(calcPrecio(hist, [], jornadas))
  })

  it('una jornada sin jugar (partidos = 0) deja el precio como estaba y se marca como no jugada', () => {
    const hist = [entry(15, 6), entry(18, 0, 0)]
    const serie = evolucionJugador(hist, [], jornadas)
    expect(serie[1].jugada).toBe(false)
    expect(serie[1].precio).toBe(serie[0].precio)
  })

  it('la temporada anterior entra en la ventana de las primeras jornadas', () => {
    const serie = evolucionJugador([entry(15, 2)], [entry(1, 10)], jornadas)
    expect(serie[0].precio).toBe(precio(6)) // (2 + 10) / 2
  })

  it('historial vacío -> serie vacía', () => {
    expect(evolucionJugador([], [], jornadas)).toEqual([])
  })
})
