import { describe, it, expect } from 'vitest'
import {
  calcMatchPoints, calcTotalPoints, sumarStats, valorEstadistica, ordenarPorEstadistica, ESTADISTICAS, EMPTY_STATS,
} from './points'

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

describe('sumarStats', () => {
  // Caso real (Pablo Ferrer): 1 + 2 + 1 goles en tres jornadas. La columna
  // jugadores.stats se quedó congelada en la primera (1 gol), pero la ficha debe
  // enseñar la suma del historial.
  it('suma las stats de todas las jornadas del historial', () => {
    const historial = [
      { stats: stats({ partidos: 1, goles: 1 }) },
      { stats: stats({ partidos: 1, goles: 2 }) },
      { stats: stats({ partidos: 1, goles: 1, goles_penalti: 1, expulsiones: 1 }) },
    ]
    expect(sumarStats(historial)).toEqual(stats({ partidos: 3, goles: 4, goles_penalti: 1, expulsiones: 1 }))
  })

  it('no cuenta como partido una fila densa con partidos = 0', () => {
    expect(sumarStats([{ stats: stats({ partidos: 1, goles: 2 }) }, { stats: stats({}) }]).partidos).toBe(1)
  })

  it('goles_contra se acumula siempre a 0 (es una cifra por partido, como en recalc_puntos)', () => {
    expect(sumarStats([{ stats: stats({ partidos: 1, goles_contra: 7 }) }]).goles_contra).toBe(0)
  })

  it('historial vacío -> todo a 0', () => {
    expect(sumarStats([])).toEqual(EMPTY_STATS)
  })
})

describe('calcTotalPoints', () => {
  it('sums puntos from historial', () => {
    expect(calcTotalPoints([
      { puntos: 5 },
      { puntos: -2 },
      { puntos: 10 }
    ])).toBe(13)
  })

  it('returns 0 for empty historial', () => {
    expect(calcTotalPoints([])).toBe(0)
  })
})

describe('valorEstadistica', () => {
  const historial = [
    { puntos: 6, stats: stats({ partidos: 1, goles: 1, tarjetas: 1 }) },
    { puntos: 11, stats: stats({ partidos: 1, goles: 2, expulsiones: 1 }) },
  ]

  it('puntos es la suma de puntos del historial', () => {
    expect(valorEstadistica(historial, 'puntos')).toBe(17)
  })

  it('el resto de claves son la suma de esa estadística en todo el historial', () => {
    expect(valorEstadistica(historial, 'goles')).toBe(3)
    expect(valorEstadistica(historial, 'partidos')).toBe(2)
    expect(valorEstadistica(historial, 'tarjetas')).toBe(1)
  })

  it('historial vacío -> 0', () => {
    expect(valorEstadistica([], 'goles')).toBe(0)
    expect(valorEstadistica([], 'puntos')).toBe(0)
  })

  it('ofrece las estadísticas de la ficha (sin goles_contra) y Puntos primero', () => {
    expect(ESTADISTICAS[0].clave).toBe('puntos')
    expect(ESTADISTICAS.map(e => e.clave)).toEqual([
      'puntos', 'partidos', 'goles', 'goles_penalti', 'penaltis_fallados',
      'faltas_penalti', 'tarjetas', 'expulsiones', 'expulsiones_graves',
    ])
  })
})

describe('ordenarPorEstadistica', () => {
  const j = (id: number, puntos: number, o: Partial<typeof EMPTY_STATS> = {}) => ({
    id, historial: [{ puntos, stats: stats({ partidos: 1, ...o }) }],
  })
  const ids = (xs: { id: number }[]) => xs.map(x => x.id)

  it('por puntos (el orden por defecto de la lista), de mayor a menor', () => {
    expect(ids(ordenarPorEstadistica([j(1, 5), j(2, 20), j(3, 12)], 'puntos'))).toEqual([2, 3, 1])
  })

  it('por otra estadística, de mayor a menor', () => {
    const js = [j(1, 20, { goles: 1 }), j(2, 5, { goles: 4 }), j(3, 12, { goles: 2 })]
    expect(ids(ordenarPorEstadistica(js, 'goles'))).toEqual([2, 3, 1])
  })

  it('a igualdad de estadística desempata por puntos totales', () => {
    const js = [j(1, 5, { tarjetas: 1 }), j(2, 20, { tarjetas: 1 }), j(3, 12, { tarjetas: 0 })]
    expect(ids(ordenarPorEstadistica(js, 'tarjetas'))).toEqual([2, 1, 3])
  })

  it('jugadores sin historial (undefined) valen 0 y no rompen', () => {
    const js: { id: number; historial?: ReturnType<typeof j>['historial'] }[] = [{ id: 1 }, j(2, 3, { goles: 1 })]
    expect(ids(ordenarPorEstadistica(js, 'goles'))).toEqual([2, 1])
  })

  it('no modifica la lista original', () => {
    const js = [j(1, 5), j(2, 20)]
    ordenarPorEstadistica(js, 'puntos')
    expect(ids(js)).toEqual([1, 2])
  })
})
