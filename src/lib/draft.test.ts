import { describe, it, expect } from 'vitest'
import { validarDraft } from './draft'

const precios = { 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 6: 100, 7: 100, 8: 500 }

describe('validarDraft', () => {
  it('ok con 7 jugadores distintos, capitán entre ellos, dentro de presupuesto', () => {
    expect(validarDraft([1, 2, 3, 4, 5, 6, 7], 3, precios, 1000)).toEqual({ ok: true })
  })

  it('falla con menos de 7', () => {
    expect(validarDraft([1, 2, 3], 1, precios, 1000)).toEqual({
      ok: false, error: 'Elige exactamente 7 jugadores.',
    })
  })

  it('falla con un dorsal repetido', () => {
    expect(validarDraft([1, 2, 3, 4, 5, 6, 6], 1, precios, 1000).ok).toBe(false)
  })

  it('falla sin capitán', () => {
    expect(validarDraft([1, 2, 3, 4, 5, 6, 7], null, precios, 1000)).toEqual({
      ok: false, error: 'Elige un capitán de tu 7.',
    })
  })

  it('falla si el capitán no está en los 7', () => {
    expect(validarDraft([1, 2, 3, 4, 5, 6, 7], 8, precios, 1000).ok).toBe(false)
  })

  it('falla si el coste total supera el presupuesto', () => {
    expect(validarDraft([1, 2, 3, 4, 5, 6, 8], 1, precios, 1000)).toEqual({
      ok: false, error: 'Te pasas del presupuesto (1100€ de 1000€).',
    })
  })
})
