---
status: done
created: 2026-09-11
updated: 2026-09-14
---

# Fantasy dinámico — presupuesto, draft semanal, apuestas y power-ups

## Context
El juego era estático: cada usuario elegía un `usuarios.equipo` (7 dorsales)
una vez y lo mantenía indefinidamente durante toda la temporada, sin ninguna
decisión semanal. Aburrido y sin nada que hacer entre jornada y jornada.

## Goal
Un bucle semanal real: presupuesto que varía, draft desde cero cada jornada,
capitán con puntos x2, apuestas con cuotas automáticas y riesgo real sobre
el presupuesto, y power-ups recargables — todo calculable a partir de los
datos que el scraper ya recoge, sin ampliar el pool de jugadores más allá de
Los Sharks.

## Acceptance criteria
- [x] Fase A — esquema `jornadas`/`alineaciones`/`presupuestos`, precio de
      jugador dinámico, `resolver_jornada()`, deprecar el modelo antiguo de
      `equipo`/`recalc_puntos()` para la puntuación.
- [x] Fase B — pantalla de draft (sustituye "Mi Equipo" antiguo): 7
      jugadores, presupuesto, capitán, cierre de 24h.
- [x] Fase C — apuestas: 4 tipos, cuotas automáticas server-side, tope del
      20% del presupuesto, privadas siempre.
- [x] Fase D — power-ups: 6 tipos, se ganan por cadencia y por racha de
      apuestas, máximo 1 aplicado por jornada.
- [x] Las 4 fases con migraciones aplicadas a producción y PRs fusionadas a
      `develop`.
- [x] Manual de reglas para jugadores y administradores
      (`docs/MANUAL_DEL_JUEGO.md`).

## Sessions

### 2026-09-14
**Qué se hizo:**
- Fase C (apuestas) llevada de "diseñada" a implementada, revisada
  (incluida revisión final de rama) y aplicada a producción — PR #6
  fusionada.
- Fase D (power-ups) diseñada desde cero (brainstorming), planificada,
  implementada, revisada y aplicada a producción — PR #7 fusionada.
- Documento nuevo `docs/MANUAL_DEL_JUEGO.md`: manual completo de reglas
  para jugadores y administradores, cubriendo las 4 fases al detalle.
- `develop` sincronizado con GitHub (`origin/develop` al día); `main`
  sigue sin promoverse (decisión aplazada del usuario).

**Decisiones clave:**
- Los power-ups se activan ya esta temporada, no se aplazan a la
  siguiente (cambio respecto a la decisión inicial de brainstorming).
- Máximo 1 power-up aplicado por usuario y jornada.
- Los power-ups se ganan por dos vías: cadencia (cada 3 jornadas resueltas,
  para todos) y racha de apuestas acertadas (individual).
- "Doble ganancia" y "apuesta sin riesgo" afectan a TODAS las apuestas de
  la jornada, no a una elegida.
- `resolver_jornada()` debe seguir siendo re-ejecutable con seguridad
  (hay un botón de admin y un backfill del scraper que dependen de ello) —
  cualquier bloque nuevo de una fase debe respetar esa propiedad.
- Se aplazó explícitamente (sin corregir) la carrera de presupuesto entre
  que se abre la jornada N+1 y se resuelve la N — queda como limitación
  conocida, documentada en el manual.

**Qué queda:**
- Promover `develop` → `main` cuando el usuario decida.
- Prueba manual en navegador de Apuestas y Power-ups con una cuenta real
  (omitida a propósito, backend verificado a fondo).
- Deuda no bloqueante documentada en el manual: "Terminar temporada" no
  vacía `alineaciones`/`apuestas`/`powerups_*`; caso raro de Fase D
  (equipo incompleto + power-up + doble resolución); carrera de
  presupuesto N/N+1 sin corregir; UI residual de `usuarios.equipo` en el
  panel de admin.
- No hay una Fase E definida — el diseño original (A-D) está completo.
