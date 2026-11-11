---
status: done
created: 2026-11-01
updated: 2026-11-11
---

# Mejoras para la próxima jornada

## Context
Con J7 ya resuelta y la J8 pendiente de que la federación publique la fecha del partido, el usuario quiere dejar listas cuatro mejoras antes de probarlo todo con la fecha ya publicada. Orden de prioridad del usuario:

1. Comprobar que en la próxima jornada **no se podrán fichar los mismos jugadores** que en la anterior, "como dice el manual".
2. Mostrar el **ranking completo**, no solo el top 10.
3. Añadir a **José Santapau** como entrenador (easter egg): no se puede fichar ni apostar por él, aparece en la lista de jugadores y tiene puntos infinitos. Solo visual.
4. Mostrar los fichajes del usuario en **formación de waterpolo** (como el fantasy antiguo), cada jugador en su posición, en "Mi equipo".

### Hallazgos de la lectura del código (2026-11-01, solo lectura, nada modificado)

**1. Regla de "no repetir fichajes": NO existe, ni en código ni en el manual.**
- Manual (`docs/MANUAL_DEL_JUEGO.md` líneas 50-51, idéntico en `docs/MANUAL_USUARIOS.md`): "No hay plantilla fija: se draftea de cero cada jornada, así que un mal resultado nunca te condena para el resto de la temporada."
- Manual (`MANUAL_DEL_JUEGO.md` líneas 304-306, sección 8; `MANUAL_USUARIOS.md` ~291-293): "El pool de jugadores es siempre el mismo para todos — no hay propiedad exclusiva, cualquiera puede fichar a cualquiera en cualquier jornada."
- Lo único con "sin repetir" es dentro de **un mismo 7** ("Exactamente 7 dorsales distintos, sin repetir", sección "Elegir tu 7").
- Código: `validarDraft` (`src/lib/draft.ts`) solo valida 7 distintos, capitán, composición y presupuesto; `Draft.tsx` guarda con un upsert por `(usuario_id, jornada)` sin mirar la jornada anterior; el trigger `alineaciones_composicion` (`20261022000001`) y las políticas RLS tampoco. Un usuario puede hoy repetir exactamente los mismos 7 en J8.
- El manual dice lo contrario de lo que cree el usuario. Hay que decidir con él: o se **implementa** la regla (cambio de reglas de juego + manual + validación en UI y en servidor), o se deja como está.

**2. Ranking.** `src/components/Ranking/Ranking.tsx`: `.limit(10)` en la línea 29 y el título "Top 10" en la línea 62. La política `usuarios_read_ranking` (`FOR SELECT TO authenticated USING (true)`) ya permite leer todos los usuarios. Los manuales dicen "top 10" (`MANUAL_DEL_JUEGO.md:296`, `MANUAL_USUARIOS.md:283`). Hay ~22 usuarios, así que no hace falta paginar.

**3. Entrenador.** `jugadores.pos` es `TEXT NOT NULL` (sin CHECK en las migraciones del repo); el tipo `Position` de TS es una unión de 5 posiciones. Puntos donde aparecería una fila de entrenador en `jugadores`: lista de Draft (`Draft.tsx`, filtra por posición), selects de goleador/expulsado en `Apuestas.tsx:290`, `Players.tsx` (ordena por `calcTotalPoints`), el `numero` es `UNIQUE NOT NULL`, scraper (`sync.ts:90`, empareja por `leverade_id`). El trigger de composición ya rechazaría en servidor cualquier 7 con una posición que no sea de las 5. Alternativa más simple y sin riesgo: una constante solo de frontend añadida a la lista de `Players.tsx` (sin fila en BD), con la foto en `public/jugadores/`.

**4. Formación.** Posiciones y composición fija (7 en el campo, sin banquillo; todos puntúan): 1 Portero, 2 Extremos, 2 Laterales, 1 Boya, 1 Contraboya (`COMPOSICION` en `src/lib/draft.ts`). "Mi equipo" (`Draft.tsx`, bloque `resumen-card`) enseña hoy los 7 en una rejilla plana (`mini-pool`). El **fantasy antiguo** (`Pool.tsx`, borrado en el commit `c3be946`, recuperable con `git show c3be946^:src/components/Dashboard/Pool.tsx`) dibujaba la piscina con 4 filas de arriba abajo: 1 arriba, 2 en la línea de 5 m, 3 en la de 2 m y el portero abajo, con línea de medio campo, líneas de 5 m y 2 m y portería. El CSS de ese diseño sigue en `src/index.css` (`.pool-container`, `.pool-row`, `.player-node`, `.goalkeeper-row`, líneas ~401-626).

