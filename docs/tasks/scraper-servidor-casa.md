---
status: todo  # decidido: opción A, pendiente de hacer
created: 2026-10-25
updated: 2026-10-25
---

# Scraper desde el servidor de casa

## Context
El scraper semanal corre en GitHub Actions (`.github/workflows/scraper.yml`), pero la
federación (`waterpolo.fncv.es`, detrás de Cloudflare) responde 520/429 a las IPs de
GitHub. El run manual `--jornada 7` del 2026-10-25 falló con HTTP 520 al pedir las
estadísticas del partido, tras 60 s, sin escribir nada. El cron del sábado
2026-10-25 00:00 UTC terminó en éxito pero con "nothing new", sin demostrar que pueda
escribir. Mientras tanto, J7 se tuvo que sincronizar en local.

Tampoco está probado que `SUPABASE_SERVICE_ROLE_KEY` (secret de GitHub, actualizado el
2026-09-09) permita escribir: la única prueba posible es una escritura real.

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
Opción A (2026-10-25): el job lo ejecuta el servidor de casa, no las máquinas de GitHub, así que el tráfico a la federación sale desde la IP de casa. Se mantiene el historial de runs y los secrets en GitHub. La B (cron local) queda descartada por ahora.

## Acceptance criteria
- [ ] Servidor de casa con Node 24 y acceso saliente a la federación y a Supabase
- [ ] Runner autoalojado (opción A) instalado y arrancando con el servidor; workflow con `runs-on: self-hosted`, solo para `schedule` y `workflow_dispatch`
- [ ] Ejecución manual `--jornada 7` desde el servidor sin 520/429 (prueba de bloqueo)
- [ ] Prueba de escritura real con la clave de servicio (p. ej. `--jornada 7` o la
      próxima jornada) y comprobación en la base de datos de que no cambia nada
      inesperado (`usuarios.puntos`, `historial`, `apuestas`, `presupuestos`)
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
