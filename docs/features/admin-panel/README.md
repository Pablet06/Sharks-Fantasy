# Admin Panel (Phase B)

## What it does
An in-app admin view for `usuarios.is_admin` users: manage `jugadores`,
edit `historial` per jornada, see sync status, manage `usuarios`, and
end/start a season. Opens from the "Admin" button; the normal nav hides
while it is open.

## How to use it
- **Jugadores** — create / inline-edit / delete players. A search box filters
  by name, nick, number or position (accent- and case-insensitive). Deleting
  warns with the users who have the player in their lineup for the current
  jornada.
- **Historial** — pick a jornada; edit a row's 9 stats (points recompute
  live), add a manual row, delete a row or the whole jornada. Every change
  runs `recalc_puntos()`.
- **Sync** — read-only status + "Recalcular puntos". Federation re-sync is
  still `npm run sync` / the GitHub Actions workflow.
- **Usuarios** — search by name, rename, toggle admin, delete the account (via the
  `delete-account` edge function). A jornada selector (defaults to the one
  Mi Equipo shows) lists each user's real `alineaciones` row (7 + captain +
  points); the admin can edit or create it. Same rules as the Draft but no
  budget cap; on an already-scored jornada it asks to confirm, clears
  `puntos_jornada` and runs `resolver_jornada` automatically.
- **Temporada** — "Terminar" downloads `historial` as JSON then wipes it and
  zeros stats/points; "Empezar" sets `config.tournament_id`. Both need the
  word `CONFIRMAR`.

## Configuration
- RLS: `is_admin(uuid)` SECURITY DEFINER function; admin policies on
  `jugadores`, `historial`, `config`, `usuarios`, `alineaciones`.
- `recalc_puntos()` RPC — the single recalculation path for the frontend.
- Edge function `delete-account` takes an optional `{ target_user_id }`.

## Known limitations
- No undo on Temporada actions beyond the JSON export.
- `recalc_puntos()` and the scraper's `recalc()` are separate implementations
  (parity-tested, not shared).
- No React component tests (jsdom is too slow on this checkout); sections are
  manually verified — see `docs/diary/federation-sync.md`.
