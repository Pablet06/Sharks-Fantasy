# Scraper desde el servidor de casa

Que el scraper de la federación corra en un runner autoalojado de GitHub Actions en `pablo-server`, porque Cloudflare responde 520/429 a las IPs de GitHub. Tarea: `docs/tasks/scraper-servidor-casa.md` (creada el 2026-10-25 con la opción A elegida y retomada el 2026-10-30 para esperar al primer partido; ese historial está en su sección Sessions). PRs: #50 a #57 (de cada par, el primero va a `develop` y el segundo es la release a `main`) y #66 (tarea futura, solo en `develop`).

## 2026-11-15

### What was done
- **Diagnóstico tras el partido de Castelló**: los runs de GitHub fallaban con HTTP 429 en `/match/<id>/stats` desde el 13-nov, lo que confirmó que hacía falta el runner. Además la federación había recreado el calendario el 13-nov a las 08:29 UTC y renumerado las jornadas (Morvedre J7→J15, Petrer J10→J18, Castelló J2→J10), y un sync local sin explicar a las 16:20 UTC había escrito una "J15" vacía y disparado `resolver_jornada`.
- **Copia y migración en la base de datos**: copia completa de 9 tablas en `backup_20261115`, verificada fila a fila; migración atómica a la numeración nueva en `jornadas`, `historial`, `alineaciones`, `apuestas`, `presupuestos` y `powerups_aplicados` (FKs quitadas y recreadas, comprobaciones antes y después, J15 vacía retirada). Después `npm run sync` en local escribió J10: 17 alineaciones puntuadas, 18 apuestas resueltas, +408 puntos. J15 y J18 quedaron idénticas a la copia.
- **Power-up duplicado**: el reparto se había disparado dos veces (J15 vacía y J10 real). Se quitó exactamente el segundo y la tabla quedó idéntica a la copia previa al sync (25 power-ups).
- **Runner en `pablo-server`**: Ubuntu 26.04 por Tailscale SSH, usuario `ghrunner` sin `sudo` ni `docker` y con `linger`, runner 2.338.2 con checksum verificado, servicio de usuario `github-runner`, etiqueta `sharks-scraper`, solo conexiones de salida. Política de aprobación a forks pasada de `first_time_contributors` a `all_external_contributors`.
- **Código**: #50/#51 `runs-on: [self-hosted, sharks-scraper]` en `scraper.yml`; #52/#53 `syncJornada` pide solo el `/stats` del partido de los Sharks, identificado por la API (TDD con 3 tests nuevos, 3 mutaciones detectadas, 71 tests en el scraper y 99 en la raíz); #54/#55 crons de fin de semana a `0 20 * * 6` y `0 20 * * 0` (21:00 CET) y tareas al día.
- **Cierre documental**: #56/#57 dejan `scraper-servidor-casa`, `forgot-password` y `next-jornada-improvements` como completadas. #66 añade la tarea futura `scraper-timer-servidor` (`status: todo`), ya en `develop` y todavía no en `main`.
- **Sesiones hijas**: desde esta sesión salieron `mejoras-ui-stats-ranking-admin` (#58–#61) y `posicion-por-jornada` (#62–#65), con sus propias tareas y diarios, ya en `main`.

### Decisions made
- **Opción A con medidas, no la B** (cron local con la clave de servicio en el servidor): así el historial de runs, los emails de fallo y los secretos se quedan en GitHub y la clave `service_role` no sale de ahí. Con un repo público un runner ejecuta lo que se le mande, de ahí las medidas: aprobación a forks, usuario sin privilegios, solo salida y `scraper.yml` nunca con `push` ni `pull_request`.
- **El esquema `backup_20261115` se conserva** ("por si acaso"); se borra solo cuando lo diga el usuario.
- **Un solo reparto de power-ups**: se quita el segundo porque lo disparó una jornada vacía, no un partido real.
- **Las tres tareas se cierran aunque quede algo sin verificar**: lo no verificado va a secciones de pendientes sin marcar como hecho, para que el cierre no diga más de lo que se comprobó.
- **El timer en el servidor se aplaza**: GitHub retrasa los crons de 3,5 a unas 8 h (el diario de las 08:00 UTC sale hacia las 15:00-16:00 UTC y el de las 20:00 UTC del 15-nov no se había visto a las 21:27 UTC). Recomendación dada: opción C (timer que solo lanza el workflow con un token limitado, así se conservan historial, emails y secretos). El usuario lo deja para más adelante y de momento siguen los crons de GitHub en el runner de casa.

### What's left
- **Primera escritura real desde el runner**: hasta ahora todos los runs fueron `nothing new`. El próximo partido de los Sharks debe escribir `historial` y puntuar desde `pablo-server`; si sale en rojo, reabrir la tarea.
- Mañana por la tarde, `gh run list --workflow scraper.yml --event schedule --limit 3` para comprobar que el run diario lo ejecuta `pablo-server`.
- Avisos: si la federación vuelve a renumerar el calendario y si el scraper falla (comprobar que GitHub envía el email de los runs fallidos).
- Marzo de 2027: pasar los crons de fin de semana a `0 19` (y volver a `0 20` en octubre), o resolverlo con el timer.
- Revisar `resolver_jornada`: calcula la jornada anterior de la racha con `numero <`, y la numeración de la federación no es cronológica (debería usar `orden`).
- La reconciliación de presupuesto (PR #27) sigue sin revisarse con datos reales.
- Borrar a mano la carpeta vacía `.worktrees/posicion-por-jornada`.
- `todo` es un estado nuevo para las tareas (el proyecto solo usaba `in-progress` y `done`).
