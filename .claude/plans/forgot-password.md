# Recuperar y cambiar la contraseña — Implementation Plan

> Estado: **aprobado por el usuario el 2026-11-11** con estas decisiones: P1 plantilla del correo en castellano (el usuario la pega en el panel); P2 dos campos de contraseña (con repetición); P3 documentar el reset manual por SQL en `MANUAL_DEL_JUEGO` §14; P4 sin pedir la contraseña actual (verificado en el panel: "Secure password change" desactivado); P5 cuenta de prueba iCloud; botón "Cancelar" incluido. Decisiones ya tomadas en `docs/tasks/forgot-password.md` (secciones Decisions y Acceptance criteria). Rama: `feature/forgot-password` (ya creada). Nada aplicado, nada commiteado. Sin migración ni cambios de RLS.

**Goal:** que un usuario pueda pedir desde el login un enlace para fijar una contraseña nueva y entrar en la app, y que un usuario con sesión pueda cambiarla desde Perfil; en local y en GitHub Pages.
**Approach:** flujo implícito de supabase-js (sin tocar `createClient`). Se captura la URL **antes** de crear el cliente (helper puro `parseAuthRedirect`), `useAuth` expone un flag `recovery` (desde la URL **y** desde el evento `PASSWORD_RECOVERY`), y `App.tsx` pinta un único `ResetPasswordForm` antes de Onboarding/Dashboard. Mismo componente dentro de `Profile.tsx`. Errores de Supabase traducidos con un segundo helper puro (`authErrorMessage`).
**Estimated steps:** 9

## Verificado en el código (no suposiciones)

