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

## 2026-10-24

### What was done
- Sin cambios de código. Partido ya jugado; se espera al scraper automático (sáb 22:00 UTC, reintento dom 22:00 UTC) y se verifica con `docs/runbook-partido-j7.md`.
- Análisis: en PR #27 `jornadaAbierta` exige fecha + no finalizada + >24h. Riesgo real: `resolver_jornada` solo escribe presupuestos de jornada+1 si esa fila existe al resolver (migración `20260913000001`); si J8 aparece después, los usuarios empiezan con 1000€ salvo "Reprocesar jornada 7" previo. PR #27 lo automatiza.

### Decisions made
- Esperar al scraper. Aplazada la idea de condicionar la apertura de jornada a que existan filas en `presupuestos`.

### What's left
- Verificar scraper tras 22:00 UTC; confirmar que el secret `service_role` es la clave real.
- Sin PR #27: Reprocesar jornada 7 antes de que aparezca J8. Luego decidir merge de PR #27 y revisar PR #26 (no mergear hasta confirmar J7).
- Recalcular puntos; historial por jornada; admin leyendo `alineaciones`.

## 2026-10-25

### What was done
- J7 verificada tras el partido. Scraper de GitHub bloqueado (520, luego 429 de la federación); ejecutado en local con la `service_role` del `.env`: 19 filas de historial, 0 sin emparejar, J7 perdida 9-22.
- Bug: `resolver_jornada` abortaba por `UPDATE usuarios` sin WHERE. Migración `20261025000000_resolver_jornada_where_usuarios.sql` (`WHERE true`) aplicada en prod y commiteada (46def40). J7 reprocesada: apuestas 34/34, alineaciones 19/19, `finalizado=true`, puntos top 5 = 46-49.
- `recalc_puntos` ejecutado por SQL: stats recalculadas en 19/19 jugadores.
- Mergeados PR #27 -> develop, #28 develop -> main, #26 -> develop (tras renombrar la migración de fotos a `20261026000000_fotos_privadas.sql` por colisión de timestamp y usar `is_admin()`), #29 develop -> main. Deploys OK. Tests 59, lint y build OK.
- `CLAUDE.md` restaurado a la versión del repo.

### Decisions made
- Sin push directo a main; cadena feature -> develop -> main.
- La migración de fotos ya aplicada en prod mantiene las políticas EXISTS antiguas; solo cambió el fichero del repo. Una migración de seguimiento las alinearía con `is_admin()`.

### What's left
- Confirmar que el secret `SUPABASE_SERVICE_ROLE_KEY` de GitHub es la real (reintento dom 22:00 UTC o ejecución manual); el cron del sábado nunca apareció en las ejecuciones (la última programada: 2026-07-25).
- Probar con datos reales la financiación de presupuesto de J8 (reconciliación de PR #27) cuando aparezca su fecha.
- Pantalla de historial por usuario en `feature/historial-usuario` (desde develop); admin leyendo `alineaciones`.
- Opcional: migración de políticas de storage de fotos con `is_admin()`; PNG antiguos en el historial público de git; 4 jugadores con foto caen a la por defecto hasta nueva subida.
- Sin commitear: `.claude/launch.json` y estas actualizaciones de docs.

## 2026-10-25 (tarde)

### What was done
- Historial por usuario (PR #30-#33), vistas de solo lectura de la última jornada, puntos por jugador. 65 tests OK.
- Verificada RLS de `alineaciones` en prod (sin agujero). Scraper: sin prueba de escritura; 520 desde GH.
- Tarea `scraper-servidor-casa` creada (runner autoalojado).

### Decisions made
- Runner autoalojado en servidor de casa; crons de fin de semana a las 21:00 hora española.

### What's left
- Runner, secret de service role, J8 con datos reales, admin leyendo `alineaciones`, fotos.
