## Session Start — MANDATORY

At the very start of every conversation, before ANY work, invoke the `task-manager` agent via `/start-session`. It will ask you to choose free mode or a managed Plane session. Do not write code or answer questions before this step.

## Session End — MANDATORY

When the user says "we're done", "wrap up", or "close session", invoke `/close-session`. The task-manager will generate a session summary and update the Plane ticket (if managed mode).

# sharks-fantasy

## Project Overview
Un juego de fantasy basado en la liga de waterpolo del equipo "Los Sharks". Cada usuario gestiona un equipo de jugadores y obtiene puntos según los resultados reales de los partidos jugados los fines de semana.

## Git Workflow
- Base branch: `develop`
- Feature branches: `feature/<name>` off `develop`
- PROJECT_TYPE: team (PRs required)
- Remote: git@github.com:Pablet06/Sharks-Fantasy.git

## Plane Integration
- Workspace: none
- Project: none
- Default label filter: `` — no label filter configured

## Commands

### Dev
N/A — static frontend + Node.js scraper (`node scraper/server.js`)

### Test
N/A

## Stack
- **Frontend**: Vanilla HTML/CSS/JavaScript (`index.html`)
- **Scraper/Backend**: Node.js (`scraper/`)
- No Python — skip all Python toolchain steps

## Architecture
See `docs/ADRs.md` for architecture decision records (maintained by the `architect-deployer` agent). Deployment topology and resource configuration live in IaC files (`terraform/`, `cdk/`).

## Workflow

### Plan First
- Enter plan mode for any non-trivial task (3+ steps or multiple files)
- Write the plan before implementing — use the `planner` agent
- If something goes wrong mid-task, STOP and re-plan — never push through

### Subagent Strategy
- Use subagents to keep the main context clean
- One task per subagent
- Throw more compute at hard problems — spawn a subagent rather than struggling in the main context

### Autonomous Bug Fixing
- When given a bug: go to logs, find the root cause, resolve it
- No hand-holding needed — investigate first, ask only if genuinely blocked

## Project Docs
- `docs/plan.md` — high-level project plan (if present). Read at session start. **Never modify without explicit user confirmation.**
- `docs/ADRs.md` — architecture decision records
- `docs/diary/<feature-or-ticket>.md` — per-feature session diary (read at session start, written at session end by `task-manager`)
- `docs/features/<feature-name>/README.md` — feature documentation written when a feature is complete

### Project Plan Rule
If `docs/plan.md` exists and a development decision diverges from or extends it, **stop and discuss with the user before continuing**. Update `docs/plan.md` only after explicit user confirmation.

## Working Standards

- **Simplicity first** — touch minimal code. No unnecessary refactors or abstractions.
- **Verify before claiming done** — run tests, check logs, diff behavior. Ask: "Would a staff engineer approve this?"
- **Ask once** — one clarifying question upfront if the task is unclear. Never interrupt mid-task.
- **Never assume** — verify file paths, API shapes, and variable names before using them.
- **Demand elegance** — if a fix feels hacky, rebuild it properly. Don't over-engineer simple things.
- **Self-improvement loop** — after any correction, note it in agent memory with format: `[date] | what went wrong | rule to prevent it`.