- **supabase-js 2.105.4 (`@supabase/auth-js` 2.105.4).** El constructor de `GoTrueClient` llama a `this.initialize()` en cuanto se ejecuta `createClient` (`GoTrueClient.js` ~l.225). `_initialize()` lee `window.location.href` con `parseParametersFromURL` (hash **y** query; la query manda) y lo trata como callback implícito si hay `access_token` **o** `error_description` (`_isImplicitGrantCallback`, l.3119).
- **Éxito (`#access_token=…&type=recovery`):** `_getSessionFromURL` valida el token con una llamada de red (`_getUser`) y **solo después** borra el hash con `window.location.hash = ''` (l.~3100; la URL queda acabada en `#`). Luego `_saveSession` y, en un `setTimeout(…, 0)`, emite `PASSWORD_RECOVERY` (l.318-326). Es decir: el hash desaparece de forma asíncrona y el evento puede llegar antes o después de que React se suscriba.
- **`getSession()` espera a `initializePromise`**, así que cuando `useAuth` pone `loading=false` la sesión de recuperación ya está guardada y `user` ya es el del enlace. Lo único que se pierde es *saber que era una recuperación* → eso es lo que hay que capturar.
- **`onAuthStateChange`** registra el callback de forma síncrona y, tras `initializePromise`, emite `INITIAL_SESSION` (l.3396-3410). Si `PASSWORD_RECOVERY` ya se emitió antes de suscribirse, **no se repite**: de ahí la carrera.
- **Error (`#error=access_denied&error_code=otp_expired&error_description=…`):** `_getSessionFromURL` lanza `AuthImplicitGrantRedirectError` **antes** de borrar el hash → supabase-js **no limpia la URL** en el caso de error y no emite nada (solo lo deja en el `{ error }` de `initialize`). Si no lo limpiamos nosotros, cada recarga repetiría el error.
- **`BroadcastChannel`:** `_notifyAllSubscribers` reenvía los eventos a otras pestañas abiertas de la app (l.3943-3948). Si el usuario tiene la app abierta en otra pestaña, esa pestaña también recibe `PASSWORD_RECOVERY` y la sesión.
- **`resetPasswordForEmail(email, { redirectTo })`** solo usa PKCE si `flowType === 'pkce'` (l.3505); con el cliente por defecto es implícito. `updateUser` espera a `initializePromise` (l.2630). `AuthError` trae `code` (tipo `ErrorCode` en `lib/error-codes.d.ts`, incluye `over_email_send_rate_limit`, `over_request_rate_limit`, `same_password`, `weak_password`, `otp_expired`, `session_not_found`, `reauthentication_needed`).
- **App:** sin router; `main.tsx` usa `<StrictMode>` (efectos doble en dev: el patrón suscribir/desuscribir actual lo aguanta). `App.tsx`: `authLoading || jugadoresLoading` → carga; `jugadoresError`; `!user` → `<Auth />`; `usuarioLoading`; `needsOnboarding`; `!usuario`; `<Dashboard>`. `Auth.tsx` alterna `'login' | 'signup'` y pinta el logo con `/Sharks-Fantasy/logo.png`. `LoginForm`/`SignupForm` reciben solo `onSwitch` y muestran `error.message` en crudo (inglés).
- **Profile:** props `usuario`, `userEmail`, `onUpdate`, `onSignOut` (montado en `Dashboard.tsx:45-50`); bloques `.profile-email`, `.profile-field` (con `.label`), `Historial`, `.danger-zone`.
- **CSS reutilizable** (`src/index.css`): `.auth-container`, `.auth-logo*`, `.auth-title`, `.auth-subtitle` (144-191), `.auth-form` (+`h2`), `.auth-input`, `.auth-btn`, `.auth-error`, `.auth-switch`, `.auth-link` (193-274), `.profile-field`/`.label` (1373-1390). Existe `--success: #2ed573`; **no** hay clase de mensaje de éxito → se añade `.auth-success` (espejo de `.auth-error`).
- **Base URL:** `vite.config.ts` `base: '/Sharks-Fantasy/'` → `import.meta.env.BASE_URL === '/Sharks-Fantasy/'` en dev y build. Nadie lo usa aún en `src/`. Dev en el puerto 5173 (`.claude/launch.json`).
- **Tests:** Vitest en entorno `node`, `include: src/**/*.test.ts`; `URL`/`URLSearchParams` disponibles. `src/lib/supabase.ts` lanza si faltan las env → el helper **no** puede vivir ahí (el test no podría importarlo).
- **Deploy:** `.github/workflows/deploy.yml` publica en cada push a `main`.
- **`.env` local apunta a PROD** (nota del planner): cambiar la contraseña en local cambia la contraseña real de esa cuenta en producción.
- `docs/plan.md` (22 líneas) no trata auth → **sin divergencia**.

## Inventario de reutilización

| Qué | Dónde | Uso |
|---|---|---|
| Patrón formulario (`useState` email/error/loading, `form.auth-form`, `auth-input`, `auth-btn`, `auth-error`, `auth-switch` + `auth-link`) | `LoginForm.tsx`, `SignupForm.tsx` | `ForgotPasswordForm` y `ResetPasswordForm` |
| Pantalla "hecho" con botón de vuelta | `SignupForm.tsx:31-44` (`done`) | estado enviado de `ForgotPasswordForm` |
| Contenedor + logo | `Auth.tsx:9-14` | pantalla de recuperación en `App.tsx` (mismo marcado) |
| `minLength={6}` + placeholder "(mín. 6 caracteres)" | `SignupForm.tsx:58-66` | campos de contraseña nueva |
| `.profile-field` + `span.label` | `Profile.tsx:63-76` | bloque "Cambiar contraseña" |
| `--success` | `src/index.css:15` | `.auth-success` |

## Flujo de datos

```
carga de la página
  └─ src/lib/supabase.ts (evaluación del módulo)
       1. authRedirect = parseAuthRedirect(window.location.href)   ← síncrono, ANTES de createClient
       2. si authRedirect.linkError → history.replaceState(null, '', pathname + search sin el hash)
       3. supabase = createClient(...)  → initialize() procesa el hash (si sigue ahí) de forma asíncrona
  └─ useAuth: recovery = useState(authRedirect.recovery)
              onAuthStateChange: if (event === 'PASSWORD_RECOVERY') setRecovery(true)
  └─ App: … !user → <Auth linkError={authRedirect.linkError}/> ; user && recovery → pantalla "Nueva contraseña"
          (antes de usuarioLoading / Onboarding / Dashboard)
          onSuccess → endRecovery() → sigue el flujo normal → Dashboard (u Onboarding)
```

