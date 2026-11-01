# Mejoras para la próxima jornada — Implementation Plan

> Estado: **borrador, pendiente de confirmación del usuario** (2026-11-01). Decisiones ya tomadas en `docs/tasks/next-jornada-improvements.md` (sección Decisions). Rama: `feature/next-jornada-improvements` desde `develop` (ya creada). Nada aplicado, nada commiteado.

**Goal:** dejar listas antes de que se abra la J8 cuatro mejoras: regla de repetidos (capitán + máx. 4 de 7), ranking completo, entrenador José Santapau (easter egg) y formación de waterpolo en Mi equipo.
**Approach:** frontend mínimo reutilizando helpers/CSS existentes + **una** migración (trigger) solo para la regla de repetidos. Entrenador como constante de frontend. Formación inline en `Draft.tsx` con el CSS del antiguo `Pool.tsx`.
**Estimated steps:** 10

## Verificado en el código (no suposiciones)

- **"Alineación anterior" no es `jornada - 1`.** `jornadas.numero` es el número de federación (no consecutivo ni en orden de calendario: `jornada.ts:19-21`); el orden del Fantasy es `jornadas.orden` (`20261022000000`, `NOT NULL`, índice único). `resolver_jornada` ya resuelve "la siguiente" por `orden + 1`. **Definición del plan:** la alineación anterior de una fila `(usuario, jornada J)` es la alineación de ese usuario en la jornada con el **mayor `orden` < `orden(J)`** (su última alineación previa, aunque se saltara alguna jornada). Ver P1.
- **El scraper escribe el calendario futuro en cada sync** (spec `2026-09-11-fantasy-dinamico-design.md:424`), así que puede haber varias jornadas con fecha a >24 h y la RLS `alineaciones_owner_write` (`20260911000002`) deja escribir en todas por API, **en cualquier orden**. Por eso el trigger compara con la vecina anterior **y** con la siguiente (la UI solo edita una).
- **Capitán tardío:** `Draft.tsx:180-193` hace `UPDATE capitan` por la policy `alineaciones_owner_write_tardio` (`20260914000002`). El trigger que limita esa vía se llama **`alineaciones_before_update_capitan_tardio`** (la función es `alineaciones_limitar_capitan_tardio`) y revierte `jugadores` al valor viejo. El trigger de composición (`alineaciones_composicion`, `20261022000001`) solo salta con `INSERT OR UPDATE OF jugadores`, así que **no** cubre el capitán.
- **Orden de triggers:** Postgres ejecuta los BEFORE ROW por orden alfabético de nombre: `alineaciones_before_update_capitan_tardio` → `alineaciones_composicion` → `alineaciones_repeticion` (nuevo). El nuevo ve los `jugadores` ya revertidos y los errores de composición salen antes.
- **Distinguir al admin en BD:** `is_admin(uid)` (`20260909000000`, SECURITY DEFINER). Patrón ya usado: `IF auth.uid() IS NOT NULL AND NOT is_admin(auth.uid()) THEN <comprobar>` (`20260914000002:57`). `auth.uid()` NULL = service role / SQL editor. `resolver_jornada` solo toca `puntos_jornada`, así que no dispara el trigger nuevo (`UPDATE OF jugadores, capitan`).
- **Filas viejas:** un no admin no puede escribir alineaciones de jornadas a <24 h ni jugadas (RLS), salvo el capitán en la ventana tardía. El trigger solo actúa en escrituras: **no** revalida el histórico J1–J7 (que ya incumple la regla, porque no existía). Si el admin cambia una alineación vieja, la siguiente del usuario no se revalida hasta que el usuario la vuelva a guardar.
- **RLS de lectura:** `alineaciones_select` (`20260912000000`) deja ver siempre las filas propias → el trigger (SECURITY INVOKER) y `Draft.tsx` pueden leer la alineación anterior del usuario sin cambios de RLS. `jornadas_select` es pública.
- **Admin:** `filaAlineacionAdmin` llama a `validarDraft(elegidos, capitan, {}, Infinity, posiciones)`; si el parámetro nuevo es opcional (por defecto `null`), queda exento **sin tocarlo**.
- **Ranking:** `Ranking.tsx:29` `.limit(10)`, título `:62`. La página hace scroll normal (`.dashboard-main` con 100 px de margen inferior para la barra móvil); el modal de equipo no depende del límite.
- **Entrenador:** `Players.tsx` ordena con `calcTotalPoints` y pinta `pos-badge pos-${pos}`; `Position` tiene 5 valores y `COMPOSICION: Record<Position, number>` obliga a no ampliarlo. Draft/Apuestas/Powerups reciben `jugadores` de BD (`useJugadores`) → una constante en `Players.tsx` no llega a ellos. `composicion_valida` exige 7 filas reales en `jugadores` → el servidor ya rechaza cualquier dorsal inexistente. `.pos-badge` sin clase de posición sale en gris neutro (sin CSS nuevo).
- **Fotos:** las fotos de jugadores **salieron de `public/` a propósito** (repo público → bucket privado, migración `20261026000000_fotos_privadas`). `DEFAULT_PHOTO` existe en `src/lib/photos.ts`. Ver P2.
- **Formación:** el antiguo `Pool.tsx` (`git show c3be946^:src/components/Dashboard/Pool.tsx`) pintaba: `.pool` > `.pool-halfline`, fila de arriba (1), fila (2), `.pool-zone-line.fivemeter`, fila (3), `.pool-zone-line.twometer`, `.pool-row.goalkeeper-row` (portero), `.pool-goal`. Nodo: `button.player-node` con `img.player-node-photo`, `span.player-node-name`, `span.player-node-pts` (badge). Todo ese CSS sigue en `src/index.css:401-646` (+ móvil `:1616-1622`), incluido `.pool-zone-label` (sin uso). Ojo: a ≥768 px `.pool-container { max-width: none }` (`:1683`).
- **Los dos periodos de Mi equipo ya existen:** `soloLectura` (`Draft.tsx:31,52-56`) = no hay jornada en curso → se enseña la última resuelta = fase "Esperando fecha". Hoy el resumen ya hace `soloLectura ? puntos×(2 si capitán) : precio` (`Draft.tsx:347-349`). Se reutiliza tal cual. Tocar un fichaje ya abre `PlayerCard` (`setSelectedCard`).
- **`.env` local apunta a PROD** (nota de memoria del planner): las pruebas en navegador que guardan alineaciones escriben en producción.

