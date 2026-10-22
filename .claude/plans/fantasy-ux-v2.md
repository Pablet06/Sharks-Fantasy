# Fantasy UX v2 + Fantasy numbering + 25-26 prices: Implementation Plan

**Goal:** Ship the Fantasy's own jornada numbering ("Jornada 1" = federation round 7), clearer "already done" states in Mi equipo, Apuestas and Power-ups, and player prices seeded from the 25-26 season, before the season-26-27 opener (Sat 2026-10-24).
**Approach:** Keep `jornadas.numero` (federation round) as the only internal key. Add a display-only `jornadas.orden` column, assigned by a DB trigger. Store the 25-26 stats in a separate `historial_anterior` table that the scraper fills. `calcPrecio` reads a mixed window. The UI keeps today's editors and wraps each one in "summary block + modal" when data already exists.
**Branch:** `feature/fantasy-ux-v2`, cut from `develop` (the current branch `feature/season-launch-readiness` has uncommitted changes, so commit or stash them first).
**Estimated steps:** 9
**Status:** written by the planner on 2026-10-22 from requirements agreed with the user. The user still has to confirm this plan before implementation starts.

## Prod state checked 2026-10-22 (read-only SQL)

- `jornadas` has one row: `numero=7`, `fecha_partido=2026-10-24 13:45Z`, not finished. **The J7 draft closes Fri 2026-10-23 at 13:45Z.**
- `historial` is empty. `presupuestos` and `powerups_aplicados` are empty. `config.tournament_id=1344408` (26-27).
- 'Pablo 2' (`baef0241-…`) has an `alineaciones` row for J7 (`[1,12,4,3,5,13,6]`, captain 6, `presupuesto_usado=350`) and 3 `apuestas` rows for J7: resultado gana 50€, goleador 6 100€, expulsado 11 5€.
- There are 19 `jugadores`, and every one has a `leverade_id`. The 4 new players (Antonio #3, Jose Almodóvar #7, Luca #18, Ackermann #19) have 2026 leverade ids and no 25-26 games.
- **No server-side price check exists anywhere.** Only the client computes the price (`calcPrecio` in `Draft.tsx`). The client sends `alineaciones.presupuesto_usado` and no trigger or function validates it. `resolver_jornada` never reads prices. So "keeping both consistent" only applies to the frontend, and nothing in the DB needs changing. This is pre-existing trust in the client. Flag it, but do not fix it in this plan.

---

## Step 1: DB migration, Fantasy numbering (`orden`) + resolver fix
- Files: `supabase/migrations/20261022000000_fantasy_jornadas_orden.sql`
- Details (idempotent outline):
```sql
ALTER TABLE jornadas ADD COLUMN IF NOT EXISTS orden integer;

-- Backfill: rows without orden, in date order, continuing after the current max (today: 7 -> 1)
UPDATE jornadas j SET orden = sub.base + sub.rn
FROM (SELECT numero,
             (SELECT COALESCE(max(orden),0) FROM jornadas) AS base,
             row_number() OVER (ORDER BY fecha_partido NULLS LAST, numero) AS rn
      FROM jornadas WHERE orden IS NULL) sub
WHERE j.numero = sub.numero;

ALTER TABLE jornadas ALTER COLUMN orden SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS jornadas_orden_key ON jornadas(orden);

CREATE OR REPLACE FUNCTION jornadas_asignar_orden() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.orden IS NULL THEN
    NEW.orden := (SELECT COALESCE(max(orden),0) + 1 FROM jornadas);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS jornadas_before_insert_orden ON jornadas;
CREATE TRIGGER jornadas_before_insert_orden BEFORE INSERT ON jornadas
FOR EACH ROW EXECUTE FUNCTION jornadas_asignar_orden();
```
  - A DB trigger instead of scraper code covers every writer: `syncCalendar`, `syncJornada` and admin inserts. The scraper's upserts never include `orden`, and PostgREST's `ON CONFLICT DO UPDATE` only sets the columns in the payload, so an upsert on an existing row keeps its `orden`. The BEFORE INSERT trigger's value goes into EXCLUDED and is then ignored. Verify this (see the acceptance criteria).
  - **Resolver fix (flagged).** `resolver_jornada` funds `p_jornada + 1`. When the Sharks have a bye or the federation rounds are not consecutive (7 → 9), that row does not exist, so the bets' winnings or losses are silently dropped and the next jornada falls back to 1000€. In the same migration, `CREATE OR REPLACE` the **full** current body from `20260914000001_fantasy_powerups_resolver.sql` (no later migration redefines it). Change only these lines:
    ```sql
    DECLARE v_siguiente integer;  -- added to the existing DECLAREs
    ...
    SELECT numero INTO v_siguiente FROM jornadas
    WHERE orden = (SELECT orden + 1 FROM jornadas WHERE numero = p_jornada);
    IF v_siguiente IS NOT NULL THEN
      INSERT INTO presupuestos ... SELECT a.usuario_id, v_siguiente, ...
        + CASE WHEN EXISTS (... pa.jornada = v_siguiente AND pa.tipo='presupuesto_extra') ...
    ```
    Keep the REVOKE/GRANT lines. `cuota_actual` (`numero < p_jornada`) and the streak token (`max(numero) < p_jornada`) already compare by order, so they stay correct, because federation numbers increase monotonically.
  - A remaining risk, not new: if J(N+1) is not in `jornadas` yet when J(N) resolves, nothing gets funded. The funding block is an idempotent upsert that `v_ya_finalizada` does not gate, so the fix is to re-run "Reprocesar jornada N" in Admin once the next jornada appears. Document this in the manual's admin section.

## Step 2: DB migration, `historial_anterior`
- Files: `supabase/migrations/20261022000001_historial_anterior.sql`
- Details:
```sql
CREATE TABLE IF NOT EXISTS historial_anterior (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jugador_id  <same type as jugadores.id> NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  jornada     integer NOT NULL,          -- 25-26 federation round
  stats       jsonb   NOT NULL,
  puntos      integer NOT NULL,
  date        <same type as historial.date>,
  UNIQUE (jugador_id, jornada)
);
ALTER TABLE historial_anterior ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS historial_anterior_select ON historial_anterior;
CREATE POLICY historial_anterior_select ON historial_anterior FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS historial_anterior_admin_all ON historial_anterior;
CREATE POLICY historial_anterior_admin_all ON historial_anterior FOR ALL TO authenticated
  USING (is_admin((SELECT auth.uid()))) WITH CHECK (is_admin((SELECT auth.uid())));
```
  - **Why a separate table and not a `temporada` column:** `resolver_jornada`, `cuota_actual` (`historial h WHERE h.jornada < p_jornada`), `recalc_puntos` and the scraper's incremental check all read `historial` without a season filter. Mixing seasons there would corrupt odds and stats.
  - **Read policy, deviating from "authenticated only":** `useJugadores` runs once at `App` mount, possibly before login (as anon), and never refetches. With authenticated-only read, the embed comes back empty for a fresh login and every player shows 50€ until the page is reloaded. Use the same public read as `historial`. This is public federation data anyway. The user should confirm this.
  - The scraper writes with the service role, which bypasses RLS. Memory notes a risk that the workflow secret may not be the service-role key. If the backfill fails with an RLS error, that is the reason.

## Step 3: Scraper, backfill of 25-26 into `historial_anterior`
- Files: `scraper/src/sync.ts`, `scraper/src/index.ts`, `.github/workflows/scraper.yml`, `scraper/test/sync.test.ts`
- Details:
  - `syncJornada(tournamentId, round, dbPlayers, destino: 'historial' | 'historial_anterior' = 'historial')`. When the destination is `historial_anterior`, **skip the `jornadas` upsert** and upsert the dense rows into `historial_anterior` (`onConflict: 'jugador_id,jornada'`). Nothing else changes.
  - New export `runBackfillAnterior(tournamentId: string)`: `getDbPlayers()`, then `getRounds(tid)`, then for each round call `syncJornada(..., 'historial_anterior')`. Log the unmatched players: Álvaro Mayordomo and César Paredes are expected, since they left. **No** `syncCalendar`, no `resolver_jornada`, no stale cleanup, no `setConfig`. Set exit code 1 if every round failed.
  - `index.ts`: `--anterior <tournamentId>` calls `runBackfillAnterior`. It must be an integer and cannot be combined with `--backfill` or `--jornada`.
  - Workflow: add a `workflow_dispatch` input `args` (default `''`) and run `npm run sync:prod -- ${{ inputs.args }}`. The cron path is unchanged because the empty default keeps it incremental. Run it once from GitHub with `--anterior 1324114`. A home IP gets HTTP 429 from Cloudflare, but GitHub Actions IPs worked.
  - The scraper writes dense rows, so the 4 new players get `partidos=0` rows. `calcPrecio` filters those out, so their price is 50€.

## Step 4: `calcPrecio`, base 50 + mixed window
- Files: `src/lib/precio.ts`, `src/lib/precio.test.ts`, `src/types/index.ts`, `src/hooks/useJugadores.ts`, `src/components/Dashboard/Draft.tsx`
- Exact change:
```ts
/** Precio: máx(50, round(50 + 12 × media de las últimas 5 jornadas jugadas)).
 * Ventana mixta: primero las de esta temporada (más recientes primero) y
 * se completa con las de la temporada anterior hasta 5. */
export function calcPrecio(historial: HistorialEntry[], anterior: HistorialEntry[] = []): number {
  const jugadas = (h: HistorialEntry[]) =>
    h.filter(x => x.stats.partidos > 0).sort((a, b) => b.jornada - a.jornada)
  const ventana = [...jugadas(historial), ...jugadas(anterior)].slice(0, 5)
  if (ventana.length === 0) return 50
  const media = ventana.reduce((s, h) => s + h.puntos, 0) / ventana.length
  return Math.max(50, Math.round(50 + 12 * media))
}
```
  - `Jugador` type: add `historial_anterior?: HistorialEntry[]`. `useJugadores` select becomes `'*, historial(*), historial_anterior(*)'`.
  - `Draft.tsx`: call `calcPrecio(j.historial ?? [], j.historial_anterior ?? [])`. This is the only call site, and there is no server copy (see the prod-state notes above).
  - `docs/MANUAL_DEL_JUEGO.md` §Precio: update the formula and the mixed-window explanation.

## Step 5: Fantasy jornada labels across the UI
- Files: `src/types/index.ts` (`Jornada.orden: number`), `src/lib/jornada.ts` (+ test), `src/hooks/useJornadas.ts` (new, small), `Draft.tsx`, `Apuestas.tsx`, `Powerups.tsx`, `Ranking.tsx`, `PlayerCard.tsx`
- Details:
  - Draft, Apuestas and Powerups already fetch `jornadas` with `select('*')`, so they get `orden` for free. Change the headers to `Jornada {jornada.orden}`.
  - For places that only have a federation number, add `etiquetaJornada(jornadas, numero): number` in `lib/jornada.ts`. It returns `orden`, or `numero` as a fallback when the row is missing. Add `useJornadas()`, a single `select('numero, orden')`. Use them in: the Ranking modal ("Jornada {…}"), the "Resultado de tus apuestas de la jornada {…}" line in Apuestas, and the `J{…}` per-match list in PlayerCard. The 25-26 rows are not shown in PlayerCard.
  - Admin (`SyncAdmin` "Reprocesar jornada", `HistorialAdmin`) keeps federation numbers, because it is an internal tool. Optionally add a hint such as "nº federación".

## Step 6: Mi equipo (Draft.tsx), summary + "Cambiar Fichajes" modal
- Files: `src/components/Dashboard/Draft.tsx`, `src/index.css`
- Details:
  - Move the existing chips, list and save button into one `editor` JSX variable. Do not create a new component file.
  - If `alineacion !== null`, show a summary block:
    - the 7 players (photo, nick, position, ★ on the captain)
    - the cost at current prices
    - "Te quedan X€" (`presupuesto - coste`)
    - a full-width "Cambiar Fichajes" button, only when not `bloqueada`, which opens the existing `modal-overlay` + `team-modal` (as in Ranking) containing `editor`.
  - If there is no lineup and the jornada is not locked, render `editor` inline as today.
  - If the jornada is locked, show the summary block (no button), plus the capitán-tardío select as today. This replaces the read-only full list.
  - **Bug to fix along the way:** `guardar()` never updates `alineacion`, so the summary would not appear until a reload. Upsert with `.select().single()`, then `setAlineacion(data)` and close the modal on success.
  - When the modal is cancelled, reset `seleccion`/`capitan` to the saved `alineacion`.
  - Budget header: show only the money left. Replace `{presupuesto - usado}€ <small>de {presupuesto}€</small>` with "Te quedan {presupuesto - usado}€".
  - Full-width save button: `.draft-container` is not a flex column (`.apuestas-container` is, so its button stretches). Add `width: 100%` to the Draft save button, either as a modifier class or by giving `.draft-container` the same `display:flex; flex-direction:column; gap:14px`. Check that `.players-list` still looks right.

## Step 7: Apuestas, notice + summary + "Modificar apuestas" modal
- Files: `src/components/Dashboard/Apuestas.tsx`
- Details:
  - Notice, always visible while the jornada is open, both in the summary and in the form: "Lo que ganes o pierdas con tus apuestas (el importe apostado NO se descuenta de esta jornada) se suma o resta a tu presupuesto de la **Jornada {jornada.orden + 1}** (1000€ ± resultado neto)." There is no rule change: `orden + 1` is by definition the next Fantasy jornada, and the Step 1 fix makes the backend match it.
  - If `existentes.length > 0` and the jornada is not locked: show a summary block (label, selection with the player's nick instead of the raw dorsal, amount, odds, potential gain, and the total staked against the 20% cap) plus a full-width "Modificar apuestas" button that opens a modal with the current form, using the same `form` JSX variable. With no bets, show the form inline as today. The locked view is unchanged.
  - **Bug to fix along the way:** after `guardar()`, `existentes` is stale, so a second save in the same session computes the wrong `idsABorrar`. Re-fetch the bets for this jornada after a successful save (reuse the query, extracted into a `cargar()` function), then close the modal.

## Step 8: Power-ups, informative block
- Files: `src/components/Dashboard/Powerups.tsx`
- Details: `UNIQUE (usuario_id, jornada)` allows at most one power-up per jornada. Replace the `aplicado` placeholder `<p>` with a card that shows "Power-up activado para la Jornada {orden}", the label, and the target player's nick instead of "dorsal N". Leave the inventory and the "no aplicado" UI as they are.

## Step 9: Deploy + data + verification
- Order (against the deadline, Fri 23 Oct 13:45Z):
  1. Apply the Step 1 and Step 2 migrations to prod via `architect-deployer`.
  2. Dispatch the scraper workflow with `--anterior 1324114`.
  3. Run the sanity query below and show the price table to the user.
  4. Merge and deploy the frontend.
  5. Update `docs/MANUAL_DEL_JUEGO.md` (numbering, prices, bets notice, re-processing tip) and add an ADR for `orden` and `historial_anterior`.
- Sanity query (prices before any 26-27 game):
```sql
WITH v AS (SELECT jugador_id, puntos,
             row_number() OVER (PARTITION BY jugador_id ORDER BY jornada DESC) rn
           FROM historial_anterior WHERE (stats->>'partidos')::int > 0)
SELECT j.numero, j.nick, count(v.puntos) n,
       GREATEST(50, round(50 + 12 * COALESCE(avg(v.puntos), 0))) AS precio
FROM jugadores j LEFT JOIN v ON v.jugador_id = j.id AND v.rn <= 5
GROUP BY j.numero, j.nick ORDER BY precio DESC;
-- best-7 total = sum of the top 7 precio values
```

## Tests to add (vitest)
- `src/lib/precio.test.ts`:
  - Update the existing case: 172 becomes **122** (50 + 12×6).
  - The floor case stays at 50.
  - New cases:
    - only `anterior` (5 most recent of 25-26)
    - mixed: 2 current-season + 6 previous, which uses the 2 current + the 3 most recent previous
    - 5+ current-season games ignore `anterior` completely
    - `partidos=0` rows in `anterior` are skipped
    - a player with no history in either season costs 50.
- `src/lib/jornada.test.ts`: `etiquetaJornada` returns `orden`, and falls back to `numero` when the row is missing.
- `src/lib/draft.test.ts`: no change (the signature is the same).
- `scraper/test/sync.test.ts` (follow the existing `vi.mock('../src/supabase')` pattern):
  - `syncJornada(..., 'historial_anterior')` upserts into `historial_anterior` and never touches `jornadas`.
  - `runBackfillAnterior` does not call `rpc('resolver_jornada')`.
  - `index` rejects `--anterior` combined with `--backfill`.
- SQL checks on prod after the migration (read-only, plus one `BEGIN … ROLLBACK`):
  - Row 7 has `orden=1`.
  - Re-running the `syncCalendar`-style upsert on 7 keeps `orden=1`.
  - Inside BEGIN/ROLLBACK: insert numero 9 and expect `orden=2`, then call the resolver logic with 7 and see funding go to numero 9.
- Frontend tests run in a node env without jsdom, so the component changes are verified by hand in `npm run dev`. Check every state of the 3 tabs: no data, data present, modal edit and save, locked.

## Risks
- **Cloudflare / 429:** the backfill must run from GitHub Actions. If it is still blocked, prices stay at 50€ for everyone. That is consistent and harmless, but not what was agreed. Do not loop on retries.
- **Price calibration (flag for the user):** the 2026-09-11 spec measured the best 7 at about 1130€ with **base 100** × 12, which means an average of about 5.1 pts. With **base 50** the same players cost about **780€**, so the 1000€ budget would not limit anyone. That estimate comes from season averages, not last-5. Real numbers come from the Step 9 query. If the best 7 is below about 1100€, the knob is the multiplier: about 20–22 restores roughly 1070–1140€. Do not change it without the user's OK.
- **Prod data (Pablo 2):** none of the migrations touch `alineaciones` or `apuestas`. `orden` is additive and the resolver keeps the same key. His saved J7 lineup cost 350€ at the old prices. If the new prices push it above 1000€, nothing breaks server-side, because there is no server check. He would only see "Te quedan" go negative, and re-saving would fail client validation. Check this after the Step 9 query.
- **Prices change after people have drafted:** the J7 lineup was saved at the 50€ flat prices. Applying the new prices before the Friday deadline is fairer. Applying them after the deadline only affects J8 and later.
- **`orden` order = insert order, not strictly by date:** a postponed round inserted later with an earlier date gets a higher `orden`. If that happens, an admin can edit `jornadas.orden` by hand (the admin write policy exists).
- **Unfunded next jornada** when J(N+1) is missing at resolve time (see Step 1). Mitigation: "Reprocesar jornada N".
- **Service-role key** on the scraper secret: still unverified (from memory). Step 3 is the first real write test.

## Acceptance Criteria
- [ ] `jornadas.orden` exists, is NOT NULL and unique. Row 7 has `orden=1`. A new insert gets max+1, and an upsert of an existing round does not change its `orden`.
- [ ] Draft, Apuestas, Powerups, the Ranking modal, the Apuestas results line and PlayerCard all show the Fantasy number ("Jornada 1"). Admin still shows federation numbers.
- [ ] `resolver_jornada` funds the jornada with `orden + 1`, whatever its federation number. Every other behaviour is identical (same body apart from the funding block).
- [ ] Apuestas shows the "Jornada N+1" net-result notice, and the rules are unchanged.
- [ ] Mi equipo, with a saved lineup: a summary with 7 players, captain, cost and "Te quedan X€", plus "Cambiar Fichajes" opening an editable modal that saves and closes. With no lineup: the list inline. The save button is full width. The budget shows only the money left.
- [ ] Apuestas, with bets: a summary plus "Modificar apuestas" opening a modal. Without bets: the form inline. Saving twice in one session works (`existentes` is refreshed).
- [ ] Power-ups with an applied power-up shows an informative block with the target player's name.
- [ ] `historial_anterior` is filled from tournament 1324114 via the Actions run. The 4 new players and anyone with no games cost 50€. The price table and best-7 total have been shown to the user.
- [ ] `calcPrecio` = max(50, round(50 + 12 × average of the last 5 games played)) over the mixed window. All vitest suites (frontend + scraper) pass.
- [ ] Pablo 2's J7 `alineaciones` row and 3 `apuestas` rows are unchanged after the migrations.
- [ ] `docs/MANUAL_DEL_JUEGO.md` and `docs/ADRs.md` are updated.
