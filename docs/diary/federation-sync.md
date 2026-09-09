# Federation sync rework — Phase A

Season 25-26 backfill + verification. Companion to
`docs/superpowers/specs/2026-09-03-federation-sync-and-admin-design.md` (Subproject A)
and `docs/superpowers/plans/2026-09-03-federation-sync.md`.

## What was built

- **Scraper rewritten** (`scraper/src/`): enumerates the season's jornadas and
  matches through Leverade's public JSON:API (`api.leverade.com`, tournament
  `1324114`), then scrapes each Sharks match's server-rendered
  `/es/tournament/1324114/match/{matchId}/stats` page with cheerio. One
  `historial` row per rostered player per jornada (dense: absent players get a
  zero row). Accumulated `jugadores.stats` and `usuarios.puntos` are recomputed
  from `historial`.
- **New stat model** (9 fields): `partidos, goles, goles_penalti,
  penaltis_fallados, faltas_penalti, tarjetas, expulsiones, expulsiones_graves,
  goles_contra`. Dropped the never-sourced `tiros / paradas / penaltis_parados`
  and the manual keeper `penaltis`. `goles_contra` is now team-goals-conceded in
  that match (keeper scoring only).
- **New scoring formula** — identical in `scraper/src/points.ts` and
  `src/lib/points.ts`:
  - All: `partidos ×1`, `faltas_penalti ×−1`, `expulsiones ×−1`,
    `tarjetas ×−3`, `expulsiones_graves ×−5`.
  - Field players: `goles ×5`, `goles_penalti ×3`, `penaltis_fallados ×−2`.
  - Keepers (only if `partidos > 0`): `+2` and `+max(0, 10 − goles_contra)`.
- **Schema**: `jugadores.leverade_id`, `historial` UNIQUE(jugador_id, jornada),
  `config` key/value table (migration `20260904000000_federation_sync.sql`,
  applied to prod).
- **Frontend**: `PlayerCard` + `src/lib/points.ts` + types moved to the new model
  (Phase A only touched display; the full admin rework is Phase B).
- **CI**: `.github/workflows/scraper.yml` runs `npm ci` + `npm run sync:prod`
  weekly (incremental).

## Cloudflare note — how the backfill was actually run

`waterpolo.fncv.es` sits behind Cloudflare. Our datacenter/runner IP is in a
rate-limit penalty box (repeated hits over several sessions), so
`npm run sync -- --backfill` returns HTTP 429 + a JS-challenge interstitial on
the first `/stats` fetch and cannot complete from here. A real browser passes the
challenge transparently, so the 16 finished Sharks matches were fetched once
through a browser session, parsed with the exact same `parseMatchStats` DOM
logic, and written to prod via `execute_sql`. `jugadores.leverade_id` was
populated the same way (16 auto-matched by name, `Victor Medina` mapped manually
— see below).

The weekly incremental cron fetches ~1 match/week and is far less likely to trip
Cloudflare; leave it and watch the first few runs. If CI also gets 429'd, the
mitigation is a `cf_clearance` cookie header or running the weekly sync from a
residential IP.

## "Convocado vs jugó"

**Rule: a player counts as having played a jornada (`partidos = 1`) iff they
appear on that match's stats sheet with a dorsal (shirt number).** This is
exactly how the federation computes its own `PJ` column — verified below, our
`PJ` matches theirs to the row for every player visible on the federation
statistics page.

## Federation data gap — Jornada 12

Match `143423240` (J12, Sharks A 4 – C.W. Carthago 16): the federation logged the
roster (13 players, all with dorsals) but **no per-player stats at all** — every
stat cell is a dash. We store it faithfully: 13 players get `partidos = 1` and
zeros for everything else. The 4 Sharks goals that jornada are unattributed on
the federation side; nothing we can do. It costs the field players ~0 fantasy
points for that round (just the `+1` for playing).

## Verification vs the federation

`https://waterpolo.fncv.es/es/tournament/1324114/statistics` only publishes the
top ~50 scorers of the whole league, so only the 4 top-scoring Sharks appear.
For those 4 our backfill matches the federation **exactly** on every compared
column:

| Player | PJ | G | GP | EX | P | PF | source |
|---|---|---|---|---|---|---|---|
| Carlos Ferrer | 15 | 37 | 3 | 10 | 5 | 3 | federation |
| Carlos Ferrer | 15 | 37 | 3 | 10 | 5 | 3 | **our backfill** |
| Guillermo Izquierdo | 15 | 16 | 2 | 17 | 4 | 2 | federation |
| Guillermo Izquierdo | 15 | 16 | 2 | 17 | 4 | 2 | **our backfill** |
| Hernan Frances | 14 | 11 | 1 | 3 | 1 | 1 | federation |
| Hernan Frances | 14 | 11 | 1 | 3 | 1 | 1 | **our backfill** |
| Bruno Pomara | 12 | 9 | 3 | 10 | 3 | 0 | federation |
| Bruno Pomara | 12 | 9 | 3 | 10 | 3 | 0 | **our backfill** |

