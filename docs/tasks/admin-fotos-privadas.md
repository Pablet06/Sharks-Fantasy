---
status: in-progress
created: 2026-10-23
updated: 2026-10-23
---

# Fotos privadas + admin móvil

## Context
Las fotos de jugadores estaban en `public/jugadores/` (repo público + GitHub Pages). El panel admin usa tablas de 8 columnas ilegibles en móvil.

## Goal
Fotos en bucket privado de Supabase Storage (solo usuarios con sesión), subida de fotos desde el admin y admin cómodo en móvil.

## Acceptance criteria
- [x] Migración `20261023000000_fotos_privadas.sql` (bucket privado + RLS: lectura autenticados, escritura admins)
- [x] `useJugadores` firma las URLs (`src/lib/photos.ts`)
- [x] Admin: botón Subir/Cambiar foto
- [x] Admin: tablas como tarjetas en móvil (Jugadores, Historial, Usuarios)
- [x] Revisión independiente del diff / RLS (detectó una regresión en historial_anterior, corregida)
- [ ] Probado en navegador (móvil y escritorio)
- [ ] Desplegar rama, aplicar migración en prod y subir las 4 fotos desde el admin
- [ ] Borrar `public/jugadores/*.png` (menos `predeterminado.png`)

## Notes
- Decisión: solo quitar las fotos del repo; siguen en el historial de git (sin reescribir).
- Desplegar después de la jornada 1 (sáb 2026-10-24) salvo que se indique lo contrario.

## Sessions

### 2026-10-23
## Session Summary — 2026-10-23

**What was done:**
- Bucket privado `jugadores` en Supabase Storage con RLS (lectura autenticados, escritura admins), aplicado en prod (migración `fotos_privadas_bucket`); `photo` de las 18 filas antiguas `./jugadores/` puesto a NULL en prod.
- `src/lib/photos.ts` (URLs firmadas, `uploadPhoto`); `useJugadores(userId)` firma fotos y mantiene el embed `historial_anterior` con fallback (regresión detectada en revisión y corregida).
- `JugadoresAdmin`: botones Subir/Cambiar foto.
- Tablas admin (Jugadores, Historial, Usuarios) como tarjetas en móvil (<700px, objetivos de 44px, fuente 16px).
- 4 PNG eliminados de `public/jugadores` (siguen en el historial de git).
- PR #26 abierto a develop: https://github.com/Pablet06/Sharks-Fantasy/pull/26 (NO mergeado).

**Decisions made:**
- Solo quitar del repo, sin reescribir historial.
- No mergear/desplegar antes del partido (sáb 2026-10-24 15:45 UTC): `deploy.yml` despliega al hacer push a main.

**Open questions / risks:**
- Con el frontend de prod antiguo, subir fotos desde el admin da imágenes rotas (el código viejo trata la ruta como URL): no subir hasta que PR #26 llegue a main.
- URLs firmadas caducan a las 6 h; fotos reemplazadas dejan huérfanos en el bucket.
- Layout móvil del admin no probado en navegador con admin logueado.
- El archivo de migración del repo se cambió tras aplicar la parte del bucket (la parte de datos ahora solo pone photo NULL, ya ejecutado en prod).
- `season-launch-readiness.md` tiene la hora de cierre del borrador mal: real vie 2026-10-23 17:45 España / 15:45 UTC; primer partido sáb 2026-10-24 15:45 UTC.

**Next steps:**
- Tras el partido del sábado: comprobar Weekly Stats Sync en verde y `config.unmatched_players` vacío; mergear PR #26 a develop y main; verificar fotos; probar admin en móvil; subir las 4 fotos; actualizar criterios.
- Corregir la hora en season-launch-readiness.md si se desea.
