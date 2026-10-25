# Historial por usuario

Cada usuario ve su propio historial de jornadas y, mientras el juego está en "Esperando fecha", la última jornada resuelta en cada sección.

## Qué hace
- **Perfil → "Mi historial"** (`src/components/Profile/Historial.tsx`): una fila por jornada con `finalizado = true`, ordenada por `orden`. Columnas: jornada, resultado y goles, puntos, total acumulado, presupuesto y neto de apuestas. En móvil la tabla pasa a tarjetas con la etiqueta de cada valor (`data-label`).
- **Mi equipo** (`Draft.tsx`): sin jornada en curso, muestra la última jornada resuelta en solo lectura (jugadores, capitán y puntos). Bajo cada jugador muestra los puntos que dio en esa jornada (el capitán cuenta doble; suman los puntos de jugadores, sin bonus de power-ups). No muestra dinero ni precios: los precios se recalculan con las estadísticas actuales y no son los del fichaje (daban "-112€"). Sin alineación, indica "No enviaste alineación".
- **Apuestas** (`Apuestas.tsx`): la "última jornada" se elige por `finalizado` y mayor `orden`, no por mayor `numero` de federación.
- **Power-ups** (`Powerups.tsx`): usa `jornadaEnCurso`, con la última resuelta en solo lectura como alternativa. Siempre carga el inventario restante y muestra el power-up usado en esa jornada, o que no se usó ninguno.

## Código
- `ultimaJornadaResuelta()` en `src/lib/jornada.ts` (también la usa `faseJuego`).
- `construirHistorial()` en `src/lib/historial.ts`: sin alineación, 0 puntos; sin fila de presupuesto, 1000€; `neto` = suma de `ganancia` de apuestas resueltas, `null` si no hay.
- Tests: `jornada.test.ts` y `historial.test.ts`.

## Datos
Solo frontend: sin migración ni cambios de RLS. Fuentes: `jornadas`, `alineaciones.puntos_jornada`, `presupuestos` y `apuestas`, filtradas por `usuario_id`. Las apuestas son privadas, por eso no hay historial de dinero de otros usuarios.

## Pendiente
- El dinero no se acumula: cada jornada parte de 1000€ más el neto de apuestas de la anterior (+50 con power-up). La columna de presupuesto es el de esa jornada.
- `presupuestos` está vacía en producción para las jornadas ya resueltas, así que "Presupuesto" muestra 1000€ por defecto.
- Puntos de otros usuarios por jornada (desde el modal del Ranking): aplazado.