## Inventario de reutilización

| Qué | Dónde | Uso |
|---|---|---|
| `validarDraft` | `src/lib/draft.ts` | + parámetro opcional `anterior` |
| `etiquetaJornada(jornadas, numero)` | `src/lib/jornada.ts` | `numero → orden` en `alineacionAnterior` |
| `is_admin`, patrón `auth.uid() IS NOT NULL AND NOT is_admin(...)` | migraciones `20260909000000`, `20260914000002` | exención admin/service role |
| Estilo de migración idempotente | `20261022000001` | `CREATE OR REPLACE` + `DROP TRIGGER IF EXISTS`, `ERRCODE = 'check_violation'`, mensaje en castellano sin tildes |
| `.composicion-item` (`ok`/`sobra`) | `src/index.css:1176-1192` | chip "Repetidos n/4" |
| CSS de la piscina | `src/index.css:401-646, 1616-1622` | formación |
| Clases de `PlayerCard` (`.player-card-modal`, `-header`, `-photo`, `-name`, `.player-card-total`, `.total-pts`, `.modal-overlay`, `.modal-close`) | `PlayerCard.tsx` / `index.css` | ficha del entrenador sin tocar `PlayerCard` |
| `DEFAULT_PHOTO` | `src/lib/photos.ts` | avatar provisional del entrenador |

---

