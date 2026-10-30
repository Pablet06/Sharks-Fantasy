---
status: done
created: 2026-10-23
updated: 2026-10-30
---

# Verificación pre-partido

## Context
El sábado 2026-10-24 hay partido real. Antes de que se juegue hay que comprobar que el juego funciona bien de punta a punta: historial de jornadas, fichajes de los usuarios y lo que ocurre al terminar el partido (puntuación, apuestas, dinero).

## Goal
Tener confianza de que el juego está listo para el partido y de que el proceso posterior (scraper, puntos, dinero/apuestas) está bien planificado y programado. Análisis con Opus 5.5.

## Acceptance criteria
- [x] Verificar si existe historial por jornada de cada usuario con puntos y dinero ganado (apuestas), visible para el propio usuario; si falta, documentar qué falta. (Verificado: no hay pantalla dedicada de historial con puntos y dinero por jornada; hueco documentado en Sessions y en el diario. Apuestas ya muestra resultados + balance aunque no haya jornada abierta.)
- [x] Investigar por qué no aparecen en admin los fichajes de Charly y Pablo; confirmar si es un error de datos, RLS o UI, y dejar la causa raíz identificada. (Causa raíz: UI. `UsuariosAdmin` lee `usuarios.equipo`, campo retirado; los fichajes reales están en `alineaciones` de J7. Corregido el 2026-10-30 en PR #38: el admin lee y edita `alineaciones`; **PR abierto, pendiente de mergear a `develop`**.)
- [x] Revisión del código del flujo post-partido (scraper/sync, cálculo de puntos, liquidación de apuestas, dinero) con lista de riesgos y huecos.
- [x] Hallazgos y correcciones priorizadas; ninguna se mergea/despliega antes del partido sin confirmación. (Hecho 2026-10-25: tras el partido se mergearon PR #27 y PR #26 a develop y main, con deploy OK.)
- [x] Verificar J7 tras el partido: comprobar la ejecución del scraper y los datos de J7 con `docs/runbook-partido-j7.md` (`gh run list`, comprobaciones SQL) y confirmar que el secret `service_role` de GitHub es la clave real. (J7 verificado y resuelto, scraper ejecutado en local. Secret `SUPABASE_SERVICE_ROLE_KEY` de GitHub confirmado el 2026-10-30: el run programado escribió `config.last_sync_at` = `2026-10-30T14:46:24.951Z`.)

> Cerrada el 2026-10-30. El código del arreglo del admin (criterio 2) vive en PR #38, que **todavía no está mergeado** a `develop`.

## Sessions

### 2026-10-30

## Session Summary — 2026-10-30

**What was done:**
- Admin > Usuarios arreglado en PR #38 (https://github.com/Pablet06/Sharks-Fantasy/pull/38, rama `feature/admin-alineaciones` -> `develop`, commit único `5b707c5`). Estado: ABIERTO, mergeable, SIN mergear, sin checks de CI en el PR.
  - Lee y edita `alineaciones` (7 jugadores + capitán) por jornada, con selector de jornada (por defecto la misma que "Mi equipo": `jornadaEnCurso ?? ultimaJornadaResuelta`). El admin también puede crear una alineación que falte. Helper puro `filaAlineacionAdmin` en `src/lib/draft.ts` (tests primero).
  - Quitado `equipo` del tipo `Usuario` (la columna sigue en la BD; sin migración ni cambios de RLS: `alineaciones_admin_all` ya permite escribir al admin).
  - El aviso al borrar un jugador en Admin > Jugadores ahora mira las `alineaciones` de la jornada en curso (solo `jornadaEnCurso`).
  - Legibilidad: selects de la alineación en rejilla (2 columnas en escritorio, 1 en móvil) con el capitán como 8º select marcado con ★; arregladas las barras superiores internas del admin que se solapaban con la barra fija principal en móvil.
  - Buscador en Admin > Jugadores (nombre, apodo, dorsal, posición) y Admin > Usuarios (nombre), sin distinguir acentos ni mayúsculas, con el helper puro `coincide()` en `src/lib/busqueda.ts` (+ test).
  - Docs: `docs/MANUAL_DEL_JUEGO.md`, `docs/features/admin-panel/README.md` y nuevo `docs/learning/admin-alineaciones.md` (mentor). Plan en `.claude/plans/usuarios-admin-alineaciones.md` (local, sin trackear).
  - Verificación: 78 tests, lint y build en verde. Probado a mano en el navegador integrado con la sesión de admin, solo lectura: alineaciones de J7 correctas, errores de validación, `confirm()` en jornada puntuada cancelado sin ninguna escritura de red, buscador, escritorio 1280 px y móvil.
- Secret `SUPABASE_SERVICE_ROLE_KEY` de GitHub confirmado: el run programado de hoy imprimió `sync: nothing new` a las 14:46:24.951 UTC y `config.last_sync_at` vale exactamente `2026-10-30T14:46:24.951Z` (esa tabla solo la escribe el admin o la clave de servicio). Resuelve la pregunta abierta desde el 2026-10-24.
- Tarea cerrada como `done` (5/5 criterios), con el arreglo del admin pendiente de merge (PR #38).
- Otras tareas tocadas hoy:
  - `federation-sync`: cerrada (`done`); el criterio del primer sync semanal en verde pasa a `scraper-servidor-casa`.
  - `season-launch-readiness`: cerrada (`done`) tras revisión de producción en solo lectura (RLS en las 12 tablas de `public`, storage `jugadores` privado, `resolver_jornada` no ejecutable por `anon`, `delete-account` v3 con `verify_jwt = true`, 5 secrets en GitHub, `.env` ignorado) y bloque post-partido verificado con datos reales (runs programados en verde desde el 25-10, `unmatched_players = []`, apuestas J7 34/34, alineaciones 19/19, 19 de 22 usuarios con puntos).
  - `scraper-servidor-casa`: sigue `in-progress`, en espera de J8; contexto actualizado (la clave escribe; solo falta probar `/match/<id>/stats` desde GitHub).

**Decisions made:**
- El admin no tiene tope de presupuesto y guarda `presupuesto_usado = null`.
- Se puede editar una jornada ya puntuada, previa `confirm()`: el mismo upsert pone `puntos_jornada = null` y después se llama a `resolver_jornada`, porque `resolver_jornada` no baja los `puntos_jornada` de una fila que deja de estar completa.
- El admin puede crear una alineación a un usuario que no la tiene (con aviso de puntos retroactivos).
- `equipo` fuera del tipo `Usuario`; la columna de la BD se queda (sin migración).
- Aviso de borrado de jugador basado en las `alineaciones` de `jornadaEnCurso`.
- `scraper-servidor-casa`: esperar a J8 antes de montar nada. Si el run programado tras el partido da 520/429, runner autoalojado (opción A); si funciona, cerrar sin runner.

**Open questions:**
- ¿Cuándo mergear PR #38 a `develop`? Lo decide el usuario (repo "team": PRs obligatorios).
- `CLAUDE.md` dice que el remote es SSH (`git@github.com:Pablet06/Sharks-Fantasy.git`) pero `origin` es HTTPS (`https://github.com/Pablet06/Sharks-Fantasy.git`). Discrepancia solo de documentación; el usuario no ha decidido si actualizarlo.
- Sin verificar en PR #38: el guardado real (upsert + `resolver_jornada`) contra Supabase (el `.env` local apunta a producción y editar J7 recalcularía los puntos de todos); el caso positivo del aviso al borrar jugador (necesita una jornada en curso); cambiar el selector a otra jornada (solo existe J7).

**Next steps:**
- Mergear PR #38 a `develop` (y luego `develop` -> `main`) cuando lo decida el usuario; probar el guardado real en la primera ocasión segura.
- PR pequeño de docs con los `docs/tasks/*` modificados (`federation-sync`, `pre-partido-verificacion`, `season-launch-readiness`, `scraper-servidor-casa`) y los diarios.
- Seguimiento (no hecho): `createProfile` en `src/hooks/useUsuario.ts` sigue insertando un `equipo` heredado al registrarse. La migración `20261023000000_lock_usuarios_self_insert.sql` está escrita en torno a ese insert, así que quitarlo exige una migración coordinada. La columna sigue en la BD: sin riesgo hoy.
- J8: vigilar el run del scraper tras el partido (`scraper-servidor-casa`) y la financiación de presupuestos con datos reales.
- Pendientes no bloqueantes en `season-launch-readiness` ("Pendientes al cerrar"): Confirm email y Site URL, protección de contraseñas filtradas, `.claude/launch.json` sin trackear, `VITE_ADMIN_HASH` muerto en `deploy.yml`, `REVOKE EXECUTE` opcional a `anon` en `recalc_puntos()`/`powerups_aplicar()`.

**Ideas pendientes para la próxima sesión (sin priorizar; ni iniciadas ni planificadas):**
- Añadir a "Santapau" como entrenador (easter egg), solo visual: aparece en la lista de jugadores pero no se puede fichar ni apostar por él.
- Mostrar los fichajes de "Mi equipo" en una vista de formación de waterpolo (como el fantasy antiguo), también en el estado "Esperando fecha". Preguntar detalles al usuario si hace falta.
- Mostrar el ranking completo en vez de solo el top 10.
- Confirmar que en la siguiente jornada no se pueden fichar los mismos jugadores que en la anterior, como dice el manual.

**Nota de entorno:** para probar en el móvil hace falta `npm run dev -- --host` (por defecto solo escucha en localhost); IP de LAN 192.168.1.215 y la ruta debe incluir `/Sharks-Fantasy/`. El `.env` apunta a producción.

### 2026-10-25 (tarde)

- Feature historial por usuario mergeada (PR #30-#33); admin sigue leyendo `usuarios.equipo` (pendiente: leer `alineaciones`).
- Scraper: cron de GH sin prueba de escritura; run manual `--jornada 7` falló con 520. Decisión: runner autoalojado en servidor de casa, ver `docs/tasks/scraper-servidor-casa.md`. El secret `SUPABASE_SERVICE_ROLE_KEY` sigue sin confirmar.
- J8: `presupuestos` vacía en prod; financiación solo probada con tests unitarios.
- RLS `alineaciones_owner_write` verificada en prod: ya exige `fecha_partido IS NOT NULL`; sin migración.

### 2026-10-25

## Session Summary — 2026-10-25

**What was done:**
- J7 verificado tras el partido. Las ejecuciones del scraper en GitHub fallaron (HTTP 520, luego 429: la federación/Cloudflare bloquea las IPs de GH). Scraper ejecutado en local (`cd scraper && npm run sync -- --jornada 7`) con la `service_role` del `.env`: 19 filas de historial, 0 sin emparejar, J7 perdida 9-22.
- Bug encontrado: `resolver_jornada` abortaba con "UPDATE requires a WHERE clause" (`UPDATE usuarios u SET puntos` sin condición). Arreglado con `WHERE true`; migración `20261025000000_resolver_jornada_where_usuarios.sql` aplicada en prod (versión Supabase 20261024234637) y commiteada (46def40). J7 reprocesada: apuestas 34/34, alineaciones 19/19, jornada `finalizado=true`, `usuarios.puntos` 46-49 en el top 5, `unmatched_players` vacío.
- Cuerpo de `recalc_puntos` ejecutado por SQL (RPC solo admin): `jugadores.stats` recalculado en 19/19 jugadores.
- Tests 59 OK, lint y build OK. Mergeados PR #27 -> develop y PR #28 develop -> main (deploy OK). PR #26 (fotos) revisado con un subagente de solo lectura: colisión de timestamp de migración con `lock_usuarios_self_insert` (20261023000000); renombrada a `20261026000000_fotos_privadas.sql`, políticas cambiadas a `is_admin((SELECT auth.uid()))`, develop mergeado dentro; luego PR #26 -> develop y PR #29 develop -> main (deploy OK).
- `CLAUDE.md` restaurado a la versión del repo (la copia local había perdido comandos/stack/remote).

**Decisions made:**
- Nada de push directo a main; cadena de PRs feature -> develop -> main.
- La migración de fotos ya aplicada en prod conserva las políticas antiguas basadas en EXISTS; solo cambió el fichero del repo. Haría falta una migración de seguimiento para recrearlas con `is_admin()`.

**Open questions:**
- ¿Es el secret `SUPABASE_SERVICE_ROLE_KEY` de GitHub la clave real? El cron del sábado 22:00 UTC nunca apareció en la lista de ejecuciones (la última programada fue 2026-07-25).

**Next steps:**
- Comprobar el secret de GitHub con el reintento del domingo 22:00 UTC o una ejecución manual.
- Financiación del presupuesto de J8 (reconciliación de PR #27 en `scraper/src/sync.ts`): probada con tests unitarios, no con datos reales; revisar cuando aparezca la fecha de J8.
- Pantalla de historial por usuario (puntos y dinero por jornada) en rama nueva `feature/historial-usuario` desde develop.
- Admin debe leer `alineaciones` en vez de `usuarios.equipo`.
- Opcional: migración para alinear las políticas de storage de fotos en prod con `is_admin()`; los PNG antiguos de jugadores siguen en el historial público de git; 4 jugadores con foto caen a la imagen por defecto hasta que el admin suba nuevas.
- Sin commitear: `.claude/launch.json` (config local del dev server) y estas actualizaciones de docs.

### 2026-10-24

## Session Summary — 2026-10-24

**What was done:**
- Sin cambios de código. El usuario confirmó que el partido ya se jugó; se decide esperar al scraper automático (sáb 22:00 UTC, reintento dom 22:00 UTC) y verificar con `docs/runbook-partido-j7.md` (`gh run list`, comprobaciones SQL).
- Análisis: en la rama/PR #27 `jornadaAbierta` exige fecha + no finalizada + >24h, así que sin fecha ya no se puede apostar. El riesgo real: `resolver_jornada` solo escribe presupuestos de la siguiente jornada si la fila jornada+1 existe al resolver (migración `20260913000001`, ~línea 139); si J8 aparece después, los usuarios empiezan con 1000€ salvo que se ejecute antes "Reprocesar jornada 7". PR #27 lo automatiza en el scraper.

**Decisions made:**
- Esperar (`esperamos`) a la ejecución del scraper. Aplazada la opción de condicionar la apertura de una jornada a que existan filas en `presupuestos`.
- Tarea sigue `in-progress`: decisión de merge de PR #27 pendiente.

**Open questions:**
- ¿Es el secret `service_role` de GitHub la clave real? (primera ejecución real del cron)
- Mergear PR #27 y cuándo; PR #26 no se mergea/despliega hasta confirmar J7.

**Next steps:**
- Verificar la ejecución del scraper tras las 22:00 UTC.
- Si aparece la fecha de J8 sin PR #27 mergeado: admin > Sync > Reprocesar jornada 7 primero.
- Decidir/mergear PR #27; revisar PR #26; Recalcular puntos.
- Pantalla de historial por jornada; admin debe leer `alineaciones` en vez de `usuarios.equipo`.

### 2026-10-23

**Session Summary — 2026-10-23**

**What was done:**
- Revisión read-only del flujo post-partido (scraper, `resolver_jornada`, puntos, apuestas, dinero) con un subagente Opus 5.5. Hallazgos:
  - CRÍTICO: la política `usuarios_insert_own` dejaba a cualquier usuario nuevo insertarse con `is_admin=true` (o puntos). Corregido con la migración `20261023000000_lock_usuarios_self_insert.sql`, aplicada en prod y verificada con prueba en transacción con rollback (commit `aa2cae0`).
  - ALTO: (a) la financiación del presupuesto de la siguiente jornada solo ocurre si esa jornada ya existe cuando corre `resolver_jornada`; (b) `jornadaAbierta` elegía el número de jornada más bajo, no la más cercana por fecha; (c) el scraper incremental nunca reintentaba una jornada cuyo resolver había fallado y terminaba en verde con "nada nuevo" si el partido no estaba marcado como terminado.
  - MEDIO/BAJO, sin corregir: `UsuariosAdmin` lee el campo retirado `usuarios.equipo`; corregir datos tras resolver no recalcula las apuestas ya resueltas; `capitan_tardio` solo se puede usar con la jornada abierta (en parte resuelto por la vista de solo lectura); las stats de temporada de los jugadores necesitan "Recalcular puntos" manual; el tope de presupuesto solo se valida en cliente; el `orden` de jornadas se asigna por inserción, no por fecha; los empates en goleador/expulsado dan 0 a todos; `expulsiones_graves` no cuenta en la apuesta de expulsado; `historial.date` sin zona horaria.
- Causa raíz de que no se vean los fichajes de Charly y Pablo en admin: UI, no datos ni RLS. El panel lee `usuarios.equipo` (retirado) y los fichajes reales están en `alineaciones` de J7.
- PR #27 (4+1 commits, rama `feature/pre-partido-verificacion` subida):
  - Scraper: `reconciliarJornadas`, `jornadasPorReconciliar` y `partidosSinResultado` en `scraper/src/sync.ts`, más cron diario a las 08:00 UTC en `.github/workflows/scraper.yml`.
  - Front: `src/lib/jornada.ts` (`jornadaAbierta` por fecha, `jornadaEnCurso`, `faseJuego`); Draft y Apuestas en solo lectura con la jornada cerrada; Apuestas muestra resultados y balance sin jornada abierta; `FaseBanner` bajo la cabecera (fases: abiertos, cerrados, en juego, post-partido, esperando fecha).
  - iOS: `viewport-fit=cover`, fondo en `html`, safe-area inferior.
  - Tests: frontend 59, scraper 68; `tsc`, lint y build en verde. No verificado en navegador ni en iOS.
- Backup de fichajes y apuestas de J7 por usuario en `docs/backups/2026-10-23-fichajes-apuestas-j7.md` y runbook de la noche del partido en `docs/runbook-partido-j7.md`.
- Simulación en prod dentro de una transacción con rollback: `resolver_jornada(7)` con historial falso puntuó 19 alineaciones, resolvió 34 apuestas (22 aciertos, 12 fallos), es idempotente y financió una jornada sucesora. BD intacta.
- Hallazgos de CI/scraper: el repo no tiene CI en PR (`deploy.yml` solo en push a `main`; `scraper.yml` es cron). Ejecuciones recientes del scraper: 2026-10-22 07:42 falló (HTTP 520 de waterpolo.fncv.es), 08:00 OK, 11:06 falló (HTTP 429 en un backfill `--anterior`); todas las programadas de junio-julio fallaron. El código de `main` equivale al de `develop` (develop solo tiene 2 ficheros de docs más), así que mañana el scraper corre con el código de `main`, no el del PR.

**Decisions made:**
- Mantener el cron sáb/dom 22:00 UTC (21:00 CEST no es expresable en cron UTC; deja margen) y añadir en el PR un cron diario a las 08:00 UTC como red de seguridad.
- No mergear ni desplegar nada del front/scraper antes del partido; PR #27 queda abierto hacia `develop`.
- PR #26 (fotos privadas + admin móvil) sigue retenido hasta después del partido del sábado 2026-10-24 (15:45 UTC).
- `CLAUDE.md` y `.claude/launch.json` se dejan sin commitear a propósito.

**Open questions:**
- ¿Cuándo mergear PR #27 (a `develop` y luego a `main`)? Tras el partido, a decidir con el resultado del scraper a la vista.
- ¿Se construye la pantalla de historial por jornada (puntos y dinero) para el usuario? Hoy no existe como pantalla dedicada.
- Hectorg_wp y Jusi prime no tienen alineación en J7 (puntuarán 0): ¿es lo esperado?
- Sin verificar en navegador ni en iOS los cambios de front de PR #27.

**Next steps:**
- Tras el partido: comprobar la ejecución del scraper y los datos (ver `docs/runbook-partido-j7.md`).
- Hacer a mano "Reprocesar jornada 7" cuando aparezca la fecha de la siguiente jornada (hasta que PR #27 esté mergeado).
- Decidir y ejecutar el merge de PR #27 tras el partido; después revisar PR #26.
- Construir la pantalla de historial de usuario (puntos y dinero por jornada).
- Cambiar el admin para que lea `alineaciones` en vez de `usuarios.equipo`.
- Seguimientos: `orden` de jornadas por fecha, recalcular apuestas tras corregir datos, workflow de CI en PR, validación de presupuesto en servidor.
