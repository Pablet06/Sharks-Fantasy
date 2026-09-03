let minDelayMs = 1500
let lastRequestAt = 0
let retryBackoffMs = 3000

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export function setMinDelayMs(ms: number): void {
  minDelayMs = ms
}

export function setRetryBackoffMs(ms: number): void {
  retryBackoffMs = ms
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function throttle(): Promise<void> {
  const wait = lastRequestAt + minDelayMs - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()
}

async function request(url: string, headers: Record<string, string>): Promise<Response> {
  const maxAttempts = 3
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await throttle()
    try {
      const res = await fetch(url, { headers })
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`${url} -> HTTP ${res.status}`)
        await sleep(attempt * retryBackoffMs)
        continue
      }
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
      return res
    } catch (err) {
      lastErr = err
      await sleep(attempt * retryBackoffMs)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await request(url, { Accept: 'application/json' })
  return res.json() as Promise<T>
}

export async function getHtml(url: string): Promise<string> {
  const res = await request(url, { 'User-Agent': UA, Accept: 'text/html' })
  const body = await res.text()
  if (body.includes('Comprobando tu navegador') || body.includes('cf-browser-verification')) {
    throw new Error(`Cloudflare challenge received for ${url}`)
  }
  return body
}
