# Claude Code Setup — Sharks Fantasy

Quick reference for working with Claude Code on this project.

## How to Start

1. Open Claude Code in the project directory
2. Run `/start-session`
3. Choose free mode or managed session (task file in `docs/tasks/`)
4. Start working

## Agents

| Agent | Role | When Claude uses it |
|-------|------|---------------------|
| `task-manager` | Session lifecycle, task files in `docs/tasks/` | Always, via /start-session and /close-session |
| `planner` | Design before code, implementation plans | Before non-trivial tasks |
| `researcher` | Technology/best-practice research | Before implementation decisions with open questions |
| `front-builder` | React + TypeScript + Vite frontend | Frontend work |
| `back-builder` | Supabase: schema, RLS, Auth, Edge Functions | Backend/data work |
| `ai-builder` | AI feature implementation, pattern-agnostic | AI-backed features (none in this project yet) |
| `git-handler` | Git: branches, commits, PRs | All Git operations |
| `architect-deployer` | Architecture design, Supabase/GitHub Pages deploy | System design and deployment tasks |
| `mentor` | Plain-language explanations, learning log | Automatically after non-trivial builder changes |

In practice, this project's design/planning work has mostly gone through the
`superpowers` plugin skills (brainstorming, writing-plans, subagent-driven-development)
instead of `planner`/`front-builder`/`back-builder` directly — specs and plans
live in `docs/superpowers/specs/` and `docs/superpowers/plans/`, not
`.claude/plans/`. The agents above are still available and correct to use;
`superpowers` is just the path this project has actually taken so far.

## Commands

| Command | What it does |
|---------|-------------|
| `/start-session` | Start work session (free or managed) |
| `/close-session` | Wrap up, generate summary, update task file |
| `/init-project` | Re-initialize setup for this project |

These live in `~/.claude/commands/` (user-level, not per-project — every
project on this machine shares them).

## Git Workflow

```
develop  ← always base here
  └── feature/<name>  ← your work
```

- **Team project**: open PR against `develop` on
  `git@github.com:Pablet06/Sharks-Fantasy.git`
- `develop` → `main` promotes to production (triggers the GitHub Pages deploy)

## Task Tracking

- Managed-mode tasks: `docs/tasks/<slug>.md` — plain markdown, versioned in git, no external service
- Browse them in Obsidian by opening `docs/tasks/` (or the repo root) as a vault; `status:` frontmatter is Dataview-queryable

## Deployment

- Frontend: static Vite build → GitHub Pages, via `.github/workflows/deploy.yml` on push to `main`
- Backend: Supabase (Postgres + Auth + RLS + Edge Functions) — no server to deploy
- Scraper: GitHub Actions weekly cron (`.github/workflows/scraper.yml`), no hosting needed

## Learning Log

Plain-language explanations of decisions and concepts accumulate in `docs/learning/`, written by the `mentor` agent after non-trivial changes.

## Source

This setup was generated from the personal Claude Code template at
`~/.claude/templates/` and `~/.claude/agents/`.