Por qué así: el hash es la fuente fiable (lo leemos antes de que supabase-js pueda borrarlo, porque el cliente ni siquiera existe todavía); el evento queda como red de seguridad (y cubre la otra pestaña vía `BroadcastChannel`). El flag se pone a `true` desde cualquiera de los dos y solo vuelve a `false` cuando el usuario termina o cancela. No hay carrera porque no dependemos del orden entre el evento y la suscripción.

---

## Step 1: Helpers puros + tests (TDD, tests primero)
- **Files:** `src/lib/auth.ts` (nuevo), `src/lib/auth.test.ts` (nuevo)
- **Details:**
  - `parseAuthRedirect(href: string): { recovery: boolean; linkError: boolean }`
    - Junta parámetros de hash (`#a=b&…`) y query como hace supabase-js (la query manda; hash no parseable → ignorado).
    - `recovery = type === 'recovery' && !!access_token`.
    - `linkError = !!(error || error_code || error_description)`.
  - `authErrorMessage(error: { code?: string; message: string }): string` — siempre devuelve castellano, nunca el `message` en inglés:
    - `message` casa con `/after (\d+) seconds?/` (límite de 60 s por usuario; en GoTrue viene con código `over_email_send_rate_limit` y status 429 — **comprobar en E1**, ver Step 8) → `` `Espera ${n} segundos antes de pedir otro enlace.` ``
    - `over_email_send_rate_limit` (límite de 2/hora del proyecto) → `'Ahora mismo no podemos enviar más correos. Inténtalo dentro de un rato o avisa al admin.'`
    - `over_request_rate_limit` → `'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.'`
    - `same_password` → `'La contraseña nueva tiene que ser distinta de la actual.'`
    - `weak_password` → `'La contraseña tiene que tener al menos 6 caracteres.'`
    - `session_not_found` / `session_expired` / `reauthentication_needed` → `'Tu sesión ha caducado. Vuelve a entrar o pide otro enlace.'`
    - resto → `'No se ha podido completar. Inténtalo de nuevo.'`
  - Constante exportada `LINK_ERROR_MESSAGE = 'El enlace del correo ha caducado o ya se ha usado. Pide otro con «¿Has olvidado tu contraseña?».'` (un único mensaje para cualquier error de enlace: con el registro sin confirmación por email, en la práctica solo llegan enlaces de recuperación).
- **Tests** (`auth.test.ts`):
  - `parseAuthRedirect`:
    1. `…/Sharks-Fantasy/#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer&type=recovery` → `{ recovery: true, linkError: false }`
    2. mismo hash con `type=magiclink` → `recovery: false`
    3. `#type=recovery` sin `access_token` → `recovery: false`
    4. `#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired` → `{ recovery: false, linkError: true }`
    5. error en la query (`?error=access_denied&error_code=otp_expired`) → `linkError: true`
    6. sin hash, `#` vacío y `#foo` → `{ false, false }`
  - `authErrorMessage`:
    1. `{ code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 37 seconds.' }` → contiene `37 segundos`
    2. `{ code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded' }` → mensaje de "no podemos enviar más correos"
    3. `same_password`, `weak_password` → sus mensajes
    4. `{ message: 'Something weird' }` → fallback en castellano (no contiene `Something`)
- **Risks:** el texto exacto del 60 s depende de GoTrue; si en E1 sale distinto, se ajusta la regex y el test 1 (cambio de 1 línea).

