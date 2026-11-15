# Mejoras UI: stats de la ficha, Mi equipo, gráfica, admin y ranking — Plan

**Goal:** las cinco mejoras de `docs/tasks/mejoras-ui-stats-ranking-admin.md` (más el orden por `orden`) en `feature/mejoras-ui-stats-ranking-admin`, con TDD y sin escribir en producción.
**Approach:** todo en el cliente con funciones puras testeadas en `src/lib/`; sin migraciones, sin dependencias nuevas, una sola consulta nueva de solo lectura (`usuarios.puntos` en Draft).
**Estimated steps:** 7

## Estado de partida (comprobado el 2026-11-15)
- Ya estás en la rama `feature/mejoras-ui-stats-ranking-admin` y **hay trabajo sin commitear**: `sumarStats` + 4 tests en `src/lib/points.ts`/`points.test.ts`, y `src/lib/ranking.ts` (`posicionRanking`) + `ranking.test.ts` nuevos. Los pasos 1 y 3 parten de ahí (revisar, no reescribir).
- `calcPrecio` tiene **un único llamador**: `Draft.tsx:42`. `Players.tsx` y `Ranking.tsx` no calculan precio; solo abren `PlayerCard`, que ya tiene `useJornadas()` (`numero, orden`).
- `historial` es denso (una fila por jugador y jornada sincronizada, `partidos = 0` si no jugó; `scraper/src/sync.ts:139`), así que sirve de eje X sin tocar `useJornadas`.
- Vitest corre en `node` por defecto (`vite.config.ts`); los tests de componente necesitan `// @vitest-environment jsdom`. Este plan solo testea funciones puras; los componentes se verifican en el navegador.

## Step 1: Stats generales desde `historial` (bug 1)
- Files: `src/lib/points.ts`, `src/lib/points.test.ts`, `src/components/Dashboard/PlayerCard.tsx`
- Test (ya escrito): 1+2+1 goles en 3 jornadas -> 4 (la columna congelada tenía 1); filas densas no cuentan partido; `goles_contra` = 0; vacío = `EMPTY_STATS`. Comprobar que falla sin la función (rojo) antes de dar por bueno el verde.
- Code: en `PlayerCard`, `const s = sumarStats(jugador.historial ?? [])` en lugar de `jugador.stats`. Nada más.

## Step 2: Orden por `jornadas.orden` (1b)
- Files: `src/lib/precio.ts`, `src/lib/precio.test.ts`, `PlayerCard.tsx`, `Draft.tsx`
- Test primero: 6 entradas actuales con `numero` no cronológico (p. ej. 15, 18, 10, 2, 7, 4 con `orden` 1..6) y la más antigua por `orden` con 100 pts -> la ventana la excluye; sin `jornadas` cae a `numero` (los tests actuales siguen valiendo); `historial_anterior` sigue ordenándose por `numero` aunque se pase `jornadas`.
- Code: `calcPrecio(historial, anterior = [], jornadas = [])`; el sort de la temporada actual usa `etiquetaJornada(jornadas, e.jornada)`, el de `anterior` no cambia.
- Llamadores: `Draft` pasa `todasJornadas` (ya en estado; añadirlo a las deps del `useMemo` de `precios`). `PlayerCard` ordena "Por jornada" con `etiquetaJornada(jornadas, a.jornada) - etiquetaJornada(jornadas, b.jornada)`.

## Step 3: Posición en el ranking compartida
- Files: `src/lib/ranking.ts`, `src/lib/ranking.test.ts`, `src/components/Ranking/Ranking.tsx`
- Test: añadir el caso real (24 usuarios con 103×2, 88×2, 44×2) a los existentes.
- Code: en `Ranking.tsx`, `const pos = posicionRanking(ranking, u.puntos)`; medalla y clase si `pos <= 3` (`MEDAL[pos - 1]`, `RANK_CLASS[pos - 1]`), y `#${pos}` en el resto. Dos empatados en el 2.º llevan los dos plata.

## Step 4: Mi equipo — Puntos | Dinero lado a lado (Draft)
- Files: `src/components/Dashboard/Draft.tsx`, `src/index.css`
- Code: nuevo `useEffect` con `supabase.from('usuarios').select('id, puntos')` -> estado `puntosTodos: { puntos: number }[] | null`; posición = `posicionRanking(puntosTodos, usuario.puntos)`, oculta mientras carga o si falla. Envolver las dos tarjetas en `<div className="team-totales">`; dentro de Puntos, tras el `<strong>`, `<span className="team-posicion">#3</span>`. En `soloLectura` solo va Puntos y ocupa todo el ancho (sale solo con `flex: 1`).
- CSS: `.team-totales { display: flex; gap: 10px; align-items: stretch }`, `.team-totales > .team-total-pts { flex: 1 1 0; min-width: 0; padding: 14px 8px }` (a 375 px cada caja mide ~160 px y el `padding 24px` + `letter-spacing` no caben). Notas del bloque `bloqueada` (las tres `<p className="placeholder">` de las líneas ~357-366) con un modificador `.placeholder.draft-nota { padding: 4px 0 }`, mismo patrón que `.draft-cierre`.

