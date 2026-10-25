# Historial por usuario — Implementation Plan

> Status: user decisions taken (D1 = Perfil section, D2 = only `finalizado = true`, D3 = Option C later) + extra scope ("Esperando fecha" shows last jornada in Mi Equipo / Apuestas / Power-ups). Awaiting final confirmation of this plan.

**Goal:** (1) "Mi historial" in Perfil: points and money per resolved jornada for the logged-in user. (2) When there is no jornada in progress ("Esperando fecha"), Mi Equipo, Apuestas and Power-ups show the user's last resolved jornada read-only instead of an empty placeholder.
**Approach:** frontend-only. No migration, no RLS change.
**Estimated steps:** 7

## Data audit (all readable by the owner — no gaps)

| Data | Table | RLS read |
|---|---|---|
| Points, lineup, captain, spend per jornada | `alineaciones` (`puntos_jornada`, `jugadores`, `capitan`, `presupuesto_usado`) | public |
| Budget per jornada | `presupuestos` (missing row = 1000, same as `presupuesto_actual()`) | public |
| Bets + result | `apuestas` (`importe`, `cuota`, `acierto`, `ganancia`, `resuelto`) | owner + admin |
| Power-up used per jornada | `powerups_aplicados` (`UNIQUE (usuario_id, jornada)`, so 0 or 1 per jornada) | owner + admin |
| Power-ups remaining | `powerups_usuario.disponibles` (not per jornada, current inventory) | owner + admin |
| Match result, Fantasy label | `jornadas` (`resultado`, `goles_*`, `orden`, `finalizado`) | public |

Money does not accumulate: budget of a jornada = 1000 + net bets of the previous one (+50 power-up). The history shows budget and net bet result per jornada.

Not stored, not needed now: ranking position per jornada (derivable later for Option C); breakdown of +2 pts / blindaje inside `puntos_jornada`.

## "Last jornada" definition

`ultimaJornadaResuelta(jornadas)` = the jornada with `finalizado = true` and the highest `orden` (not the highest `numero`: federation numbers are not in calendar order). That is exactly what `faseJuego` already computes inline for the 'esperando' branch (`src/lib/jornada.ts`) — extract it, reuse it there.

"Esperando fecha" state = `jornadaEnCurso(jornadas) === null` (same condition that makes `faseJuego` return 'esperando').

## Current behaviour in that state (explored)

- **Mi Equipo (`Draft.tsx`)**: `jornadaEnCurso` null -> only "No hay ninguna jornada abierta para draftear todavía." Nothing else.
- **Apuestas (`Apuestas.tsx`)**: shows "No hay ninguna jornada abierta..." plus `bloqueResultados`: each resolved bet of the last jornada (selection, importe, cuota, acierto/fallo/empate, ganancia), the net balance and "presupuesto previsto para la próxima: 1000 + neto". Bug: "last" is picked as max `apuestas.jornada` (federation `numero`) from `order('jornada') .limit(4)`, not by `orden`. Also the forecast ignores a `presupuesto_extra` +50 (acceptable, it is labelled "previsto").
- **Power-ups (`Powerups.tsx`)**: uses `jornadaAbierta` (not `jornadaEnCurso`). With null it returns early with a placeholder, and the inventory query is inside the `jornada` effect, so **remaining power-ups are not shown at all**. Side effect: the same empty screen also appears in "Fichajes cerrados", "Partido en juego" and "Post-partido" states (see D4).

## Safety note (important for implementation)

The fallback views must be read-only by an explicit flag, not by the existing `bloqueada` computation. A resolved jornada imported by backfill can have `fecha_partido = NULL`; then `bloqueada` is false in Draft, and RLS `alineaciones_owner_write` allows writes when `fecha_partido IS NULL`, so the user could upsert a lineup into an already resolved jornada (it would not be rescored, but it corrupts the record). Out of scope to change the RLS; flagged as a follow-up hardening.

## Step 1: Helper in `src/lib/jornada.ts` + test
- Files: `src/lib/jornada.ts`, `src/lib/jornada.test.ts`
- Details: export `ultimaJornadaResuelta(jornadas): Jornada | null` (finalized, max `orden`). Use it inside `faseJuego` (no behaviour change). Tests: picks by `orden` not `numero` (e.g. numero 9 orden 2 vs numero 3 orden 3); ignores non-finalized; none -> null.

