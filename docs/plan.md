# Plan del proyecto

> Este documento no existía hasta 2026-09-03 (ver auditoría de esa fecha). Recoge dónde está el proyecto ahora mismo, no una hoja de ruta inventada — la dirección futura la decide el usuario, no este documento. Cualquier cambio de rumbo se discute y confirma antes de tocar este fichero (ver regla en `CLAUDE.md`).

## Qué es

Sharks Fantasy: fantasy game sobre la liga de waterpolo del equipo "Los Sharks". Cada usuario arma un equipo de jugadores y suma puntos según las estadísticas reales de los partidos.

## Estado actual (2026-09-03)

- Frontend React + TS + Vite, backend Supabase, scraper Node.js con cron semanal — ver `docs/ADRs.md` para el porqué de cada pieza.
- En producción, con datos reales (17 jugadores, 2 usuarios activos).
- Fases ya completadas y documentadas en `docs/superpowers/plans/`: migración a Supabase, refactor a React, automatización del scraper, rediseño de UI (estilo "C" — nav flotante inmersivo).
- Auditoría completa del estado del código, seguridad y estructura: sesión 2026-09-02/03 (ver `docs/ADRs.md` ADR-004 para el hallazgo de seguridad que salió de ahí, ya corregido).

## Rediseño de UI — completado

- Overhaul de estilo "C" aplicado a todas las pantallas: Pool, PlayerCard, Dashboard shell (nav flotante), Ranking (medallas), Players (chips de filtro) y Profile. Ver `docs/superpowers/plans/2026-05-11-style-c-overhaul.md` y `docs/diary/ui-overhaul.md`.

## No es un plan de features futuras

Este fichero se actualiza cuando el usuario confirme una dirección concreta, no antes.
