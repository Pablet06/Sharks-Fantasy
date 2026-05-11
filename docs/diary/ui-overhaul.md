# UI Overhaul — Feature Diary

## 2026-05-09

### What was done
- Brainstormed 3 modern UI design directions (A: mobile bottom-nav, B: sidebar+panel, C: immersive floating nav). User selected **Option C** (immersive floating nav, hero card, horizontal scroll tabs, dark background with radial gradients).
- Built a detailed interactive mockup of the Pool/formation screen in style C: 1-2-3-1 waterpolo layout, player picker drawer sliding up from the bottom, filter chips by position, sorted player list with the currently assigned player marked.
- Implemented HTML5 drag-and-drop in `Pool.tsx` to swap player positions in the formation. Source slot dims (`.dragging`), drop target glows gold (`.drag-over`), and on drop the two slot indices in `equipo` are swapped and persisted to Supabase via `onUpdateEquipo`. Wired `onUpdateEquipo` through `Dashboard.tsx` and `App.tsx`.
- Enhanced `PlayerCard.tsx`: full name + nick (cyan) + position badge + phrase header, general stats with a section label, and a per-jornada historial in a 3-column grid (J{n} | non-zero stat chips | colored points). Added CSS classes `.player-card-nick`, `.stats-section-label`, `.historial-item`, `.historial-stat-chip`, `.historial-no-stats`.
- Closed Task #3: no migration of the 15 legacy user accounts — users will re-register fresh in Supabase Auth (clean slate, already the prior plan).

### Decisions made
- **UI direction**: Option C (immersive, floating nav, dark premium aesthetic) — rationale: most distinctive of the three, fits the "Sharks" identity better than utilitarian layouts.
- **No user migration**: re-registration is simpler than scripting account recreation for 15 users.
- **Native HTML5 DnD over a library**: 15 player slots, no nested drop zones — adding `react-dnd` or `dnd-kit` would be overkill.
- **Per-jornada stat filtering**: hide zero-value stats; show "Sin estadísticas" placeholder when all are zero to keep the historial scannable.

### What's left
- Full style-C overhaul across the remaining screens: Dashboard shell, Ranking, Players, Profile. Only Pool + PlayerCard touched so far.
- Push to `main` to trigger GitHub Pages deploy.
- Deploy the account-deletion Edge Function to Supabase.
- User must add GitHub Secrets for CI/CD (manual step).
