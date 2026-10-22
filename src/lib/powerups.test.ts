import { describe, it, expect } from 'vitest'
import { validarPowerup } from './powerups'

describe('validarPowerup', () => {
  it('ok para puntos_extra con objetivo en la alineación', () => {
    expect(validarPowerup('puntos_extra', 7, [1, 7, 12])).toEqual({ ok: true })
  })

  it('ok para presupuesto_extra sin objetivo', () => {
    expect(validarPowerup('presupuesto_extra', null, [1, 7, 12])).toEqual({ ok: true })
  })

  it('falla si puntos_extra/blindaje no traen objetivo', () => {
    expect(validarPowerup('blindaje', null, [1, 7, 12])).toEqual({
      ok: false, error: 'Elige un jugador objetivo.',
    })
  })

  it('falla si el objetivo no está en tu alineación de esta jornada', () => {
    expect(validarPowerup('puntos_extra', 99, [1, 7, 12])).toEqual({
      ok: false, error: 'El jugador objetivo debe estar en tu alineación de esta jornada.',
    })
  })

  it('falla si un tipo sin objetivo trae uno igualmente', () => {
    expect(validarPowerup('doble_ganancia', 7, [1, 7, 12])).toEqual({
      ok: false, error: 'Este power-up no necesita un jugador objetivo.',
    })
  })
})