## Goal
Antes de que se publique la fecha de la próxima jornada, tener resuelta la duda sobre los fichajes repetidos y desplegadas (vía `feature/` -> `develop` -> `main`) las mejoras de ranking completo, entrenador easter egg y formación en Mi equipo, para probarlas todo con la jornada ya abierta.

## Acceptance criteria
- [x] Fichajes repetidos: el capitán no puede repetirse respecto a la alineación anterior (y máx. 4 jugadores repetidos de 7): bloqueo en UI (`Draft.tsx`, incluido capitán tardío) y en servidor (trigger), tests en `draft.test.ts` y manuales actualizados. Decidir si el admin queda exento al editar. (Hecho: admin exento; trigger `alineaciones_repeticion` aplicado en producción tras probarlo en un bloque DO con rollback.)
- [x] Ranking completo: el ranking lista a todos los usuarios, ordenados por puntos, sin `limit(10)`; título y manuales (`MANUAL_DEL_JUEGO.md`, `MANUAL_USUARIOS.md`) actualizados; el modal de equipo sigue funcionando.
- [x] José Santapau aparece en la lista de Jugadores como "Entrenador" con puntos infinitos (∞), ordenado el primero.
- [x] José Santapau no se puede fichar (no sale en el Draft ni lo acepta el servidor) ni se puede apostar por él (no sale en goleador/expulsado), y no rompe el scraper, las cuotas ni los puntos. (Seguro por construcción: es una constante de frontend, no hay fila en BD.)
- [x] Mi equipo muestra los 7 fichajes en formación de waterpolo, cada jugador en su posición, con capitán marcado y tocar un jugador abre su ficha; se ve bien en móvil y en escritorio.
- [x] `npm run test`, `npm run lint` y `npm run build` en verde; probado en navegador. (89 tests; navegador en local, móvil y escritorio, con la alineación guardada real del usuario.)
- [x] Comprobado en producción tras el deploy: guardar con 5 repetidos o con el capitán anterior se rechaza en la UI, y la formación, el ranking completo y el entrenador se ven bien. (Hecho el 2026-11-11 en https://pablet06.github.io/Sharks-Fantasy/ con la sesión del usuario, solo lectura: formación con el capitán marcado; "Clasificación" con 24 filas y sin "Top 10"; José Santapau el primero de Jugadores como ENTRENADOR con ∞ pts; en "Cambiar Fichajes" el contador "Repetidos 4/4" y la ★ del capitán anterior deshabilitada. **No se forzó un 5.º repetido ni se guardó nada** para no tocar alineaciones reales: la barrera de servidor se comprobó el 2026-11-01 en un bloque DO con rollback y hoy el trigger `alineaciones_repeticion` sigue activo en producción.)

## Decisions (2026-11-01)
- **Rama:** `feature/next-jornada-improvements` desde `develop`.
- **Formación (punto 4):** piscina como el fantasy antiguo, pero con el orden ajustado el 2026-11-01 tras ver el ejemplo visual: Contraboya / 2 Laterales / Extremo + Boya + Extremo / Portero, con líneas de 5 m y 2 m y portería. Se recupera de `c3be946^:src/components/Dashboard/Pool.tsx`.
- **Entrenador (punto 3):** constante solo de frontend en `Players.tsx`, sin fila en la BD. Foto en el bucket privado `jugadores` (`entrenador-santapau.webp`, subida el 2026-11-01 desde la sesión admin; se pide con `signedPhotoUrl` de `src/lib/photos.ts`). Descripción "Leyenda" bajo el nombre en la ficha y etiqueta "Entrenador". Su ficha muestra ∞ y no tiene estadísticas; solo aparece en la pestaña Jugadores.
- **Fichajes repetidos (punto 1):** regla estricta descartada: el pool son 19 jugadores (2 Portero, 4 Lateral, 7 Extremo, 3 Boya, 3 Contraboya) y portero y laterales alternarían siempre sin elección. Decidido: **no se puede repetir capitán** respecto a la alineación anterior (también al cambiarlo con el power-up `capitan_tardio`, que hace `UPDATE capitan` en `Draft.tsx` y no pasa por el trigger de composición). Confirmado: además, máximo 4 jugadores repetidos de los 7 (hay que cambiar al menos 3).
- **Regla de repetidos (detalles):** el admin queda exento al editar alineaciones en Admin > Usuarios. Si el usuario no tuvo alineación anterior, no hay restricción.
- **Formación (detalles):** se usa en "Mi equipo" tanto al editar como en la vista de solo lectura; el modal "Cambiar Fichajes" mantiene la rejilla. Bajo cada jugador: el **precio** mientras se eligen fichajes y los **puntos** mientras se espera la nueva fecha.

## Open questions
Las preguntas originales (repetidos, formación y entrenador) están resueltas en Decisions. Siguen abiertas:
1. ~~¿Se anota la spec `docs/superpowers/specs/2026-09-11-fantasy-dinamico-design.md`?~~ Resuelta el 2026-11-11: sí, se añadió una nota bajo "Bucle semanal" con la regla de repetidos (la spec original queda intacta).
2. ~~Comprobar en producción la regla de repetidos, la formación, el ranking y el entrenador.~~ Hecho el 2026-11-11 (ver el último criterio de aceptación).
3. Opcional, sin hacer: redimensionar la foto del entrenador (235 KB).

## Sessions

### 2026-11-01

## Session Summary — 2026-11-01

**What was done:**
- Rama `feature/next-jornada-improvements`. PR #43 mergeado a `develop` (`0f2c161`) y PR de release #44 `develop` -> `main` mergeado (`6bc8e29`). El run "Deploy to GitHub Pages" 41353327504 (sha `6bc8e29`) seguía en curso la última vez que se miró; su resultado final NO se comprobó.
- Contexto encontrado: la próxima jornada es la "Jornada 2" de Fantasy = jornada 10 de la federación, partido el 2026-11-07 a las 17:00 UTC; los fichajes cierran el 2026-11-06 a las 18:00 (Europe/Madrid) y ya estaban abiertos. Las alineaciones ya guardadas no se revalidan.
- Hecho y verificado en local (89 tests, lint y build en verde; probado en el navegador en móvil y escritorio con la alineación guardada real del usuario):
  1. **Regla de repetidos** (`91d1215`, `273d4cb`). No se puede repetir el capitán de la alineación anterior y como máximo 4 de los 7 jugadores pueden repetirse. "Anterior" = la última alineación del usuario por `jornadas.orden` (no jornada-1). El admin queda exento; sin alineación anterior no hay restricción. UI: contador `Repetidos n/4`, estrella del capitán anterior deshabilitada, al llegar a 4 repetidos el resto de la alineación anterior queda bloqueado, y el selector del capitán tardío salta al capitán anterior. Servidor: migración `supabase/migrations/20261101000000_alineaciones_no_repetir.sql` (trigger `alineaciones_repeticion`; cubre también el `UPDATE capitan` del capitán tardío, solo comprueba lo que cambia en un UPDATE y no revalida filas existentes). Probada antes en un bloque DO con rollback en producción (5 repetidos bloqueado; 4 repetidos con otro capitán permitido; capitán repetido bloqueado en INSERT y en UPDATE de `capitan`; admin y service role exentos) y después APLICADA en producción con `apply_migration` (en el historial remoto tiene timestamp automático, nombre `alineaciones_no_repetir`).
  2. **Ranking completo** (`eee5dd6`): "Clasificación" lista a todos los usuarios en lugar del top 10.
  3. **Entrenador José Santapau** (`7311f23`): constante solo de frontend en `Players.tsx` (sin fila en BD, por tanto ni fichable ni apostable), puntos ∞, descripción "Leyenda", etiqueta "Entrenador". Foto `entrenador-santapau.webp` en el bucket PRIVADO `jugadores` (subida con la sesión admin del usuario desde el navegador integrado), servida con URL firmada (`signedPhotoUrl` en `src/lib/photos.ts`); no está en el repo público. La foto pesa 235 KB y se podría redimensionar.
  4. **Formación en "Mi equipo"**: Contraboya / 2 Laterales / línea de 5 m / Extremo + Boya + Extremo / línea de 2 m / Portero / portería. Precio bajo cada círculo mientras se eligen fichajes; puntos (x2 el capitán) mientras se espera la nueva fecha. Retoques posteriores: nombre y precio fuera del círculo (se recortaban), etiquetas de 5 m y 2 m encima de sus líneas, y el aviso "Cierra el…" encima de las tarjetas de puntos y presupuesto sin padding (clase `draft-cierre`).
  5. **Manuales** (`MANUAL_DEL_JUEGO.md`, `MANUAL_USUARIOS.md`) actualizados con la regla, el ranking y la formación (`81128b9`). El entrenador NO se menciona a propósito (easter egg).
- Documentación: plan en `.claude/plans/next-jornada-improvements.md` y explicación del mentor en `docs/learning/next-jornada-repetidos-y-formacion.md` (ambos sin trackear).

**Decisions made:**
- La regla de repetidos es un cambio de reglas del juego: el usuario creía que el manual prohibía repetir jugadores de la jornada anterior, pero decía lo contrario ("cualquiera puede fichar a cualquiera").
- Regla estricta "ningún jugador de la jornada anterior" descartada: el pool son 19 jugadores (2 Portero, 4 Lateral, 7 Extremo, 3 Boya, 3 Contraboya), así que portero y laterales alternarían sin elección; "todas las jornadas" sería imposible. Elegido: capitán distinto + máximo 4 repetidos.
- Entrenador como constante de frontend (seguro por construcción: no hay fila en BD que excluir en Draft, apuestas, scraper y cuotas). Foto privada, coherente con `fotos_privadas`, porque el repo es público.
- Lint: llamar a una función importada dentro de `toggleJugador` disparaba `react-hooks/purity` sobre un `Date.now()` ajeno; se quitó la guarda redundante (el botón ya se deshabilita con la misma comprobación; `validarDraft` y el trigger siguen siendo las barreras reales).
- Limitación conocida (comentario `ponytail:` en la migración): borrar la alineación intermedia por API, o dos escrituras simultáneas en jornadas vecinas, puede saltarse la comprobación. Mejora: trigger AFTER DELETE + `pg_advisory_xact_lock` por usuario. No hace falta para la próxima jornada.
- Feedback del usuario: no lanzar el `mentor` automáticamente (guardado en la memoria). Se escribió igualmente un documento del mentor.

**Open questions:**
- ¿Se anota la spec de diseño `docs/superpowers/specs/2026-09-11-fantasy-dinamico-design.md` (líneas 31-33: "draft desde cero" / "cualquiera puede fichar a cualquiera")? El usuario no lo ha decidido.
- Resultado final del deploy 41353327504: sin comprobar.

**Next steps:**
- (a) Cuando termine el deploy, comprobar en producción que guardar con 5 repetidos o con el capitán anterior se rechaza en la UI, y que la formación, el ranking y el entrenador se ven bien.
- (b) Decidir si se anota la spec de diseño.
- (c) Commitear los docs de esta sesión mediante un PR de docs a `develop` (+ release a `main`) como en sesiones anteriores. Sin trackear: este task file, `.claude/plans/next-jornada-improvements.md`, `docs/learning/next-jornada-repetidos-y-formacion.md` y los ficheros de cierre. `.claude/launch.json` y `.claude/plans/usuarios-admin-alineaciones.md` se quedan sin trackear a propósito.
- (d) Tras el partido del 2026-11-07: revisar puntuación y resolver, y las stats del scraper.
- (e) Opcional: redimensionar la foto del entrenador (235 KB).
- Sigue abierta `docs/tasks/scraper-servidor-casa.md` (`in-progress`): el endpoint `/match/<id>/stats` sigue sin probarse con una jornada real; el partido del 2026-11-07 es la siguiente ocasión, y si las descargas desde GitHub fallan con 520 el plan es el runner autoalojado (opción A). El servidor de desarrollo sigue en http://localhost:5174 apuntando a producción.

### 2026-11-11 (verificación en producción y cierre)

- Verificado en producción con la sesión del usuario, solo lectura (ver el último criterio de aceptación): formación, ranking completo, entrenador y contador "Repetidos 4/4" con la ★ del capitán anterior deshabilitada. No se guardó nada ni se forzó un 5.º repetido.
- Servidor (solo lectura): el trigger `alineaciones_repeticion` está activo en `alineaciones`, junto a `alineaciones_composicion` y `alineaciones_before_update_capitan_tardio`.
- El deploy 41353327504 queda irrelevante: `main` ha recibido despliegues posteriores en verde (p. ej. 43032704595 el 2026-11-11).
- La J2 (federación 10, partido del 2026-11-07) figura `finalizado` en `jornadas` (12-23); la J3 es la de la federación 2, el 2026-11-15 11:00 UTC, con fichajes abiertos hasta el 2026-11-14 12:00 (Europe/Madrid). Que las stats por jugador de la J2 se escribieran no está comprobado (es cosa de `scraper-servidor-casa`).
- Spec de diseño anotada con la regla de repetidos. Tarea cerrada como `done`.