## Step 5: Gráfica Puntos | Precio en la ficha
- Files: `src/lib/precio.ts`, `src/lib/precio.test.ts`, nuevo `src/components/Dashboard/EvolucionChart.tsx`, `PlayerCard.tsx`, `src/index.css`
- Test primero de `evolucionJugador(historial, anterior, jornadas): { orden: number; puntos: number | null; precio: number }[]`: ordena por `orden`; `puntos` = `null` si `partidos = 0`; `precio[i]` = `calcPrecio(historial hasta i, anterior, jornadas)`; el último `precio` === `calcPrecio(historial, anterior, jornadas)` (el del Draft); jornada no jugada -> precio igual al anterior; historial vacío -> `[]`. Va en `precio.ts` (es precio derivado) para no crear otro fichero de lib.
- Componente: SVG a mano con `viewBox` y `width: 100%`; dos botones (`filter-chip`, el activo con `active-all`) "Puntos | Precio". Puntos = barras (negativas bajo la línea de 0, `--success`/`--error`); jornada no jugada = sin barra y "–" en la etiqueta. Precio = polilínea con puntos (`--accent`), eje Y de mín a máx de la serie. Eje X: `J{orden}`. Con < 2 jornadas en la serie no se dibuja: `<p className="placeholder draft-nota">La gráfica aparece a partir de la 2.ª jornada.</p>`.
- En `PlayerCard`, debajo de TOTAL: `<EvolucionChart serie={evolucionJugador(jugador.historial ?? [], jugador.historial_anterior ?? [], jornadas)} />`. Vale para el modal y para el panel inline de escritorio (`Players.tsx:140`).

## Step 6: Admin — "Usuarios con plantilla: X/Y"
- Files: `src/lib/draft.ts`, `src/lib/draft.test.ts`, `src/components/Admin/UsuariosAdmin.tsx`
- Test primero de `contarConPlantilla(usuarios, alineaciones, jornada): { con: number; total: number }`: `total` = todos los usuarios; cuenta solo alineaciones de esa jornada con `jugadores` no vacío y de usuarios presentes en la lista; una alineación vacía o de otra jornada no cuenta; un usuario con dos filas no cuenta doble. En `draft.ts` porque `UsuariosAdmin` ya lo importa.
- Code: bajo el topbar, `<p>Usuarios con plantilla: {con}/{total}</p>` y `<progress value={con} max={total} />`, con `data.usuarios` completo (no `visibles`) y `jornadaSel`.

## Step 7: Manuales y cierre
- `docs/MANUAL_USUARIOS.md` y `docs/MANUAL_DEL_JUEGO.md` sí lo mencionan: Mi equipo (~l. 82/94, posición `#N` junto a los puntos), Ranking (§7: empates comparten puesto), Jugadores/ficha (§8: estadísticas sumadas del historial y gráfica); `MANUAL_DEL_JUEGO` además Admin > Usuarios (contador).
- `npm run test -- --run`, `npm run lint`, `npm run build` en verde.

## Verificación en el navegador (solo lectura: `.env` = PRODUCCIÓN)
- `npm run dev` (http://localhost:5173). **El usuario inicia sesión él mismo**; nadie pulsa Guardar, Cambiar Fichajes > Guardar, el selector de capitán tardío, los checkboxes de Admin ni escribe en los nombres de Admin > Usuarios (guardan en `onBlur`). Cambiar el selector de jornada de Admin sí es inocuo.
- En 375 px (`mobile`) y escritorio: Mi equipo con dos cajas a la misma altura y `#N` coherente con Clasificación (incluido un usuario empatado); en "Esperando fecha" solo Puntos a todo el ancho y el pool más arriba. Ficha de Carlos Ferrer, Pablo Ferrer y Luca Di Lorenzo: 4 goles, "Por jornada" J1, J2, J3, gráfica en ambos modos y último precio = precio del Draft. Admin > Usuarios: J orden 1/2/3 -> 19/24, 18/24, 17/24 (cifras del task file; confirmar con SQL de solo lectura si no cuadra).

## Commits sugeridos (conventional, en inglés)
1. `fix(player-card): sum general stats from historial instead of stale jugadores.stats`
2. `fix: order player history and price window by jornadas.orden`
3. `feat(ranking): shared competition-ranking position with ties`
4. `feat(draft): show points, money and ranking position side by side`
5. `feat(player-card): add points/price evolution chart`
6. `feat(admin): show users-with-lineup counter for the selected jornada`
7. `docs: update manuals for ranking position, player chart and admin counter`

Luego PR -> `develop` (cuerpo: la causa del bug 1 NO es la renumeración, es que nada llama a `recalc_puntos()` tras el scraper) y PR de release `develop` -> `main`. El usuario aprueba cada merge.

## Acceptance Criteria
- [ ] `sumarStats` testeado (rojo antes, verde después) y la ficha enseña 4 goles a Carlos Ferrer, Pablo Ferrer y Luca Di Lorenzo
- [ ] "Por jornada" y la ventana de `calcPrecio` ordenan por `orden`, con test de > 5 jornadas desordenadas por `numero`; `historial_anterior` sin cambios
- [ ] Clasificación y Mi equipo dan la misma posición, con empates 1, 2, 2, 4 y medallas por posición
- [ ] Mi equipo: Puntos (con `#N`) | Dinero a la misma altura; solo Puntos a todo ancho en solo lectura; notas con menos padding; OK en 375 px y escritorio
- [ ] Gráfica Puntos | Precio en modal y panel inline; último precio = precio del Draft; con < 2 jornadas muestra el aviso
- [ ] Admin > Usuarios muestra "Usuarios con plantilla: X/24" con `<progress>` para la jornada del selector, función testeada
- [ ] Sin dependencias nuevas, sin escrituras en producción, sin tocar `backup_20261115` ni los tres ficheros sin trackear
- [ ] `npm run test`, `npm run lint`, `npm run build` en verde; manuales actualizados