Secondary cross-check: the previous scraper had accumulated season totals into
`jugadores.stats` from the same federation source. Our new totals match the old
ones on every overlapping field (`goles`, `goles_penalti`, `expulsiones`,
`penaltis_fallados`, `partidos`) for all 17 players — the only differences are
the genuinely new fields (`faltas_penalti`, `expulsiones_graves`, the
`goles`/`goles_penalti` split) and `Victor Medina` (see below).

### Full backfilled totals (season 25-26)

| Player | Pos | PJ | G | GP | PF | P | TA | EX | EG | total pts |
|---|---|---|---|---|---|---|---|---|---|---|
| Carlos Ferrer | Lateral | 15 | 37 | 3 | 3 | 5 | 0 | 10 | 0 | 188 |
| Guillermo Izquierdo | Lateral | 15 | 16 | 2 | 2 | 4 | 0 | 17 | 0 | 76 |
| Hernan Frances | Boya | 14 | 11 | 1 | 1 | 1 | 0 | 3 | 0 | 66 |
| Bruno Pomara | Lateral | 12 | 9 | 3 | 0 | 3 | 0 | 10 | 0 | 53 |
| Pablo Camara | Portero | 16 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 46 |
| Pablo Ferrer | Lateral | 14 | 7 | 1 | 0 | 4 | 0 | 5 | 0 | 43 |
| Teo Vicente | Boya | 13 | 7 | 1 | 1 | 1 | 0 | 5 | 0 | 43 |
| Andoni Irastorza | Portero | 15 | 0 | 0 | 0 | 9 | 0 | 1 | 0 | 35 |
| Raul Benitez | Extremo | 14 | 3 | 1 | 1 | 1 | 0 | 4 | 0 | 25 |
| Andreu Valero | Extremo | 16 | 5 | 0 | 1 | 8 | 0 | 7 | 0 | 24 |
| Josep Baeza | Boya | 10 | 3 | 0 | 0 | 0 | 1 | 2 | 0 | 20 |
| Vivien Chavanelle | Contraboya | 15 | 4 | 0 | 0 | 2 | 0 | 21 | 0 | 12 |
| Cesar Paredes | Contraboya | 8 | 1 | 0 | 0 | 0 | 0 | 4 | 0 | 9 |
| Alvaro Mayordomo | Extremo | 3 | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 7 |
| Jose Rodas | Extremo | 12 | 1 | 0 | 0 | 4 | 0 | 11 | 0 | 2 |
| Victor Medina | Contraboya | 13 | 3 | 0 | 0 | 6 | 0 | 15 | 1 | 2 |
| Jorge Ortiz | Extremo | 14 | 0 | 1 | 0 | 1 | 0 | 15 | 0 | 1 |

`goles_contra` is 0 in every accumulated row by design (it is a per-match value
for keeper scoring only; it lives in the per-jornada `historial.stats`).

### User points

| User | equipo (dorsales) | puntos |
|---|---|---|
| Pablo | 1, 10, 12, 17, 13, 6, 16 | 301 |
| charly | 2, 3, 12, 4, 7, 17, 11 | 120 |

Both plausible (were 0 before the backfill because the old `historial` was a
mislabeled lump).

## Player mapping — `leverade_id`

16 of 17 Sharks matched automatically (federation "GIVEN FIRST SURNAME ..." vs
DB "Given Surname"). One manual fix:

- **Victor Medina** (id 16) — federation name is "VICTOR MANUEL MEDINA RUIZ";
  the `given + first-surname` heuristic reads "victor manuel", which never
  matches "victor medina". Mapped by hand to `leverade_id = 53834720`. He now
  backfills correctly (13 PJ, previously 0 in prod for the same reason).

No departed players, no genuinely-unmatched federation players. `config.unmatched_players` is `[]`.

## Not played / not in the backfill

- **J3** (`143423195`) and **J8** (`143423217`) — `finished: false` on Leverade
  (postponed / not yet played as of the scrape). No `historial` rows. When they
  are played, run `npm run sync -- --jornada 3` (and `8`).

## Re-running the sync

From `scraper/` with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `../.env`
(and a working path to `waterpolo.fncv.es` — see the Cloudflare note):

