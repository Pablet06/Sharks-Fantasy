# Sync con la federación + panel de admin extendido — Diseño

**Fecha:** 2026-09-03
**Estado:** Aprobado en brainstorming, pendiente de plan de implementación
**Rama:** `feature/federation-sync` (nueva, tras mergear PR #1)

---

## Contexto

- El scraper actual (`scraper/src/index.ts`) lee la página de **totales acumulados** de un equipo en `clupik.pro` y calcula deltas contra la suma del `historial`. Resultado: no distingue a qué jornada pertenece cada dato, mete todo lo nuevo desde la última ejecución en "la siguiente jornada" (por eso la J8 en producción es un pegote de mayo-2026 con toda la temporada junta), y se rompe si la web corrige una estadística a la baja.
- El modelo de stats tiene 10 campos (`partidos, goles, penaltis, tarjetas, expulsiones, tiros, penaltis_fallados, paradas, goles_contra, penaltis_parados`). Cuatro de ellos (`tiros`, `paradas`, `penaltis_parados`, `goles_contra` individual) **nunca han tenido fuente de datos** — siempre a 0.
- El "panel de admin" (`src/components/Admin/AdminPanel.tsx`) sólo edita una entrada de jornada de un jugador. No hay CRUD de jugadores, ni de jornadas, ni gestión de usuarios.
- No existe concepto de temporada. `historial.jornada` es un entero plano.
- `usuarios.puntos` está a 0 para los 2 usuarios en producción — el recálculo nunca ha corrido bien.

## Objetivos

1. **Sync correcto por jornada** desde la fuente autoritativa de la federación (`waterpolo.fncv.es`), verificable contra sus totales.
2. **Panel de admin extenso**: CRUD de jugadores, jornadas/historial y usuarios; estado del sync; transición de temporada.

## No-objetivos

- Tabla de temporadas / histórico multi-temporada (decisión explícita del usuario: modelo plano).
- Estadísticas de portero por parte (paradas, penaltis parados) — no existen en la fuente.
- Botón de "sincronizar ahora" en el navegador (el scraper necesita la service-role key). El cron semanal + `npm run sync` manual cubren el caso.
- Rediseño visual del resto de la app (sigue pendiente el estilo "C" en Ranking/Players/Profile — fuera de alcance).

---

## Fuente de datos: plataforma Leverade / FNCV

`waterpolo.fncv.es` es un frontend temático de **Leverade** (backend `clupik.pro`, `api.leverade.com`). El equipo es `team/15688441` = "C.W. Sharks A" (mismo ID que usa el scraper actual).

### API pública de Leverade (JSON:API, con CORS, sin token)

Sirve para **enumerar** partidos:

```
GET https://api.leverade.com/tournaments/{tournamentId}?include=teams,groups
    → group id
GET https://api.leverade.com/groups/{groupId}?include=rounds
    → 18 rounds (jornadas), cada uno con attributes.order = número de jornada
GET https://api.leverade.com/rounds/{roundId}?include=matches
    → matches con id, attributes.date, attributes.finished
```

El detalle de partido (`matches/{id}?include=...`) devuelve **401** sin auth — no se usa.

### Páginas SSR de FNCV (HTML, parseables con cheerio)

`GET https://waterpolo.fncv.es/es/tournament/{tid}/match/{matchId}/stats`

Renderizado en servidor. Contiene, **por partido, por jugador y por equipo**, la tabla completa:

| Col | Significado | Uso fantasy |
|---|---|---|
| A | `Titular N` (dorsal) o vacío | jugó ese partido (aparece con dorsal) |
| G | Goles en juego | ✅ |
| GP | Goles de penalti | ✅ |
| G5P | Goles en tanda de penaltis | ignorar |
| TA / TR | Tarjetas amarillas / rojas | ✅ (suma) |
| EX | Expulsiones de 20 segundos | ✅ |
| ED / EB / EN / EP | Expulsiones definitivas / brutalidad / definitiva no discip. / con penalti | ✅ (suma → `expulsiones_graves`) |
| P | Faltas por penalti (penaltis cometidos) | ✅ (negativo) |
| PF | Penaltis fallados | ✅ (negativo) |
| O | Otros | ignorar |

Cada fila enlaza a `/es/players/{leveradeId}` — **ID estable de federación**, mejor clave de emparejamiento que el nombre (hay dos "* FERRER BAIXAULI" en la plantilla).

La cabecera de la página da el marcador (`Godella B Goles 11 : Goles 7 Sharks A`) → **goles encajados por el equipo** ese partido, necesario para el bonus de portero.

### Rate limiting

Cloudflare bloquea (`429` / challenge) si se piden muchas páginas seguidas. El scraper **debe** pausar ~1,5–2 s entre peticiones y mandar un `User-Agent` de navegador real. Backfill de 18 jornadas ≈ 1–2 min.

---

## Subproyecto A — Sync federación

### A1. Modelo de stats nuevo

`historial.stats` (jsonb, delta de la jornada) y `jugadores.stats` (jsonb, acumulado de temporada) pasan a:

```ts
interface PlayerStats {
  partidos: number            // 1 si aparece en el /stats del partido con dorsal, si no 0
  goles: number               // G
  goles_penalti: number       // GP
  penaltis_fallados: number   // PF
  faltas_penalti: number      // P
  tarjetas: number            // TA + TR
  expulsiones: number         // EX
  expulsiones_graves: number  // ED + EB + EN + EP
  goles_contra: number        // goles encajados por el EQUIPO ese partido (0 en acumulado; sólo se lee para porteros)
}
```

Se **eliminan** `penaltis` (renombrado a `goles_penalti`), `tiros`, `paradas`, `penaltis_parados`. `goles_contra` cambia de semántica (equipo, no individual).

### A2. Fórmula de puntos (`calcMatchPoints`)

```
TODOS:
  partidos            × 1
  faltas_penalti      × −1
  expulsiones         × −1
  tarjetas            × −3
  expulsiones_graves  × −5

JUGADORES DE CAMPO (pos ≠ 'Portero'):
  goles               × 5
  goles_penalti       × 3
  penaltis_fallados   × −2

PORTEROS (pos == 'Portero', sólo si partidos > 0):
  + 2                              (bonus de titularidad)
  + max(0, 10 − goles_contra)      (bonus defensivo de equipo)
```

Ejemplos: portero con 7 encajados → `1 + 2 + 3 = 6`; con 15 → `1 + 2 + 0 = 3`. Delantero con 4 goles en juego → `1 + 20 = 21`.

**Ceiling ponytail:** si dos porteros son convocados el mismo partido, ambos reciben el bonus defensivo (la fuente no da minutos jugados). Es raro; se corrige a mano en el panel si pasa.

`calcMatchPoints` se duplica en `src/lib/points.ts` y `scraper/src/points.ts` (procesos separados, ya era así). Un test (`src/lib/points.test.ts`) cubre los dos caminos (campo / portero) con casos límite.

### A3. Emparejamiento de jugadores

- Nueva columna `jugadores.leverade_id bigint UNIQUE`.
- Script one-off (o primera pasada del backfill) que recorre los `/stats` del Sharks, junta `{leveradeId, nombreFederación}` y los muestra para que el admin/dev enlace cada uno con su fila de `jugadores`. Alternativa: rellenar el `leverade_id` a mano una vez (17 jugadores).
- En el sync: match por `leverade_id`. Fallback: nombre normalizado (minúsculas, sin acentos, nombre + primer apellido). Un jugador de la federación sin emparejar → se salta y se acumula en una lista de warnings que el sync imprime al final y guarda en `config` (`unmatched_players`) para que el panel la muestre.

### A4. Arquitectura del scraper

Reescritura de `scraper/src/`. El `index.ts` actual → `scraper/legacy/`.

```
scraper/src/
  leverade.ts   cliente API pública (enumerar jornadas → partidos)
  fncv.ts       fetch + cheerio de /match/{id}/stats → { equipoLocal, equipoVisitante, golesLocal, golesVisitante, jugadores: [{ leveradeId, nombre, dorsal, G, GP, TA, TR, EX, ED, EB, EN, EP, P, PF }] }
  match.ts      resolver leveradeId → jugadores.id (con fallback a nombre)
  points.ts     fórmula A2
  sync.ts       orquestación
  index.ts      CLI
  config.ts     lee la tabla config (tournament_id, etc.)
```

**CLI:**

| Comando | Efecto |
|---|---|
| `npm run sync` | Incremental: procesa jornadas `finished` que aún no están completas en `historial`. Idempotente. |
| `npm run sync -- --backfill` | Borra `historial`, resetea `jugadores.stats`, reprocesa las 18 jornadas de la temporada activa. |
| `npm run sync -- --jornada N` | Reprocesa sólo la jornada N (borra sus filas y las reescribe). |

**`sync.ts` por jornada:**
1. API Leverade → partidos de la jornada. Filtra `finished == true`.
2. Para cada partido: `fncv.ts` baja el `/stats`. Si ningún equipo es "C.W. Sharks A" → siguiente.
3. Para el equipo Sharks: por cada jugador de la tabla, construye el `PlayerStats` de la jornada (`partidos = 1`, `goles_contra = golesDelRival`).
4. Jugadores de la plantilla que **no** aparecen en el `/stats` de esa jornada → fila con `partidos = 0` y todo a 0 (mantiene el `historial` denso, como ahora).
5. `upsert` en `historial` con `onConflict: (jugador_id, jornada)`. `puntos` = `calcMatchPoints`.
6. Al terminar todas las jornadas: recalcula `jugadores.stats` (suma de `historial`) y `usuarios.puntos` (suma de puntos de los jugadores de su `equipo`).

**Guardas:**
- Modo incremental + delta negativo (web corrige a la baja) → warning + no aplica esa jornada.
- Partido sin datos (`/stats` vacío aunque `finished`) → warning, no crea filas.
- Fallo de red / 429 → reintento con backoff (máx 3), luego aborta con código ≠ 0 (el workflow lo marca en rojo).

**`scraper.yml`:** sin cambios de estructura (cron sábado 22:00 UTC + `workflow_dispatch`), sólo pasa a llamar al `sync` incremental. Secrets `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` ya existen.

### A5. Migración de esquema

```sql
-- jugadores
ALTER TABLE jugadores ADD COLUMN leverade_id bigint UNIQUE;

-- historial: unicidad para upsert idempotente
ALTER TABLE historial ADD CONSTRAINT historial_jugador_jornada_uniq UNIQUE (jugador_id, jornada);

-- tabla de configuración mínima (no es una tabla de temporadas)
CREATE TABLE config (
  key   text PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO config (key, value) VALUES
  ('tournament_id', '1324114'),
  ('last_sync_at', ''),
  ('unmatched_players', '[]');

ALTER TABLE config ENABLE ROW LEVEL SECURITY;
CREATE POLICY config_read   ON config FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY config_admin_write ON config FOR ALL TO authenticated
  USING     (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.is_admin));
```

La forma nueva de `stats` jsonb no necesita migración de datos: el `historial` se vacía en el backfill y `jugadores.stats` se recalcula.

### A6. Backfill y verificación (25-26)

1. Aplicar migración A5.
2. Rellenar `jugadores.leverade_id` (17 filas).
3. `npm run sync -- --backfill`.
4. **Verificación:** comparar `jugadores.stats` (acumulado calculado) contra la tabla `/es/tournament/1324114/statistics` de la federación, jugador por jugador (PJ, G, GP, EX, P, PF). Se documenta la comparación en `docs/diary/federation-sync.md`. Diferencias esperadas sólo por definición de "partido jugado" (convocado vs jugado) — se decide el criterio y se deja fijado.
5. Revisar `usuarios.puntos` > 0 y coherentes.

### A7. Cambios en el frontend (tipos + UI)

- `src/types/index.ts`: `PlayerStats` nuevo (A1).
- `src/lib/points.ts`: `calcMatchPoints` nuevo (A2). `calcTotalPoints` sin cambios.
- `src/lib/points.test.ts`: reescrito para la fórmula nueva.
- `src/components/Dashboard/PlayerCard.tsx`: `getKeyStats` y el grid de stats — quitar paradas/tiros/penaltis_parados, usar los campos nuevos. Porteros muestran `G. Encajados (equipo)` en vez de paradas.
- Buscar cualquier otro uso de los campos eliminados (`Players.tsx`, `Pool.tsx`, `Profile.tsx` no los usan hoy — confirmado por grep, revisar de nuevo al implementar).

---

## Subproyecto B — Panel de admin extendido

### B1. De modal a vista completa

`AdminPanel` deja de ser un modal. Pasa a ser una **vista** que se muestra cuando `usuario.is_admin` y el usuario pulsa "Admin" en el Shell (reemplaza el contenido de `<main>`, con un botón "volver" a la app normal). Internamente, sub-navegación por secciones.

Ficheros:
```
src/components/Admin/
  AdminView.tsx        contenedor + sub-nav
  JugadoresAdmin.tsx
  HistorialAdmin.tsx
  SyncAdmin.tsx
  UsuariosAdmin.tsx
  TemporadaAdmin.tsx
  useAdminData.ts      fetch + mutaciones compartidas
```

### B2. Secciones

**Jugadores** — tabla de `jugadores`:
- Crear (nombre, nick, dorsal `numero`, posición, frase, foto URL, `leverade_id`).
- Editar cualquier campo inline.
- Borrar (con confirmación; avisa si el jugador está en el `equipo` de algún usuario).

**Historial** — por jornada:
- Selector de jornada → tabla de las entradas de esa jornada (jugador, stats, puntos).
- Editar los stats de una entrada → recalcula `puntos` (`calcMatchPoints` cliente) y el acumulado del jugador y `usuarios.puntos` (vía RPC `recalc_puntos`, B4).
- Añadir entrada manual (jugador + jornada + stats).
- Borrar una entrada. Borrar una jornada entera (todas sus filas).

**Sync** — sólo lectura + una acción de BD:
- `config.last_sync_at`, número de jornadas en `historial`, `config.unmatched_players`.
- Botón "Recalcular puntos" → RPC `recalc_puntos()`.
- Texto de ayuda: "Para re-sincronizar con la federación: `npm run sync` en local, o lanzar el workflow 'Weekly Stats Sync' en GitHub Actions."

**Usuarios** — tabla de `usuarios`:
- Listar (nombre, email si accesible, puntos, is_admin, equipo).
- Marcar / desmarcar admin.
- Editar `nombre` y `equipo` (7 `numero`).
- Borrar usuario → reutiliza la edge function `delete-account` (hoy sólo borra la cuenta propia; se amplía para aceptar un `target_user_id` si el llamante es admin).

**Temporada** — dos acciones con confirmación fuerte (escribir "CONFIRMAR"):
- **Terminar temporada:** descarga `historial` completo como JSON (el navegador, `Blob`), luego `DELETE FROM historial`, `jugadores.stats` a cero, `usuarios.puntos` a 0.
- **Empezar temporada:** input para el nuevo `tournament_id` de la federación → `UPDATE config`. (El backfill de la nueva temporada se lanza luego con `npm run sync -- --backfill`.)

### B3. RLS nuevas (migración)

```sql
-- DELETE admin en jugadores e historial
CREATE POLICY jugadores_admin_delete ON jugadores FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.is_admin));
CREATE POLICY historial_admin_delete ON historial FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.is_admin));

-- usuarios: admin puede ver / editar / borrar cualquier fila
CREATE POLICY usuarios_admin_all ON usuarios FOR ALL TO authenticated
  USING     (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.is_admin));
```

Cuidado: la subconsulta a `usuarios` dentro de una policy de `usuarios` puede recursar. Se resuelve con una función `is_admin(uid uuid) returns boolean` marcada `SECURITY DEFINER` y `STABLE`, y todas las policies la usan. (Reemplaza también los `EXISTS (...)` de las policies existentes de la migración `admin_rls` por consistencia.)

### B4. Función de recálculo

```sql
CREATE FUNCTION recalc_puntos() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- acumulado por jugador
  UPDATE jugadores j SET stats = sub.tot
  FROM (SELECT jugador_id, <suma jsonb de historial.stats> AS tot FROM historial GROUP BY jugador_id) sub
  WHERE j.id = sub.jugador_id;
  -- puntos por usuario (equipo = numero[])
  UPDATE usuarios u SET puntos = COALESCE(sub.p, 0)
  FROM (SELECT u2.id, SUM(h.puntos) p
        FROM usuarios u2
        LEFT JOIN jugadores j ON j.numero = ANY(u2.equipo)
        LEFT JOIN historial h ON h.jugador_id = j.id
        GROUP BY u2.id) sub
  WHERE u.id = sub.id;
END $$;
REVOKE ALL ON FUNCTION recalc_puntos() FROM public;
GRANT EXECUTE ON FUNCTION recalc_puntos() TO authenticated;  -- guardada además por check is_admin dentro
```

Se añade una guarda `IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION ...` al principio.

El scraper (service role) recalcula con su propia lógica en `sync.ts` (no llama a la RPC) o llama a `recalc_puntos()` vía RPC — a decidir en el plan; preferible una sola fuente de verdad (la RPC).

---

## Secuencia de entrega

1. **Mergear PR #1** (`feature/admin-rls-and-cleanup` → `develop`) o reintegrarlo en la rama nueva.
2. Rama `feature/federation-sync` desde `develop`.
3. **Fase A** (sync): migración A5 → scraper nuevo → backfill 25-26 → verificación → frontend tipos/UI. PR + merge a `develop`.
4. **Fase B** (admin): migración B3/B4 → `AdminView` + secciones. PR + merge a `develop`.
5. `develop` → `main` para desplegar (GitHub Pages).

Cada fase es un PR independiente y desplegable.

## Estrategia de test

- `scraper`: test de parseo de `fncv.ts` contra un HTML fijo guardado (fixture de un `/stats` real). Test de `points.ts`.
- `src/lib/points.test.ts`: fórmula nueva, casos campo/portero/límite.
- Backfill: verificación manual documentada contra la web de la federación (A6.4).
- Admin: sin suite E2E (YAGNI para 1 admin); prueba manual de cada sección antes del merge, documentada en el diario.

## Riesgos / ceilings conocidos

| Riesgo | Mitigación |
|---|---|
| Cloudflare bloquea el scraper | Pausa 1,5–2 s + User-Agent real. Si aun así bloquea: mover a `clupik.pro` (mismo HTML, menos CF). |
| "Partido jugado" = convocado, no minutos reales | Se fija ese criterio y se documenta. Coincide con cómo cuenta la federación PJ. |
| Doble portero convocado → doble bonus defensivo | Raro. Corrección manual en el panel. |
| La API de Leverade cambia o cae | El enumerado se puede rehacer scrapeando el calendario SSR (`/tournament/{tid}/calendar`, una página por jornada). |
| Recursión en RLS de `usuarios` | Función `is_admin()` `SECURITY DEFINER`. |
| Borrar jugador que está en un `equipo` | El panel avisa; el `numero` huérfano en `equipo` ya se ignora en el render (`jugadores.find` → undefined → skip). |
