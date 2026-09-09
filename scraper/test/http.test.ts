import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getJson, getHtml, setMinDelayMs, setRetryBackoffMs } from '../src/http'

beforeEach(() => {
  setMinDelayMs(0)
  setRetryBackoffMs(0)
  vi.restoreAllMocks()
})

describe('getJson', () => {
  it('parses a JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"a":1}', { status: 200 })))
    expect(await getJson<{ a: number }>('https://x/y')).toEqual({ a: 1 })
  })

  it('retries on 429 then succeeds', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', f)
    expect(await getJson('https://x/y')).toEqual({ ok: true })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('throws after 3 failed attempts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    await expect(getJson('https://x/y')).rejects.toThrow(/500/)
  })
})

describe('getHtml', () => {
  it('returns the body for a normal page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>ok</html>', { status: 200 })))
    expect(await getHtml('https://x/y')).toContain('ok')
  })

  it('throws on a Cloudflare challenge body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('<html>Comprobando tu navegador</html>', { status: 200 })))
    await expect(getHtml('https://x/y')).rejects.toThrow(/challenge|Cloudflare/i)
  })
})
