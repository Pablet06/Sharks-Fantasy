---
status: in-progress
created: 2026-11-15
updated: 2026-11-15
---

# Posición de cada usuario en cada jornada

> Decisiones de diseño tomadas por el usuario el 2026-11-15 (ver «Decisiones de diseño»). Plan aprobado; implementación en curso.

## Context
El usuario ha pedido: "que se pudiera ver en qué posición ha acabado cada usuario en cada jornada". Hoy la app solo enseña la clasificación **general acumulada** (`Ranking.tsx`, ordenada por `usuarios.puntos`) y la posición actual del propio usuario en "Mi equipo" (`Draft.tsx`). No hay forma de ver cómo quedó cada uno en una jornada concreta.

Sharks Fantasy: fantasy de waterpolo sobre la liga de "Los Sharks"; unos 24 usuarios; React 19 + TypeScript + Vite en el frontend (estático en GitHub Pages) y Supabase como backend.

Datos disponibles: `alineaciones(usuario_id, jornada, puntos_jornada)` (puntos de cada usuario en cada jornada) y `usuarios.puntos` (acumulado de la temporada).

Contexto importante: la federación renumeró las jornadas el 2026-11-13 y la base de datos se migró el 2026-11-15, así que `jornadas.numero` **no es cronológico**; el orden real es `jornadas.orden` (ver `docs/tasks/mejoras-ui-stats-ranking-admin.md`). **Nunca se ordena por `numero`.**

Lógica de posición existente (a reutilizar si encaja): `src/lib/ranking.ts` (`posicionRanking`, empates 1, 2, 2, 4), `src/components/Ranking/Ranking.tsx` (Clasificación) y `src/components/Dashboard/Draft.tsx` ("Mi equipo" ya enseña la posición del usuario).

## Goal
Poder ver, para cada jornada finalizada, la posición que obtuvo cada usuario (por puntos de esa jornada y por acumulado hasta ella), además de la clasificación general. Se ve en la Clasificación (selector de jornada), en el historial del perfil y en el modal del equipo de cada usuario.

## Acceptance criteria
- [x] Decididas y anotadas aquí las decisiones de diseño: dónde se muestra, base de la posición, empates y usuarios sin alineación, y visibilidad
- [x] Lógica de posición por jornada con tests: empates y usuarios sin alineación incluidos; orden de jornadas siempre por `jornadas.orden`
- [x] Clasificación: selector de jornada (por `orden`) + conmutador «Jornada / Acumulado»; lista de todos con su posición
- [x] Historial del perfil: columna con la posición del usuario en cada jornada
- [x] Modal del equipo de otro usuario: su posición en cada jornada
- [x] Verificado en el navegador en 375 px y en escritorio (lecturas contra producción: selector, conmutador, modal e historial cuadran con la base de datos)
- [x] `npm run test`, `npm run lint` y `npm run build` en verde
- [x] Manuales (`docs/MANUAL_USUARIOS.md` y `docs/MANUAL_DEL_JUEGO.md`) actualizados si procede
- [ ] PR `feature/posicion-por-jornada` -> `develop` y después PR de release `develop` -> `main` (el usuario aprueba cada merge)

## Decisiones de diseño
Respondidas por el usuario el 2026-11-15:
- **Dónde:** las tres: pantalla Clasificación con selector de jornada, historial del perfil y modal del equipo de otro usuario.
- **Base:** ambas, con conmutador «Jornada / Acumulado» (jornada = por `puntos_jornada` de esa jornada; acumulado = suma hasta esa jornada, por `orden`).
- **Empates y sin alineación:** los empatados comparten puesto (1, 2, 2, 4, igual que la general). Quien no envió alineación en una jornada sale al final como «No jugó», sin puesto, y el total es sobre quienes jugaron («Jugaron 17 de 24 usuarios», en la Clasificación). Ajuste posterior del usuario: en el modal y en el historial el puesto se muestra solo como «#N» (sin «de M»).
- **Visibilidad:** todos ven todas las posiciones. La RLS de `alineaciones` ya deja leer los `puntos_jornada` de cualquier usuario, así que no hay cambios de base de datos.

Confirmadas por el usuario después (2026-11-15):
- En modo **Acumulado**, todos los usuarios cuentan (los que aún no tienen puntos van con 0 y comparten el último puesto), de modo que el acumulado de la última jornada coincide con la Clasificación general.
- En el **historial del perfil** y en el **modal** se enseñan las dos posiciones (de la jornada y acumulada) en vez de depender del conmutador.
- El selector de la Clasificación lista «General» y después las jornadas de la más reciente a la más antigua (por `orden`).
- Plan aprobado: `.claude/plans/posicion-por-jornada.md`. Una alineación ya puntuada con 0 puntos (equipo incompleto, lo deja así `resolver_jornada`) cuenta como «jugó» con 0 pts; «No jugó» es solo no tener alineación puntuada en esa jornada.

## Sessions
