import { describe, it, expect } from 'vitest'
import { coincide } from './busqueda'

describe('coincide', () => {
  it('una consulta vacía (o solo espacios) deja pasar todo', () => {
    expect(coincide('', 'Pablo')).toBe(true)
    expect(coincide('   ', 'Pablo')).toBe(true)
  })

  it('no distingue mayúsculas', () => {
    expect(coincide('PABLO', 'pablo ferrer')).toBe(true)
  })

  it('no distingue tildes, en ningún sentido', () => {
    expect(coincide('raul', 'Raúl')).toBe(true)
    expect(coincide('comodín', 'Comodin ')).toBe(true)
  })

  it('busca por trozo, en cualquier parte del texto', () => {
    expect(coincide('ferr', 'Carlos Ferrer')).toBe(true)
    expect(coincide('carlos f', 'Carlos Ferrer')).toBe(true)
  })

  it('basta con que coincida uno de los textos; ignora null, undefined y números ajenos', () => {
    expect(coincide('tigre', 'Carlos Ferrer', 'Tigre', null)).toBe(true)
    expect(coincide('tigre', 'Carlos Ferrer', null, undefined)).toBe(false)
  })

  it('un número se compara como texto (dorsal)', () => {
    expect(coincide('12', 'Josep Baeza', 12)).toBe(true)
    expect(coincide('99', 'Josep Baeza', 12)).toBe(false)
  })

  it('sin coincidencia devuelve false', () => {
    expect(coincide('zzz', 'Pablo', 'Lateral')).toBe(false)
  })
})
