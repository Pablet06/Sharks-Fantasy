---
status: in-progress
created: 2026-10-22
updated: 2026-10-22
---

# Season launch readiness

## Context
La temporada 26-27 empieza el sábado 2026-10-24 (jornada 7 de la federación = "Jornada 1" del Fantasy, 13:45 UTC). Los usuarios deben poder entrar y jugar. Competición: https://waterpolo.fncv.es/es/tournament/1344408/summary (Primera División Masculina 26-27, 9 equipos, incluye "C.W. Sharks A").

Estado inicial (2026-10-22): `main` iba 60 commits por detrás de `develop`, `config.tournament_id` seguía en la 25-26 y la base tenía datos de la temporada pasada.

## Goal
Producción en la última versión de `develop` con la 26-27 configurada: registro y login funcionando, usuarios fichando y apostando, y el scraper ingiriendo resultados del torneo 1344408.

## Acceptance criteria
- [x] Estrategia de reseteo decidida y aplicada: sin archivo (a petición); historial, jornadas y tablas fantasy vaciados, usuarios a 0 con `equipo = {}`, stats a cero
- [x] Roster 26-27 cargado (19 jugadores: bajas Álvaro Mayordomo y César Paredes; altas Antonio, José Almódovar, Luca y Ackermann) y `leverade_id` de los 19 actualizado a los ids de la 26-27
- [x] `config.tournament_id = 1344408`
- [x] Scraper verificado contra el torneo 1344408; arreglado el partido de descanso que tumbaba cada jornada con HTTP 520 (PR #9/#10); `workflow_dispatch` en verde
- [x] Segundo cron de reintento (domingo 22:00 UTC) además del del sábado (PR #16/#17)
- [x] `develop` -> `main` mergeado y deploy en verde; producción con el Fantasy v2 (PR #8, #13, #15, #17)
- [x] Registro, login y fichajes probados en producción (cuenta de pruebas "Pablo 2")
- [x] Fantasy v2 desplegado: numeración `orden`, bloques informativos, composición obligatoria (trigger), precios desde la 25-26 (base 50, multiplicador 22) y cuotas con prior de la 25-26
- [x] Favicon / icono de pantalla de inicio (iOS y Android) desplegado (PR #14/#15)
- [ ] Variables de entorno y RLS de producción revisadas tras el deploy
- [ ] Decidir qué hacer con los cambios locales sin commitear de `CLAUDE.md`

### Antes del cierre del draft (vie 2026-10-23, 13:45 UTC)
- [x] Probar la interfaz con sesión iniciada (Mi equipo, Apuestas, Power-ups, en todos sus estados)
- [x] Reinstalar el acceso directo en el móvil para ver el icono nuevo
- [x] Decidir qué hacer con la cuenta de pruebas "Pablo 2"
- [x] Avisar a los usuarios de que tienen que volver a fichar para la jornada 7

Marcado como completado por el usuario; no verificado por Claude (requiere sesión iniciada y un móvil).

### Tras el partido (sáb 24 y dom 25)
- [ ] El workflow `Weekly Stats Sync` sale en verde (sábado 22:00 UTC; reintento domingo 22:00 UTC)
- [ ] `config.unmatched_players` vacío
- [ ] El ranking tiene puntos y las apuestas de la jornada están resueltas
- [ ] Si la jornada siguiente aún no tenía fecha al resolver: "Reprocesar jornada" en el panel de admin

## Riesgos conocidos
- Precios de porteros calculados suponiendo 8 goles encajados por partido en la 25-26 (la captura no traía ese dato).
- `presupuesto_usado` y el coste de la alineación solo se validan en el navegador; no hay comprobación en el servidor (la composición sí tiene trigger).
- Cuotas acotadas a ×1,2 a ×2,1: casi todo queda en ×2,1; subir el tope cambia una regla publicada.
- «Confirm email» de Supabase Auth desactivado temporalmente.

## Sessions
- 2026-10-22: reseteo de la 25-26, roster, fix del scraper (descanso), Fantasy v2 (PR #8 a #17), migraciones aplicadas en producción (`orden` + resolver, composición, `historial_anterior`, `cuotas_previas`), favicon móvil, cron del domingo y `leverade_id` de la 26-27. Registro: el enlace de confirmación llevaba a `pablet06.github.io/` (404, Site URL mal al enviarse); decisión del usuario: «Confirm email» desactivado temporalmente. Rama de cierre: `feature/docs-registro` (mensaje del registro y documentación).
