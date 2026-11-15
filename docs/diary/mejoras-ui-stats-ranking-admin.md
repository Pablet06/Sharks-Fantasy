# Mejoras de UI: stats de la ficha, Mi equipo, gráfica, admin y ranking

Cinco mejoras tras la Jornada 3 de Fantasy (federación 10, Castelló, 2026-11-15) más tres extras: estadísticas generales de la ficha, "Mi equipo" con Puntos | Dinero y posición, gráfica de evolución, contador de plantillas en el admin y ranking con empates. Tarea: `docs/tasks/mejoras-ui-stats-ranking-admin.md`. PRs: #58 (a `develop`) y #59 (release a `main`).

## 2026-11-15

### What was done
- **Bug de las estadísticas generales de la ficha**: la columna `jugadores.stats` solo se refresca con la RPC de admin `recalc_puntos()` y nada la lanza tras el scraper, así que se quedó congelada tras la jornada 1 (Carlos Ferrer: 1 gol en la columna frente a 4 en `historial`). No es consecuencia de la renumeración del 15-nov. Arreglado en el cliente con `sumarStats(historial)` en `src/lib/points.ts`, sin cambios en BD. La columna `jugadores.stats` ya no tiene lector.
- **Mi equipo** (`Draft.tsx`): Puntos | Dinero a la misma altura, posición `#N` dentro de Puntos, notas de estado sin el padding global de 40 px. En "Esperando fecha" solo Puntos (con la posición) a todo el ancho.
- **Gráfica en la ficha**: botones Puntos | Precio, SVG a mano. El precio se deriva con `calcPrecio` hasta cada jornada (no existe historial de precios). Una jornada sin jugar no pinta barra.
- **Admin > Usuarios**: "Usuarios con plantilla X/24" con barra de progreso para la jornada del selector (19/24, 18/24 y 17/24 en J1/J2/J3, igual que SQL). Función `contarConPlantilla`.
- **Ranking con empates** (1, 2, 2, 4) con `posicionRanking`, compartida por Clasificación y Mi equipo.
- **Extra aprobado**: orden por `jornadas.orden` en vez de `numero` en "Por jornada" de la ficha y en la ventana de 5 jornadas de `calcPrecio` (solo temporada actual).
- **Extra pedido con la PR abierta**: Jugadores se puede ordenar por cualquier estadística de la ficha con un botón "Estadísticas" bajo el buscador (Puntos por defecto). `ESTADISTICAS`, `valorEstadistica` y `ordenarPorEstadistica` en `src/lib/points.ts`.
- **Extra pedido por el usuario**: el modal "ver equipo" de Clasificación enseñaba la J2 en vez de la J3 porque elegía la última alineación por `numero`. Ahora `ultimaAlineacionPuntuada` (`src/lib/jornada.ts`) elige por `orden`.
- Todo verificado en el navegador (375 px y escritorio) con la sesión real del usuario, solo lectura sobre producción, y contrastado con SQL. Manuales (`MANUAL_USUARIOS.md`, `MANUAL_DEL_JUEGO.md`) actualizados. 133 tests, lint y build en verde.
- Entrega: PR #58 (`feature/mejoras-ui-stats-ranking-admin` -> `develop`, merge `0463b55`) y release #59 (`develop` -> `main`, merge `186dc61`), con deploy completado. El usuario aprobó cada merge.

### Decisions made
- Estadísticas generales en el cliente y no con un trigger en BD: no hace falta migración ni escribir en producción, y la cifra nunca se queda atrasada. Coste asumido: la columna `jugadores.stats` queda huérfana.
- Nunca se ordena por `numero` (la federación recreó el calendario y ya no es cronológico); siempre por `jornadas.orden`.
- El precio de la gráfica es dato derivado, no registrado: si se recalibra `MULTIPLICADOR_PRECIO`, la serie pasada cambia. Se aceptó a cambio de no crear una tabla de precios.
- Sin librería de gráficas: SVG a mano, sin dependencias nuevas.
- Empates compartiendo posición y una sola función para las dos pantallas, para que Clasificación y Mi equipo nunca discrepen.
- Y del contador del admin = todos los usuarios (24, admin incluido); "con plantilla" = alineación con jugadores en esa jornada.
- El `mentor` no se lanzó (preferencia del usuario). Los tres ficheros sin trackear (`.claude/launch.json`, `.claude/plans/usuarios-admin-alineaciones.md`, `docs/learning/next-jornada-repetidos-y-formacion.md`) se dejaron intactos a petición suya.

### What's left
- Mirar en producción, cuando abra la próxima jornada, la fila Puntos | Dinero de Mi equipo y el contador del admin sobre una jornada abierta: hoy solo se comprobaron con una página temporal con el mismo CSS (ya borrada), no con datos vivos.
- Decidir qué hacer con la columna `jugadores.stats` y con el botón de `recalc_puntos()` del admin, que ya no alimenta la ficha.
- Borrar la rama remota `feature/mejoras-ui-stats-ranking-admin` si ya no hace falta.
