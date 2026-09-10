# Admin RLS & Cleanup — Feature Diary

## 2026-09-02

### What was done
- Ran a full project audit (real build/lint/test, not just reading) and found CLAUDE.md badly out of date — it described the stack as vanilla HTML/JS when the project is actually React 19 + TS + Vite + Supabase since a May 2026 migration. Delivered as a published HTML artifact report.
- Clarified Vite vs Node.js for the user: they're complementary, not alternatives; confirmed the current architecture (static Vite build + Supabase backend + cron scraper, no persistent Node server) is already correct.
- Implemented the audit's action plan on branch `feature/admin-rls-and-cleanup` (off `develop`), opened PR #1 into `develop`: https://github.com/Pablet06/Sharks-Fantasy/pull/1
  - Found the Supabase project was PAUSED mid-plan (via Supabase MCP); user reactivated it manually.
  - Security fix: replaced the client-side SHA-256 admin password (security theater — RLS had no write policies at all for `jugadores`/`historial`, so the panel never actually worked) with real server-enforced RLS: added `usuarios.is_admin`, granted INSERT/UPDATE on `jugadores`/`historial` only to authenticated admins, applied via Supabase migrations (`supabase/migrations/`), set `is_admin=true` for pablofebaix@gmail.com.
  - Fixed 2 real eslint react-hooks errors (Pool.tsx `PlayerNode` hoisted out of render; useUsuario.ts removed a sync setState-in-effect).
  - Repo cleanup: removed a duplicate 5MB `jugadores/` folder and a stray 3MB PSD file (`jugadores/crear`) that was crashing repo-wide `eslint .`; fixed a broken `serve` script in `scraper/package.json` pointing at a nonexistent file; archived one-shot Firebase migration scripts to `scripts/legacy/`.
  - Docs: updated CLAUDE.md's stack description to match reality, created `docs/ADRs.md` and `docs/plan.md` (both referenced by CLAUDE.md but missing).
  - Follow-up after user reported "can't do the double-click": replaced the hidden invisible admin-trigger dot with a visible "Admin" button in the header, gated on `usuario.is_admin`.
  - Investigated an apparent bundle-size regression (290KB→412KB); root-caused to a stale local Vite dependency cache (`node_modules/.vite`), not a real regression — confirmed `main` builds to the same ~412KB once cleared.

### Decisions made
- RLS + `is_admin` flag over an Edge Function for admin auth — simpler, no new deployed function, RLS already enforces server-side regardless of anon/authenticated key.
- Visible "Admin" button over the hidden click-trigger, now that a password is no longer the security boundary.

### What's left
- PR #1 open against `develop`, not yet merged — needs review and merge.
- Nothing deployed yet: GitHub Pages only deploys on push to `main`; after merging to `develop`, still need to promote `develop` → `main` to go live.
- Recommended: test the admin panel end-to-end locally (`npm run dev` on the branch), logged in as the admin account, before merging.
- A pre-existing, unrelated `package-lock.json` change is stashed on `main` (`stash@{0}`, from this session's initial `npm install`) — not yet popped or dropped.
