---
status: in-progress  # en espera de la próxima jornada; si falla la descarga de stats desde GitHub, montar el runner (opción A)
created: 2026-10-25
updated: 2026-10-30
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

Mantener los crons actuales (sábado y domingo 22:00 UTC, diario 08:00 UTC): el
incremental es idempotente.

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
- [ ] Sonda de solo lectura desde GitHub: `workflow_dispatch` con `--discover`, para ver si el
      endpoint de estadísticas sigue dando 520/429 a las IPs de GitHub (decide si hace falta el runner)
- [ ] Servidor de casa con Node 24 y acceso saliente a la federación y a Supabase
- [ ] Runner autoalojado (opción A) instalado y arrancando con el servidor; workflow con `runs-on: self-hosted`, solo para `schedule` y `workflow_dispatch`
- [ ] Ejecución manual `--jornada 7` desde el servidor sin 520/429 (prueba de bloqueo)
- [ ] Prueba de escritura real con la clave de servicio (p. ej. `--jornada 7` o la
      próxima jornada) y comprobación en la base de datos de que no cambia nada
      inesperado (`usuarios.puntos`, `historial`, `apuestas`, `presupuestos`). La clave ya
      escribe en `config` (comprobado el 2026-10-30); falta una escritura de `historial`
- [ ] Decidir si se desactiva el cron de GitHub Actions (evita runs duplicados y fallos
      en rojo)
- [ ] Aviso si el scraper falla (hoy solo `::error::` en el log del run)
- [ ] Cambiar la hora de los crons de fin de semana (sábado y domingo) a las 21:00 hora
      española. Hoy están a las 22:00 UTC (23:00/24:00 en España). Los crons van en UTC, así
      que 21:00 son 19:00 UTC en horario de verano (CEST) y 20:00 UTC en invierno (CET): el
      cambio de hora fue el 2026-10-25, así que ahora toca `0 20 * * 6` y `0 20 * * 0`, y
      habrá que retocarlo en marzo, o aceptar 1 h de desfase. Actualizar también los
      comentarios de `scraper.yml`. Si el runner es autoalojado, otra opción es un timer
      con zona horaria `Europe/Madrid`.

## Notes
- El incremental ya reintenta jornadas dejadas a medias (`resolver_jornada` fallido y
  financiación de la jornada sucesora).
- Una IP residencial puede entrar igualmente en el "penalty box" de Cloudflare si se
  hacen muchas peticiones seguidas (pasó con el backfill de 272 filas). El incremental
  semanal hace pocas, pero el `--backfill` conviene seguir lanzándolo desde un navegador.
- Pendiente de la jornada J8: la reconciliación de presupuesto (PR #27, `sync.ts`) solo
  tiene tests unitarios; revisarla con datos reales cuando aparezca la fecha.

## Sessions

### 2026-10-30

- Tarea retomada y puesta en `in-progress`. Descubierto que la clave de servicio sí escribe (`config.last_sync_at`) y que solo falta probar la descarga de estadísticas desde GitHub. Decisión: esperar a la próxima jornada antes de montar el runner; el contexto y los criterios quedan actualizados. Ningún criterio de infraestructura iniciado.

### 2026-10-25

- Tarea creada y decisión tomada: opción A (runner autoalojado). Ningún criterio cumplido aún. Mergeada a develop y main como doc.

