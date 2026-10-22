---
status: in-progress
created: 2026-10-22
updated: 2026-10-22
---

# Season launch readiness

## Context
The 26-27 season starts this Saturday. Users must be able to sign in and play. Competition: https://waterpolo.fncv.es/es/tournament/1344408/summary (Primera División Masculina 26-27, in_progress, 9 teams, includes "C.W. Sharks A").

State found on 2026-10-22:
- PRs #2–#7 are merged into `develop` (federation sync, admin panel Phase B, fantasy dinámico phases A–D).
- `origin/main` is 60 commits behind `develop` (last deploy 2026-09-10). Production deploys from `main` pushes (`deploy.yml` -> gh-pages), so fantasy dinámico is NOT live.
- Supabase `config.tournament_id` is still `1324114` (Liga Autonómica Primera Masculina 25-26). `last_sync_at` 2026-09-04. DB still holds last season's data: 17 jugadores, 272 historial rows, 2 usuarios.
- GitHub secrets all present; `SUPABASE_SERVICE_ROLE_KEY` updated 2026-09-09 (probably the earlier risk is fixed, unverified).
- Last scheduled "Weekly Stats Sync" runs (Jun-Jul 2026) all failed (old scraper); no runs since. Cron has never run successfully with the new scraper.
- Uncommitted local edits (from OneDrive): `CLAUDE.md` (lines removed) and `index.html` (favicon link).

## Goal
By Saturday, production runs the latest `develop` with the 26-27 tournament configured, sign-in works, and the scraper ingests results from tournament 1344408.

## Acceptance criteria
- [ ] Decide season-reset strategy for DB (keep/archive 25-26 historial and puntos, roster for 26-27)
- [ ] `config.tournament_id` switched to `1344408`; `discover` run to map leverade_ids for the 26-27 roster
- [ ] Scraper verified against tournament 1344408 (SHARKS_TEAM_NAME "C.W. Sharks A" matches)
- [ ] Manual `workflow_dispatch` of Weekly Stats Sync succeeds (service-role key works); cron schedule still active
- [ ] PR `develop` -> `main` merged; deploy workflow green; production shows fantasy dinámico
- [ ] Sign-in flow verified end to end in production (register, login, build team)
- [ ] Production env vars / RLS checked after deploy
- [ ] Decide on the uncommitted `CLAUDE.md` / `index.html` edits (commit or discard)

## Sessions
- 2026-10-22: reset de la 25-26 hecho en prod (sin archivo, a petición): historial/jornadas/fantasy vacíos, usuarios a 0 con equipo `{}`, roster 19 (bajas: Alvaro Mayordomo, Cesar Paredes; altas: Antonio, José Almódovar, Luca, Ackermann como Extremo, dorsales 3/7/18/19), stats a cero, `tournament_id=1344408`. PR #8 develop→main abierto. Pendiente: sync manual (bloqueado por el clasificador), merge PR #8, verificar login en prod, decidir CLAUDE.md/index.html.
- 2026-10-22: session started on `feature/season-launch-readiness`; task file re-groomed against real repo/prod state.
