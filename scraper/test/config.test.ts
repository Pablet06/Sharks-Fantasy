import { describe, it, expect, vi } from 'vitest'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../src/supabase', () => ({ supabase: { from } }))

import { getConfig, setConfig } from '../src/config'

describe('getConfig', () => {
  it('returns the value for a key', async () => {
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: '1324114' } }) }) }),
    })
    expect(await getConfig('tournament_id')).toBe('1324114')
  })

  it('throws when the key is missing', async () => {
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    })
    await expect(getConfig('nope')).rejects.toThrow(/nope/)
  })
})

describe('setConfig', () => {
  it('upserts the key', async () => {
    const upsert = vi.fn(async () => ({ error: null }))
    from.mockReturnValue({ upsert })
    await setConfig('last_sync_at', '2026-09-04')
    expect(upsert).toHaveBeenCalledWith({ key: 'last_sync_at', value: '2026-09-04' }, { onConflict: 'key' })
  })
})