```bash
npm run sync                    # incremental: only jornadas not yet in historial
npm run sync -- --jornada 3     # re-pull one jornada (deletes + re-inserts it)
npm run sync -- --backfill      # wipe historial, re-pull every finished jornada
npm run sync -- --discover      # list federation players + leverade_id-mapping SQL
```

`--backfill` and `--jornada` end with a full `recalc()` (rebuilds
`jugadores.stats` + `usuarios.puntos`) and bump `config.last_sync_at`.

## Session — 2026-09-08 close

Free-mode session. **Phase A shipped as PR #2** (`feature/federation-sync` →
`develop`), not yet merged. The 14-task plan
`docs/superpowers/plans/2026-09-03-federation-sync.md` was executed via
Subagent-Driven Development (fresh implementer per task + per-task review +
whole-branch review + scoped re-review of fixes).

### What was done

- Full scraper rewrite landed on the branch (Leverade JSON:API enumeration +
  cheerio `/stats` parsing, 9-field stat model, new scoring formula shared by
  `scraper/src/points.ts` and `src/lib/points.ts`, `--backfill / --jornada /
  --discover` CLI, `discover.ts` split out to break a circular import).
- Migration `20260904000000_federation_sync.sql` applied to prod
  (`leverade_id`, `historial` UNIQUE(jugador_id, jornada), `config` table + RLS).
- Season 25-26 backfilled directly through a browser + Supabase MCP (Cloudflare
  blocks this repo's IP): 272 `historial` rows over 16 jornadas (J3, J8
  postponed), `jugadores.stats` rebuilt to the 9-field model,
  `usuarios.puntos` recalculated (Pablo 301, charly 120 — both were 0).
- Verified: the 4 Sharks on the federation's public statistics page match the
  backfill exactly on PJ/G/GP/EX/P/PF; cross-checked all 17 vs the old
  scraper's accumulated totals.
- Frontend moved to the new model (`PlayerCard`, `src/lib/points.ts`, types);
  full admin rework deferred to Phase B.
- CI: `.github/workflows/scraper.yml` runs the weekly incremental sync.

### Decisions made

- R1 `http.ts` exposes `setRetryBackoffMs()` test hook.
- R2 `discover.ts` created to break a circular import with `index.ts`.
- R3 implementers locate edit sites by symbol, not line number.
- R4 `match.ts` `normalize()` strips a trailing "(c)" captain suffix.
- R5 `rawToStats` test uses `expulsiones_graves: 2` (plan typo was 3).
- R6 `--backfill` gets per-round try/catch + `recalc()` error-checking.
- R7 `package.json` `"build"` → `"tsc -b && vite build"` (bare `tsc` was a
  no-op under project references).
- R8 "convocado vs jugó": a player with a dorsal on the match stats sheet
  counts as `partidos = 1` (matches the federation's PJ column).

### What's left (Phase A)

- User reviews + merges PR #2 to `develop`, then `develop` → `main`.
- **Risk 1:** `.env` `SUPABASE_SERVICE_ROLE_KEY` is not a real service-role key
  (46 chars, RLS still applies) — the scraper cannot write. Regenerate the
  `service_role` secret in Supabase, update the GitHub Actions secret + local
  `.env`, or the weekly cron fails.
- **Risk 2:** the scraper's fetch + orchestration path (`syncJornada`, CLI,
  config read/write) has never run end-to-end — Cloudflare blocks this repo's
  IP on `waterpolo.fncv.es`. The Saturday cron is its first real execution;
  watch it.
- **Risk 3 (data gap):** Jornada 12 (match 143423240) has a roster but zero
  per-player stats federation-side — stored faithfully (13 players
  `partidos=1`, else 0).
- Pre-existing, out of scope: root `package.json` `"test": "vitest"` is watch
  mode (scraper uses `vitest run`).

### Carry-over notes for Phase B (extended admin panel)

- `config` RLS uses bare `auth.uid()` (should be `(SELECT auth.uid())`) and is
  `FOR ALL` (should be `FOR INSERT, UPDATE`).
- `AdminPanel` sums `goles_contra` in accumulation while the scraper forces it
  to 0.
- `AdminPanel` never updates `usuarios.puntos` after an edit.
- `historial.date` gets two formats from two code paths.
- Spec Subproject B has the design.

### Verification at session end

frontend `tsc -b` 0 · scraper `tsc --noEmit` 0 · frontend vitest 9/9 ·
scraper vitest 32/32 · lint clean · `npm run build` passes.

## Phase B — 2026-09-09

Task 5: AdminView shell wired; nav hides on entry; 5 placeholder sections;
AdminPanel deleted. Manual check passed.
