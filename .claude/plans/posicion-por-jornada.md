# Posición por jornada — Plan de implementación

**Goal:** ver en qué puesto acabó cada usuario en cada jornada finalizada (por puntos de la jornada y por acumulado hasta ella) en Clasificación, en el historial del perfil y en el modal del equipo.
**Approach:** una función pura `posicionesPorJornada` en `src/lib/posiciones.ts` (reutiliza `posicionRanking`), un hook `usePosicionesPorJornada` que la alimenta con una sola tanda de consultas, y cambios pequeños en `Ranking.tsx` y `Historial.tsx`. Sin cambios de base de datos.
**Estimated steps:** 7

Decisiones del usuario: ver `docs/tasks/posicion-por-jornada.md`. `docs/plan.md` no dice nada que choque con esto (es una ampliación de Ranking/Perfil, no cambia el plan).

> **Pendiente de confirmar por el usuario (valores por defecto propuestos, fáciles de cambiar):**
> - **D1 — Acumulado cuenta a todos:** en modo Acumulado entran los 24 usuarios; quien aún no tiene puntos va con 0 y comparte el último puesto. Así el Acumulado de la última jornada == Clasificación general. *Cambiarlo* = filtrar en una sola línea de `posicionesPorJornada` (ver Paso 2) y ajustar un test.
> - **D2 — Perfil y modal enseñan las dos posiciones** (jornada y acumulada) por jornada, sin depender del conmutador. *Cambiarlo* = quitar una columna en cada sitio.

---

## Paso 1: Tests de `posicionesPorJornada` (TDD, en rojo)
- Files: `src/lib/posiciones.test.ts` (nuevo)
- Details: mismo estilo que `historial.test.ts` (helper `j(numero, orden, o)` y alineaciones literales). Tests:
  1. **Orden por `orden`, no por `numero`:** jornadas `[j(10,3), j(15,1), j(18,2)]` → resultado con `orden` `[1,2,3]` y `numero` `[15,18,10]`; el acumulado suma en ese orden.
  2. **Ignora no finalizadas:** una `j(12,4,{finalizado:false})` con alineaciones puntuadas no aparece ni suma al acumulado.
  3. **Empate en jornada:** puntos 30, 20, 20, 10 → `posJornada` 1, 2, 2, 4.
  4. **Empate en acumulado:** dos usuarios que llegan con el mismo total por caminos distintos comparten `posAcumulado`.
  5. **Sin alineación en una jornada:** `puntos === null`, `posJornada === null`; `jugaron` no lo cuenta (3 usuarios, 2 juegan → `jugaron` 2) y no empuja hacia abajo a nadie en `posJornada`.
  6. **Se saltó una jornada pero jugó otras:** en la que se saltó, `posJornada` null pero `acumulado` = lo que llevaba y `posAcumulado` numérico.
  7. **Usuario sin ninguna alineación:** en todas las jornadas `posJornada` null, `acumulado` 0 y `posAcumulado` = último (compartido con otros a 0) — **D1**.
  8. **`puntos_jornada` null se trata como «No jugó»** (defensivo, aunque la consulta ya los filtra).
  9. **Alineación de un `usuario_id` que no está en `usuarios`** se ignora (el universo son los usuarios).
  10. **Datos vacíos:** sin jornadas → `[]`; con jornadas finalizadas y sin alineaciones → todos «No jugó», `jugaron` 0, todos 1.º en acumulado con 0.
  11. **Coherencia con la general:** con usuarios cuyo `puntos` = suma de sus `puntos_jornada`, el `posAcumulado` de la última jornada == `posicionRanking(usuarios, u.puntos)` para cada usuario.
  12. `formatoPuesto(3, 17)` → `'3.º de 17'`.

