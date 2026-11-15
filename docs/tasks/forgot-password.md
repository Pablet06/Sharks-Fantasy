---
status: done  # cerrada el 2026-11-11 por decisión del usuario; ver "Verificación aplazada" en Acceptance criteria
created: 2026-11-11
updated: 2026-11-11
---

# Recuperar y cambiar la contraseña

## Context
Hoy `LoginForm.tsx` solo ofrece email + contraseña y un enlace a "Regístrate". Si un usuario olvida la contraseña no tiene forma de recuperarla (el admin no puede cambiarla desde el panel), y tampoco puede cambiarla estando dentro (`Profile.tsx` solo tiene nombre y "Zona de peligro"). Con ~22 usuarios y la liga en marcha, es un hueco real. El usuario pidió la opción "Se me ha olvidado la contraseña" en el login y, en el grooming del 2026-11-11, amplió el alcance a "Cambiar contraseña" desde Perfil.

### Hallazgos de la lectura del código (2026-11-11, solo lectura, nada modificado)
- **No hay router** (ni `react-router` en `package.json`): `main.tsx` monta `<App />` y `App.tsx` decide la pantalla por estado (`user`, `needsOnboarding`...). `Auth.tsx` alterna `login`/`signup` con un `useState`. Por tanto no hay `HashRouter` que condicione la `redirectTo`; la app es una sola URL.
- **URL de producción**: `vite.config.ts` fija `base: '/Sharks-Fantasy/'` y el deploy publica `dist` en GitHub Pages, así que la app vive en `https://pablet06.github.io/Sharks-Fantasy/`. La `redirectTo` debería ser `window.location.origin + import.meta.env.BASE_URL` (en local: `http://localhost:5173/Sharks-Fantasy/`).
- **Flujo del cliente**: `src/lib/supabase.ts` usa `createClient` con los valores por defecto (flujo implícito, `detectSessionInUrl` activo). El enlace del email vuelve a `redirectTo#access_token=...&type=recovery`; no necesita servidor ni 404.html y funciona aunque el usuario abra el correo en otro dispositivo (PKCE no lo haría, no cambiarlo).
- **Trampa principal**: `useAuth.ts` ignoraba el tipo de evento de `onAuthStateChange`. Al abrir el enlace de recuperación Supabase crea una sesión y emite `PASSWORD_RECOVERY`; con el código anterior el usuario entraba directo al Dashboard sin poder fijar la nueva contraseña.
- **Perfil**: `Profile.tsx` recibe `usuario`, `userEmail`, `onUpdate` y `onSignOut`, y se monta desde `Dashboard.tsx`.
- **Configuración de Supabase Auth (fuera del repo)**: no hay `supabase/config.toml`; todo se gestiona desde el panel (revisado y resuelto, ver Decisions).
- Supabase no revela si un email existe al pedir la recuperación (respuesta genérica), y limita a 1 petición cada 60 s por usuario.

## Goal
Que un usuario que ha olvidado su contraseña pueda pedir un enlace desde el login, recibirlo por email, fijar una contraseña nueva y entrar en la app; y que un usuario con sesión pueda cambiarla desde Perfil. En producción (GitHub Pages) y en local.

