import { describe, it, expect } from 'vitest'
import { parseAuthRedirect, authErrorMessage } from './auth'

const BASE = 'http://localhost:5173/Sharks-Fantasy/'

describe('parseAuthRedirect', () => {
  it('detects a recovery link', () => {
    const href = `${BASE}#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer&type=recovery`
    expect(parseAuthRedirect(href)).toEqual({ recovery: true, linkError: false })
  })

  it('ignores other link types', () => {
    const href = `${BASE}#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer&type=magiclink`
    expect(parseAuthRedirect(href).recovery).toBe(false)
  })

  it('requires an access_token for recovery', () => {
    expect(parseAuthRedirect(`${BASE}#type=recovery`).recovery).toBe(false)
  })

  it('detects a link error in the hash', () => {
    const href = `${BASE}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`
    expect(parseAuthRedirect(href)).toEqual({ recovery: false, linkError: true })
  })

  it('detects a link error in the query', () => {
    expect(parseAuthRedirect(`${BASE}?error=access_denied&error_code=otp_expired`).linkError).toBe(true)
  })

  it('returns false/false for plain urls', () => {
    const none = { recovery: false, linkError: false }
    expect(parseAuthRedirect(BASE)).toEqual(none)
    expect(parseAuthRedirect(`${BASE}#`)).toEqual(none)
    expect(parseAuthRedirect(`${BASE}#foo`)).toEqual(none)
  })
})

describe('authErrorMessage', () => {
  it('translates the per-user 60 s limit with the seconds left', () => {
    const msg = authErrorMessage({
      code: 'over_email_send_rate_limit',
      message: 'For security purposes, you can only request this after 37 seconds.',
    })
    expect(msg).toContain('37 segundos')
  })

  it('translates the project email limit', () => {
    const msg = authErrorMessage({ code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded' })
    expect(msg).toContain('no podemos enviar más correos')
  })

  it('translates same_password and weak_password', () => {
    expect(authErrorMessage({ code: 'same_password', message: 'x' })).toBe(
      'La contraseña nueva tiene que ser distinta de la actual.',
    )
    expect(authErrorMessage({ code: 'weak_password', message: 'x' })).toBe(
      'La contraseña tiene que tener al menos 6 caracteres.',
    )
  })

  it('falls back to Spanish for unknown errors', () => {
    const msg = authErrorMessage({ message: 'Something weird' })
    expect(msg).not.toContain('Something')
    expect(msg).toBe('No se ha podido completar. Inténtalo de nuevo.')
  })
})