## Step 1: Regla de repetidos — lógica pura + tests (TDD, tests primero)
- **Files:** `src/lib/draft.ts`, `src/lib/draft.test.ts`
- **Details:**
  - `export const MAX_REPETIDOS = 4` (comentario: "misma cifra que el trigger `alineaciones_repeticion`").
  - `type AlineacionPrevia = Pick<Alineacion, 'jugadores' | 'capitan'>`.
  - `contarRepetidos(jugadores: number[], anterior: AlineacionPrevia | null): number` → cuántos de `jugadores` están en `anterior.jugadores` (0 si `anterior` o sus `jugadores` son `null`). La usan `validarDraft` y el chip del Step 3.
  - `validarDraft(..., posiciones, anterior: AlineacionPrevia | null = null)`: tras composición y antes del presupuesto:
    - `anterior?.capitan != null && capitan === anterior.capitan` → `'No puedes repetir el capitán de tu alineación anterior.'`
    - `contarRepetidos > MAX_REPETIDOS` → `` `Repites ${n} jugadores de tu alineación anterior (máximo ${MAX_REPETIDOS}): cambia al menos 3.` ``
  - `alineacionAnterior(jornadas: Pick<Jornada,'numero'|'orden'>[], alineaciones: Pick<Alineacion,'jornada'|'jugadores'|'capitan'>[], numeroActual: number): AlineacionPrevia | null` → la de mayor `orden` estrictamente menor que el de `numeroActual` (orden vía `etiquetaJornada`), o `null`.
  - `filaAlineacionAdmin`: **sin cambios** (no pasa `anterior` → exento).
- **Tests** (`draft.test.ts`; ampliar el fixture `posiciones` con p. ej. `10: 'Extremo'` para poder montar un 7 válido con 4 repetidos — no rompe los tests existentes):
  - mismo capitán que la anterior → error de capitán;
  - 5 repetidos (`[9,2,3,4,8,6,7]` vs `ok7`) → error que contiene `Repites 5`;
  - exactamente 4 repetidos (`[9,2,10,4,8,6,7]`) y otro capitán → `ok`;
  - `anterior = null` o `anterior.jugadores = null` → sin restricción;
  - `alineacionAnterior` elige por `orden`, no por `numero` (p. ej. `numero 9/orden 3`, `numero 3/orden 4`, actual `numero 12/orden 5` → la de `numero 3`); ignora la actual y las posteriores; `null` si no hay previas.
- **Risks:** ninguno relevante; son funciones puras.

## Step 2: Regla de repetidos — migración (escribir, **NO aplicar**)
- **Files:** `supabase/migrations/20261101000000_alineaciones_no_repetir.sql` (nuevo)
- **Details** (esqueleto; back-builder escribe la versión final con comentario de cabecera en castellano como las demás):
  ```sql
  CREATE OR REPLACE FUNCTION alineaciones_validar_repeticion()
  RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
  DECLARE v_orden integer; v_vecina record; v_rep integer;
  BEGIN
    -- Admin (Admin > Usuarios) y service role (auth.uid() NULL) exentos.
    IF auth.uid() IS NULL OR is_admin(auth.uid()) THEN RETURN NEW; END IF;
    SELECT orden INTO v_orden FROM jornadas WHERE numero = NEW.jornada;
    FOR v_vecina IN
      (SELECT a.jugadores, a.capitan FROM alineaciones a JOIN jornadas j ON j.numero = a.jornada
        WHERE a.usuario_id = NEW.usuario_id AND j.orden < v_orden ORDER BY j.orden DESC LIMIT 1)
      UNION ALL
      (SELECT a.jugadores, a.capitan FROM alineaciones a JOIN jornadas j ON j.numero = a.jornada
        WHERE a.usuario_id = NEW.usuario_id AND j.orden > v_orden ORDER BY j.orden ASC LIMIT 1)
    LOOP
      IF NEW.capitan = v_vecina.capitan THEN
        RAISE EXCEPTION 'alineacion invalida: no puedes repetir capitan en dos alineaciones seguidas'
          USING ERRCODE = 'check_violation';
      END IF;
      SELECT count(*) INTO v_rep FROM unnest(NEW.jugadores) x WHERE x = ANY(v_vecina.jugadores);
      IF v_rep > 4 THEN  -- = MAX_REPETIDOS en src/lib/draft.ts
        RAISE EXCEPTION 'alineacion invalida: repites % jugadores de una alineacion seguida (maximo 4)', v_rep
          USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
    RETURN NEW;
  END $$;

  DROP TRIGGER IF EXISTS alineaciones_repeticion ON alineaciones;
  CREATE TRIGGER alineaciones_repeticion
    BEFORE INSERT OR UPDATE OF jugadores, capitan ON alineaciones
    FOR EACH ROW EXECUTE FUNCTION alineaciones_validar_repeticion();
  ```
  - Comentar en la cabecera: por qué anterior **y** siguiente (escrituras fuera de orden por API), por qué el nombre (orden alfabético tras el de capitán tardío), que cubre el capitán tardío (`UPDATE OF capitan`) y que no revalida el histórico.
  - Sin SECURITY DEFINER: lee filas propias bajo RLS.