## Step 2: Capturar la URL antes de crear el cliente
- **Files:** `src/lib/supabase.ts`
- **Details:**
  - `import { parseAuthRedirect } from './auth'`.
  - Justo después de la comprobación de env y **antes** de `createClient`: `export const authRedirect = parseAuthRedirect(window.location.href)`.
  - Si `authRedirect.linkError`: `window.history.replaceState(null, '', window.location.pathname)` (la app no usa query ni hash, así que basta el `pathname`; quita el error venga por hash o por query). Así supabase-js ni lo ve (no hay error en consola) y una recarga no repite el aviso.
  - Comentario corto en inglés: por qué antes de `createClient` (el cliente borra el hash al procesarlo y emite `PASSWORD_RECOVERY` en un `setTimeout`, posiblemente antes de que React se suscriba).
  - `createClient(...)` **sin cambios** (implícito, sin PKCE).
- **Risks:** ninguno: lectura síncrona; en el caso de éxito no tocamos la URL.

## Step 3: `useAuth` expone el modo recuperación
- **Files:** `src/hooks/useAuth.ts`
- **Details:**
  - `const [recovery, setRecovery] = useState(authRedirect.recovery)`.
  - En `onAuthStateChange((event, session) => …)`: además de `setUser`, `if (event === 'PASSWORD_RECOVERY') setRecovery(true)`.
  - Devolver `{ user, loading, signOut, recovery, endRecovery: () => setRecovery(false) }`.
  - Nada más (sin listener de `SIGNED_OUT`: el que cancela llama a `endRecovery` y `signOut` a la vez, Step 5).
- **Risks:** la otra pestaña abierta también pasa a "Nueva contraseña" (por `BroadcastChannel`); es coherente (es la misma sesión de recuperación). Aceptable.

## Step 4: `ResetPasswordForm` reutilizable + CSS
- **Files:** `src/components/Auth/ResetPasswordForm.tsx` (nuevo), `src/index.css`
- **Details:**
  - Props: `{ title?: string; onSuccess?: () => void; onCancel?: () => void }`.
  - Estado: `password`, `confirm`, `error`, `loading`, `done`.
  - Render: `form.auth-form` → `h2` con `title` si viene → `p.auth-error` / `p.auth-success` → `input.auth-input type="password" autoComplete="new-password" minLength={6} required` "Contraseña nueva (mín. 6 caracteres)" → segundo input "Repite la contraseña" (ver P2) → `button.auth-btn` "Guardar contraseña" / "Guardando..." → si `onCancel`, `p.auth-switch` con `button.auth-link` "Cancelar".
  - Submit: si `password !== confirm` → `'Las dos contraseñas no coinciden.'` (sin llamada). Si no, `supabase.auth.updateUser({ password })`; error → `setError(authErrorMessage(error))`; éxito → vaciar campos, `setDone(true)` ("✓ Contraseña cambiada"), `onSuccess?.()`.
  - Comportamiento por contexto:
    - **Recuperación (App):** `title="Nueva contraseña"`, `onSuccess` = `endRecovery` → el formulario se desmonta al momento y se entra en la app (Dashboard u Onboarding si el perfil no existía). `onCancel` = cerrar sesión (Step 5).
    - **Perfil:** sin `title` (el título lo pone el bloque `.profile-field`), sin `onCancel`; tras el éxito se queda montado mostrando "✓ Contraseña cambiada" y la sesión sigue abierta (`updateUser` no la cierra).
  - CSS: `.auth-success` = copia de `.auth-error` con `--success` (`rgba(46, 213, 115, 0.12)` de fondo, borde `0.3`, `color: var(--success)`). Nada más.
- **Risks:** `.auth-form h2` es grande; en Perfil no se pasa `title`, así que no aplica.

## Step 5: Pantalla de recuperación en `App.tsx`
- **Files:** `src/App.tsx`
- **Details:**
  - `const { user, loading: authLoading, signOut, recovery, endRecovery } = useAuth()`.
  - `if (!user) return <Auth linkError={authRedirect.linkError} />` (importar `authRedirect` de `./lib/supabase`).
  - Justo después (antes de `usuarioLoading`): `if (recovery)` → mismo marcado que `Auth.tsx` (`div.auth-container` + `div.auth-logo` con logo/título/subtítulo) y dentro `<ResetPasswordForm title="Nueva contraseña" onSuccess={endRecovery} onCancel={() => { endRecovery(); signOut() }} />`.
  - Así un usuario con sesión de recuperación **nunca** ve Onboarding ni Dashboard hasta terminar o cancelar.
