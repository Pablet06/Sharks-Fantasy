# Fantasy dinámico — diario

## 2026-09-14

### What was done
- Fase C (apuestas): implementada, revisada, aplicada a prod, PR #6
  fusionada a `develop`.
- Fase D (power-ups): diseñada, planificada, implementada, revisada,
  aplicada a prod, PR #7 fusionada a `develop`.
- `docs/MANUAL_DEL_JUEGO.md`: manual completo del juego para jugadores y
  administradores.

### Decisions made
- Power-ups activos ya esta temporada (no aplazados a la siguiente).
- Máximo 1 power-up por usuario y jornada; se ganan por cadencia (cada 3
  jornadas resueltas, todos los usuarios) y por racha de apuestas
  acertadas (individual).
- "Doble ganancia"/"apuesta sin riesgo" afectan a todas las apuestas de la
  jornada, no a una elegida.
- `resolver_jornada()` debe seguir siendo idempotente/re-ejecutable con
  seguridad — restricción que guió varias correcciones de la revisión
  final de Fase D.
- La carrera de presupuesto entre que se abre la jornada N+1 y se resuelve
  la N (identificada en la revisión final de Fase C) se deja sin corregir
  a propósito, documentada como limitación conocida.

### What's left
- Promover `develop` → `main` (decisión del usuario, aplazada).
- Prueba manual en navegador de Apuestas y Power-ups.
- Deuda documentada en el manual: limpieza de tablas del fantasy dinámico
  al fin de temporada, caso raro de re-resolución con equipo incompleto,
  carrera de presupuesto N/N+1, UI residual de `usuarios.equipo`.
- Sin Fase E definida — el diseño original (A-D) está completo.
