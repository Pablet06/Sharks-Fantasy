---
status: in-progress
created: 2026-09-09
updated: 2026-09-09
---

# Federation Sync — Phase A merge + Phase B

## Context
Phase A (per-jornada federation scraper, new stat model + scoring formula,
season 25-26 backfill, frontend on the new model) was built in the 2026-09-08
session and opened as PR #2 (`feature/federation-sync` → `develop`). It is
MERGEABLE/CLEAN but has no review and is not merged. `develop` is also 6
commits ahead of `main`, so nothing from Phase A (or PR #1) is live yet.
Several risks and Phase B carry-overs were logged in
`docs/diary/federation-sync.md`.

## Goal
Phase A reviewed, merged to `develop`, promoted to `main` (live on GitHub
Pages), and the weekly scraper cron actually working. Then plan Phase B
(extended admin panel).

## Acceptance criteria
- [x] PR #2 code-reviewed; blocking findings fixed (H1/H2/H7 + vitest env, commits `bb40138`, `87f2c61`)
- [x] PR #2 merged to `develop` (merge commit `7715f2a`)
- [x] Frontend verified locally vs prod DB (Dashboard/PlayerCard/Ranking/Players);
      found + fixed a data-loss bug — AdminPanel jornada editor never loaded the
      existing historial row, so saving overwrote it with zeros. Editor disabled
      until Phase B (commit `915c83b`).
- [x] `develop` → `main` promoted (`60f6f8f`) — GitHub Pages deploy verified (title + fresh JS bundle live at pablet06.github.io/Sharks-Fantasy)
- [x] `service_role` key done: `sb_secret_…` in local `.env` + GH Actions secret
      (updated 2026-09-09), verified it bypasses RLS on `config`
- [x] Scheduled workflow re-enabled on `main` (auto-reactivated by the main push; new `scraper.yml` now on main)
- [ ] First real weekly sync run observed green — **Saturday 2026-09-12 22:00 UTC** (watch: Cloudflare IP block risk, orchestration never run end-to-end)
- [x] Phase B plan written — `docs/superpowers/plans/2026-09-09-admin-panel.md`
- [x] **Phase B executed** — PR #3 merged (`5b6309e`). AdminView + 5 sections replace the disabled AdminPanel; `is_admin()`/`recalc_puntos()` on prod; `delete-account` v3; + a CRITICAL security fix (usuarios self-promotion, migration `20260910000000`). All 4 carry-over bugs closed. SDD ledger: `.superpowers/sdd/2026-09-09-admin-panel/progress.md`

## Sessions