- **Risks:**
  - Si cierra la pestaña sin fijar contraseña, la sesión de recuperación queda guardada y en la siguiente visita (sin hash) entra al Dashboard con su contraseña vieja. Es el comportamiento estándar de Supabase; puede cambiarla en Perfil. Aceptable.
  - Si el token del enlace no es válido (`_getUser` falla), no hay sesión → `!user` → login normal; el flag `recovery` queda en `true` pero no hace nada sin usuario. Si después inicia sesión con su contraseña, vería "Nueva contraseña" en vez del Dashboard; caso muy raro (enlace manipulado) y tiene "Cancelar". Aceptable.
  - Enlace caducado abierto **con sesión ya iniciada**: el aviso solo se pinta en el login, así que entra al Dashboard sin aviso. Aceptable.

## Step 6: Login → "¿Has olvidado tu contraseña?" + aviso de enlace caducado
- **Files:** `src/components/Auth/Auth.tsx`, `src/components/Auth/LoginForm.tsx`, `src/components/Auth/ForgotPasswordForm.tsx` (nuevo)
- **Details:**
  - `Auth.tsx`: prop `{ linkError?: boolean }`; `mode: 'login' | 'signup' | 'forgot'`; `login` → `<LoginForm onSwitch={…signup} onForgot={() => setMode('forgot')} notice={linkError ? LINK_ERROR_MESSAGE : null} />`; `forgot` → `<ForgotPasswordForm onBack={() => setMode('login')} />`. (Ternario → tres ramas legibles.)
  - `LoginForm.tsx`: props nuevas `onForgot: () => void`, `notice?: string | null`. `notice` arriba como `p.auth-error`. Bajo el botón "Entrar", `p.auth-switch` con `button.auth-link` "¿Has olvidado tu contraseña?" (antes del "¿No tienes cuenta?"). No se toca el `error.message` del login (fuera de alcance).
  - `ForgotPasswordForm.tsx` (calcado de `SignupForm`): `h2` "Recuperar contraseña", texto breve "Te enviaremos un enlace para crear una contraseña nueva.", `input.auth-input type="email"`, `button.auth-btn` "Enviar enlace" / "Enviando...", `p.auth-switch` + `auth-link` "Volver al login".
    - Submit: `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + import.meta.env.BASE_URL })`.
    - Error → `authErrorMessage(error)` (60 s, límite del proyecto, otros). Éxito → estado `sent` con el mensaje genérico **sin revelar si existe**: "Si ese email está registrado, te hemos enviado un enlace para crear una contraseña nueva. Revisa también la carpeta de spam." + `button.auth-btn` "Volver al login".
  - Sin pasar el email del login al formulario de recuperación (habría que subir estado a `Auth`; YAGNI).
- **Risks:** Supabase responde 200 tanto si el email existe como si no → el mensaje genérico es fiel. El límite de 60 s sí puede delatar indirectamente que se pidió hace poco; irrelevante aquí.

## Step 7: "Cambiar contraseña" en Perfil
- **Files:** `src/components/Profile/Profile.tsx`
- **Details:** tras el bloque del nombre (antes de `<Historial>`): `div.profile-field` con `span.label` "Cambiar contraseña" y `<ResetPasswordForm />` sin props. Sin pedir la contraseña actual (ver P4). Props de `Profile` sin cambios.
- **Risks:** si en el panel estuviera activado "Secure password change", `updateUser` pediría reautenticación (`reauthentication_needed`) → se ve "Tu sesión ha caducado…". Por defecto está desactivado; comprobar en P4/E-pruebas.

