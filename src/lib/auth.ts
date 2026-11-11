// Pure auth helpers. Must not import ./supabase (it throws without env vars, which breaks tests).

export const LINK_ERROR_MESSAGE =
  'El enlace del correo ha caducado o ya se ha usado. Pide otro con «¿Has olvidado tu contraseña?».'

// Reads hash + query params the same way supabase-js does (query wins).
export function parseAuthRedirect(href: string): { recovery: boolean; linkError: boolean } {
  const url = new URL(href)
  const params: Record<string, string> = {}
  if (url.hash.startsWith('#')) {
    try {
      new URLSearchParams(url.hash.slice(1)).forEach((value, key) => {
        params[key] = value
      })
    } catch {
      // unparseable hash: ignore, like supabase-js
    }
  }
  url.searchParams.forEach((value, key) => {
    params[key] = value
  })

  return {
    recovery: params.type === 'recovery' && !!params.access_token,
    linkError: !!(params.error || params.error_code || params.error_description),
  }
}

export function authErrorMessage(error: { code?: string; message: string }): string {
  const seconds = error.message.match(/after (\d+) seconds?/)
  if (seconds) return `Espera ${seconds[1]} segundos antes de pedir otro enlace.`

  switch (error.code) {
    case 'over_email_send_rate_limit':
      return 'Ahora mismo no podemos enviar más correos. Inténtalo dentro de un rato o avisa al admin.'
    case 'over_request_rate_limit':
      return 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.'
    case 'same_password':
      return 'La contraseña nueva tiene que ser distinta de la actual.'
    case 'weak_password':
      return 'La contraseña tiene que tener al menos 6 caracteres.'
    case 'session_not_found':
    case 'session_expired':
    case 'reauthentication_needed':
      return 'Tu sesión ha caducado. Vuelve a entrar o pide otro enlace.'
    default:
      return 'No se ha podido completar. Inténtalo de nuevo.'
  }
}