## Acceptance criteria
- [x] **Panel de Supabase (Authentication > URL Configuration)**: Site URL ya era `https://pablet06.github.io/Sharks-Fantasy/` (no hizo falta tocarlo); Redirect URLs solo tenía producción y el usuario añadió `http://localhost:5173/Sharks-Fantasy/**` (verificado leyendo el panel).
- [x] **Entrega del email probada antes de escribir código**: el correo de recuperación llegó a una cuenta iCloud de prueba que no es miembro de la organización (descartada la sospecha de "solo miembros"); el enlace aterriza en la app, no en 404.
- [x] `LoginForm` muestra "¿Has olvidado tu contraseña?" que abre `ForgotPasswordForm` (modo `forgot` de `Auth.tsx`, con vuelta al login); llama a `resetPasswordForEmail(email, { redirectTo })` y muestra un mensaje genérico que no revela si la cuenta existe.
- [x] Al abrir el enlace la app muestra "Nueva contraseña" (dos campos, mín. 6) en vez del Dashboard, sin parpadeo; `updateUser({ password })` y entra directo a la app. La URL se captura en `src/lib/supabase.ts` antes de `createClient`, así que no hay carrera con `PASSWORD_RECOVERY`.
- [x] Enlace caducado o ya usado (`otp_expired`): aviso amable en el login, con la URL limpia y sin repetirse al recargar. Verificado en producción. Solo se muestra a quien no tiene sesión (aceptado: quien ya está dentro entra normal).
- [x] **Cambiar contraseña desde Perfil**: bloque en `Profile.tsx` con el mismo `ResetPasswordForm` (dos campos, mín. 6, éxito y errores en español); la sesión se mantiene (comprobado: `updated_at` en BD cambió y no se cerró la sesión). El botón "Cancelar" de la pantalla de recuperación cierra sesión y vuelve al login.
- [x] **Probado de extremo a extremo en producción** con un correo real: pedido desde la web, enlace abierto (`/verify` 303), "Nueva contraseña", contraseña guardada y login con la nueva OK. Reabrir el mismo enlace: el servidor lo rechaza (`otp_expired`) y, como ya había sesión, la app entra normal (previsto en el plan).
- [x] `npm run test` (99/99, 10 nuevos en `src/lib/auth.test.ts`), `npm run lint` y `npm run build` limpios; pruebas manuales locales con hash/sesión simulados y móvil a 375 px sin desbordes.
- [x] `docs/MANUAL_USUARIOS.md` y `docs/MANUAL_DEL_JUEGO.md`: §2, §9 y FAQ en ambos; §14 de `MANUAL_DEL_JUEGO.md` con el reset manual por panel y por SQL.
- [x] Sin migración, sin cambios de RLS y sin dependencias nuevas.

### Verificación aplazada (cierre con estas partes SIN verificar, por decisión del usuario el 2026-11-11)
- [ ] **Prueba E1 con correo real desde LOCAL** (límite de 60 s y reabrir un enlace usado desde localhost): no se hizo; el puerto 5173 estaba ocupado por otro proceso y Vite cayó al 5174, que no está en Redirect URLs. El usuario da la tarea por cerrada sin esta prueba.
- [ ] **Texto del límite de 60 s**: el patrón "after N seconds" de `authErrorMessage` sigue sin confirmarse contra una respuesta real de Supabase (solo lo cubren los tests unitarios).
- [ ] **Plantilla del correo en castellano**: pegada en el panel y verificada al recargar, pero NO vista aún en una bandeja real.
- [ ] **Enlace abierto desde un dispositivo distinto al que lo pidió**: no consta que se probara expresamente; el flujo implícito está pensado para que funcione, pero no se ha comprobado.

## Decisions (2026-11-11)
- **Rama:** `feature/forgot-password` desde `develop`, creada por la sesión principal con `git-handler`.
- **Panel de Supabase:** la corrección de URL Configuration entró en la tarea; Site URL ya estaba bien y solo faltaba el Redirect URL de localhost.
- **Correo integrado de Supabase:** se acepta su límite (2 emails/hora para todo el proyecto), sin SMTP propio. "Confirm email" y "Secure password change" siguen desactivados (por eso Perfil no pide la contraseña actual).
- **Flujo:** implícito de supabase-js (sin PKCE) y URL capturada antes de `createClient` para evitar la carrera con `PASSWORD_RECOVERY`.
- **UX:** dos campos de contraseña (un error de tecleo obligaría a pedir otro correo con cupo de 2/h); sin contraseña actual en Perfil; botón Cancelar; mínimo 6 caracteres; respuesta genérica sin revelar si el email existe; tras fijar la contraseña se entra directo.
- **Alcance ampliado:** "Cambiar contraseña" desde Perfil dentro, con un único `ResetPasswordForm` reutilizado.
- **Plantilla del correo de recuperación (P1):** en castellano, pegada por Claude en Authentication > Emails > Reset password con permiso explícito del usuario (asunto "Sharks Fantasy · Cambia tu contraseña", cuerpo HTML con `{{ .ConfirmationURL }}`).
- **Reset manual:** documentado en `MANUAL_DEL_JUEGO.md` §14, por panel y por SQL (`extensions.crypt(..., extensions.gen_salt('bf', 10))`), para quien no pueda recibir el correo.
- **Ficheros tocados:** `src/lib/auth.ts` y `auth.test.ts` (nuevos: `parseAuthRedirect`, `authErrorMessage`, `LINK_ERROR_MESSAGE`), `src/lib/supabase.ts`, `src/hooks/useAuth.ts` (`recovery`/`endRecovery`), `src/App.tsx`, `src/components/Auth/Auth.tsx`, `LoginForm.tsx`, `ForgotPasswordForm.tsx` y `ResetPasswordForm.tsx` (nuevos), `src/components/Profile/Profile.tsx`, `src/index.css` (`.auth-success`) y los dos manuales.
- **Git:** commits `3e6f240`, `2b26bff`, `0c87bb8`, `66bda3c`; PR #47 `feature/forgot-password` -> `develop` (merge `a35b453`) y PR #48 `develop` -> `main` (merge `b23ea7b`); deploy GitHub Pages run 43032704595 = success.

