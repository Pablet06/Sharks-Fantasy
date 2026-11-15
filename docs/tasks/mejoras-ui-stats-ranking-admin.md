---
status: done
created: 2026-11-15
updated: 2026-11-15
---

# Mejoras de UI: stats de la ficha, Mi equipo, gráfica, admin y ranking

## Context
Tras la J3 (Castelló, 2026-11-15) el usuario ha pedido cinco mejoras sobre la app. Una es un fallo real (las estadísticas generales de la ficha de un jugador no cuadran con el historial) y las otras cuatro son mejoras de interfaz. Hay tres jornadas finalizadas (federación 15, 18 y 10 = "Jornada 1", "2" y "3" del Fantasy) y 24 usuarios (1 admin).

Contexto importante: el 2026-11-15 se migró la base de datos a la **nueva numeración de la federación** (la federación recreó el calendario el 13-nov; ver `docs/tasks/scraper-servidor-casa.md`). Desde entonces `jornadas.numero` **no es cronológico** (15 = 24-oct, 18 = 7-nov, 10 = 15-nov): el orden real es `jornadas.orden`. **Nunca se ordena por `numero`.**

Las cinco peticiones:
1. **Bug**: las estadísticas generales de la ficha de cada jugador están mal (ejemplo: un jugador con 4 goles muestra 1).
2. **UI "Mi equipo"**: puntos y dinero lado a lado, a la misma altura (dos rectángulos); el texto inferior ("Última jornada (Jornada 3) — 5 pts") con menos padding para que el cuadro de fichajes quede más arriba. Comprobar en 375 px y en escritorio.
3. **Gráfica en la ficha** de cada jugador con la evolución de puntos y dinero.
4. **Panel admin (Usuarios)**: indicador visual de cuántos usuarios han firmado alineación, p. ej. "Usuarios con plantilla: 16/19".
5. **Posición en el ranking** del usuario en "Mi equipo", reutilizando la lógica de `Ranking.tsx` (usuarios por `usuarios.puntos`).

### Hallazgos de la lectura del código y de la base (2026-11-15, solo lectura, nada modificado)

**Ruta real:** "Mi equipo" está en `src/components/Dashboard/Draft.tsx` (no existe `src/components/Draft/`). Los estilos están en `src/index.css` (`.team-total-pts`, `.team-puntos`, `.team-dinero`, `.placeholder`, `.resumen-card`).

