## Session Start — MANDATORY

At the very start of every conversation, before ANY work, invoke the `task-manager` agent via `/start-session`. It will ask you to choose free mode or a managed session (a task file in `docs/tasks/`). Do not write code or answer questions before this step.

## Session End — MANDATORY

When the user says "we're done", "wrap up", or "close session", invoke `/close-session`. The task-manager will generate a session summary and update the task file in `docs/tasks/` (if managed mode).

# sharks-fantasy

## Project Overview
Un juego de fantasy basado en la liga de waterpolo del equipo "Los Sharks". Cada usuario gestiona un equipo de jugadores y obtiene puntos según los resultados reales de los partidos jugados los fines de semana.

## Git Workflow
- Base branch: `develop`
- Feature branches: `feature/<name>` off `develop`
- PROJECT_TYPE: team (PRs required)
- Remote: git@github.com:Pablet06/Sharks-Fantasy.git

## Commands

### Dev
`npm run dev` (Vite, http://localhost:5173) — needs `.env` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
Scraper sync (manual): `cd scraper && npm run sync`

### Test
`npm run test` (Vitest) · `npm run lint` (ESLint) · `npm run build`

## Stack
- **Frontend**: React 19 + TypeScript + Vite, deployed as a static build to GitHub Pages via `.github/workflows/deploy.yml`
- **Backend**: Supabase (Postgres + Auth + RLS + Edge Functions in `supabase/functions/`) — no custom server
- **Scraper**: Node.js + TypeScript (`scraper/src/`), run on a weekly GitHub Actions cron (`.github/workflows/scraper.yml`), writes via the Supabase service role key
- No Python — skip all Python toolchain steps

## Architecture
See `docs/ADRs.md` for architecture decision records. No IaC — infra is entirely managed through the Supabase and GitHub Pages dashboards/CLIs; there is no `terraform/`/`cdk/` in this repo.

## Workflow

### Plan First
- Enter plan mode for any non-trivial task (3+ steps or multiple files)
- Write the plan before implementing — use the `planner` agent
- If something goes wrong mid-task, STOP and re-plan — never push through

### Subagent Strategy
- Use subagents to keep the main context clean
- One task per subagent
- Throw more compute at hard problems — spawn a subagent rather than struggling in the main context
- After `front-builder`, `back-builder`, `ai-builder`, `git-handler`, or `architect-deployer` finish a non-trivial change, hand off to `mentor` for a plain-language explanation — this project is also a learning exercise

### Autonomous Bug Fixing
- When given a bug: go to logs, find the root cause, resolve it
- No hand-holding needed — investigate first, ask only if genuinely blocked

## Project Docs
- `docs/plan.md` — high-level project plan (if present). Read at session start. **Never modify without explicit user confirmation.**
- `docs/tasks/<slug>.md` — one file per managed-mode task (created/groomed at session start, session summaries appended at session end by `task-manager`)
- `docs/ADRs.md` — architecture decision records
- `docs/diary/<feature-or-ticket>.md` — per-feature session diary (read at session start, written at session end by `task-manager`)
- `docs/features/<feature-name>/README.md` — feature documentation written when a feature is complete
- `docs/learning/<topic>.md` — plain-language explanations written by `mentor`, a running personal knowledge base
- `.claude/plans/<topic>.md` — implementation plans written by `planner` before non-trivial work

### Project Plan Rule
If `docs/plan.md` exists and a development decision diverges from or extends it, **stop and discuss with the user before continuing**. Update `docs/plan.md` only after explicit user confirmation.

## Working Standards

- **Simplicity first** — touch minimal code. No unnecessary refactors or abstractions.
- **Verify before claiming done** — run tests, check logs, diff behavior. Ask: "Would a staff engineer approve this?"
- **Ask once** — one clarifying question upfront if the task is unclear. Never interrupt mid-task.
- **Never assume** — verify file paths, API shapes, and variable names before using them.
- **Demand elegance** — if a fix feels hacky, rebuild it properly. Don't over-engineer simple things.
- **Self-improvement loop** — after any correction, note it in agent memory with format: `[date] | what went wrong | rule to prevent it`.