## Paso 2: Implementar `src/lib/posiciones.ts` (en verde)
- Files: `src/lib/posiciones.ts` (nuevo)
- Details:
  ```ts
  export interface PosicionUsuario {
    usuarioId: string
    puntos: number | null       // null = «No jugó» esa jornada
    acumulado: number           // suma de puntos_jornada hasta esta jornada (por orden)
    posJornada: number | null   // null = «No jugó»
    posAcumulado: number
  }
  export interface PosicionesJornada {
    numero: number              // clave de federación (para cruzar con alineaciones/historial)
    orden: number               // etiqueta visible
    jugaron: number             // total para «N.º de M» en modo Jornada
    total: number               // total para modo Acumulado (= usuarios.length con D1)
    filas: PosicionUsuario[]    // una por usuario, sin ordenar (ordena quien pinta)
  }
  export function posicionesPorJornada(
    usuarios: { id: string }[],
    alineaciones: Pick<Alineacion, 'usuario_id' | 'jornada' | 'puntos_jornada'>[],
    jornadas: Pick<Jornada, 'numero' | 'orden' | 'finalizado'>[],
  ): PosicionesJornada[]
  export function formatoPuesto(pos: number, total: number): string // '3.º de 17'
  ```
  - Recorre `jornadas.filter(finalizado).sort((a,b) => a.orden - b.orden)` (igual que `construirHistorial`), con un `Map<usuarioId, acumulado>` que arranca a 0 para todos los usuarios.
  - Por jornada: `puntos` = `puntos_jornada` de la fila `(usuario_id, numero)` o null. `posJornada = puntos === null ? null : posicionRanking(jugaronLista, puntos)`, donde `jugaronLista` son los `{ puntos }` no nulos. `posAcumulado = posicionRanking(todosConAcumulado, acumulado)`.
  - **D1** vive en una sola línea: la lista sobre la que se calcula `posAcumulado` (todos los usuarios). Si el usuario decide lo contrario, se filtra a «han jugado alguna jornada hasta aquí» y `total` pasa a esa longitud.
  - Coste O(jornadas × usuarios × alineaciones) con `find`; con 22 × 24 × ~500 es irrelevante. Si molesta, un `Map` por clave `usuario|jornada`. No se optimiza de entrada.

## Paso 3: Hook `usePosicionesPorJornada`
- Files: `src/hooks/usePosicionesPorJornada.ts` (nuevo)
- Details:
  - Mismo patrón que `useJornadas` + flag `cancelled` como `Historial`. Un `Promise.all` de tres consultas:
    - `usuarios.select('id')`
    - `alineaciones.select('usuario_id, jornada, puntos_jornada').not('puntos_jornada', 'is', null)`
    - `jornadas.select('numero, orden, finalizado')`
  - Devuelve `PosicionesJornada[] | null` (null = cargando). Error: `console.error` como el resto del código y devuelve `[]`, así la UI simplemente no enseña posiciones (la Clasificación general sigue funcionando porque tiene su propia consulta).
  - Límite: PostgREST corta a 1000 filas por defecto; 24 usuarios × ~22 jornadas ≈ 530 filas como máximo. Dejar un comentario `ponytail:` con el techo y la salida (paginar con `.range()` o una vista agregada) si algún día crece la liga.
  - Por qué un hook y no meterlo en `Ranking`: lo usan dos pantallas que no comparten árbol (Ranking y Perfil). El modal vive dentro de `Ranking`, así que reutiliza el mismo resultado sin otra consulta.
  - Duplicación aceptada: `Ranking` sigue pidiendo `usuarios(*)` y `useJornadas`, y el hook pide `usuarios(id)` y `jornadas` otra vez (tablas de 24 y ~22 filas). No se refactoriza `Ranking` para compartirlas: diff mínimo y la Clasificación general no cambia.
  - Sin test propio: es un envoltorio de E/S; la lógica está testeada en el Paso 1.

