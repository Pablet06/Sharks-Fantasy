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
- [ ] PR #2 merged to `develop`
- [ ] `develop` → `main` promoted and GitHub Pages deploy verified
- [ ] Scraper cron: real `service_role` key in place (Supabase secret + GH
      Actions secret + local `.env`); scheduled workflow re-enabled on `main`
- [ ] First real weekly sync run observed green (or root-caused)
- [ ] Phase B plan written (extended admin panel + logged carry-over bugs:
      `config` RLS `auth.uid()`/`FOR ALL`, AdminPanel `goles_contra` sum,
      AdminPanel not updating `usuarios.puntos`, `historial.date` two formats)

## Sessions
