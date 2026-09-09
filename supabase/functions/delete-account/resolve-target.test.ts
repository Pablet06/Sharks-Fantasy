import { describe, it, expect } from 'vitest'
import { resolveTarget } from './resolve-target'

describe('resolveTarget', () => {
  it('no body → caller deletes self', () => {
    expect(resolveTarget('a', false, null)).toEqual({ id: 'a' })
  })
  it('admin deletes another user', () => {
    expect(resolveTarget('admin', true, { target_user_id: 'b' })).toEqual({ id: 'b' })
  })
  it('non-admin cannot delete another user', () => {
    expect(resolveTarget('a', false, { target_user_id: 'b' })).toEqual({ error: 'forbidden' })
  })
  it('targeting self is allowed even for non-admin', () => {
    expect(resolveTarget('a', false, { target_user_id: 'a' })).toEqual({ id: 'a' })
  })
})
