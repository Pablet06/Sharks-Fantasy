---
status: in-progress
created: 2026-10-23
updated: 2026-10-25
---

# Verificación pre-partido

## Context
El sábado 2026-10-24 hay partido real. Antes de que se juegue hay que comprobar que el juego funciona bien de punta a punta: historial de jornadas, fichajes de los usuarios y lo que ocurre al terminar el partido (puntuación, apuestas, dinero).

## Goal
Tener confianza de que el juego está listo para el partido y de que el proceso posterior (scraper, puntos, dinero/apuestas) está bien planificado y programado. Análisis con Opus 5.5.

## Acceptance criteria
- [x] Verificar si existe historial por jornada de cada usuario con puntos y dinero ganado (apuestas), visible para el propio usuario; si falta, documentar qué falta. (Verificado: no hay pantalla dedicada de historial con puntos y dinero por jornada; hueco documentado en Sessions y en el diario. Apuestas ya muestra resultados + balance aunque no haya jornada abierta.)
- [x] Investigar por qué no aparecen en admin los fichajes de Charly y Pablo; confirmar si es un error de datos, RLS o UI, y dejar la causa raíz identificada. (Causa raíz: UI. `UsuariosAdmin` lee `usuarios.equipo`, campo retirado; los fichajes reales están en `alineaciones` de J7. Sin corregir.)
- [x] Revisión del código del flujo post-partido (scraper/sync, cálculo de puntos, liquidación de apuestas, dinero) con lista de riesgos y huecos.
- [x] Hallazgos y correcciones priorizadas; ninguna se mergea/despliega antes del partido sin confirmación. (Hecho 2026-10-25: tras el partido se mergearon PR #27 y PR #26 a develop y main, con deploy OK.)
- [x] Verificar J7 tras el partido: comprobar la ejecución del scraper y los datos de J7 con `docs/runbook-partido-j7.md` (`gh run list`, comprobaciones SQL) y confirmar que el secret `service_role` de GitHub es la clave real. (J7 verificado y resuelto, scraper ejecutado en local. SIGUE PENDIENTE confirmar el secret `SUPABASE_SERVICE_ROLE_KEY` de GitHub: las ejecuciones de GH fallaron por 520/429 de la federación, no se pudo comprobar.)

## Sessions

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
