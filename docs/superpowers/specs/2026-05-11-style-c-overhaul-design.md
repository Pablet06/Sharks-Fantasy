# Style C Overhaul + Edge Function — Design Spec

**Date:** 2026-05-11  
**Status:** Approved by user

---

## Scope

Two tasks:
1. Apply Style C (immersive, dark premium) to remaining screens: Dashboard shell, Ranking, Players, Profile.
2. Deploy the `delete-account` Supabase Edge Function (already called by `Profile.tsx`).

Pool + PlayerCard are already done and serve as the reference implementation for Style C.

---

## Task 1 — Style C Overhaul

### Decision: Bottom Tab Bar (Shell component)

**Navigation:** Move from top tab pills to a floating bottom tab bar — mobile app style, thumb-friendly.

**Implementation approach:** Extract a new `Shell.tsx` component that owns the layout chrome (header + bottom nav). `Dashboard.tsx` becomes a thin orchestrator that renders the active tab's content.

### Shell.tsx

New file: `src/components/Dashboard/Shell.tsx`

Renders:
- **Minimal top header** — shark logo (left) + "SHARKS FANTASY" title + "Salir" button (right). Same glassmorphism as current header but slimmer (no tabs).
- **`<main>`** — flex-fills the vertical space, renders `{children}` (the active tab).
- **Bottom nav bar** — fixed, floats above page bottom with `backdrop-filter: blur`. Four tabs: Mi Equipo (⚽), Ranking (🏆), Jugadores (👥), Perfil (👤). Active tab gets a cyan gradient pill + white label; inactive tabs are icon + muted label.

CSS additions to `index.css`:
- `.bottom-nav` — `position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: ...; background: rgba(10,10,26,0.88); backdrop-filter: blur(14px); border: 1px solid rgba(0,210,255,0.18); border-radius: 28px; padding: 10px 24px; box-shadow: 0 -4px 30px rgba(0,210,255,0.12);`
- `.bottom-nav-btn` — flex column, icon + label, transition on color/background.
- `.bottom-nav-btn.active` — icon gets cyan gradient background bubble.
- `.dashboard-main` — add `padding-bottom: 100px` to prevent content hiding behind the fixed nav.

### Shell.tsx — Props interface

Export the `Tab` type from `Dashboard.tsx`:
```ts
export type Tab = 'team' | 'ranking' | 'players' | 'profile'
```

Shell props:
```ts
interface ShellProps {
  tab: Tab
  onTabChange: (t: Tab) => void
  onSignOut: () => void
  children: React.ReactNode
}
```

Bottom nav icons are Unicode emoji literals in JSX — no icon library needed:
- Mi Equipo: `🌊` (water wave, fits waterpolo better than ⚽)
- Ranking: `🏆`
- Jugadores: `👥`
- Perfil: `👤`

### Dashboard.tsx

Remove `<header>` and `<nav className="tabs">`. Wrap the active-tab content in `<Shell tab={tab} onTabChange={setTab} onSignOut={onSignOut}>`.

The admin panel logic (`showAdmin`, `adminClickCount`, hidden footer trigger) stays in `Dashboard.tsx`. The hidden `·` trigger is rendered **outside** `<Shell>`, as a fixed-position element in the bottom-right corner (or keep as footer inside the shell's main area — not part of the Shell chrome). This keeps Shell free of admin concerns.

### Ranking.tsx

Replace the current medal-less list with a unified list where:
- Position 1: `🥇` + gold border + gold points
- Position 2: `🥈` + blue border + blue points  
- Position 3: `🥉` + bronze border + bronze points
- Positions 4+: compact row, `#N` prefix, cyan points
- Current user always highlighted in gold regardless of position

No podium widget — flat list, differentiated by color and emoji.

CSS: reuse existing `.ranking-item` and extend with `.rank-gold`, `.rank-silver`, `.rank-bronze` modifier classes that set **border-color and points color only**.

The existing `.current-user` class sets only the **background** (`rgba(255,215,0,0.08)`) and keeps its existing box-shadow. When both classes apply (e.g. current user is rank 2), the rank modifier controls border and points color, and `.current-user` controls background — no conflict.

### Players.tsx

Add position filter chips above the search input:
- Options: Todos | Portero | Boya | Extremo | Lateral | Contraboya
- Chips use the existing `.pos-badge` color system for the active chip when a position is selected (e.g. `.pos-portero` styles for the Portero chip). The "Todos" chip when active uses `--primary` (cyan) background tint — add a `.filter-chip.active-all` class for this case.
- Filtering is client-side on `jugadores` array by `j.pos`

State: `const [posFilter, setPosFilter] = useState<string>('Todos')`

### Profile.tsx

No structural changes. The new Shell frames it correctly. The danger zone (delete account) already calls the Edge Function endpoint — once the function is deployed it will work.

---

## Task 2 — delete-account Edge Function

### Location

`supabase/functions/delete-account/index.ts`

### Flow

1. Read `Authorization: Bearer <token>` header.
2. Create a Supabase client with the **service role key** (from env var `SUPABASE_SERVICE_ROLE_KEY`).
3. Verify the token: call `supabase.auth.getUser(token)` — if no user, return 401.
4. Delete user row: `supabase.from('usuarios').delete().eq('id', user.id)`.
5. Delete auth user: `supabase.auth.admin.deleteUser(user.id)`.
6. Return `{ ok: true }` with status 200, or a descriptive error with 500.

### CORS

Add `Access-Control-Allow-Origin: *` headers and handle `OPTIONS` preflight (required for browser fetch calls to Edge Functions).

### Environment variables needed

- `SUPABASE_URL` — available automatically in Edge Function runtime
- `SUPABASE_SERVICE_ROLE_KEY` — must be set in Supabase project dashboard → Settings → Edge Functions

### Deployment

```bash
supabase functions deploy delete-account
```

Requires Supabase CLI installed and `supabase login` done.

---

## Files to create / modify

| Action | File |
|--------|------|
| Create | `src/components/Dashboard/Shell.tsx` |
| Modify | `src/components/Dashboard/Dashboard.tsx` |
| Modify | `src/components/Ranking/Ranking.tsx` |
| Modify | `src/components/Players/Players.tsx` |
| Modify | `src/index.css` |
| Create | `supabase/functions/delete-account/index.ts` |

---

## Out of scope

- Profile layout changes (the shell frames it correctly as-is)
- AdminPanel (hidden feature, not part of the public UI overhaul)
- Any backend scraper changes
