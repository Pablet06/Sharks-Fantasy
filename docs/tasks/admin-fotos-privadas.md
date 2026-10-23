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
- [ ] Revisión independiente del diff / RLS
- [ ] Probado en navegador (móvil y escritorio)
- [ ] Desplegar rama, aplicar migración en prod y subir las 4 fotos desde el admin
- [ ] Borrar `public/jugadores/*.png` (menos `predeterminado.png`)

## Notes
- Decisión: solo quitar las fotos del repo; siguen en el historial de git (sin reescribir).
- Desplegar después de la jornada 1 (sáb 2026-10-24) salvo que se indique lo contrario.
