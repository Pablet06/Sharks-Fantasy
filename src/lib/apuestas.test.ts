import { describe, it, expect } from 'vitest'
import { validarApuestas } from './apuestas'

describe('validarApuestas', () => {
  it('ok con importes positivos dentro del 20% del presupuesto', () => {
    expect(validarApuestas([{ tipo: 'resultado', seleccion: 'gana', importe: 100 }], 1000))
      .toEqual({ ok: true })
  })

  it('ok sumando varias apuestas hasta el tope exacto', () => {
    const apuestas = [
      { tipo: 'resultado', seleccion: 'gana', importe: 100 },
      { tipo: 'porteria', seleccion: 'si', importe: 100 },
    ]
    expect(validarApuestas(apuestas, 1000)).toEqual({ ok: true })
  })

  it('falla si algún importe es 0 o negativo', () => {
    expect(validarApuestas([{ tipo: 'resultado', seleccion: 'gana', importe: 0 }], 1000)).toEqual({
      ok: false, error: 'El importe debe ser mayor que 0.',
    })
  })

  it('falla si la suma supera el 20% del presupuesto', () => {
    const apuestas = [
      { tipo: 'resultado', seleccion: 'gana', importe: 150 },
      { tipo: 'porteria', seleccion: 'si', importe: 100 },
    ]
    expect(validarApuestas(apuestas, 1000)).toEqual({
      ok: false, error: 'El total apostado (250€) supera el 20% del presupuesto (200€).',
    })
  })
})
