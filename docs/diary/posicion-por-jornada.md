# Posición de cada usuario en cada jornada

Ver en qué posición ha acabado cada usuario en cada jornada, por puntos de la jornada y por acumulado, en la Clasificación, en el historial del perfil y en el modal del equipo de otro usuario (Fantasy, 2026-11-15). Tarea: `docs/tasks/posicion-por-jornada.md`. PRs: #62 (a `develop`) y #63 (release a `main`).

## 2026-11-15

### What was done
- **Diseño antes de planificar**: se preguntaron al usuario las dudas de diseño antes de tocar nada. Decisiones: posiciones en tres sitios (Clasificación con selector de jornada, Perfil > Mi historial y modal del equipo de otro usuario); base = Jornada y Acumulado con conmutador; empates comparten puesto (1, 2, 2, 4) reutilizando `posicionRanking`; quien no tiene alineación puntuada en una jornada sale como «No jugó» (sin puesto y sin contar en «Jugaron N de M»); todos ven todas las posiciones.
- **Plan y aislamiento**: el `planner` dejó el plan en `.claude/plans/posicion-por-jornada.md`. Se trabajó en un git worktree (`.worktrees/posicion-por-jornada`, rama `feature/posicion-por-jornada` desde `origin/develop`) porque el checkout compartido no debía cambiar de rama.
- **TDD**: función pura `posicionesPorJornada()` en `src/lib/posiciones.ts` con 12 tests en `src/lib/posiciones.test.ts` (empates en jornada y en acumulado, sin alineación, jornada saltada, usuario sin alineaciones, `numero` distinto de `orden`, jornadas no finalizadas ignoradas, puntos nulos, usuario desconocido, datos vacíos y coherencia con la clasificación general). Un test mío estaba mal (b empata con z en la J1) y se corrigió el test, no la lógica.
- **Hook** `src/hooks/usePosicionesPorJornada.ts`: solo lectura (`usuarios(id)`, alineaciones puntuadas y jornadas); `null` mientras carga y `[]` si hay error. Lleva un comentario `ponytail:` sobre el límite de 1000 filas de PostgREST (se esperan ~530 al final de temporada).
- **UI**: `Ranking.tsx` con `<select>` nativo y chips «Jornada / Acumulado» (`aria-pressed`), resumen «Jugaron N de M usuarios», filas «No jugó» atenuadas al final, medallas y usuario actual conservados, y tabla «Posición por jornada» en el modal del equipo (J / Pts / Puesto / Acum.). `Historial.tsx` con columnas «Puesto» y «Pos. total». CSS en `src/index.css`.
- **Ajuste pedido por el usuario**: el modal y el historial enseñan solo `#N` en vez de «N.º de M» (se eliminó `formatoPuesto` y su test); el «Jugaron N de M» se queda en la Clasificación.
- **Manuales**: `docs/MANUAL_USUARIOS.md` (§7 y §9) y `docs/MANUAL_DEL_JUEGO.md` (§7 y §9, donde faltaba el punto de Mi historial).
- **Verificación**: 145 tests, lint y build en verde. Comprobado en el navegador a 375 px y en escritorio con datos de producción (solo lectura; el usuario inició sesión él mismo en el panel): Jornada 1/2/3 enseñan 19/18/17 jugadores con puesto y 5/6/7 «No jugó»; el Acumulado de la Jornada 3 es idéntico a General (24 usuarios, mismos empates); modal e historial cuadran con la lista; sin desbordamiento horizontal.
- **Entrega**: PR #62 (`feature/posicion-por-jornada` -> `develop`, merge `5b89073`) y PR de release #63 (`develop` -> `main`, merge `b246c16`), cuyo push lanzó el workflow «Deploy to GitHub Pages» (run 43760812241, que terminó en `success`).

### Decisions made
- **Sin cambios de base de datos**: la RLS `alineaciones_select` ya deja a cualquier usuario leer los `puntos_jornada` puntuados, así que la visibilidad total no pide migración ni escrituras en producción.
- **En Acumulado cuentan todos los usuarios** (los que aún no tienen puntos van con 0 y comparten el último puesto), de modo que el acumulado de la última jornada coincide con la clasificación general.
- **Una alineación puntuada con 0 puntos cuenta como «jugó»** (un equipo incompleto lo deja así `resolver_jornada`); «No jugó» es solo no tener alineación puntuada en esa jornada.
- **El selector lista «General» y luego las jornadas de la más reciente a la más antigua por `orden`**; nunca por `numero` (la federación renumeró el calendario).
- **En el historial y en el modal se enseñan las dos posiciones** (jornada y acumulada) en vez de depender del conmutador.
- **Una sola función pura** (`posicionesPorJornada`) alimenta las tres pantallas para que nunca discrepen, reutilizando `posicionRanking`.
- **Worktree aislado** para no cambiar de rama en el checkout compartido.
- El `mentor` no se lanzó (preferencia del usuario: solo si lo pide).

### What's left
- El workflow de deploy terminó en verde; falta comprobar a ojo en la web publicada que enseña la función (no se ha abierto la web publicada).
- Esta documentación de cierre (diario + tarea en `done`) va por su propia PR `docs/cierre-posicion-por-jornada` -> `develop` y después una PR de release a `main`, cada una pendiente de la aprobación del usuario.
- Si la liga supera ~1000 alineaciones puntuadas, paginar o usar una vista agregada en `usePosicionesPorJornada`.
- Borrar la rama local `feature/posicion-por-jornada` (ya fusionada). El worktree y el servidor `vite` suelto se retiraron al cerrar la sesión.
- Aprendido: `preview_start` sirve el checkout principal (el cwd de la sesión original), no un worktree; para una función en un worktree hay que lanzar Vite desde el worktree en un puerto libre (tras parar la tarea quedó un proceso `vite` suelto). Además, el puerto 5173 estaba ocupado por otro servidor de desarrollo del checkout principal, por eso la función no se veía allí hasta mergear. Los errores de HMR de Vite al quitar `formatoPuesto` fueron transitorios (se editaban los importadores uno a uno).