## Paso 4: Clasificación — selector + conmutador
- Files: `src/components/Ranking/Ranking.tsx`, `src/index.css`
- Details:
  - Estado nuevo: `vista: number | null` (`null` = General, que es el **estado de entrada**, así la pantalla se abre exactamente como hoy) y `modo: 'jornada' | 'acumulado'` (por defecto `'jornada'`).
  - Bajo el título, un `<select>` nativo (mejor que chips: con 22 jornadas los chips ocupan media pantalla a 375 px). Opciones: «General» y luego «Jornada N» por cada jornada finalizada, **de la más reciente a la más antigua por `orden`**, así la primera opción tras General es la última jornada. Se oculta si el hook devuelve `[]` o `null` (cero jornadas finalizadas o cargando): la pantalla queda idéntica a la actual. Estilo: reutilizar las reglas de `.apuesta-row select` añadiendo el selector `.ranking-filtros select` a esa misma regla (no se duplica CSS). `font-size: 16px` para que iOS no haga zoom.
  - Con una jornada elegida, al lado del select dos botones `filter-chip` («Jornada» / «Acumulado») con `active-all` y `aria-pressed`, el patrón de `Players.tsx`. Contenedor `div.filter-chips.ranking-filtros` (ya hace `flex-wrap`, así a 375 px el par de chips baja de línea si no cabe).
  - Línea de resumen con `.placeholder`: modo Jornada «Jugaron 17 de 24»; modo Acumulado «Total tras la jornada 3».
  - Render: en vez de duplicar el `<li>`, el `map` actual pasa a recorrer una lista calculada `{ usuario, pos: number | null, pts: number | null }`:
    - General: igual que ahora (`posicionRanking(ranking, u.puntos)`, `u.puntos`), mismo orden del `.order('puntos')`.
    - Jornada: `pos = posJornada`, `pts = puntos`; Acumulado: `pos = posAcumulado`, `pts = acumulado`. Se cruza `filas` con `ranking` por id (para nombre y para abrir el modal con el `Usuario`). Orden: `pos` ascendente con null al final, desempate por `nombre.localeCompare`.
  - «No jugó»: `rank-pos` muestra `–`, `rank-pts` muestra `No jugó`, y el `<li>` lleva una clase `no-jugo` (una regla CSS: `opacity: .55`). Sigue siendo clicable (abre el modal).
  - Medallas y `RANK_CLASS` se aplican igual que hoy cuando `pos <= 3`. El usuario actual sigue con `current-user`.
  - Responsive: la rejilla `.ranking-item` (44px | 1fr | auto a ≤600 px) no cambia; «No jugó» cabe en la columna `auto`. No hace falta más CSS.

## Paso 5: Modal del equipo — posición por jornada
- Files: `src/components/Ranking/Ranking.tsx`, `src/index.css`
- Details:
  - Debajo de la alineación actual (no se toca), un bloque `h4`/`.placeholder` «Posición por jornada» con una tabla compacta `table.posiciones-table`: columnas **J** (`orden`), **Pts**, **Puesto** (`formatoPuesto(posJornada, jugaron)` o «No jugó») y **Acum.** (`formatoPuesto(posAcumulado, total)`) — **D2**. Filas por `orden` ascendente (como el historial).
  - Datos: los del mismo hook de `Ranking` filtrando `filas` por `viewTeam.id`. Cero consultas nuevas.
  - Se oculta si no hay jornadas finalizadas o el hook aún está cargando.
  - No se reutiliza `.admin-table` porque a ≤700 px se convierte en tarjetas (una por jornada → modal larguísimo). `.posiciones-table`: 3–4 reglas (ancho 100 %, `font-size: .85rem`, padding corto, borde inferior como `.admin-table`). Cuatro columnas cortas caben en los ~300 px útiles del modal a 375 px; el modal ya hace scroll (`max-height: 92vh`).

## Paso 6: Historial del perfil — dos columnas nuevas
- Files: `src/components/Profile/Historial.tsx`
- Details:
  - Llamar a `usePosicionesPorJornada()` y, por cada `FilaHistorial`, buscar la jornada por `numero` y la fila del `usuarioId`.
  - Dos columnas tras «Total»: **Puesto** (`formatoPuesto(posJornada, jugaron)` o «No jugó») y **Pos. total** (`formatoPuesto(posAcumulado, total)`) — **D2**. Con `data-label` («Puesto», «Pos. total») para la vista en tarjetas a ≤700 px que ya da `.admin-table`.
  - Mientras el hook carga: `-` en esas celdas (no bloquear la tabla, que ya tiene su propia carga).
  - `construirHistorial` y su test **no se tocan**: el cruce es de presentación.
  - Nota: el Historial cuenta 0 puntos si no hubo alineación; la nueva columna dirá «No jugó» en esa misma fila. Es coherente con la decisión 3.

