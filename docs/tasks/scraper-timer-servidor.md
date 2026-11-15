---
status: todo  # tarea futura, aplazada por el usuario el 2026-11-15; de momento se sigue con los crons de GitHub Actions en el runner de casa
created: 2026-11-15
updated: 2026-11-15
---

# Timer en el servidor de casa para lanzar el scraper a su hora

## Context
Desde el 2026-11-15 el scraper corre en un runner autoalojado en `pablo-server` (ver
`docs/tasks/scraper-servidor-casa.md`), lanzado por los crons de GitHub Actions
(`.github/workflows/scraper.yml`). El problema es que GitHub no garantiza la hora de los crons y en
este repo llegan con muchas horas de retraso. Runs programados del 2026-11-11 al 15: el cron diario
de las 08:00 UTC salió entre las 14:42 y las 16:29 UTC; el del sábado a las 22:00 UTC salió a las
01:31 UTC del domingo. El cambio de los crons de fin de semana a las 20:00 UTC (21:00 CET), hecho
el 2026-11-15, aún no se había visto ejecutar a las 21:27 UTC. Por tanto la hora de las 21:00 es
solo orientativa.

El usuario decidió el 2026-11-15 **dejar esto para el futuro y seguir como hasta ahora** (crons de
GitHub Actions ejecutados en el runner de casa).

## Goal
Que el scraper se lance a la hora exacta (21:00 hora de Madrid los fines de semana y 08:00 el
diario) y sin retocar los crons en marzo y octubre por el cambio de hora, conservando todo lo que
se pueda del historial de runs y de los avisos de fallo de GitHub.

## Options
Son las dos opciones que se comentaron el 2026-11-15 (en `scraper-servidor-casa` se llamó B a la
primera). La diferencia clave es qué credencial guarda el servidor.

- **B. El timer ejecuta el sync él mismo.**
  1. Usuario propio sin privilegios, distinto de `ghrunner` (si no, los jobs del runner podrían
     leer lo que guarde), con un clon del repo (público, sin credenciales) y `npm ci` en `scraper/`.
     Node 24 instalado en su carpeta: el servidor tiene el 22 y el workflow usa el 24.
  2. Un fichero `env` con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, permisos `600`. Es el gran
     cambio de seguridad: hoy esa clave (admin total de la base de datos) solo vive en los
     secretos de GitHub.
  3. Servicio `oneshot` que hace `git pull --ff-only`, `npm ci` y `npm run sync:prod`.
  4. Timer de systemd, p. ej. `OnCalendar=Sat,Sun *-*-* 21:00:00 Europe/Madrid`,
     `OnCalendar=*-*-* 08:00:00 Europe/Madrid` y `Persistent=true` (ejecuta lo perdido si el
     servidor estaba apagado). Con la zona `Europe/Madrid` desaparece el cambio de marzo/octubre.
  5. Quitar el bloque `schedule` de `scraper.yml` (dejar `workflow_dispatch`).
  - Costes: sin historial de runs ni emails de GitHub; logs en `journalctl --user`; el aviso de
    fallo hay que construirlo (`OnFailure=` más Telegram, ntfy o email); el código del servidor se
    actualiza con `git pull` de `main`.
- **C. El timer solo lanza el workflow en GitHub** (equivalente a `gh workflow run scraper.yml`
  por la API); el trabajo sigue en el runner con los secretos de GitHub. El servidor guarda solo un
  token fine-grained limitado a este repo con "Actions: write" (lo crea el usuario en GitHub; no
  se comparte con Claude), en un usuario distinto del runner.
  - A favor: se conservan historial de runs, emails de fallo y secretos en GitHub; se gana la
    puntualidad y la hora de Madrid; la credencial del servidor vale mucho menos que la clave
    `service_role`.
  - En contra: hay que renovar el token (máx. 1 año) y depende de GitHub. **Matiz:** el token no
    puede restringirse por argumentos, y `workflow_dispatch` admite el input `args`
    (`--backfill`, `--jornada N`...). Si se filtrara, alguien podría lanzar un `--backfill` que
    sobrescribiera la temporada. Tratarlo como una credencial con ese poder.
  - También hay que quitar el bloque `schedule` de `scraper.yml`.

**Recomendación dada el 2026-11-15: C**, porque se busca puntualidad y no independencia de GitHub.
B solo compensa si se quiere que el sync funcione aunque GitHub falle.

## Decision
Aplazada por el usuario el 2026-11-15. No se hace nada ahora: se mantienen los crons de GitHub
Actions (`0 20 * * 6`, `0 20 * * 0` y `0 8 * * *`, en UTC) ejecutados en el runner de casa.

## Acceptance criteria
Se concretarán al elegir la opción.
- [ ] Elegir B o C (con el usuario)
- [ ] El scraper se lanza a la hora exacta: 21:00 hora de Madrid los fines de semana y 08:00 el
      diario, comprobado en un fin de semana real
- [ ] El cambio de hora (marzo y octubre) no requiere tocar nada
- [ ] Quitado el bloque `schedule` de `scraper.yml` (un solo disparador; ver Notes)
- [ ] Aviso de fallo funcionando (email de GitHub en C; mecanismo propio en B)
- [ ] Documentado en `docs/tasks/scraper-servidor-casa.md` (sección Runner) cómo queda montado

## Notes
- **No dejar dos disparadores a la vez.** Si el timer y el cron de GitHub corrieran a la vez,
  `resolver_jornada` podría repartir los power-ups dos veces (lee `finalizado` al empezar y reparte
  cuando el nº de jornadas finalizadas es múltiplo de 3). Ya pasó el 2026-11-15 por otra causa; ver
  `scraper-servidor-casa`.
- Comprobar en el servidor que su systemd acepta la zona horaria en `OnCalendar`:
  `systemd-analyze calendar "Sat,Sun *-*-* 21:00:00 Europe/Madrid"`.
- Estado del servidor (2026-11-15): Ubuntu 26.04, Node 22, `sudo` con contraseña, Docker. El
  runner vive en el usuario `ghrunner` (sin `sudo` ni `docker`), servicio de usuario con `linger`.
- Pendiente de comprobar, ya con los crons actuales: que el run diario del 2026-11-16 (llegará
  hacia las 15:00-16:00 UTC) lo ejecute `pablo-server`, y cuándo salta el de las 20:00 UTC.

## Sessions

### 2026-11-15

- Tarea creada tras ver que GitHub retrasa los crons de 3,5 a ~8 h. Se explicaron las opciones B
  y C y el usuario decidió dejarlo para el futuro y seguir como hasta ahora.