## Step 2: Pure merge for the history + test
- Files: `src/lib/historial.ts`, `src/lib/historial.test.ts`
- Details: `construirHistorial(jornadas, alineaciones, presupuestos, apuestas)` -> one row per `finalizado` jornada ordered by `orden`: `{ numero, orden, resultado, golesFavor, golesContra, puntos (0 if no lineup), acumulado, presupuesto (row or 1000), apostado, neto (sum of resolved `ganancia`, null if no bets) }`. Tests: no lineup -> 0; missing budget row -> 1000; tie `ganancia = 0`; unresolved bet excluded; cumulative sum; non-consecutive numbers ordered by `orden`.

## Step 3: "Mi historial" section in Perfil
- Files: `src/components/Profile/Historial.tsx`, `src/components/Profile/Profile.tsx`
- Details: 4 selects filtered by `usuario_id` (jornadas: all), cancel pattern as in `Ranking.tsx`. Compact table: Jornada (`orden`), resultado, pts, total, presupuesto, neto apuestas (+green/-red via existing `pts-positive`/`pts-negative`). Empty state: "Todavía no hay jornadas resueltas." Rendered above "Zona de peligro".

## Step 4: Mi Equipo fallback
- Files: `src/components/Dashboard/Draft.tsx`
- Details: when `jornadaEnCurso` is null, load `ultimaJornadaResuelta` as `jornada` with `soloLectura = true`. Reuse the existing summary render (mini-pool, captain star, `puntos_jornada`, coste). Heading "Última jornada (Jornada N) — X pts". `soloLectura` forces: no editor, no "Cambiar Fichajes", no capitán tardío, no `guardar`. No lineup that jornada -> "No enviaste alineación en la Jornada N." (instead of the editor). No resolved jornada at all -> keep current placeholder.

## Step 5: Apuestas — keep as today, fix "last jornada"
- Files: `src/components/Dashboard/Apuestas.tsx`
- Details: keep the current esperando view. Replace "max `apuestas.jornada` from the 4 latest rows" with: fetch resolved bets where `jornada = ultimaJornadaResuelta(...).numero`. No other change.

## Step 6: Power-ups fallback
- Files: `src/components/Dashboard/Powerups.tsx`
- Details: move the `powerups_usuario` inventory query out of the `jornada` effect so remaining power-ups always show. When there is no open jornada, show the inventory list ("Te quedan") plus, for `ultimaJornadaResuelta`, the `powerups_aplicados` row ("Usaste X en la Jornada N", target player if any) or "No usaste power-up en la Jornada N". Read-only: no apply form.

## Step 7: Verify + docs
- `npm run test`, `npm run lint`, `npm run build`.
- Browser (`npm run dev`, desktop + mobile width) in the current real state (J7 resolved, no J8 date = Esperando fecha): Mi Equipo shows the J7 lineup and points; Apuestas shows the J7 bets; Power-ups shows inventory + J7 power-up; Perfil history J7 row matches SQL (`alineaciones.puntos_jornada`, sum of `apuestas.ganancia`).
- Update `docs/MANUAL_USUARIOS.md` and add `docs/features/historial-usuario/README.md`.

## Open decision
- **D4 — Power-ups in "Fichajes cerrados" / "Partido en juego" / "Post-partido"**: today the screen is empty in those states too (it uses `jornadaAbierta`). Recommended: switch to `jornadaEnCurso` so it shows the in-progress jornada read-only (as Draft and Apuestas already do), with the Step 6 fallback for "Esperando fecha". Alternative: only cover "Esperando fecha" as requested.

## Follow-ups (not in this plan)
- RLS hardening: `alineaciones_owner_write` should reject `finalizado = true` jornadas.
- Option C: other users' points per jornada from Ranking.

## Acceptance Criteria
- [ ] Perfil shows "Mi historial": one row per `finalizado` jornada (by `orden`) with points, cumulative total, budget and net bet result.
- [ ] Sum of the points column equals `usuarios.puntos`; J7 row matches the DB for at least one real user.
- [ ] No lineup -> 0 pts; missing budget row -> 1000€; no bets -> "-".
- [ ] In "Esperando fecha", Mi Equipo shows the last resolved jornada's lineup (players, captain, points) read-only, with no way to save.
- [ ] In "Esperando fecha", Apuestas behaves as today, and the "last jornada" is chosen by `orden`, not by `numero`.
- [ ] In "Esperando fecha", Power-ups shows remaining tokens and the power-up used in the last resolved jornada (or that none was used), read-only.
- [ ] "Last jornada" comes from one helper `ultimaJornadaResuelta`, also used by `faseJuego`; unit-tested.
- [ ] No migration, no RLS change; no user can see another user's bets or power-ups.
- [ ] Test, lint, build green; usable at mobile width.
