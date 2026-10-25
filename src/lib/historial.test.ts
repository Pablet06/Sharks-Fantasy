import { describe, it, expect } from 'vitest'
import { construirHistorial } from './historial'
import type { Jornada } from '../types'

const j = (numero: number, orden: number, o: Partial<Jornada> = {}): Jornada => ({
  numero, orden, fecha_partido: null, resultado: 'gana', goles_favor: 10, goles_contra: 5, finalizado: true, ...o,
})

describe('construirHistorial', () => {
  it('ordena por orden, acumula puntos y solo incluye finalizadas', () => {
    const h = construirHistorial(
      [j(9, 2), j(3, 1), j(12, 3, { finalizado: false })],
      [{ jornada: 3, puntos_jornada: 20 }, { jornada: 9, puntos_jornada: 15 }],
      [], [],
    )
    expect(h.map(f => [f.numero, f.puntos, f.acumulado])).toEqual([[3, 20, 20], [9, 15, 35]])
  })

  it('sin alineación 0 pts, sin presupuesto 1000 y sin apuestas neto null', () => {
    const [f] = construirHistorial([j(1, 1)], [], [], [])
    expect(f.puntos).toBe(0)
    expect(f.presupuesto).toBe(1000)
    expect(f.neto).toBeNull()
  })

  it('suma ganancias resueltas (empate 0 y pérdidas incluidos) y excluye no resueltas', () => {
    const [f] = construirHistorial([j(1, 1)], [], [{ jornada: 1, presupuesto: 1050 }], [
      { jornada: 1, importe: 50, resuelto: true, ganancia: 75 },
      { jornada: 1, importe: 20, resuelto: true, ganancia: -20 },
      { jornada: 1, importe: 10, resuelto: true, ganancia: 0 },
      { jornada: 1, importe: 40, resuelto: false, ganancia: null },
      { jornada: 2, importe: 99, resuelto: true, ganancia: 99 },
    ])
    expect(f.presupuesto).toBe(1050)
    expect(f.neto).toBe(55)
    expect(f.apostado).toBe(120)
  })
})
