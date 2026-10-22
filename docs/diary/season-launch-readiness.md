# Season launch readiness

Preparar producción para la temporada 26-27 (arranca sáb 2026-10-24; jornada 7 federación = "Jornada 1" Fantasy, partido 17:45 Madrid, draft cierra vie 2026-10-23 17:45 Madrid; torneo 1344408). Tarea: `docs/tasks/season-launch-readiness.md`.

## 2026-10-22

### What was done
- Hallazgo inicial: `main` 60 commits por detrás de `develop`; `config.tournament_id` aún en la 25-26 (1324114).
- Reseteo de la 25-26 en prod (sin archivo, aprobado): historial/jornadas/fantasy vaciados, usuarios a 0 con `equipo {}`, roster de 19 (bajas Álvaro Mayordomo y César Paredes; altas Antonio, José Almódovar, Luca, Ackermann), `leverade_id` actualizado a los ids de la 26-27, `tournament_id = 1344408`.
- Scraper: partido de descanso (HTTP 520 en `/stats`) ya no tumba la jornada (PR #9/#10); fechas de Leverade en UTC, no Madrid (PR #21/#22), jornada 7 corregida a mano; segundo cron domingo 22:00 UTC (PR #16/#17).
- Fantasy v2 a `main` (PR #8, #11-#13, #15, #18-#24) y migraciones en prod: `orden` + `resolver_jornada` (con `REVOKE EXECUTE` a `anon`, había un agujero), trigger de composición, `historial_anterior`, `cuotas_previas` + `cuota_actual`, `ON DELETE CASCADE` en 5 FK a `usuarios`.
- UI: numeración Jornada N, bloques informativos y modales, puntos (amarillo) y dinero (verde), precio y posición por fichaje, contadores de composición.
- Registro: enlace de confirmación 404 (Site URL); "Confirm email" desactivado temporalmente; `SignupForm` no muestra "Revisa tu email" si hay sesión.
- Iconos de pantalla de inicio (PR #14/#15).
- Docs: manual del juego, `MANUAL_USUARIOS.md` nuevo, ADR-005..007.
- Security advisor de Supabase: sin hallazgos graves.
- Marcado por el usuario, no verificado por Claude: prueba de UI con sesión, acceso directo reinstalado, cuenta "Pablo 2" borrada (fix #23/#24), usuarios avisados para volver a fichar.

### Decisions made
- Sin archivo del reseteo (petición del usuario).
- Precios: base 50, multiplicador 22 (mejor 7 válido ~1088 vs presupuesto 1000); iniciales desde totales 25-26 (captura del usuario; Cloudflare 429 bloqueó la recarga por partido), como 5 partidos virtuales; porteros con 8 goles encajados por partido supuestos.
- Cuotas: Sharks perdieron todos los partidos 25-26, prior pierde=1/gana=0/empata=0; goleador/expulsado por simulación; tope ×1,2-×2,1 mantenido (casi todo ×2,1).
- Confirm email off temporalmente en lugar de arreglar el Site URL ahora.

### What's left
- Revisión completa de variables de entorno y RLS de prod (solo se pasó el advisor; leaked-password protection desactivada, opcional; avisos bajos: `is_admin`, `recalc_puntos`, `powerups_aplicar` ejecutables por `anon` pero con guarda).
- Decidir sobre el cambio local de `CLAUDE.md` y `.claude/launch.json` sin trackear (ignorar o borrar).
- Tras el partido (sáb 24 / dom 25): workflow `Weekly Stats Sync` en verde (reintento domingo), `config.unmatched_players` vacío, ranking con puntos, "Reprocesar jornada" si la siguiente no tenía fecha.
- Decidir si reactivar Confirm email.
- Riesgos: supuesto de 8 goles de porteros; `presupuesto_usado`/precio solo validados en cliente (proponer trigger de servidor); tope de cuotas; GitHub Actions degradado esta tarde (Pages en cola, sitio ya activo).