## Step 8: Verificación (tests, lint, build y prueba manual económica)
- `npx vitest run`, `npm run lint`, `npm run build` → en verde.
- **Prerrequisito (usuario, panel):** `http://localhost:5173/Sharks-Fantasy/**` en Authentication > URL Configuration > Redirect URLs.
- **Cuenta de prueba:** una cuenta propia (ver P5), nunca la de un jugador. Recordar que `.env` local = PROD.
- **Presupuesto de correo:** 2 emails/hora para **todo** el proyecto (los usuarios reales también gastan). Plan: **1 email en local (E1) y 1 en producción (E2), en horas distintas**, a una hora tranquila. Todo lo demás se prueba **sin correo**.

### A. Sin gastar correo (local, `npm run dev`)
1. **Enlace caducado simulado:** abrir `http://localhost:5173/Sharks-Fantasy/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired` sin sesión → login con el aviso en castellano; la URL queda limpia; recargar → sin aviso.
2. **Recuperación simulada (mismo camino de código que el enlace real):** iniciar sesión con la cuenta de prueba; en la consola del navegador copiar `access_token`, `refresh_token`, `expires_in`, `expires_at`, `token_type` del item de `localStorage` que acaba en `-auth-token`; abrir en la misma pestaña `http://localhost:5173/Sharks-Fantasy/#access_token=…&refresh_token=…&expires_in=…&expires_at=…&token_type=bearer&type=recovery` y recargar. Esperado: pantalla "Nueva contraseña" con logo, **no** el Dashboard (ni un parpadeo del Dashboard); la URL acaba en `#`.
   - Contraseñas distintas → "no coinciden" (sin llamada). 5 caracteres → lo bloquea el navegador. Misma contraseña que la actual → `same_password` en castellano.
   - Contraseña nueva válida → entra directo al Dashboard. Cerrar sesión y entrar con la nueva → OK.
   - Repetir el punto 2 y pulsar "Cancelar" → login.
   - (Los tokens solo se pegan en la barra de direcciones local; no compartirlos ni dejarlos en ningún fichero.)
3. **Perfil:** cambiar la contraseña → "✓ Contraseña cambiada", la sesión sigue; cerrar sesión y entrar con la nueva; probar "no coinciden" y `same_password`.
4. **Pantalla "Recuperar contraseña":** el enlace aparece en el login, "Volver al login" funciona, móvil 375 px sin desbordes. Opcional: pedir el enlace para un email **no registrado** → mensaje genérico (Supabase no envía nada; confirmar en los logs de Auth que no hay `mail.send`, si no, cuenta como un envío).

### B. E1 — un correo real en local
1. Pedir el enlace para la cuenta de prueba desde `localhost` → mensaje genérico.
2. **En menos de 60 s, pedirlo otra vez** → mensaje "Espera N segundos…" (no se envía correo). Aquí comprobar una vez el `code`/`status`/`message` reales en la pestaña Network y, si no casan con el Step 1, ajustar la regex.
3. En el correo, **antes de pulsar**, mirar que el `redirect_to=` del enlace sea `http://localhost:5173/Sharks-Fantasy/` (si sale la URL de producción, falta la Redirect URL de localhost: el enlace seguiría sirviendo, pero para la prueba de producción).
4. Pulsar en el mismo ordenador → "Nueva contraseña" → fijarla → Dashboard. Cerrar sesión, entrar con la nueva.
5. **Pulsar otra vez el mismo enlace** → enlace ya usado → aviso de enlace caducado en el login (prueba real del error, gratis).

### C. Deploy y E2 — un correo real en producción (otra hora)
1. PR `feature/forgot-password` → `develop`; luego `develop` → `main`; esperar al workflow de GitHub Pages.
2. Repetir A.1 y A.3 en `https://pablet06.github.io/Sharks-Fantasy/` (sin correo).
3. Pedir el enlace en producción desde el ordenador y **abrirlo en el móvil** (otro dispositivo) → "Nueva contraseña" → fijarla → entra en la app en el móvil. En el ordenador, entrar con la nueva.
4. Si en esa misma hora ya se han gastado los 2 envíos, una tercera petición enseña el mensaje del límite del proyecto (comprobación gratis; si aún queda cupo, no forzarla).