## Paso 7: Manuales
- Files: `docs/MANUAL_USUARIOS.md` (§7 Ranking y §9 Perfil), `docs/MANUAL_DEL_JUEGO.md` (§7 Ranking; §9 Perfil no menciona el historial — añadir la misma viñeta que en el manual de usuarios para que queden alineados).
- Details: explicar el selector (General / Jornada N), el conmutador Jornada/Acumulado, «No jugó» y que el total de la jornada es sobre quienes jugaron, los empates compartidos, la tabla del modal y las dos columnas nuevas del historial.

---

## Commits (conventional commits, en inglés)
1. `feat(posiciones): compute per-jornada and accumulated positions` — `posiciones.ts` + `posiciones.test.ts` (Pasos 1–2).
2. `feat(posiciones): add usePosicionesPorJornada hook` — Paso 3.
3. `feat(ranking): add jornada selector and jornada/accumulated toggle` — Paso 4.
4. `feat(ranking): show per-jornada positions in the team modal` — Paso 5.
5. `feat(profile): show jornada and accumulated position in the history` — Paso 6.
6. `docs: document per-jornada positions in the manuals` — Paso 7.

## Verificación
- `npm run test`, `npm run lint`, `npm run build` en verde.
- Navegador: `preview_start` con nombre `dev`, a 375 px (preset mobile) y escritorio. **Solo lectura**: `.env` apunta a producción; la feature solo hace `select`. No guardar alineaciones, apuestas ni perfil durante la prueba.
  - Clasificación abre en General y se ve igual que antes.
  - Jornada 1/2/3: 19/18/17 jugadores con puesto y 5/6/7 «No jugó» al final; «Jugaron 19 de 24», etc.
  - Acumulado de la jornada 3 = misma lista y mismos puestos que General (comprobación de D1).
  - Modal de un usuario que se saltó alguna jornada: «No jugó» en Puesto y Acum. numérico; modal del usuario sin alineaciones: todo «No jugó» y último en Acum.
  - Perfil → Mi historial: columnas nuevas correctas para el usuario conectado; en 375 px salen en las tarjetas.
  - Sin errores en consola.

## Acceptance Criteria
- [ ] `posicionesPorJornada` con los 12 tests del Paso 1 en verde; ordena siempre por `jornadas.orden` y solo usa jornadas finalizadas.
- [ ] Empates comparten puesto (1, 2, 2, 4) en jornada y acumulado vía `posicionRanking`.
- [ ] Clasificación abre en General sin cambios visibles; con selector de jornada (por `orden`) y conmutador Jornada/Acumulado; «No jugó» al final sin puesto y total sobre quienes jugaron.
- [ ] Modal del equipo muestra puesto de jornada y acumulado por jornada, sin consultas extra.
- [ ] Mi historial muestra «Puesto» y «Pos. total» por jornada.
- [ ] Sin jornadas finalizadas: no aparece ni selector, ni tabla del modal, y el historial sigue con su mensaje actual.
- [ ] Funciona a 375 px y en escritorio, sin scroll horizontal.
- [ ] Sin cambios de base de datos.
- [ ] `npm run test`, `npm run lint`, `npm run build` en verde.
- [ ] Manuales actualizados.

## Riesgos / preguntas abiertas
1. **D1 y D2** pendientes de confirmar (ver arriba).
2. **Ventana de resolución:** si una jornada tiene `puntos_jornada` escritos pero aún no `finalizado`, `usuarios.puntos` ya los incluye y el Acumulado de la última jornada finalizada no coincidiría con la General durante ese rato. Propuesta: aceptarlo (es transitorio); confirmar que la resolución marca `finalizado` en la misma operación.
3. **Orden del selector:** propuesto de más reciente a más antigua. Si se prefiere cronológico (1, 2, 3…), es invertir un `sort`.
