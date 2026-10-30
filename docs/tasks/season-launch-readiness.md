---
status: done
created: 2026-10-22
updated: 2026-10-30
---

# Season launch readiness

## Context
La temporada 26-27 empieza el sábado 2026-10-24 (jornada 7 de la federación = "Jornada 1" del Fantasy, 13:45 UTC). Los usuarios deben poder entrar y jugar. Competición: https://waterpolo.fncv.es/es/tournament/1344408/summary (Primera División Masculina 26-27, 9 equipos, incluye "C.W. Sharks A").

Estado inicial (2026-10-22): `main` iba 60 commits por detrás de `develop`, `config.tournament_id` seguía en la 25-26 y la base tenía datos de la temporada pasada.

## Goal
Producción en la última versión de `develop` con la 26-27 configurada: registro y login funcionando, usuarios fichando y apostando, y el scraper ingiriendo resultados del torneo 1344408.

## Acceptance criteria
- [x] Estrategia de reseteo decidida y aplicada: sin archivo (a petición); historial, jornadas y tablas fantasy vaciados, usuarios a 0 con `equipo = {}`, stats a cero
- [x] Roster 26-27 cargado (19 jugadores: bajas Álvaro Mayordomo y César Paredes; altas Antonio, José Almódovar, Luca y Ackermann) y `leverade_id` de los 19 actualizado a los ids de la 26-27
- [x] `config.tournament_id = 1344408`
- [x] Scraper verificado contra el torneo 1344408; arreglado el partido de descanso que tumbaba cada jornada con HTTP 520 (PR #9/#10); `workflow_dispatch` en verde
- [x] Segundo cron de reintento (domingo 22:00 UTC) además del del sábado (PR #16/#17)
- [x] `develop` -> `main` mergeado y deploy en verde; producción con el Fantasy v2 (PR #8, #13, #15, #17)
- [x] Registro, login y fichajes probados en producción (cuenta de pruebas "Pablo 2")
- [x] Fantasy v2 desplegado: numeración `orden`, bloques informativos, composición obligatoria (trigger), precios desde la 25-26 (base 50, multiplicador 22) y cuotas con prior de la 25-26
- [x] Favicon / icono de pantalla de inicio (iOS y Android) desplegado (PR #14/#15)
- [x] Variables de entorno y RLS de producción revisadas tras el deploy (2026-10-30, ver "Revisión de producción")
- [x] Decidir qué hacer con los cambios locales sin commitear de `CLAUDE.md` (restaurado a la versión del repo el 2026-10-25; `git diff` vacío)

### Antes del cierre del draft (vie 2026-10-23, 13:45 UTC)
- [x] Probar la interfaz con sesión iniciada (Mi equipo, Apuestas, Power-ups, en todos sus estados)
- [x] Reinstalar el acceso directo en el móvil para ver el icono nuevo
- [x] Decidir qué hacer con la cuenta de pruebas "Pablo 2"
- [x] Avisar a los usuarios de que tienen que volver a fichar para la jornada 7

Marcado como completado por el usuario; no verificado por Claude (requiere sesión iniciada y un móvil).

### Tras el partido (sáb 24 y dom 25)
Verificado el 2026-10-30 contra producción:
- [x] El workflow `Weekly Stats Sync` sale en verde: todos los runs programados desde el 2026-10-25 en `success`; solo fallaron 2 `workflow_dispatch` manuales (HTTP 520)
- [x] `config.unmatched_players` vacío (`[]`)
- [x] El ranking tiene puntos y las apuestas de la jornada están resueltas: 19 de 22 usuarios con puntos (los 3 sin alineación en J7 se quedan a 0), alineaciones 19/19 puntuadas, apuestas 34/34 resueltas, J7 `finalizado` (pierde)
- [x] Si la jornada siguiente aún no tenía fecha al resolver: no aplica, la J8 todavía no existe en `jornadas` (la app muestra "Esperando fecha")

### Revisión de producción (2026-10-30)
Solo lectura, proyecto Supabase `sharks-fantasy`.
- **RLS:** las 12 tablas de `public` tienen RLS activo y políticas. Configuración, jornadas, jugadores, historial y presupuestos solo los escribe el admin; el dueño solo escribe su `alineaciones`, `apuestas` y `powerups_aplicados`, y solo con fecha de partido; `usuarios` solo permite insertar/actualizarse a uno mismo con `is_admin = false` (y `puntos = 0` al insertar). Storage `jugadores`: lectura solo autenticados, escritura solo admin.
- **Funciones:** `resolver_jornada` ya no la puede ejecutar `anon`; `resolver_jornada` y `recalc_puntos` tienen guarda de admin. Siguen ejecutables por `anon` `is_admin` (la necesitan las políticas), `recalc_puntos` y `powerups_aplicar` (avisos del advisor, riesgo bajo).
- **Edge function** `delete-account`: activa, v3, `verify_jwt = true`.
- **Variables:** los 5 secrets que usan los workflows existen en GitHub. `.env` local con las mismas 4 claves que `.env.example`, ignorado por git y apuntando a producción. `VITE_ADMIN_HASH` se inyecta en `deploy.yml` pero ya no lo lee nada del código (resto del acceso admin antiguo): se puede quitar del workflow y borrar el secret.
- **Scraper:** el run diario del 2026-10-30 escribió `config.last_sync_at` (14:46:24 UTC) con `SUPABASE_SERVICE_ROLE_KEY` de GitHub: la clave sí escribe. Ojo: desde J7 todos los runs son "nothing new", así que la descarga de estadísticas de un partido desde las IPs de GitHub no se ha vuelto a probar (el 520 de J7 puede repetirse en la próxima jornada; ver `scraper-servidor-casa`).

### Pendientes al cerrar (2026-10-30)
Tarea cerrada como `done`; lo siguiente no bloquea el lanzamiento y queda como notas:
- **«Confirm email»** de Supabase Auth sigue desactivado, y el **Site URL** de Auth sin revisar (Authentication > URL Configuration). Decisión del usuario.
- **Protección contra contraseñas filtradas** desactivada (opcional; depende del plan de Supabase).
- **`.claude/launch.json`** sin trackear: ignorarlo en `.gitignore` o borrarlo.
- **`VITE_ADMIN_HASH`**: quitarlo de `deploy.yml` (PR) y borrar el secret de GitHub (`gh secret delete VITE_ADMIN_HASH`). Ya no lo lee nada del código.
- **Endurecimiento opcional:** `REVOKE EXECUTE ... FROM anon` en `recalc_puntos()` y `powerups_aplicar()` (migración; `is_admin` debe seguir ejecutable porque la usan las políticas).
- **Scraper y IPs de GitHub:** la descarga de estadísticas de un partido no se ha vuelto a probar desde J7; seguimiento en `scraper-servidor-casa`. El secret `SUPABASE_SERVICE_ROLE_KEY` de GitHub ya está comprobado (escribe `config.last_sync_at`).

## Riesgos conocidos
- Precios de porteros calculados suponiendo 8 goles encajados por partido en la 25-26 (la captura no traía ese dato).
- `presupuesto_usado` y el coste de la alineación solo se validan en el navegador; no hay comprobación en el servidor (la composición sí tiene trigger).
- Cuotas acotadas a ×1,2 a ×2,1: casi todo queda en ×2,1; subir el tope cambia una regla publicada.
- «Confirm email» de Supabase Auth desactivado temporalmente.

## Sessions
- 2026-10-30: revisión de producción en solo lectura (RLS, permisos de funciones, storage, edge function, variables y secrets) y comprobación del bloque "Tras el partido" con datos reales; sin hallazgos graves. Tarea cerrada como `done`; pendientes anotados en "Pendientes al cerrar".
- 2026-10-22: reseteo de la 25-26, roster, fix del scraper (descanso), Fantasy v2 (PR #8 a #17), migraciones aplicadas en producción (`orden` + resolver, composición, `historial_anterior`, `cuotas_previas`), favicon móvil, cron del domingo y `leverade_id` de la 26-27. Registro: el enlace de confirmación llevaba a `pablet06.github.io/` (404, Site URL mal al enviarse); decisión del usuario: «Confirm email» desactivado temporalmente. Rama de cierre: `feature/docs-registro` (mensaje del registro y documentación).

### 2026-10-22 (resumen final de sesión)

**Qué se hizo:**
- Reseteo de la 25-26 en producción (sin archivo, a petición): historial, jornadas y tablas fantasy vaciados, usuarios a 0 con `equipo = {}`; roster de 19 (bajas Álvaro Mayordomo y César Paredes; altas Antonio, José Almódovar, Luca, Ackermann); `leverade_id` de los 19 actualizado a los ids de la 26-27 (son ids de inscripción por temporada); `tournament_id = 1344408`.
- Scraper: arreglado el partido de descanso (sin local/visitante, `finished=true`, `/stats` devolvía HTTP 520 y tumbaba la jornada) (PR #9/#10). Arreglado que las fechas de Leverade son UTC y se guardaban como Europe/Madrid (partidos 1-2 h antes) (PR #21/#22); jornada 7 corregida a mano en prod. Segundo cron el domingo 22:00 UTC como reintento (PR #16/#17).
- Fantasy v2 en `main` (PR #8, #11-#13, #15, #18-#24) con migraciones aplicadas en prod: `20261022000000` (`jornadas.orden`, `resolver_jornada` financia por `orden` y `REVOKE EXECUTE` a `anon`: `anon` podía llamar a `resolver_jornada`), `000001` (trigger `alineaciones_composicion`: 1 Portero, 2 Extremos, 2 Laterales, 1 Boya, 1 Contraboya), `000002` (`historial_anterior`), `000003` (`cuotas_previas` + `cuota_actual` con prior de la 25-26, peso 5 partidos virtuales), `000004` (`ON DELETE CASCADE` en 5 FK a `usuarios`; borrar cuentas con datos fallaba).
- UI: numeración "Jornada N", bloques informativos y modales de edición en Mi equipo / Apuestas / Power-ups, bloque de puntos (amarillo) y dinero (verde), precio y posición por fichaje, contadores de composición.
- Registro: el enlace de confirmación daba 404 (Site URL mal); "Confirm email" desactivado temporalmente; `SignupForm` ya no muestra "Revisa tu email" si `signUp` devuelve sesión.
- Iconos de pantalla de inicio (apple-touch-icon, manifest, maskable, `logo.ico` multi-tamaño) (PR #14/#15).
- Docs: `docs/MANUAL_DEL_JUEGO.md` actualizado, nuevo `docs/MANUAL_USUARIOS.md` (solo jugadores), ADR-005..007 en `docs/ADRs.md`.
- Security advisor de Supabase ejecutado: sin hallazgos graves.
- Marcado como hecho por el usuario (no verificado por Claude): prueba de la UI con sesión, acceso directo reinstalado, decisión sobre "Pablo 2" (borrada con el fix #23/#24), aviso a usuarios para volver a fichar en la jornada 7.

**Decisiones:**
- Precios: base 50, multiplicador 22 (mejor 7 válido ~1088 frente a presupuesto 1000); precios iniciales desde los totales 25-26 que dio el usuario en captura (Cloudflare 429 bloqueó la recarga por partido incluso desde GitHub Actions), guardados como 5 partidos virtuales por jugador; supuesto de 8 goles encajados por partido para porteros.
- Cuotas: los Sharks perdieron todos los partidos 25-26 (dato del usuario), prior de resultado pierde=1 / gana=0 / empata=0; goleador y expulsado por simulación; tope ×1,2 a ×2,1 mantenido (casi todo ×2,1).
- Confirm email desactivado temporalmente en vez de arreglar el Site URL.

**Preguntas abiertas:**
- ¿Reactivar "Confirm email" (y corregir Site URL)?
- ¿Qué hacer con el cambio local de `CLAUDE.md`? Además `.claude/launch.json` sin trackear (lo creó la herramienta de preview): ignorar o borrar.
- Protección contra contraseñas filtradas (leaked-password) desactivada en Supabase Auth (opcional).
- Advisor: avisos de bajo riesgo (`is_admin`, `recalc_puntos`, `powerups_aplicar` ejecutables por `anon` pero con guarda). Variables de entorno y RLS de producción: solo se pasó el advisor, falta la revisión completa.

**Próximos pasos:**
- Tras el partido del sábado: comprobar el workflow `Weekly Stats Sync`, `config.unmatched_players` vacío, ranking con puntos; "Reprocesar jornada" si la siguiente no tenía fecha. Reintento del cron el domingo.
- Decidir lo de `CLAUDE.md` y `.claude/launch.json`.
- Riesgos: supuesto de 8 goles para porteros; `presupuesto_usado`/precio solo validados en cliente (proponer trigger en servidor como el de composición); tope de cuotas; GitHub Actions estuvo degradado esta tarde (build de Pages en cola mucho rato, el sitio ya estaba activo).