## Risks
- **Cupo de 2 correos/hora compartido** por todo el proyecto (aceptado): si varios usuarios piden recuperación a la vez, el correo puede no salir; mitigado con el mensaje en castellano y el reset manual (§14 del manual).
- Usuarios con email falso: se comprobó con una consulta de solo lectura a `auth.users` que los 23 usuarios tienen email real (gmail/hotmail/icloud) y están confirmados, así que el riesgo es bajo hoy.
- La plantilla en castellano no se ha visto renderizada en una bandeja real (podría verse distinta o ir a spam).

## Open questions
Resueltas durante la sesión: plantilla (castellano, pegada en el panel), SMTP (se acepta el límite del integrado), emails reales (23 de 23).
Siguen abiertas, sin urgencia:
1. ¿Avisar del enlace caducado también a quien ya tiene sesión? (añadido pequeño; hoy solo lo ve quien no la tiene).
2. ¿Borrar la cuenta de prueba iCloud (creada el 2026-11-11 a las 12:13 UTC en producción)?
3. ¿Escribir `docs/features/forgot-password/README.md`? (la tarea completa una función visible al usuario; no se ha escrito).
4. Nota para pruebas futuras: el `.env` local apunta a producción.

## Sessions

### 2026-11-11

## Session Summary — 2026-11-11

**What was done:**
- Grooming y plan (`.claude/plans/forgot-password.md`, aprobado por el usuario): plantilla en castellano, dos campos de contraseña, documentar el reset manual por SQL, sin contraseña actual en Perfil, botón Cancelar.
- Panel de Supabase revisado en solo lectura (salvo la plantilla): Site URL correcto; el usuario añadió el Redirect URL de localhost; correo integrado (2 emails/hora); "Confirm email" y "Secure password change" desactivados; 23 usuarios con email real y confirmados. Entrega de correo probada con una cuenta iCloud no miembro de la organización.
- Implementado el flujo completo: helpers puros con 10 tests, captura de la URL antes de `createClient`, `useAuth` con modo recuperación, `ForgotPasswordForm`, `ResetPasswordForm` (recuperación y Perfil), pantalla "Nueva contraseña" en `App.tsx` y manuales actualizados.
- Verificación: 99/99 tests, lint y build limpios; pruebas manuales locales y en móvil. PR #47 -> `develop` y PR #48 -> `main` mergeados; deploy `43032704595` en verde. En producción: aviso de enlace caducado, correo real, "Nueva contraseña", guardado y login con la nueva OK.
- Plantilla del correo de recuperación pegada en el panel por Claude con permiso explícito del usuario.

**Decisions made:**
- Se acepta el límite de 2 correos/hora del correo integrado (sin SMTP propio) y se documenta el reset manual por SQL como salida.
- Flujo implícito (sin PKCE) y URL capturada antes de `createClient`, para que el enlace funcione desde otro dispositivo y no haya carrera con `PASSWORD_RECOVERY`.
- Perfil sin contraseña actual (con "Secure password change" desactivado); dos campos de contraseña.
- Cierre de la tarea con partes sin verificar, por decisión del usuario (ver "Verificación aplazada").

**Open questions:**
- Sin verificar: prueba con correo real desde local (límite de 60 s y reabrir enlace usado desde localhost), texto real del límite de 60 s, plantilla en bandeja real y enlace abierto desde otro dispositivo.
- ¿Avisar del enlace caducado a quien ya tiene sesión? ¿Borrar la cuenta de prueba iCloud? ¿Escribir `docs/features/forgot-password/README.md`?

**Next steps:**
- Commitear los docs de esta sesión (esta tarea, el diario y `.claude/plans/forgot-password.md`) con un PR de docs a `develop` (+ release a `main`).
- Cuando haya ocasión, ver la plantilla en una bandeja real y comprobar el mensaje de límite de 60 s si algún usuario lo provoca.
- Seguir con `next-jornada-improvements` (verificación en producción) y `scraper-servidor-casa` (revisión tras el partido del 2026-11-07); la Jornada 3 cierra fichajes el 14 nov 2026 a las 12:00.
