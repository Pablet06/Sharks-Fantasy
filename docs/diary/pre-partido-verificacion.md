# Verificación pre-partido

Revisión del juego antes del partido real del sábado 2026-10-24 (15:45 UTC): historial de usuario, fichajes en admin y flujo posterior al partido (scraper, puntos, apuestas, dinero). Tarea: `docs/tasks/pre-partido-verificacion.md`. PR: #27 hacia `develop` (abierto, sin mergear).

## 2026-10-23

### What was done
- Revisión read-only del flujo post-partido con un subagente Opus 5.5. Crítico: `usuarios_insert_own` permitía autoasignarse `is_admin=true`; corregido con la migración `20261023000000_lock_usuarios_self_insert.sql`, aplicada en prod y verificada con rollback (commit `aa2cae0`). Altos: financiación de la siguiente jornada solo si ya existe al correr `resolver_jornada`; `jornadaAbierta` por número y no por fecha; el scraper incremental no reintentaba jornadas con resolver fallido.
- Causa raíz de los fichajes "vacíos" de Charly y Pablo en admin: UI. `UsuariosAdmin` lee `usuarios.equipo` (retirado); los datos reales están en `alineaciones` de J7. Sin corregir.
- Criterio 1 (historial de usuario): no existe pantalla dedicada de puntos y dinero por jornada; Apuestas sí muestra resultados y balance sin jornada abierta. Pantalla de historial NO construida.
- PR #27: reconciliación del scraper (`reconciliarJornadas`, `jornadasPorReconciliar`, `partidosSinResultado`) y cron diario 08:00 UTC; `src/lib/jornada.ts` (jornada abierta por fecha, en curso, fases); Draft y Apuestas en solo lectura con jornada cerrada; `FaseBanner`; arreglos iOS (`viewport-fit=cover`, fondo en `html`, safe-area inferior). Tests: frontend 59, scraper 68, `tsc`/lint/build en verde. Sin verificar en navegador ni iOS.
- Simulación en prod en transacción con rollback: `resolver_jornada(7)` con historial falso puntuó 19 alineaciones, resolvió 34 apuestas (22 aciertos, 12 fallos), idempotente, financió una jornada sucesora. BD intacta.
- Backup de fichajes y apuestas de J7 en `docs/backups/2026-10-23-fichajes-apuestas-j7.md` y runbook de la noche del partido en `docs/runbook-partido-j7.md`.
- Hallazgos de CI/scraper: no hay CI en PR (`deploy.yml` solo en push a `main`; `scraper.yml` es cron). Fallos recientes del scraper por HTTP 520 y 429 de la federación; todas las ejecuciones programadas de junio-julio fallaron. `main` y `develop` tienen el mismo código, así que el scraper de mañana corre con `main`, no con PR #27.

### Decisions made
- Mantener el cron sáb/dom 22:00 UTC (21:00 CEST no es expresable; deja margen) y añadir un cron diario 08:00 UTC en el PR.
- No mergear ni desplegar front/scraper antes del partido; PR #27 espera. La única pieza en prod es la migración de seguridad, por ser crítica.
- PR #26 (fotos privadas + admin móvil) sigue retenido hasta después del partido.
- `CLAUDE.md` y `.claude/launch.json` se quedan sin commitear a propósito.

### What's left
- Tras el partido: comprobar la ejecución del scraper y los datos (runbook); "Reprocesar jornada 7" a mano cuando aparezca la fecha de la siguiente jornada, hasta que PR #27 esté mergeado.
- Decidir el merge de PR #27 (a `develop` y luego a `main`) tras el partido; después PR #26.
- Construir la pantalla de historial por jornada (puntos y dinero) para el usuario.
- Admin: leer `alineaciones` en vez de `usuarios.equipo`.
- Sin corregir (medio/bajo): recalcular apuestas resueltas tras corregir datos; `capitan_tardio` solo con jornada abierta; stats de temporada con "Recalcular puntos" manual; tope de presupuesto solo en cliente; `orden` de jornadas por inserción y no por fecha; empates en goleador/expulsado dan 0 a todos; `expulsiones_graves` no cuenta en la apuesta de expulsado; `historial.date` sin zona horaria.
- Añadir un workflow de CI en PR.
- Hectorg_wp y Jusi prime no tienen alineación en J7 y puntuarán 0.