**1. Stats generales mal: causa confirmada con SQL de solo lectura, y NO es la renumeración.**
- "Estadísticas generales" de `PlayerCard.tsx` lee `jugador.stats`, la columna `jugadores.stats`: un agregado desnormalizado. Solo se refresca con la RPC `recalc_puntos()`, que es solo de admin (`is_admin(auth.uid())`) y se lanza a mano desde Admin > Sync / Historial / Temporada.
- El scraper (`scraper/src/sync.ts`) hace upsert de `historial` y llama a `resolver_jornada`, pero **nunca** a `recalc_puntos()` (con la clave de servicio no pasaría la guarda de admin), y `resolver_jornada` no escribe `jugadores.stats`. Resultado: la columna se queda en el último recálculo manual, mientras que el TOTAL de la ficha (`calcTotalPoints(historial)`) y "Por jornada" se calculan en vivo y sí están al día.
- Comprobación contra producción (columna frente a `SUM(historial.stats)`): Carlos Ferrer (#6) 1 gol vs 4, Pablo Ferrer (#13) 1 vs 4, Luca Di Lorenzo (#18) 1 vs 4, Antonio García (#3) 1 vs 3, Bruno Pomara (#5) 0 vs 2; en casi todos `partidos` 1 vs 3.
- **No depende de la numeración de jornadas**: la suma recorre todas las filas de `historial` sin mirar `jornada`, así que renumerar no la altera. Lo que ha ocurrido es que ni el sync local de J10 ni la migración dispararon el recálculo (y nunca se disparaba solo tras un sync).
- Único lector de `jugador.stats` en `src/`: `PlayerCard.tsx:33` (el resto son escrituras de admin). Opciones de arreglo:
  - **A (recomendada)**: función pura `sumarStats(historial)` en `src/lib/points.ts` (como `calcTotalPoints`) y que `PlayerCard` calcule las generales desde `jugador.historial`. Sin migración ni escrituras en producción; nunca se queda atrasado. `goles_contra` acumulado = 0 por diseño (es una cifra por partido; la ficha ya no lo muestra en las generales).
  - B: trigger en BD sobre `historial` que llame a la agregación. Más pesado: migración en producción, para una columna que solo lee un componente.
- **Hallazgo relacionado con la renumeración (visible hoy)**: `PlayerCard.tsx` ordena "Por jornada" con `a.jornada - b.jornada` (por `numero`), así que se ve J3, J1, J2. Y `src/lib/precio.ts` (`jugadas`) toma las "últimas 5" ordenando por `jornada` (`numero`) descendente: hoy no afecta (hay 3 jornadas, caben todas), pero fallará al pasar de 5. Ambos deberían usar `jornadas.orden`.

**2. Mi equipo.** En `Draft.tsx` (~líneas 342-352) los puntos (`team-total-pts team-puntos`) y el dinero (`team-total-pts team-dinero`) son dos tarjetas apiladas a todo el ancho; el dinero solo se pinta si `!soloLectura`. El texto "Última jornada (Jornada N) — X pts" es un `<p className="placeholder">` con el `padding: 40px` global; `.placeholder.draft-cierre { padding: 0 }` ya es el precedente de cómo quitárselo.

**3. Gráfica: qué datos hay.**
- `historial` guarda por jugador y jornada `puntos` y `stats` (temporada actual; clave `jugador_id, jornada`). `historial_anterior` es la temporada pasada (solo para el precio). Hay ≤ 3 jornadas finalizadas.
- **No existe historial de precios**: ni tabla ni columna. El precio se calcula al vuelo con `calcPrecio(historial, anterior)` (media de las últimas 5 jornadas jugadas, ventana mixta con la temporada anterior, × `MULTIPLICADOR_PRECIO` = 22, mínimo 50 €).
- Se podría **derivar** una serie de precio re-aplicando `calcPrecio` con el historial hasta cada jornada (ordenada por `orden`). Es dato real derivado, no inventado, pero no es un precio "registrado": si se recalibra el multiplicador, la serie pasada cambia.
- No hay librería de gráficas instalada (dependencias: react, react-dom, supabase-js). Una gráfica simple se haría con SVG a mano, sin dependencia nueva.

**4. Admin Usuarios.** `UsuariosAdmin.tsx` ya tiene selector de jornada (`jornadaSel`, por defecto `jornadaEnCurso ?? ultimaJornadaResuelta`, la misma que ve el jugador en Mi equipo) y `data.alineaciones` carga todas las alineaciones, así que el contador se puede calcular sin consultas nuevas. Hoy no hay ninguna jornada abierta: las tres con fecha están finalizadas y la J4 aún no tiene fecha publicada; por eso "la próxima abierta" no sirve como única referencia. Totales hoy: 24 usuarios, 1 admin. Alineaciones con 7 jugadores: 19 (J orden 1), 18 (J orden 2), 17 (J orden 3).

**5. Ranking.** `Ranking.tsx` ordena `usuarios` por `puntos` descendente y numera por índice (`#{i + 1}`), sin tratar empates. Hay 24 usuarios y solo **21 valores distintos de `puntos`**: ya hay empates, así que importa cómo se tratan. La política `usuarios_read_ranking` deja a cualquier usuario autenticado leer a todos. `Draft.tsx` solo recibe `usuario.puntos` del propio usuario, así que necesita leer los puntos del resto.

## Goal
Las cinco mejoras funcionando y verificadas en el navegador (móvil de 375 px y escritorio), desplegadas por la vía habitual (`feature/` -> `develop` -> `main`), sin escribir en producción más allá del deploy de la propia web: las estadísticas generales de cada ficha coinciden con la suma de su historial, "Mi equipo" muestra puntos y dinero lado a lado con el cuadro de fichajes más arriba y la posición en el ranking, la ficha tiene una gráfica de evolución y el panel admin enseña cuántos usuarios han firmado alineación.

## Acceptance criteria
- [x] **1. Stats generales**: `sumarStats` con test que reproduce el fallo (1+2+1 goles frente a la columna congelada con 1); `PlayerCard` calcula las generales desde `historial`. Verificado con sesión real: Pablo Ferrer 3 partidos y 4 goles, Carlos Ferrer 4 goles, Luca Di Lorenzo 4 goles. **La causa NO es la renumeración**: nada recalcula `jugadores.stats` tras el scraper (la columna quedó en el último recálculo manual, la jornada 1).
- [x] **1b. Orden por `orden`**: "Por jornada" de la ficha (verificado: J1, J2, J3) y la ventana de `calcPrecio` (solo temporada actual), con tests de más de 5 jornadas desordenadas por `numero`
- [x] **2. Mi equipo**: fila `team-totales` con Puntos | Dinero a la misma altura, posición `#N` dentro de Puntos, notas sin padding global; solo Puntos a todo ancho en "Esperando fecha". Verificado en 375 px y escritorio. **Matiz:** hoy no hay jornada abierta, así que la fila de dos rectángulos (Puntos | Dinero) se comprobó con una página temporal con el mismo CSS y no con datos vivos; conviene mirarla cuando abra la próxima jornada
- [x] **3. Gráfica de la ficha**: una gráfica Puntos | Precio (SVG a mano), ordenada por `orden`; precio derivado con `calcPrecio` (verificado a mano contra `historial_anterior` para Pablo Ferrer: 130 €, 165 €, 165 €); jornada sin jugar sin barra; con 1 jornada se dibuja una sola barra, con 12 se quitan las etiquetas
- [x] **4. Admin Usuarios**: "Usuarios con plantilla: X/24" con `<progress>` para la jornada del selector; `contarConPlantilla` testeada; verificado 19/24, 18/24 y 17/24 (J1/J2/J3), igual que SQL
- [x] **5. Posición en el ranking**: `posicionRanking` testeada (empates 1, 2, 2, 4), usada por Clasificación (medallas por posición) y Mi equipo (`#6` para dos usuarios con 103 pts, verificado contra `rank()` en SQL)
- [x] `npm run test` (133 al cerrar), `npm run lint` y `npm run build` en verde
- [x] Verificado en el navegador local en 375 px y escritorio con sesión real, solo lectura (únicamente se cambió el selector de jornada del admin, que es estado local)
- [x] **6. (añadida después, mismo PR) Jugadores: ordenar por estadística**: botón "Estadísticas" bajo el buscador con chips (Puntos, Partidos, Goles, Goles penalti, P. fallados, Faltas penalti, Tarjetas, Expulsiones, Expuls. graves); por defecto Puntos (como antes); el número de la derecha pasa a la estadística elegida; desempate por puntos. `ESTADISTICAS`, `valorEstadistica` y `ordenarPorEstadistica` en `src/lib/points.ts` con tests. Verificado con sesión real en escritorio y 375 px (Goles: Carlos Ferrer, Luca Di Lorenzo y Pablo Ferrer con 4; Expulsiones: Guillermo Izquierdo con 5, igual que SQL)
- [x] PR a `develop` (#58, `feature/mejoras-ui-stats-ranking-admin`, merge `0463b55`) y PR de release `develop` -> `main` (#59, merge `186dc61`); el usuario aprobó cada merge y el workflow de deploy terminó bien
- [x] Manuales (`MANUAL_USUARIOS.md` / `MANUAL_DEL_JUEGO.md`) actualizados

## Arreglo añadido después (mismo PR)
- **Ranking, modal "ver equipo"**: elegía la última alineación resuelta con `.order('jornada', desc)` (por `numero` de federación) y enseñaba la J2 (fed. 18) en vez de la J3 (fed. 10). Ahora se traen las alineaciones puntuadas del usuario y `ultimaAlineacionPuntuada` (`src/lib/jornada.ts`, con tests) elige la de mayor `orden`. Verificado con sesión real: Vivi el Gabacho J3 = 41 pts (antes saldría la J2 con 47), El vasko J3 = 46, igual que SQL. Revisado: no queda ningún otro `order('jornada')` ni sort por `numero` en `src/` (los `a.numero - b.numero` de `jornada.ts` son desempate tras la fecha).

## Decisiones del usuario (2026-11-15, todas las dudas cerradas)
1. **Bug 1**: calcular las estadísticas generales en el cliente desde `historial` (`sumarStats`), sin tocar la BD. La columna `jugadores.stats` queda sin lector.
2. **Orden**: se corrige también por `orden` (no `numero`) el listado "Por jornada" de la ficha y la ventana de 5 jornadas de `calcPrecio` (que pasa a recibir `jornadas`, solo para la temporada actual).
3. **Mi equipo**: dos rectángulos Puntos | Dinero, con la posición dentro del de Puntos con formato `#3`. En "Esperando fecha" (solo lectura) solo Puntos (con la posición), a todo el ancho. Notas de estado sin el padding global.
4. **Gráfica**: UNA gráfica con botones Puntos | Precio. Puntos por jornada (barras); "dinero" = precio (€) tras cada jornada, derivado con `calcPrecio` hasta esa jornada (el último punto = precio actual del Draft). Una jornada sin jugar: sin barra ("–") y el precio no cambia. SVG a mano, sin dependencias.
5. **Admin**: "Usuarios con plantilla: X/Y" con barra, para la jornada del selector existente; Y = todos los usuarios (24, admin incluido); "con plantilla" = alineación con jugadores en esa jornada.
6. **Ranking**: empates comparten posición (1, 2, 2, 4) y Clasificación usa la misma función (medallas por posición).

## Decisions
- **Rama:** `feature/mejoras-ui-stats-ranking-admin` desde `develop`, una sola PR (#58) para todo el trabajo. La rama sigue existiendo en GitHub (no se ha borrado tras el merge).
- **Restricciones de entrega (del usuario, 2026-11-15):** TDD donde haya lógica; el `.env` local apunta a producción, así que solo SQL de solo lectura por el MCP de Supabase y ninguna escritura en datos de producción; no tocar el esquema `backup_20261115` ni los tres ficheros sin trackear (`.claude/launch.json`, `.claude/plans/usuarios-admin-alineaciones.md`, `docs/learning/next-jornada-repetidos-y-formacion.md`); no lanzar el `mentor` salvo que el usuario lo pida.
- Sin dependencias nuevas: si hace falta gráfica, SVG a mano.

## Sessions

### 2026-11-15

**What was done:**
- Las cinco mejoras pedidas, verificadas en el navegador (375 px y escritorio) con la sesión real del usuario (solo lectura sobre producción; únicamente se tocó el selector de jornada del admin, que es estado local) y contrastadas con SQL:
  1. **Bug de las estadísticas generales de la ficha**: la causa era que `jugadores.stats` solo se refresca con la RPC de admin `recalc_puntos()` y nada la lanza tras el scraper, así que se quedó congelada en la jornada 1. No la causó la renumeración del 15-nov. Arreglado en el cliente con `sumarStats(historial)`, sin tocar la BD; la columna `jugadores.stats` ya no tiene lector.
  2. **Mi equipo**: Puntos | Dinero lado a lado, posición `#N` dentro de Puntos, notas sin el padding de 40 px; en "Esperando fecha" solo Puntos (con posición) a todo el ancho.
  3. **Gráfica de evolución en la ficha**: botones Puntos | Precio, SVG a mano; el precio se deriva con `calcPrecio` hasta cada jornada porque no se guarda historial de precios.
  4. **Admin > Usuarios**: contador "Usuarios con plantilla X/24" con barra de progreso (19/24, 18/24 y 17/24 para J1/J2/J3, igual que SQL).
  5. **Posición en el ranking** con empates compartidos (1, 2, 2, 4), común a Clasificación y Mi equipo (`posicionRanking`).
- Extras aprobados o pedidos por el usuario:
  - Orden por `jornadas.orden` en lugar del `numero` de la federación en "Por jornada" de la ficha y en la ventana de 5 jornadas de `calcPrecio` (solo temporada actual).
  - Jugadores: botón "Estadísticas" bajo el buscador para ordenar por cualquier estadística de la ficha (Puntos por defecto); `ESTADISTICAS`, `valorEstadistica` y `ordenarPorEstadistica` en `src/lib/points.ts`.
  - Arreglo del modal "ver equipo" de Clasificación, que elegía la última alineación por `numero` (enseñaba la J2 en vez de la J3); ahora `ultimaAlineacionPuntuada` (`src/lib/jornada.ts`) elige por `orden`.
- Entrega: PR #58 (`feature/mejoras-ui-stats-ranking-admin` -> `develop`, merge `0463b55`) y PR de release #59 (`develop` -> `main`, merge `186dc61`); deploy completado con éxito. El usuario aprobó cada merge; auto-fix activado en #58.
- 133 tests, lint y build en verde. Manuales (`MANUAL_USUARIOS.md`, `MANUAL_DEL_JUEGO.md`) actualizados. El `planner` dejó el plan en `.claude/plans/mejoras-ui-stats-ranking-admin.md`.

**Decisions made:**
- Stats generales calculadas en el cliente (`sumarStats`) y no con un trigger en BD: sin migración ni escrituras en producción, y nunca se queda atrasado. Coste: la columna `jugadores.stats` queda sin lector.
- Ordenar siempre por `jornadas.orden`, nunca por `numero`, desde la renumeración de la federación.
- Precio de la gráfica derivado con `calcPrecio` y no "registrado": si se recalibra `MULTIPLICADOR_PRECIO`, la serie pasada cambia.
- Empates en el ranking comparten posición (1, 2, 2, 4) con una única función para Clasificación y Mi equipo.
- El `mentor` no se lanzó (preferencia del usuario: solo si lo pide). No se tocaron los tres ficheros sin trackear (`.claude/launch.json`, `.claude/plans/usuarios-admin-alineaciones.md`, `docs/learning/next-jornada-repetidos-y-formacion.md`) por petición expresa.

**Open questions:**
- Ninguna de producto. Limitación de verificación: hoy no hay jornada abierta, así que la fila de dos rectángulos (Puntos | Dinero) y el contador del admin sobre una jornada abierta solo se comprobaron con una página temporal con el mismo CSS (ya borrada) y no con datos vivos.

**Next steps:**
- Cuando abra la próxima jornada, mirar en producción Mi equipo (Puntos | Dinero con `#N`) y el contador "Usuarios con plantilla" del admin.
- Decidir si se borra la columna `jugadores.stats` (o se deja sin lector) y si se quita `recalc_puntos()` de los botones de admin si ya no hace falta para la ficha.
- Borrar la rama remota `feature/mejoras-ui-stats-ranking-admin` si ya no se necesita (sigue en GitHub).
