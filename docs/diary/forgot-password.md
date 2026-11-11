# Recuperar y cambiar la contraseña

Opción "¿Has olvidado tu contraseña?" en el login y "Cambiar contraseña" en Perfil, con Supabase Auth (correo integrado) y GitHub Pages estático sin router. Tarea: `docs/tasks/forgot-password.md`. Plan: `.claude/plans/forgot-password.md`. PRs: #47 (a `develop`) y #48 (release a `main`).

## 2026-11-11

### What was done
- Grooming y plan aprobados: plantilla del correo en castellano, dos campos de contraseña, reset manual por SQL documentado, sin contraseña actual en Perfil, botón Cancelar.
- Panel de Supabase revisado en solo lectura: Site URL correcto; el usuario añadió `http://localhost:5173/Sharks-Fantasy/**` a Redirect URLs; correo integrado (límite de 2 emails/hora para todo el proyecto); "Confirm email" y "Secure password change" desactivados; 23 usuarios con email real y confirmados.
- Entrega de correo probada antes de programar: llegó a una cuenta iCloud de prueba que no es miembro de la organización, y el enlace aterriza en la app.
- Código: `src/lib/auth.ts` (+ `auth.test.ts`, 10 tests) con `parseAuthRedirect`, `authErrorMessage` y `LINK_ERROR_MESSAGE`; `supabase.ts` captura la URL antes de `createClient`; `useAuth` con `recovery`/`endRecovery`; `ResetPasswordForm` (recuperación y Perfil), `ForgotPasswordForm`, modo `forgot` en `Auth.tsx`, enlace en `LoginForm`, pantalla "Nueva contraseña" en `App.tsx` y bloque en `Profile.tsx`.
- Manuales actualizados: §2, §9 y FAQ en ambos; §14 con el reset manual por panel y por SQL solo en `MANUAL_DEL_JUEGO.md`.
- Verificación: 99/99 tests, lint y build limpios; pruebas locales (enlace caducado simulado, pantalla de recuperación sin parpadeo, contraseñas distintas, cambio desde la recuperación y desde Perfil, Cancelar, móvil 375 px).
- Git: commits `3e6f240`, `2b26bff`, `0c87bb8`, `66bda3c`; PR #47 (merge `a35b453`) y PR #48 (merge `b23ea7b`); deploy run `43032704595` en verde.
- Producción: aviso de enlace caducado, correo real, "Nueva contraseña", guardado (14:16 UTC) y login con la nueva OK. Reabrir el mismo enlace: `otp_expired`; con sesión previa la app entra normal.
- Plantilla del correo pegada en Authentication > Emails > Reset password por Claude, con permiso explícito del usuario (asunto "Sharks Fantasy · Cambia tu contraseña").

### Decisions made
- Aceptar el límite de 2 correos/hora del correo integrado en vez de montar SMTP propio: 23 usuarios y uso esporádico; la salida para quien no reciba el correo es el reset manual del §14.
- Flujo implícito (sin PKCE): funciona abierto desde otro dispositivo, que es lo habitual con el correo en el móvil. La URL se captura antes de `createClient` porque el cliente la consume y podía haber carrera con `PASSWORD_RECOVERY`.
- Dos campos de contraseña: un error de tecleo obligaría a pedir otro correo con un cupo de 2/h. Sin contraseña actual en Perfil porque "Secure password change" está desactivado.
- Cerrar la tarea sin la prueba E1 con correo real desde local: el puerto 5173 estaba ocupado y Vite cayó al 5174, que no está en Redirect URLs. Decisión del usuario.

### What's left
- Sin verificar (por decisión del usuario): E1 desde local (límite de 60 s y reabrir enlace usado desde localhost), texto real del límite de 60 s (patrón "after N seconds" de `authErrorMessage`), plantilla en bandeja real y enlace abierto desde otro dispositivo.
- Opcional: avisar del enlace caducado también a quien ya tiene sesión; borrar la cuenta de prueba iCloud (creada el 2026-11-11 a las 12:13 UTC); escribir `docs/features/forgot-password/README.md`.
- Nota: el `.env` local apunta a producción.
- Commitear los docs de la sesión (PR de docs a `develop` + release a `main`).