- **Risks:**
  - Un upsert `INSERT ... ON CONFLICT DO UPDATE` dispara el BEFORE INSERT **y** el BEFORE UPDATE: se comprueba dos veces, mismo resultado. OK.
  - El admin jugando como usuario queda exento en servidor (la BD no distingue el panel de su propio Draft); en su Draft sigue bloqueado por el cliente. Coherente con el resto de triggers.
  - **Aplicarla antes de que la J8 tenga fecha**: hasta entonces nadie puede escribir J8 (RLS), así que no habrá filas J8 sin comprobar.

## Step 3: Regla de repetidos — `Draft.tsx`
- **Files:** `src/components/Dashboard/Draft.tsx`
- **Details:**
  - Estado `todasJornadas: Jornada[]`, rellenado en el primer `useEffect` con el `data` que ya se descarga (`abiertas`) — sin consulta extra.
  - En el segundo `useEffect` (el de `[jornada, usuario.id]`), una consulta más con el mismo patrón `cancelled`: `from('alineaciones').select('jornada, jugadores, capitan').eq('usuario_id', usuario.id)` → estado `misAlineaciones`. (Mismo patrón que `Profile/Historial.tsx`: consultas separadas + unión en un helper puro.)
  - En render (tras los early returns, sin hook): `const anterior = soloLectura ? null : alineacionAnterior(todasJornadas, misAlineaciones, jornada.numero)`.
  - `guardar()`: `validarDraft(seleccion, capitan, precios, presupuesto, posiciones, anterior)`.
  - Editor: botón ★ `disabled` si `j.numero === anterior?.capitan`, con `title="Fue tu capitán en la alineación anterior"`; dentro de `.composicion`, si hay `anterior`, chip `Repetidos {n}/{MAX_REPETIDOS}` con clase `sobra` si `n > MAX_REPETIDOS` (n = `contarRepetidos(seleccion, anterior)`).
  - Capitán tardío (`<select>` de `:320-328`): la `<option>` del capitán anterior `disabled` y con sufijo ` (capitán anterior)`. El trigger es la red de seguridad.
  - Si el guardado falla en servidor, el mensaje del trigger ya sale por `setMsg(\`Error: ${error.message}\`)` (sin cambios).
- **Tests:** cubiertos por Step 1 (no hay tests de componentes en el repo).
- **Risks:** si el usuario guarda antes de que llegue `misAlineaciones`, el cliente no bloquea pero el servidor sí. Aceptable.

## Step 4: Regla de repetidos — manuales
- **Files:** `docs/MANUAL_DEL_JUEGO.md`, `docs/MANUAL_USUARIOS.md` (mismo texto en ambos salvo la parte de admin)
- **Details:**
  - §1 "No hay plantilla fija…" (`DEL_JUEGO:50-51`, `USUARIOS:39-40`): se draftea de nuevo cada jornada, pero no puedes repetir el capitán de tu alineación anterior y como mucho repites 4 de los 7.
  - §3 "Elegir tu 7" (`DEL_JUEGO:122-134`, `USUARIOS:110-121`): viñeta nueva "**No repetir**": respecto a tu alineación anterior (la última jornada en la que fichaste) no puedes repetir capitán y repites como máximo 4 jugadores (cambia al menos 3); sin alineación anterior, sin límite; ves un contador «Repetidos n/4»; la base de datos también lo comprueba.
  - §5 Capitán tardío (`DEL_JUEGO:264-267`, `USUARIOS:251-254`): el nuevo capitán tampoco puede ser el de tu alineación anterior.
  - §8 (`DEL_JUEGO:303-306`, `USUARIOS:290-293`): quitar "cualquiera puede fichar a cualquiera en cualquier jornada" → "cualquiera puede fichar a cualquiera; el único límite es no repetir demasiado respecto a tu alineación anterior (sección 3)".
  - FAQ: "¿Puedo repetir el mismo equipo que la jornada pasada?" → No: capitán distinto y al menos 3 cambios.
  - Solo `MANUAL_DEL_JUEGO` §11 Usuarios (`:407-409`): "…pero sin tope de presupuesto **ni regla de repetidos**".

