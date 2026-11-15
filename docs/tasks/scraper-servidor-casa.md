---
status: done  # cerrada el 2026-11-15 por decisión del usuario; ver "Pendiente tras el cierre" en Acceptance criteria
created: 2026-10-25
updated: 2026-11-15
---

# Scraper desde el servidor de casa

## Context
El scraper semanal corre en GitHub Actions (`.github/workflows/scraper.yml`), pero la
federación (`waterpolo.fncv.es`, detrás de Cloudflare) responde 520/429 a las IPs de
GitHub. El run manual `--jornada 7` del 2026-10-25 falló con HTTP 520 al pedir las
estadísticas del partido, tras 60 s, sin escribir nada. El cron del sábado
2026-10-25 00:00 UTC terminó en éxito pero con "nothing new", sin demostrar que pueda
escribir. Mientras tanto, J7 se tuvo que sincronizar en local.

**Actualización 2026-10-30:**
- `SUPABASE_SERVICE_ROLE_KEY` (secret de GitHub, actualizado el 2026-09-09) **sí escribe**: el
  run diario de hoy imprimió `sync: nothing new` a las 14:46:24.951 UTC y `config.last_sync_at`
  vale exactamente `14:46:24.951Z` (esa tabla solo la escribe un admin o la clave de servicio).
- Desde el 25-10 todos los runs programados salen en verde, pero todos son `nothing new`: solo
  piden calendario (J1..J18 se descargan bien desde la IP de GitHub). El único fallo real (HTTP
  520, manual `--jornada 7`, 25-10 09:45 UTC) fue en `/match/<id>/stats`, el endpoint que no se
  ha vuelto a probar. No está claro si es un bloqueo de IP o un error intermitente del origen.
- `--discover` es una sonda de solo lectura de ese mismo endpoint (pide las estadísticas de los
  partidos terminados y no escribe en la base de datos).

**Actualización 2026-11-15:**
- **GitHub recibe HTTP 429 en `/match/<id>/stats`** (runs rojos desde el 13-nov): confirmado con
  datos reales, así que la opción A (runner autoalojado) queda justificada. Desde la IP de casa
  el incremental completo funcionó sin 429.
- **La federación recreó el calendario el 13-nov a las 08:29 y renumeró las jornadas** (Leverade
  `order`, que el scraper usa como `jornada`). Antiguo → nuevo: Morvedre 24-oct J7→J15, Petrer
  7-nov J10→J18, Castelló 15-nov J2→J10. Efecto: el incremental se saltaba J10 (tenía el
  historial de Petrer) y un sync local escribió una "J15" vacía (la federación perdió las actas
  de los partidos recreados).
- **Migración hecha el 2026-11-15** (un solo bloque atómico con comprobaciones antes y después):
  `jornadas`, `historial`, `alineaciones`, `apuestas`, `presupuestos` y `powerups_aplicados`
  renumeradas 10→18, 7→15, 2→10 con las FKs quitadas y recreadas idénticas. La J15 vacía se
  retiró y está en la copia. Copia completa pre-migración en el esquema `backup_20261115`
  (no expuesto por la API). Después `npm run sync` en local escribió J10 (Castelló 7-14).
- Efecto colateral conocido: `resolver_jornada` reparte un power-up aleatorio a todos cuando el
  nº de jornadas finalizadas es múltiplo de 3; la J15 vacía lo disparó a las 16:20 y la J10 real
  lo volvió a disparar (powerups_usuario 25 → 49). **Decidido el 2026-11-15: dejar un solo
  reparto.** Se restó exactamente el segundo (diferencia contra la copia previa al sync, +1 por
  usuario) y la tabla quedó idéntica a esa copia (26 filas, 25 power-ups).

## Goal
El scraper corre solo, tras cada partido, desde una IP que la federación no bloquee
(servidor de casa), y se confirma que escribe en producción con la clave de servicio.