## Step 9: Manuales
- **Files:** `docs/MANUAL_USUARIOS.md`, `docs/MANUAL_DEL_JUEGO.md` (mismo texto en ambos salvo la parte de admin)
- **Details:**
  - §2 "Cómo entrar" (`USUARIOS:44-49`, `DEL_JUEGO:55-60`): frase nueva: "Si has olvidado tu contraseña, pulsa «¿Has olvidado tu contraseña?» en el login: te llega un correo con un enlace; al abrirlo eliges una contraseña nueva (mín. 6 caracteres) y entras directamente."
  - §9 "Perfil" (`USUARIOS:310-317`, `DEL_JUEGO:323-329`): viñeta "Cambiar tu contraseña (no hace falta la actual; sigues con la sesión abierta)."
  - §10 FAQ, nuevas entradas:
    - "**He olvidado mi contraseña, ¿qué hago?**" → el enlace del login; el correo puede tardar o ir a spam; el enlace caduca y solo sirve una vez (si falla, pide otro); el servidor solo puede mandar unos pocos correos por hora para toda la liga: si te dice que ahora no puede, prueba más tarde o avisa al admin.
    - "**¿Cómo cambio mi contraseña?**" → Perfil > Cambiar contraseña.
  - Solo `MANUAL_DEL_JUEGO` §14 "Cosas que solo se pueden hacer a mano": cómo resetear la contraseña de un usuario si el correo no sirve (ver P3).
  - (De paso, aviso: `MANUAL_DEL_JUEGO` §9 no tiene la viñeta "Mi historial" que sí está en `MANUAL_USUARIOS`; **no** se toca salvo que el usuario lo pida.)

## Commits (git-handler), conventional commits en inglés, PR a `develop`
1. `feat(auth): add pure helpers to parse auth redirects and translate auth errors` — Step 1.
2. `feat(auth): add forgot-password flow and recovery screen` — Steps 2–6 (`supabase.ts`, `useAuth.ts`, `App.tsx`, `Auth.tsx`, `LoginForm.tsx`, `ForgotPasswordForm.tsx`, `ResetPasswordForm.tsx`, `index.css`).
3. `feat(profile): let users change their password from the profile` — Step 7.
4. `docs: document password recovery and change in the manuals` — Step 9.
(El task file y este plan, en el commit de docs de `/close-session`.)

## Rollback
- Solo frontend: `git revert -m 1 <merge en main>` (o revertir los commits) → el workflow vuelve a desplegar. Sin BD que deshacer.
- La Redirect URL de localhost puede quedarse (inofensiva) o quitarse en el panel.
- Correos de recuperación ya enviados tras un rollback: abrirían la app vieja, que entra directo al Dashboard con la sesión de recuperación (el comportamiento de hoy) → sin daño; el usuario puede pedir ayuda al admin.

## Riesgos generales
- **Cupo de 2 correos/hora compartido** con los usuarios reales (aceptado): mitigado con el mensaje en castellano y el reset manual del admin (P3).
- **Correo en inglés y a spam** si se deja la plantilla por defecto (P1).
- **Sesión de recuperación sin terminar** → entra al Dashboard en la siguiente visita (Step 5); aceptable.
- **Texto del límite de 60 s** puede variar con versiones de GoTrue → se verifica en E1 (Step 8 B.2).

## Divergencias con `docs/plan.md` / specs
- Ninguna: `docs/plan.md` no trata autenticación. No se toca.

