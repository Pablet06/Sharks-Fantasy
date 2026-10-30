import { describe, it, expect } from 'vitest'
import { validarDraft, contarPosiciones, filaAlineacionAdmin } from './draft'
import type { Position } from '../types'

const precios = { 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 6: 100, 7: 100, 8: 500, 9: 100 }
// 1 Portero, 2 Extremos, 2 Laterales, 1 Boya, 1 Contraboya (+ 8 y 9 de repuesto)
const posiciones: Record<number, Position> = {
  1: 'Portero', 2: 'Extremo', 3: 'Extremo', 4: 'Lateral', 5: 'Lateral',
  6: 'Boya', 7: 'Contraboya', 8: 'Lateral', 9: 'Portero',
}
const ok7 = [1, 2, 3, 4, 5, 6, 7]

describe('validarDraft', () => {
  it('ok con 7 jugadores distintos, capitán entre ellos, composición y presupuesto', () => {
    expect(validarDraft(ok7, 3, precios, 1000, posiciones)).toEqual({ ok: true })
  })

  it('falla con menos de 7', () => {
    expect(validarDraft([1, 2, 3], 1, precios, 1000, posiciones)).toEqual({
      ok: false, error: 'Elige exactamente 7 jugadores.',
    })
  })

  it('falla con un dorsal repetido', () => {
    expect(validarDraft([1, 2, 3, 4, 5, 6, 6], 1, precios, 1000, posiciones).ok).toBe(false)
  })

  it('falla sin capitán', () => {
    expect(validarDraft(ok7, null, precios, 1000, posiciones)).toEqual({
      ok: false, error: 'Elige un capitán de tu 7.',
    })
  })

  it('falla si el capitán no está en los 7', () => {
    expect(validarDraft(ok7, 8, precios, 1000, posiciones).ok).toBe(false)
  })

  it('falla si el coste total supera el presupuesto', () => {
    // 1,2,3,4,5,6 + 8 (Lateral 500€): composición 3 laterales -> cambiamos 7 por 8 solo en coste
    const pos = { ...posiciones, 8: 'Contraboya' as Position }
    expect(validarDraft([1, 2, 3, 4, 5, 6, 8], 1, precios, 1000, pos)).toEqual({
      ok: false, error: 'Te pasas del presupuesto (1100€ de 1000€).',
    })
  })

  it('falla si hay dos porteros y falta un contraboya', () => {
    const r = validarDraft([1, 9, 2, 3, 4, 5, 6], 1, precios, 1000, posiciones)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain('Portero 2/1')
      expect(r.error).toContain('Contraboya 0/1')
    }
  })

  it('falla con tres laterales aunque sean 7 distintos', () => {
    const r = validarDraft([1, 2, 4, 5, 8, 6, 7], 1, precios, 1000, posiciones)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain('Lateral 3/2')
      expect(r.error).toContain('Extremo 1/2')
    }
  })

  it('un dorsal sin posición conocida no cuenta y la composición falla', () => {
    expect(validarDraft([1, 2, 3, 4, 5, 6, 99], 1, precios, 1000, posiciones).ok).toBe(false)
  })
})

describe('contarPosiciones', () => {
  it('cuenta por posición', () => {
    expect(contarPosiciones(ok7, posiciones)).toEqual({
      Portero: 1, Extremo: 2, Lateral: 2, Boya: 1, Contraboya: 1,
    })
  })
})

describe('filaAlineacionAdmin', () => {
  it('falla si queda un hueco vacío', () => {
    expect(filaAlineacionAdmin('u1', 13, false, [1, 2, 3, 4, 5, 6, null], 1, posiciones)).toEqual({
      ok: false, error: 'Elige exactamente 7 jugadores.',
    })
  })

  it('falla con composición incorrecta', () => {
    const r = filaAlineacionAdmin('u1', 13, false, [1, 9, 2, 3, 4, 5, 6], 1, posiciones)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Composición incorrecta')
  })

  it('no aplica tope de presupuesto (el 7 que en Draft se pasa de 1000€ vale)', () => {
    const pos = { ...posiciones, 8: 'Contraboya' as Position }
    expect(filaAlineacionAdmin('u1', 13, false, [1, 2, 3, 4, 5, 6, 8], 1, pos).ok).toBe(true)
  })

  it('jornada sin puntuar: fila sin puntos_jornada, presupuesto_usado null y sin reprocesar', () => {
    expect(filaAlineacionAdmin('u1', 13, false, ok7, 3, posiciones)).toStrictEqual({
      ok: true,
      fila: { usuario_id: 'u1', jornada: 13, jugadores: ok7, capitan: 3, presupuesto_usado: null },
      reprocesar: false,
    })
  })

  it('jornada ya puntuada: vacía puntos_jornada y pide reprocesar', () => {
    expect(filaAlineacionAdmin('u1', 13, true, ok7, 3, posiciones)).toStrictEqual({
      ok: true,
      fila: { usuario_id: 'u1', jornada: 13, jugadores: ok7, capitan: 3, presupuesto_usado: null, puntos_jornada: null },
      reprocesar: true,
    })
  })

  it('escribe en la jornada recibida (número de federación, no el orden)', () => {
    const r = filaAlineacionAdmin('u1', 9, false, ok7, 3, posiciones)
    expect(r.ok && r.fila.jornada).toBe(9)
  })
})