## Options
- **A. Runner autoalojado de GitHub Actions** en el servidor (ELEGIDA el 2026-10-25; se hará en el futuro): se reutiliza
  el workflow y sus crons; los secrets siguen en GitHub; solo cambia `runs-on` a
  `self-hosted`. Ojo: el repo es público si lo es, y un runner autoalojado ejecuta código
  de PRs; limitarlo a `schedule` y `workflow_dispatch`.
- **B. cron / systemd timer** en el servidor ejecutando `cd scraper && npm run sync:prod`
  con un `.env` local (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Más simple, pero
  la clave vive en el servidor y no hay historial de runs en GitHub.

Crons: sábado y domingo 20:00 UTC (21:00 CET desde el 2026-11-15; antes 22:00 UTC) y diario
08:00 UTC. El incremental es idempotente, así que repetirlo es seguro.

## Decision
**2026-10-30: esperar a la próxima jornada (J8) antes de montar nada.** Hoy se comprobó que la
clave de servicio escribe y que el calendario se descarga bien desde GitHub; lo único sin probar
es la descarga de estadísticas de un partido. Se decide no lanzar la sonda `--discover` ahora y
dejar que el primer partido nuevo lo demuestre. Cuando J8 tenga fecha y se juegue: mirar si el run
programado de después del partido (`gh run list --workflow scraper.yml`) sale en verde y escribe
`historial`. Si da 520/429 → montar el runner autoalojado (opción A, abajo) y cerrar los criterios.
Si funciona → cerrar la tarea sin runner (quedan solo el aviso de fallo y la hora de los crons).

Opción A (2026-10-25): el job lo ejecuta el servidor de casa, no las máquinas de GitHub, así que el tráfico a la federación sale desde la IP de casa. Se mantiene el historial de runs y los secrets en GitHub. La B (cron local) queda descartada por ahora.

## Acceptance criteria
- [x] Sonda desde GitHub: no hizo falta `--discover`; los runs reales del 13 al 15-nov dan 429
      en `/stats` (2026-11-15). Hace falta el runner
- [x] Servidor de casa con acceso saliente a la federación y a Supabase (2026-11-15). Tiene Node 22,
      pero `setup-node` instala el 24 en cada job
- [x] Runner autoalojado (opción A) instalado y arrancando con el servidor; workflow con
      `runs-on: [self-hosted, sharks-scraper]`, solo para `schedule` y `workflow_dispatch` (#50, 2026-11-15)
- [x] Ejecución completa del incremental desde el servidor sin 520/429 (2026-11-15; `--jornada 7`
      ya no aplica por la renumeración)
- [x] Prueba de escritura real con la clave de servicio y comprobación en la base de datos
      (2026-11-15, desde el PC de casa): `historial`, `jornadas`, puntos y apuestas de J10 bien;
      J15 y J18 sin una fila distinta respecto a la copia
- [x] Reducir peticiones: `syncJornada` pide solo el `/stats` del partido de los Sharks,
      identificado por la API (y ninguno mientras no haya terminado) (#52, 2026-11-15)
- [x] Decidir el power-up duplicado: se quitó el segundo reparto (2026-11-15)
- [x] Cron de GitHub Actions: se mantiene; ahora ejecuta en el runner de casa (2026-11-15)
- [x] Hora de los crons de fin de semana a las 21:00 hora española: `0 20 * * 6` y `0 20 * * 0`
      (20:00 UTC = 21:00 CET), con comentario en `scraper.yml` (2026-11-15). Ver abajo el
      cambio de marzo

### Pendiente tras el cierre (cierre con estas partes SIN hacer, por decisión del usuario el 2026-11-15)
No se marcan como hechas.
- [ ] **Primera escritura real desde el runner**: el próximo partido de los Sharks debe escribir
      `historial` y puntuar desde `pablo-server`. Todos los runs hasta ahora fueron `nothing new`.
      Si ese run sale en rojo, reabrir esta tarea
- [ ] **Aviso si la federación renumera el calendario** (p. ej. comparar fecha/rival de las
      jornadas con historial contra la API y avisar si no cuadran, en vez de saltarlas en silencio)
- [ ] **Aviso si el scraper falla** (hoy solo `::error::` en el log del run): comprobar que
      GitHub envía el email de los runs fallidos o añadir otro aviso
- [ ] **Marzo de 2027**: con el horario de verano, pasar los dos crons de fin de semana a `0 19`
      (y volver a `0 20` en octubre), o aceptar 1 h de desfase
- Esquema `backup_20261115`: se deja en la base de datos por decisión del usuario (2026-11-15,
  "por si acaso"). Borrarlo solo cuando el usuario lo diga

## Notes
- El incremental ya reintenta jornadas dejadas a medias (`resolver_jornada` fallido y
  financiación de la jornada sucesora).
- Una IP residencial puede entrar igualmente en el "penalty box" de Cloudflare si se
  hacen muchas peticiones seguidas (pasó con el backfill de 272 filas). El incremental
  semanal hace pocas, pero el `--backfill` conviene seguir lanzándolo desde un navegador.
- Pendiente de la jornada J8: la reconciliación de presupuesto (PR #27, `sync.ts`) solo
  tiene tests unitarios; revisarla con datos reales cuando aparezca la fecha.

- `resolver_jornada` calcula la jornada anterior de la racha con `numero < p_jornada`, pero la
  numeración de la federación no es cronológica (por eso existe `orden`). Ya pasaba antes de
  la renumeración; revisar si debería usar `orden`.
- Runner (2026-11-15): máquina `pablo-server` (Tailscale), usuario `ghrunner` sin `sudo` ni
  `docker`, en `/home/ghrunner/actions-runner`, como servicio de usuario `github-runner` (con
  `linger`, arranca con el servidor), etiqueta `sharks-scraper`, solo conexiones de salida. El
  repo es público: política de aprobación a forks en `all_external_contributors`, y **nunca
  añadir `push` ni `pull_request` a `scraper.yml`**. Estado del servicio:
  `tailscale ssh ghrunner@pablo-server` y `systemctl --user status github-runner`.
- Lanzar el sync a mano: `gh workflow run scraper.yml` (opcional `-f args="--jornada N"`). No
  usar `--backfill` ni `--jornada 15`/`--jornada 18`: la federación perdió las actas de los
  partidos recreados y se sobrescribirían con ceros.

## Sessions

### 2026-11-15

**What was done:**
- Diagnóstico: los runs de GitHub fallaban con HTTP 429 de Cloudflare en `/match/<id>/stats`
  desde el 13-nov, y ese día la federación recreó el calendario y renumeró las jornadas (detalle
  y correspondencia antiguo → nuevo en Context). Un sync local sin explicar a las 16:20 UTC había
  escrito una "J15" vacía (Morvedre con acta sin jugadores) y disparado `resolver_jornada`.
- Base de datos (Supabase `sihvxbhqcyynuulhqmii`): copia completa de 9 tablas en el esquema
  `backup_20261115`, verificada fila a fila; migración atómica a la numeración nueva (FKs
  quitadas y recreadas; 10→18, 7→15 y 2→10 en `jornadas`, `historial`, `alineaciones`, `apuestas`,
  `presupuestos` y `powerups_aplicados`, con comprobaciones antes y después; la J15 vacía se retiró
  y queda en la copia). `npm run sync` en local escribió J10 (Castelló 7-14): 17 alineaciones
  puntuadas, 18 apuestas resueltas y +408 puntos repartidos; J15 y J18 intactas frente a la copia.
- Power-ups: el reparto se disparó dos veces (J15 vacía a las 16:20 y J10 real). Se quitó
  exactamente el segundo: 25 power-ups y tabla idéntica a la copia previa al sync.
- Infra: runner de GitHub Actions autoalojado en `pablo-server` (Ubuntu 26.04, entrando por
  Tailscale SSH): usuario `ghrunner` sin `sudo` ni `docker` y con `linger`, runner 2.338.2 con
  checksum verificado, servicio de usuario `github-runner`, etiqueta `sharks-scraper` y solo
  conexiones de salida. Política de aprobación a forks cambiada de `first_time_contributors` a
  `all_external_contributors`, porque el repo es público.
- Código y PRs (en pares: PR a `develop` y release a `main`): #50/#51 `scraper.yml` con
  `runs-on: [self-hosted, sharks-scraper]`; #52/#53 `syncJornada` pide solo el `/stats` del partido
  de los Sharks, identificado por la API (TDD, 3 tests nuevos y 3 mutaciones detectadas; scraper
  71 tests, raíz 99); #54/#55 crons de fin de semana a `0 20 * * 6` y `0 20 * * 0` (21:00 CET)
  y tareas al día; #56/#57 cierre de `scraper-servidor-casa`, `forgot-password` y
  `next-jornada-improvements`; #66 tarea futura `scraper-timer-servidor` (status `todo`, fusionada
  en `develop` y aún no en `main`).
- Desde esta sesión se lanzaron otras dos, con sus propias tareas y diarios:
  `mejoras-ui-stats-ranking-admin` (#58–#61) y `posicion-por-jornada` (#62–#65), ya en `main`.

**Decisions made:**
- Opción A (runner autoalojado con medidas de seguridad) y no la B: se conservan el historial de
  runs, los emails de fallo y los secretos en GitHub. Con un repo público el runner solo se
  protege si se limita quién puede lanzarlo: forks bajo aprobación, usuario sin privilegios, solo
  salida, y `scraper.yml` nunca con `push` ni `pull_request`.
- El esquema `backup_20261115` se conserva ("por si acaso"); solo se borra cuando lo diga el
  usuario.
- Un solo reparto de power-ups: se quita el segundo, que vino de un `resolver_jornada` disparado
  por una jornada vacía y no de un partido real.
- Las tres tareas se dan por completadas aunque quede algo sin verificar: lo pendiente no se
  marca como hecho y queda en secciones de pendientes (ver "Pendiente tras el cierre").
- El timer en el servidor se aplaza (`scraper-timer-servidor`). Recomendación dada: opción C
  (timer que solo lanza el workflow, con un token limitado). De momento siguen los crons de GitHub
  ejecutados en el runner de casa.

**Open questions:**
- Primera escritura real desde el runner con el próximo partido de los Sharks; si ese run sale en
  rojo, reabrir la tarea.
- Aviso si la federación vuelve a renumerar el calendario, y comprobar que GitHub envía el email
  de los runs fallidos.
- Marzo de 2027: pasar los crons de fin de semana a `0 19` (o resolverlo con el timer).
- El run programado de las 20:00 UTC del 15-nov no se había visto a las 21:27 UTC: GitHub retrasa
  los crons de 3,5 a unas 8 h (el diario de las 08:00 UTC sale hacia las 15:00-16:00 UTC), así que
  la hora de las 21:00 es orientativa.
- `resolver_jornada` calcula la jornada anterior de la racha con `numero <` aunque la numeración
  no es cronológica; debería usar `orden` (ver Notes).
- La reconciliación de presupuesto (PR #27) sigue sin revisarse con datos reales.
- La carpeta vacía `.worktrees/posicion-por-jornada` hay que borrarla a mano.
- `todo` es un estado nuevo: hasta ahora el proyecto solo usaba `in-progress` y `done`.

**Next steps:**
- Mañana por la tarde: `gh run list --workflow scraper.yml --event schedule --limit 3` y
  comprobar que el run diario lo ejecuta `pablo-server`.
- Esperar al próximo partido para la primera escritura real desde el runner.
- Retomar `scraper-timer-servidor` cuando el usuario quiera.

### 2026-10-30

- Tarea retomada y puesta en `in-progress`. Descubierto que la clave de servicio sí escribe (`config.last_sync_at`) y que solo falta probar la descarga de estadísticas desde GitHub. Decisión: esperar a la próxima jornada antes de montar el runner; el contexto y los criterios quedan actualizados. Ningún criterio de infraestructura iniciado.

### 2026-10-25

- Tarea creada y decisión tomada: opción A (runner autoalojado). Ningún criterio cumplido aún. Mergeada a develop y main como doc.

