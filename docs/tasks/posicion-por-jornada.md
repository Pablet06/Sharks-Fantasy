---
status: done
created: 2026-11-15
updated: 2026-11-15
---

# Posición de cada usuario en cada jornada

> Decisiones de diseño tomadas por el usuario el 2026-11-15 (ver «Decisiones de diseño»). Implementada, verificada y desplegada (PR #62 a `develop` y release #63 a `main`).

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
- [x] PR `feature/posicion-por-jornada` -> `develop` (#62, merge `5b89073`) y después PR de release `develop` -> `main` (#63, merge `b246c16`); el usuario aprobó cada merge. El push a `main` lanzó el deploy a GitHub Pages (run 43760812241), que terminó en `success`

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

### 2026-11-15

**What was done:**
- Se preguntaron al usuario las dudas de diseño antes de planificar y se anotaron en «Decisiones de diseño». El `planner` dejó el plan en `.claude/plans/posicion-por-jornada.md`; se trabajó en un git worktree aislado (`.worktrees/posicion-por-jornada`, rama `feature/posicion-por-jornada` desde `origin/develop`) para no cambiar de rama en el checkout compartido.
- TDD: función pura `posicionesPorJornada()` en `src/lib/posiciones.ts` con 12 tests (empates en jornada y acumulado, sin alineación, jornada saltada, usuario sin alineaciones, `numero` distinto de `orden`, jornadas no finalizadas, puntos nulos, usuario desconocido, datos vacíos y coherencia con la general). Un test mío estaba mal (b empata con z en la J1) y se corrigió el test, no la lógica.
- Hook de solo lectura `src/hooks/usePosicionesPorJornada.ts` (`null` mientras carga, `[]` si hay error; comentario `ponytail:` sobre el límite de 1000 filas de PostgREST, ~530 esperadas a final de temporada).
- UI: `Ranking.tsx` con `<select>` nativo, chips «Jornada / Acumulado», resumen «Jugaron N de M usuarios», filas «No jugó» atenuadas al final y tabla «Posición por jornada» (J / Pts / Puesto / Acum.) en el modal del equipo; `Historial.tsx` con columnas «Puesto» y «Pos. total»; CSS en `src/index.css`.
- Ajuste pedido por el usuario: modal e historial muestran solo `#N` (se eliminó `formatoPuesto` y su test); el «Jugaron N de M» se queda en la Clasificación.
- Manuales actualizados: `docs/MANUAL_USUARIOS.md` (§7, §9) y `docs/MANUAL_DEL_JUEGO.md` (§7 y §9, donde faltaba el punto de Mi historial).
- Verificación: 145 tests, lint y build en verde. Navegador a 375 px y escritorio con datos de producción (solo lectura; el usuario inició sesión él mismo en el panel): Jornada 1/2/3 con 19/18/17 jugadores con puesto y 5/6/7 «No jugó»; Acumulado de la Jornada 3 idéntico a General (24 usuarios, mismos empates); modal e historial cuadran con la lista; sin desbordamiento horizontal.
- Entrega: PR #62 (`feature/posicion-por-jornada` -> `develop`, merge `5b89073`) y release #63 (`develop` -> `main`, merge `b246c16`); el push a `main` lanzó el workflow «Deploy to GitHub Pages» (run 43760812241, que terminó en `success`).

**Decisions made:**
- Sin cambios de BD: la RLS `alineaciones_select` ya deja leer los `puntos_jornada` puntuados de cualquier usuario.
- En Acumulado cuentan todos los usuarios (con 0 puntos comparten el último puesto), así que el acumulado de la última jornada coincide con la general.
- Una alineación puntuada con 0 puntos cuenta como «jugó»; «No jugó» es solo no tener alineación puntuada.
- Selector: «General» y luego las jornadas de la más reciente a la más antigua por `orden`, nunca por `numero`.
- Una única función pura (`posicionesPorJornada`) para las tres pantallas, reutilizando `posicionRanking` (empates 1, 2, 2, 4).
- Worktree aislado en vez de cambiar de rama en el checkout compartido. El `mentor` no se lanzó (preferencia del usuario).
- Aprendido: `preview_start` sirve el checkout principal y no un worktree, así que para una función en un worktree hay que lanzar Vite desde el worktree en un puerto libre (quedó un proceso `vite` suelto al parar la tarea). El puerto 5173 lo ocupaba otro servidor del checkout principal, por eso la función no se veía allí hasta mergear. Los errores de HMR al quitar `formatoPuesto` fueron transitorios.

**Open questions:**
- El workflow de deploy terminó en verde; falta comprobar a ojo en la web publicada que enseña la función (no se ha abierto la web publicada).

**Next steps:**
- Esta documentación de cierre va por su propia PR `docs/cierre-posicion-por-jornada` -> `develop` y después una release a `main`, cada una pendiente de aprobación del usuario.
- Comprobar en la web publicada que aparecen el selector de jornada, el modal y el historial con posiciones.
- Si la liga supera ~1000 alineaciones puntuadas, paginar o usar una vista agregada en `usePosicionesPorJornada`.
- Borrar la rama local `feature/posicion-por-jornada` (ya fusionada). El worktree y el servidor `vite` suelto se retiraron al cerrar la sesión.
