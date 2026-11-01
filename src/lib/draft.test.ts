import { describe, it, expect } from 'vitest'
import {
  validarDraft, contarPosiciones, filaAlineacionAdmin, contarRepetidos, repetidoBloqueado, alineacionAnterior, filasFormacion,
} from './draft'
import type { Position } from '../types'

const precios = { 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 6: 100, 7: 100, 8: 500, 9: 100 }
// 1 Portero, 2 Extremos, 2 Laterales, 1 Boya, 1 Contraboya (+ 8, 9 y 10 de repuesto)
const posiciones: Record<number, Position> = {
  1: 'Portero', 2: 'Extremo', 3: 'Extremo', 4: 'Lateral', 5: 'Lateral',
  6: 'Boya', 7: 'Contraboya', 8: 'Lateral', 9: 'Portero', 10: 'Extremo',
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

describe('validarDraft con alineación anterior', () => {
  const anterior = { jugadores: ok7, capitan: 3 }
  // Repite 2, 4, 6 y 7 de ok7 (4 repetidos); cuesta 1000€ (el 10 no tiene precio)
  const cuatroRepetidos = [9, 2, 10, 4, 8, 6, 7]

  it('falla si repite el capitán de la alineación anterior', () => {
    expect(validarDraft(cuatroRepetidos, 2, precios, 1000, posiciones, { jugadores: ok7, capitan: 2 }))
      .toEqual({ ok: false, error: 'No puedes repetir el capitán de tu alineación anterior.' })
  })

  it('falla con 5 jugadores repetidos', () => {
    const r = validarDraft([9, 2, 3, 4, 8, 6, 7], 9, precios, 2000, posiciones, anterior)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Repites 5')
  })

  it('ok con exactamente 4 repetidos y otro capitán', () => {
    expect(validarDraft(cuatroRepetidos, 9, precios, 1000, posiciones, anterior)).toEqual({ ok: true })
  })

  it('sin alineación anterior (o vacía) no hay restricción', () => {
    expect(validarDraft(ok7, 3, precios, 1000, posiciones, null)).toEqual({ ok: true })
    expect(validarDraft(ok7, 3, precios, 1000, posiciones, { jugadores: null, capitan: null })).toEqual({ ok: true })
  })
})

describe('contarRepetidos', () => {
  it('cuenta los dorsales que ya estaban; 0 sin anterior', () => {
    expect(contarRepetidos([9, 2, 10, 4, 8, 6, 7], { jugadores: ok7, capitan: 3 })).toBe(4)
    expect(contarRepetidos(ok7, null)).toBe(0)
    expect(contarRepetidos(ok7, { jugadores: null, capitan: null })).toBe(0)
  })
})

describe('repetidoBloqueado', () => {
  const anterior = { jugadores: ok7, capitan: 3 }

  it('bloquea el resto de la alineación anterior al llegar a 4 repetidos', () => {
    expect(repetidoBloqueado(7, [1, 2, 3, 4], anterior)).toBe(true)
    expect(repetidoBloqueado(7, [1, 2, 3], anterior)).toBe(false)
  })

  it('no bloquea a un jugador nuevo ni cuando no hay alineación anterior', () => {
    expect(repetidoBloqueado(8, [1, 2, 3, 4], anterior)).toBe(false)
    expect(repetidoBloqueado(7, [1, 2, 3, 4], null)).toBe(false)
  })
})

describe('alineacionAnterior', () => {
  // `numero` es el de federación; el orden del Fantasy es `orden`
  const jornadas = [
    { numero: 9, orden: 3 }, { numero: 3, orden: 4 }, { numero: 12, orden: 5 }, { numero: 1, orden: 6 },
  ]
  const a9 = { jornada: 9, jugadores: [1], capitan: 1 }
  const a3 = { jornada: 3, jugadores: [2], capitan: 2 }
  const a12 = { jornada: 12, jugadores: [3], capitan: 3 }
  const a1 = { jornada: 1, jugadores: [4], capitan: 4 }

  it('elige la de mayor orden anterior a la actual, no por número', () => {
    expect(alineacionAnterior(jornadas, [a1, a3, a12, a9], 12)).toEqual(a3)
  })

  it('si se saltó jornadas, coge su última alineación previa', () => {
    expect(alineacionAnterior(jornadas, [a9, a12, a1], 1)).toEqual(a12)
    expect(alineacionAnterior(jornadas, [a9, a12, a1], 12)).toEqual(a9)
  })

  it('null si no hay alineaciones previas', () => {
    expect(alineacionAnterior(jornadas, [a12, a3, a1], 9)).toBeNull()
    expect(alineacionAnterior(jornadas, [], 12)).toBeNull()
  })
})

describe('filasFormacion', () => {
  it('Contraboya / Laterales / Extremo + Boya + Extremo / Portero', () => {
    const js = ok7.map(n => ({ numero: n, pos: posiciones[n] })).reverse()
    expect(filasFormacion(js).map(fila => fila.map(j => j.numero))).toEqual([[7], [5, 4], [3, 6, 2], [1]])
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