## Step 5: Ranking completo
- **Files:** `src/components/Ranking/Ranking.tsx`, ambos manuales
- **Details:** quitar `.limit(10)` (`:29`); título `Top 10` → `Clasificación` (`:62`). Manuales §7 (`DEL_JUEGO:296`, `USUARIOS:283`): "Muestra la clasificación completa: todos los usuarios ordenados por puntos totales…".
- **Risks:** ninguno (≈22 filas, scroll de página normal, la RLS ya deja leer a todos).

## Step 6: Entrenador José Santapau (solo `Players.tsx`)
- **Files:** `src/components/Players/Players.tsx`, ambos manuales (1 frase, ver P3)
- **Details:**
  - Constante de módulo: `const ENTRENADOR = { name: 'José Santapau', photo: DEFAULT_PHOTO }` (cuando llegue la foto, solo cambia `photo`; ver P2).
  - Estado `selected: Jugador | 'entrenador' | null` (centinela string → el estrechamiento de tipos funciona; `Position` y `PlayerCard` no se tocan). Resaltado de filas de jugadores: `typeof selected === 'object' && selected?.id === j.id`.
  - Fila fija **antes** del `.map` (no entra en el array → `sort`/`calcTotalPoints` intactos): se ve solo con filtro `Todos` y si el nombre casa con la búsqueda (misma lógica `toLowerCase().includes` que el resto). Contenido: foto, `José Santapau`, `<span className="pos-badge">Entrenador</span>`, `∞ pts`.
  - Ficha: un bloque JSX `fichaEntrenador` con las clases de `PlayerCard` (cabecera con foto, nombre, badge "Entrenador" y `.player-card-total` con `∞ pts`; sin estadísticas ni historial). Escritorio: en `.players-detail-panel` si `selected === 'entrenador'`; móvil: envuelto en `.modal-overlay` (cerrar al tocar fuera, `stopPropagation` dentro).
  - Nada en BD, scraper, Draft, Apuestas, cuotas ni puntos.
- **Tests:** ninguno (solo presentación).
- **Risks:** que el texto del easter egg contradiga "Lista de los 19 jugadores" del manual → frase en §8 (P3).

## Step 7: Formación en Mi equipo
- **Files:** `src/lib/draft.ts`, `src/lib/draft.test.ts`, `src/components/Dashboard/Draft.tsx`, `src/index.css`, ambos manuales
- **Details:**
  - Helper puro `filasFormacion<T extends { pos: Position }>(js: T[]): T[][]` → `[contraboyas, laterales, [extremo0, ...boyas, ...resto de extremos], porteros]` (boya en el centro de su fila). Con alineaciones raras (posición cambiada por el admin, histórico sin composición) cada jugador cae en la fila de su posición actual; los dorsales borrados se omiten (como hoy).
  - En `Draft.tsx`, dentro de `.resumen-card`, sustituir el bloque `.mini-pool` (`:337-354`) por el dibujo inline (sin componente nuevo; un solo uso):
    `.pool` > `.pool-halfline` / `.pool-row` (Contraboya) / `.pool-row` (Laterales) / `.pool-zone-line.fivemeter` con `<span class="pool-zone-label">5 m</span>` / `.pool-row` (Extremos + Boya) / `.pool-zone-line.twometer` con `2 m` / `.pool-row.goalkeeper-row` (Portero) / `.pool-goal`.
  - Nodo = `button.player-node` (`onClick={() => setSelectedCard(p)}`, como hoy) con `img.player-node-photo` (`p.photo || DEFAULT_PHOTO`), `span.player-node-name` = nick/nombre + ` ★` si es capitán, `span.player-node-pts` = la etiqueta actual sin cambios: `soloLectura ? \`${pts×(2 si capitán)} pts\` : \`${precios[n]}€\``. **Sin estado nuevo.**
  - Se mantiene debajo "Coste … · Te quedan …", el mensaje y el botón "Cambiar Fichajes". El modal y el editor inline (sin alineación todavía) no cambian.
  - CSS: sustituir la regla muerta `.resumen-card .mini-pool {…}` por `.resumen-card .pool { max-width: 460px; margin: 0 auto; }` (que no se estire a 720 px en escritorio); borrar `.mini-pos` y `.mini-precio` (solo los usaba este bloque). `.mini-pool`/`.mini-player` se quedan (Ranking).
  - Manuales §3 "Tu alineación guardada" (`DEL_JUEGO:84-88`, `USUARIOS:72-76`): "tus 7 jugadores colocados en la piscina por posición (★ en el capitán), con su precio mientras se puede fichar y sus puntos de la jornada cuando ya está resuelta; toca uno para ver su ficha".