## Open questions (con default recomendado)
1. **P1 — Plantilla del correo de recuperación.** **Default propuesto: personalizarla en castellano** (la de Supabase sale en inglés y con pinta de spam). El usuario la pega en Authentication > Emails > *Reset password*. Si el panel no deja editarla con el correo integrado (sin SMTP propio), se queda la de Supabase y no pasa nada. Propuesta:
   - Asunto: `Sharks Fantasy · Cambia tu contraseña`
   - Cuerpo (HTML):
     ```html
     <h2>Sharks Fantasy</h2>
     <p>Hola,</p>
     <p>Alguien (seguramente tú) ha pedido cambiar la contraseña de tu cuenta de Sharks Fantasy.</p>
     <p><a href="{{ .ConfirmationURL }}">Elegir una contraseña nueva</a></p>
     <p>El enlace caduca en poco tiempo y solo sirve una vez. Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.</p>
     <p>— Los Sharks</p>
     ```
     (Opcional: `<img src="https://pablet06.github.io/Sharks-Fantasy/logo.png" alt="Sharks Fantasy" width="120">` arriba; el logo ya es público en `public/`.) Mantener `{{ .ConfirmationURL }}` tal cual: es lo que lleva el `redirect_to`.
2. **P2 — ¿Campo "Repite la contraseña"?** El registro solo tiene uno. **Default: sí, dos campos** en `ResetPasswordForm`: un error tecleando obligaría a pedir otro correo y el cupo es de 2/hora.
3. **P3 — Reset manual por el admin cuando el correo no sirve.** **Default:** documentar en `MANUAL_DEL_JUEGO` §14 dos vías: (a) panel de Supabase > Authentication > Users > *Send password recovery* (gasta cupo de correo); (b) SQL Editor: `UPDATE auth.users SET encrypted_password = extensions.crypt('<temporal>', extensions.gen_salt('bf')) WHERE email = '<email>';`, pasarle la temporal al usuario por privado y que la cambie en Perfil. ¿Vale documentar la (b)?
4. **P4 — ¿Pedir la contraseña actual para cambiarla en Perfil?** **Default: no** (Supabase no lo exige; quien tiene tu móvil desbloqueado ya está dentro). Confirmar en el panel que "Secure password change" está desactivado.
5. **P5 — Cuenta para las pruebas E1/E2.** **Default:** la cuenta de iCloud usada el 2026-11-11 si es un usuario registrado; si no, la del propio usuario. Nunca la de un jugador.
6. Menor: botón "Cancelar" en la pantalla de recuperación (cierra sesión y vuelve al login). **Default: sí.**

## Acceptance Criteria
- [ ] (Usuario) `http://localhost:5173/Sharks-Fantasy/**` añadido a Redirect URLs.
- [ ] El login muestra "¿Has olvidado tu contraseña?" → pantalla "Recuperar contraseña" con vuelta al login; `resetPasswordForEmail` con `redirectTo = origin + BASE_URL`; mensaje genérico que no revela si el email existe.
- [ ] Límite de 60 s y límite del proyecto (`over_email_send_rate_limit`) en castellano; ningún error de Supabase sale en inglés en estos formularios.
- [ ] Al abrir el enlace (real o simulado) se ve "Nueva contraseña" y nunca Onboarding/Dashboard; tras guardar (mín. 6, las dos iguales) se entra directo; "Cancelar" vuelve al login. Funciona aunque `PASSWORD_RECOVERY` se emita antes de suscribirse (detección por URL capturada antes de `createClient`).
- [ ] Enlace caducado/usado → aviso amable en el login, URL limpia, sin pantalla en blanco; recargar no repite el aviso.
- [ ] Perfil > "Cambiar contraseña" con el mismo `ResetPasswordForm`; éxito y errores en castellano; la sesión sigue abierta.
- [ ] `src/lib/auth.test.ts` en verde junto al resto; `npm run test`, `npm run lint`, `npm run build` en verde.
- [ ] Pruebas A–C hechas: E1 en local (incluido 60 s y reabrir enlace usado) y E2 en producción abriendo el enlace en otro dispositivo; cambio desde Perfil en local y producción.
- [ ] Manuales actualizados (§2, §9, FAQ; §14 solo en `MANUAL_DEL_JUEGO` según P3).
- [ ] Sin migración, sin cambios de RLS, sin dependencias nuevas, `createClient` sin opciones nuevas.
