# Developer Handbook

A working guide to the codebase — how it's structured, how the pieces connect, and how to make changes without breaking things.

---

## Mental model

The app is a single-page React app with no router. Navigation is controlled by a `view` state string in `App.jsx`. There is one shared dataset (all sessions) loaded once on startup and kept in React state. Every change re-saves to Supabase (or localStorage if Supabase isn't configured).

```
main.jsx
  └── App.jsx  (state owner: sessions, view, modal, activeId, summaryId)
        ├── PinGate        (wraps everything — enforces auth before rendering)
        ├── Header         (nav tabs — visibility driven by role + state)
        ├── [current view] (one of six views, rendered by view string)
        └── Modal          (overlay, rendered on top when modal state is set)
```

---

## File map

| File | What it owns |
|------|-------------|
| `App.jsx` | All state, session CRUD, view routing |
| `utils.js` | Pure helpers: `fmt`, `fmtMoney`, `profitColor`, `uid`, `sha256`, `corrColor`, `exportJSON`, all constants |
| `storage.js` | `loadSessions` / `saveSessions` — Supabase with localStorage fallback |
| `share.js` | `handleShare(ref)` — html2canvas capture + Web Share API / download |
| `styles.js` | `S` (all inline styles), `F` (Oswald), `FB` (Cormorant Garamond), global CSS injection |
| `lib/supabase.js` | Supabase client — `null` if env vars are missing |
| `components/PinGate.jsx` | Password input, role detection, brute-force lockout |
| `components/Header.jsx` | Nav bar + `NavBtn` |
| `components/Modal.jsx` | Four modal types: newSession, addPlayer, buyin, cashout |
| `components/SessionCard.jsx` | Single card in the sessions list |
| `components/StatBox.jsx` | Small stat tile (label + big number) |
| `components/icons.jsx` | `PlusIcon`, `TrashIcon`, `ChevronIcon` |
| `views/HomeView.jsx` | Active sessions + 3 most recent ended |
| `views/ActiveView.jsx` | Live session table, hidden share card, End Session |
| `views/SummaryView.jsx` | Completed session card, visible + hidden share card |
| `views/HistoryView.jsx` | All-time leaderboard + full past sessions list |
| `views/AnalyticsView.jsx` | Cumulative chart + player stats (superadmin); highlights + correlation matrix (admin/view) |
| `views/PlayerSearchView.jsx` | Player search list + `PlayerProfile` (stats, chart, session history) |

---

## Data flow

```
Supabase (or localStorage)
    │
    ▼ loadSessions() on mount
App.jsx  [sessions state]
    │
    ├── passed as prop to all views (read-only)
    ├── mutated via updateSession(id, fn) or setSessions(...)
    │
    ▼ useEffect watches sessions
saveSessions()  →  Supabase / localStorage

Supabase real-time channel (postgres_changes)
    │
    ▼ on external change (other browser)
setSessions(parsed)  →  re-render
```

**Self-echo guard:** `lastSaveValueRef` stores the JSON of the last save. When a real-time event arrives, if the value matches what we just saved, it's our own echo — ignored.

---

## Auth system

Three roles. Each maps to a SHA-256 hash stored in env vars, never the plaintext password.

| Role | Env var | `isAdmin` | `isSuperAdmin` |
|------|---------|-----------|----------------|
| superadmin | `VITE_APP_SUPER_ADMIN_HASH` | `true` | `true` |
| admin | `VITE_APP_ADMIN_HASH` | `true` | `false` |
| view | `VITE_APP_VIEW_HASH` | `false` | `false` |

`PinGate` renders `children(isAdmin, isSuperAdmin)` once authenticated. Role is kept in `sessionStorage` (clears on tab close). Lockout state (attempts + expiry) is in `localStorage`.

The rest of the app never touches auth directly — it just receives `isAdmin` and `isSuperAdmin` as props and uses them to conditionally show/hide controls.

---

## Session data shape

```js
{
  id: "lf3abc12x",        // uid() — timestamp36 + random
  name: "Session 7",       // or custom string
  date: "ISO string",      // when session was created
  ended: false,            // true once "End Session" is clicked
  endDate: "ISO string",   // set when ended
  players: [
    {
      id: "lf3xyz99q",
      name: "Alice",
      buyins: [100, 50],   // array — supports multiple rebuys
      cashout: 200         // null if still playing
    }
  ]
}
```

A player with `cashout === null` is still active. Profit is always derived: `cashout - sum(buyins)`.

---

## View routing

`App.jsx` holds `view` (string) and renders the matching view component:

```
"home"      → HomeView
"active"    → ActiveView      (requires activeSession)
"summary"   → SummaryView     (requires summarySession)
"history"   → HistoryView     (superadmin only)
"players"   → PlayerSearchView (superadmin only)
"analytics" → AnalyticsView
```

To navigate: call `setView("target")`. Some transitions also set `activeId` or `summaryId` first.

---

## Modal system

`modal` state in `App.jsx` is either `null` (closed) or `{ type: string }`.

| Type | Opens when |
|------|-----------|
| `"newSession"` | "New Session" button on Home |
| `"addPlayer"` | "Add Player" button in ActiveView |
| `"buyin"` | "Buy-in / Rebuy" button in ActiveView |
| `"cashout"` | "Cash Out" button in ActiveView |

`Modal` is only rendered when `isAdmin && modal` — view-only users never see it.

---

## Share card system

Both `ActiveView` and `SummaryView` contain a **hidden share card** rendered off-screen (`left: -9999`). It's a `<div>` with a ref that mirrors the session table in a fixed-width layout (420px).

When Share is tapped:
1. `handleShare(ref)` in `share.js` is called
2. All fonts are swapped to Inter (html2canvas renders custom fonts poorly)
3. `html2canvas` captures at 3× scale with a dark-mode `onclone` transform (black bg, white text, softened font weights)
4. Fonts are swapped back
5. The canvas blob is shared via Web Share API if available, otherwise downloaded as a PNG

The share card in `ActiveView` shows the in-progress state (players without cashout show "—"). The one in `SummaryView` shows the final state.

---

## Styles

All styles live in the `S` object in `styles.js`. Components import `{ S }` and apply styles inline: `style={S.card}`, `style={{ ...S.card, marginTop: 8 }}`.

Two font constants:
- `F` — `'Oswald'` — used for labels, buttons, nav, uppercase UI text
- `FB` — `'Cormorant Garamond'` — used for display headings, the app title

Color palette:
```
#450206   deep burgundy   (primary, header, buttons)
#2a0a08   near-black      (body text)
#fbf0df   warm cream      (page background)
#f0e0c4   lighter cream   (cards, table backgrounds)
#d4b898   tan             (borders)
#7a5030   mid-brown       (secondary text, labels)
#5c3020   dark-brown      (card subtitles)
#c0392b   red             (destructive, worst loss)
```

The global CSS injection at the bottom of `styles.js` handles: spin keyframe, `box-sizing: border-box`, body margin/bg, and a recharts overflow fix.

---

## Analytics

**`AnalyticsView`** — superadmin sees full view; admin/view-only see `LimitedStatsView`.

**LimitedStatsView** uses the last 8 sessions as its window (`slice(-8)`).

**Highlights** (last 8 sessions):
- Hot streak — consecutive wins counting backwards from most recent
- Best single win — peak profit in one session
- Most consistent — lowest standard deviation (needs 2+ sessions)
- Buy-in monster — highest total amount bought in

**Correlation matrix** — Pearson correlation between pairs of regulars (2+ sessions) over the window. Positive = tend to win/lose together; negative = rivals. Requires 2+ shared sessions per pair to compute.

**Cumulative winnings chart** — starts at 0, plots running total profit per session for up to 9 regulars. Players with only 1 session are excluded.

---

## Common tasks

### Add a new nav tab / view

1. Add a new view file in `src/views/`
2. Import it in `App.jsx`
3. Add a render line: `{view === "myview" && <MyView ... />}`
4. Add a `NavBtn` in `Header.jsx` with appropriate role guard
5. Add any needed session handlers in `App.jsx` and pass as props

### Add a new modal type

1. Add a new `{modal.type === "mytype" && ...}` block in `Modal.jsx`
2. Add a handler function inside `Modal`
3. Trigger it by calling `setModal({ type: "mytype" })` from a view

### Add a new style

Add a key to the `S` object in `styles.js`. Use it via `style={S.myStyle}` in any component that imports `{ S }`.

### Add a new player stat

Player stats are computed in `AnalyticsView.jsx` inside the `playerStats` `useMemo`. Add the field there, then render it in the `detailedStats` table below.

### Change the session window for LimitedStatsView

In `AnalyticsView.jsx`, `LimitedStatsView` uses `.slice(-8)`. Change `8` to show more or fewer sessions.

---

## Non-obvious things

- **`profitColor()`** always returns `#2a0a08` regardless of input — intentional. Color-coded profit was removed by design; the dark text reads well on all backgrounds.

- **`updateSession(id, fn)`** does a deep copy of players and their buyins arrays before passing to `fn`. This means mutations inside `fn` are safe — you can do `p.cashout = amount` directly.

- **`startNewSession`** prepends the new session to the array (`[s, ...prev]`), so newest always appears first.

- **Load failure handling** — if `loadSessions()` returns `null` (Supabase error), `setSessions` is never called and `saveEnabled` stays `false`. Empty state is never written back over existing data.

- **Real-time sync** runs in `App.jsx` against the `poker_data` table. It does NOT filter by key — it fires on any change to that table. In practice there's only one row (`poker-sessions-v2`) so this is fine.

- **The share card** must stay in the DOM at all times while its view is mounted — html2canvas can't capture elements that aren't rendered. It's hidden via absolute positioning off-screen, not `display: none`.

- **`supabase-schema.sql`** must be run once in Supabase SQL Editor to create the table and RLS policies. Without RLS, the anon key would allow unrestricted access.

- **Simultaneous edits** — last write wins. If two admins are in the same active session at the same time, one will overwrite the other's change. Real-time sync will eventually converge but changes can be lost.

---

## Local development

```bash
npm install
npm run dev          # dev server at localhost:5173
```

Without `.env.local`, Supabase is `null` and the app falls back to `localStorage`. Fully functional for offline testing.

```bash
npm run hash-pwd -- yourpassword   # generate SHA-256 hash for a new password
npm run build                       # production build → dist/
```

---

## Deployment

Push to `main` → Vercel auto-deploys. Env vars are baked into the JS bundle at build time. If you change a hash in Vercel settings, you must trigger a manual redeploy.