- **Tests:** 1 test de `filasFormacion` (orden de filas, boya en medio, portero abajo).
- **Risks:**
  - En las fases "Fichajes cerrados / Partido en juego / Post-partido" (bloqueada pero no `soloLectura`) se sigue enseñando el **precio**, porque los puntos aún no existen: es el comportamiento actual.
  - El valor va en el badge de la esquina del círculo (como el fantasy antiguo), no debajo del círculo: cero CSS nuevo. Si se quiere literalmente debajo, retoque pequeño (ver defaults).
  - `.pool` tiene `min-height: 560px`: comprobar en móvil que no queda un hueco excesivo arriba.

## Step 8: Verificación local
- `npx vitest run` (equivale a `npm run test` sin modo watch), `npm run lint`, `npm run build` → en verde.
- Navegador (`npm run dev`, http://localhost:5173/Sharks-Fantasy/ o la ruta que sirva Vite; **escribe en PROD**), móvil (375 px) y escritorio:
  - [ ] Ranking: salen todos los usuarios, título "Clasificación", medallas en los 3 primeros, mi fila resaltada, el modal de equipo abre y su ficha también; scroll fino en móvil (la barra inferior no tapa el último).
  - [ ] Jugadores: Santapau el primero, badge "Entrenador", `∞ pts`; desaparece al filtrar por posición; búsqueda "santa" lo encuentra; su ficha (modal en móvil, panel en escritorio) sin estadísticas; tocar después otro jugador funciona. No aparece en Mi equipo, ni en los selects de goleador/expulsado de Apuestas, ni en Power-ups.
  - [ ] Mi equipo, vista "Esperando fecha" (la de ahora, J7 resuelta): piscina con Contraboya / 2 Laterales / Extremo + Boya + Extremo / Portero, líneas 5 m y 2 m, portería, puntos (doble en el capitán, ★), tocar abre la ficha; sin desbordes en 320–375 px.
  - [ ] **Con la J8 abierta** (no comprobable hoy sin fecha): precios bajo cada jugador; chip «Repetidos n/4»; ★ del capitán anterior deshabilitada; guardar con 5 repetidos o con el capitán anterior → mensaje en castellano; con 4 y otro capitán → guarda. Probar con la cuenta del admin **no** sirve para el servidor (está exento): para el trigger, ver Step 9.
- Después: hand-off a `mentor` (regla del proyecto).

## Step 9: Aplicar la migración en producción — PASO SEPARADO, requiere aprobación explícita del usuario
- **No se aplica nada en este plan.** Cuando el usuario lo apruebe (back-builder / architect-deployer): aplicar `20261101000000_alineaciones_no_repetir.sql` **antes de que la J8 tenga fecha**.
- Comprobación del trigger en PROD dentro de `BEGIN; … ROLLBACK;` (no deja rastro): como `postgres`, `select set_config('request.jwt.claims', '{"sub":"<uuid de un usuario NO admin sin alineaciones>"}', true)`; insertar 2 jornadas temporales con `orden` explícito por encima del máximo; insertar una alineación válida en la primera y comprobar en la segunda: mismo capitán → error; 5 repetidos → error; 4 repetidos y otro capitán → OK; `UPDATE … SET capitan = <capitán anterior>` → error; repetir con el `sub` de un admin → pasa. `ROLLBACK`.
- Consulta de solo lectura opcional (con `lag() OVER (PARTITION BY usuario_id ORDER BY orden)`) para listar pares seguidos que incumplen la regla: lo esperado es que solo salgan pares del histórico J1–J7 (la regla no existía) y ninguno de la J8.

## Step 10: Commits y PR (git-handler)
Un commit por punto, en inglés, conventional commits, PR a `develop`:
1. `feat(draft): forbid repeating captain and more than 4 players from the previous lineup` — Steps 1–4 (incluye la migración y manuales).
2. `feat(ranking): show the full ranking instead of the top 10` — Step 5.
3. `feat(players): add coach José Santapau as an easter egg in the players list` — Step 6.
4. `feat(draft): show the saved lineup as a water polo formation` — Step 7.
(El task file `docs/tasks/next-jornada-improvements.md` y este plan, en el commit de docs que haga `/close-session`.)

---

## Divergencias con `docs/plan.md` / specs
- `docs/plan.md` no describe reglas de juego ni features futuras → **sin divergencia directa** (no se toca).
- La regla de repetidos **cambia una decisión del spec** `docs/superpowers/specs/2026-09-11-fantasy-dinamico-design.md:31-33` ("cualquiera puede fichar a cualquiera", "draft desde cero cada jornada"). Ya decidido por el usuario en el task file; solo se avisa por si quiere anotarlo en el spec.

## Open questions (con default recomendado)
1. **P1 — ¿"Anterior" = última alineación del usuario o solo la jornada inmediatamente anterior?** Si se saltó la J7 y fichó en la J6, ¿la J8 se compara con la J6? **Default: sí** (última alineación previa por `orden`). La alternativa "solo `orden - 1`" es cambiar una línea en SQL y en `alineacionAnterior`.
2. **P2 — Foto del entrenador:** `public/jugadores/` es público en un repo público, y las fotos de jugadores se sacaron de ahí justo por eso (`20261026000000_fotos_privadas`). **Default: avatar provisional ahora**; cuando haya foto, ¿`public/` igualmente (si al usuario le vale que sea pública) o bucket privado + URL firmada (≈3 líneas en `Players.tsx`)?
3. **P3 — ¿Se menciona al entrenador en los manuales?** Es un easter egg. **Default:** una frase en §8 ("arriba del todo verás al entrenador, José Santapau: ni se ficha ni se apuesta por él").

Defaults menores a validar en la prueba en navegador: boya en el centro de la fila de 2 m; precio/puntos en el badge de la esquina del círculo; título "Clasificación"; mensajes de error exactos del Step 1.

## Acceptance Criteria
- [ ] Con alineación anterior, el Draft no deja guardar el capitán anterior ni más de 4 repetidos (mensaje claro en castellano, chip «Repetidos n/4», ★ anterior deshabilitada); el capitán tardío no ofrece el capitán anterior.
- [ ] Sin alineación anterior, no hay restricción. Admin > Usuarios no aplica la regla.
- [ ] La migración `20261101000000_alineaciones_no_repetir.sql` existe, es idempotente y su trigger rechaza (para no admins) el capitán repetido y >4 repetidos frente a la alineación anterior **y** la siguiente por `orden`, también en el `UPDATE capitan` del capitán tardío. **No aplicada** sin aprobación.
- [ ] Tests nuevos en `draft.test.ts` (regla, `alineacionAnterior`, `filasFormacion`) en verde junto a los existentes.
- [ ] Ranking lista a todos los usuarios ordenados por puntos, sin `limit(10)`, título y manuales actualizados, modal de equipo funcionando.
- [ ] José Santapau sale el primero en Jugadores como "Entrenador" con ∞; ficha sin estadísticas; no sale en Draft, Apuestas ni Power-ups; nada en BD/scraper.
- [ ] Mi equipo pinta los 7 en la piscina (Contraboya / 2 Laterales / Extremo + Boya + Extremo / Portero, líneas 5 m y 2 m, portería), ★ en el capitán, precio mientras se ficha y puntos (×2 capitán) en "Esperando fecha"; tocar abre la ficha; bien en móvil y escritorio; el modal "Cambiar Fichajes" sin cambios.
- [ ] Manuales actualizados (repetidos, ranking, formación, entrenador según P3).
- [ ] `npm run test`, `npm run lint`, `npm run build` en verde; checklist de navegador hecha (la parte de J8, cuando tenga fecha).
