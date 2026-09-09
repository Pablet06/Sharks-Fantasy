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
- [ ] `develop` → `main` promoted and GitHub Pages deploy verified — DEFERRED by user
- [x] `service_role` key done: `sb_secret_…` in local `.env` + GH Actions secret
      (updated 2026-09-09), verified it bypasses RLS on `config`
- [ ] Scheduled workflow re-enabled on `main` (still `disabled_inactivity`; also
      `main` still has the OLD scraper.yml until develop→main)
- [ ] First real weekly sync run observed green (or root-caused)
- [x] Phase B plan written — `docs/superpowers/plans/2026-09-09-admin-panel.md`
      (12 tasks + Task 0; covers B1–B4 and all 4 carry-over bugs)

## Sessions
