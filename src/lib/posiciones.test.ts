import { describe, it, expect } from 'vitest'
import { posicionesPorJornada, formatoPuesto } from './posiciones'
import { posicionRanking } from './ranking'

type J = Parameters<typeof posicionesPorJornada>[2][number]
type A = Parameters<typeof posicionesPorJornada>[1][number]

const j = (numero: number, orden: number, finalizado = true): J => ({ numero, orden, finalizado })
const al = (usuario_id: string, jornada: number, puntos_jornada: number | null): A => ({ usuario_id, jornada, puntos_jornada })
const us = (...ids: string[]) => ids.map(id => ({ id }))
const fila = (r: ReturnType<typeof posicionesPorJornada>[number], id: string) => r.filas.find(f => f.usuarioId === id)!

describe('posicionesPorJornada', () => {
  it('ordena por orden (no por numero) y acumula en ese orden', () => {
    const r = posicionesPorJornada(
      us('a'),
      [al('a', 15, 10), al('a', 18, 20), al('a', 10, 30)],
      [j(10, 3), j(15, 1), j(18, 2)],
    )
    expect(r.map(x => [x.orden, x.numero])).toEqual([[1, 15], [2, 18], [3, 10]])
    expect(r.map(x => fila(x, 'a').acumulado)).toEqual([10, 30, 60])
  })

  it('ignora las jornadas no finalizadas, también en el acumulado', () => {
    const r = posicionesPorJornada(us('a'), [al('a', 1, 5), al('a', 2, 99)], [j(1, 1), j(2, 2, false)])
    expect(r).toHaveLength(1)
    expect(fila(r[0], 'a').acumulado).toBe(5)
  })

  it('empate en la jornada: comparten puesto y el siguiente salta (1, 2, 2, 4)', () => {
    const [r] = posicionesPorJornada(
      us('a', 'b', 'c', 'd'),
      [al('a', 1, 30), al('b', 1, 20), al('c', 1, 20), al('d', 1, 10)],
      [j(1, 1)],
    )
    expect(['a', 'b', 'c', 'd'].map(id => fila(r, id).posJornada)).toEqual([1, 2, 2, 4])
  })

  it('empate en el acumulado aunque lleguen por caminos distintos', () => {
    const r = posicionesPorJornada(
      us('a', 'b', 'c'),
      [al('a', 1, 30), al('a', 2, 10), al('b', 1, 10), al('b', 2, 30), al('c', 1, 5), al('c', 2, 5)],
      [j(1, 1), j(2, 2)],
    )
    expect(['a', 'b', 'c'].map(id => fila(r[1], id).posAcumulado)).toEqual([1, 1, 3])
  })

  it('sin alineación en la jornada: «No jugó», no cuenta en jugaron ni empuja a nadie', () => {
    const [r] = posicionesPorJornada(us('a', 'b', 'c'), [al('a', 1, 10), al('b', 1, 20)], [j(1, 1)])
    expect(fila(r, 'c')).toMatchObject({ puntos: null, posJornada: null })
    expect(r.jugaron).toBe(2)
    expect(fila(r, 'b').posJornada).toBe(1)
    expect(fila(r, 'a').posJornada).toBe(2)
  })

  it('una alineación puntuada con 0 puntos sí cuenta como jugada, en último lugar', () => {
    const [r] = posicionesPorJornada(us('a', 'b'), [al('a', 1, 12), al('b', 1, 0)], [j(1, 1)])
    expect(fila(r, 'b')).toMatchObject({ puntos: 0, posJornada: 2 })
    expect(r.jugaron).toBe(2)
  })

  it('se saltó una jornada pero jugó otras: sin puesto en esa, pero su acumulado cuenta', () => {
    const r = posicionesPorJornada(
      us('a', 'b'),
      [al('a', 1, 40), al('b', 1, 10), al('b', 2, 5)],
      [j(1, 1), j(2, 2)],
    )
    expect(fila(r[1], 'a')).toMatchObject({ puntos: null, posJornada: null, acumulado: 40, posAcumulado: 1 })
    expect(fila(r[1], 'b')).toMatchObject({ acumulado: 15, posAcumulado: 2 })
  })

  it('usuario sin ninguna alineación: «No jugó» siempre y último (con 0) en el acumulado', () => {
    const r = posicionesPorJornada(us('a', 'b', 'z'), [al('a', 1, 10), al('b', 2, 5)], [j(1, 1), j(2, 2)])
    for (const x of r) expect(fila(x, 'z')).toMatchObject({ puntos: null, posJornada: null, acumulado: 0 })
    // En la J1 «b» aún no ha puntuado y empata a 0 con «z» (2.º); en la J2 «z» queda último.
    expect(r.map(x => fila(x, 'z').posAcumulado)).toEqual([2, 3])
    expect(r[1].total).toBe(3)
  })

  it('trata puntos_jornada null como «No jugó»', () => {
    const [r] = posicionesPorJornada(us('a'), [al('a', 1, null)], [j(1, 1)])
    expect(fila(r, 'a')).toMatchObject({ puntos: null, posJornada: null })
    expect(r.jugaron).toBe(0)
  })

  it('ignora las alineaciones de usuarios que ya no existen', () => {
    const [r] = posicionesPorJornada(us('a'), [al('a', 1, 10), al('fantasma', 1, 99)], [j(1, 1)])
    expect(r.filas).toHaveLength(1)
    expect(r.jugaron).toBe(1)
    expect(fila(r, 'a').posJornada).toBe(1)
  })

  it('sin jornadas finalizadas devuelve [], y con jornadas pero sin alineaciones todos empatan sin jugar', () => {
    expect(posicionesPorJornada(us('a'), [], [])).toEqual([])
    const [r] = posicionesPorJornada(us('a', 'b'), [], [j(1, 1)])
    expect(r.jugaron).toBe(0)
    expect(r.filas.map(f => [f.posJornada, f.acumulado, f.posAcumulado])).toEqual([[null, 0, 1], [null, 0, 1]])
  })

  it('el acumulado de la última jornada coincide con la clasificación general', () => {
    const usuarios = [
      { id: 'a', puntos: 135 }, { id: 'b', puntos: 88 }, { id: 'c', puntos: 88 }, { id: 'd', puntos: 0 },
    ]
    const alineaciones = [
      al('a', 15, 46), al('a', 18, 43), al('a', 10, 46),
      al('b', 15, 24), al('b', 18, 25), al('b', 10, 39),
      al('c', 15, 44), al('c', 18, 32), al('c', 10, 12),
    ]
    const r = posicionesPorJornada(usuarios, alineaciones, [j(10, 3), j(15, 1), j(18, 2)])
    const ultima = r[r.length - 1]
    for (const u of usuarios) expect(fila(ultima, u.id).posAcumulado).toBe(posicionRanking(usuarios, u.puntos))
  })
})

describe('formatoPuesto', () => {
  it('«3.º de 17»', () => {
    expect(formatoPuesto(3, 17)).toBe('3.º de 17')
  })
})
