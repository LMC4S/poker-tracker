# Poker Tracker

A personal poker session tracker — built with React + Vite, persisted to Supabase, deployed on Vercel.

---

## What it does

- Create and manage poker sessions
- Track players, buy-ins, rebuys, and cash-outs
- Auto-calculates profit/loss per player
- Three-role password system: super admin, admin, and view-only
- Real-time sync — all open browsers update live when any change is made
- Share session as a high-resolution image card (3× scale, black background, white text) — title shows session name, or falls back to the full date when the name is auto-generated
- JSON backup and restore of all session data
- Frequent player suggestions — when adding a player to a session, a custom dropdown (▾) shows historical players sorted by appearance count; players already in the session are excluded

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| UI | React + Vite | Fast dev, clean production builds |
| Database | Supabase | Free tier, easy setup via Vercel integration |
| Hosting | Vercel | Auto-deploys on every GitHub push |
| Auth | SHA-256 PIN gate (three roles) | Simple shared-access lock, no user accounts needed |

---

## Project structure

```
poker_tracker_react/
├── src/
│   ├── main.jsx              # React entry point
│   ├── App.jsx               # Main orchestrator (~88 lines)
│   ├── utils.js              # Constants, helpers, sha256, exportJSON
│   ├── storage.js            # loadSessions / saveSessions (Supabase + localStorage)
│   ├── share.js              # handleShare — generates & shares PNG card
│   ├── styles.js             # S styles object, font vars, global style injection
│   ├── lib/
│   │   └── supabase.js       # Supabase client (null-safe, falls back to localStorage)
│   ├── components/
│   │   ├── PinGate.jsx       # Password auth gate (3 roles, lockout logic)
│   │   ├── Header.jsx        # Nav bar
│   │   ├── Modal.jsx         # New session / add player / buy-in / cash-out modals
│   │   ├── SessionCard.jsx   # Session list card
│   │   ├── StatBox.jsx       # Stat display box
│   │   └── icons.jsx         # SVG icon components
│   └── views/
│       ├── HomeView.jsx      # Home screen
│       ├── ActiveView.jsx    # Live session management
│       ├── SummaryView.jsx   # Completed session summary + share card
│       ├── HistoryView.jsx   # All-time leaderboard + past sessions
│       ├── AnalyticsView.jsx # Cumulative charts, stats, correlation matrix
│       └── PlayerSearchView.jsx # Player search + individual profiles
├── index.html
├── vite.config.js
├── package.json
├── supabase-schema.sql       # Run once in Supabase SQL Editor to create the table
└── .env.example              # Template for required environment variables
```

---

## Role system

Three passwords, each hashed with SHA-256 and stored as env vars. The actual passwords are never in the codebase or bundle.

| Role | Nav tabs visible | What they can do |
|---|---|---|
| **Super Admin** | Home, Session, History, Players, Stats | Full access. Sees all sessions, real names, all-time data, cumulative charts, player search |
| **Admin** | Home, Session | Can create/edit/delete sessions. No Stats tab. |
| **View-only** | Home | Read-only. All edit buttons hidden. No Stats tab. |

### Tab breakdown

- **Home** — active sessions + 3 most recent ended sessions. Admin can create/delete, view-only cannot.
- **Session** — live session management (add players, buy-ins, cash-outs, end session). Admin only controls.
- **History** — (super admin only) all-time leaderboard + full list of past sessions.
- **Players** — (super admin only) search any player by name, view their full profile: stat cards, cumulative chart, session-by-session history.
- **Stats** — (super admin only) cumulative winnings chart + player stats table (all time).

---

## Environment variables

Set these in Vercel → Project → Settings → Environment Variables.

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL (`https://xxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable key (`sb_publishable_...`) |
| `VITE_APP_SUPER_ADMIN_HASH` | SHA-256 hash of the super admin password |
| `VITE_APP_ADMIN_HASH` | SHA-256 hash of the admin password |
| `VITE_APP_VIEW_HASH` | SHA-256 hash of the view-only password |

> ⚠️ Vite only exposes env vars prefixed with `VITE_` to client-side code. The Vercel–Supabase integration auto-injects `SUPABASE_URL` / `SUPABASE_ANON_KEY` (without prefix) — those are **not** the same and won't work. You must add the `VITE_` versions manually.

For local development, copy `.env.example` to `.env.local` and fill in the real values. This file is gitignored and never committed.

---

## Password setup

Generate a hash for each password:

```bash
npm run hash-pwd -- yoursuperadminpassword
npm run hash-pwd -- youradminpassword
npm run hash-pwd -- yourviewpassword
```

Copy the outputs into Vercel as the three env vars above. After changing any env var, trigger a manual redeploy in Vercel for the new value to be baked into the bundle.

**Lock behaviour:**
- Wrong password 5 times → locked out for 15 minutes (tracked in localStorage)
- Correct password → unlocked for the browser session (tracked in sessionStorage, resets on tab close)

---

## How data is stored

All sessions are stored as a single JSON blob in Supabase under the key `poker-sessions-v2`:

```
Table: poker_data
  key        TEXT PRIMARY KEY   → "poker-sessions-v2"
  value      TEXT               → JSON array of all sessions
  updated_at TIMESTAMPTZ
```

One shared dataset, no user accounts. Everyone with a password sees the same sessions.

### Session data shape

```json
[
  {
    "id": "abc123",
    "name": "Session 1",
    "date": "2025-01-01T00:00:00.000Z",
    "ended": true,
    "endDate": "2025-01-01T03:00:00.000Z",
    "players": [
      {
        "id": "xyz789",
        "name": "Alice",
        "buyins": [100, 50],
        "cashout": 200
      }
    ]
  }
]
```

---

## First-time Supabase setup

Run this once in your Supabase project → SQL Editor → New query:

```sql
create table poker_data (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

alter table poker_data enable row level security;

create policy "App read"   on poker_data for select using (key = 'poker-sessions-v2');
create policy "App insert" on poker_data for insert with check (key = 'poker-sessions-v2');
create policy "App update" on poker_data for update using (key = 'poker-sessions-v2');
```

RLS restricts all access to only the one storage key. No row can be deleted via the anon key. Even if someone extracts the Supabase keys from the JS bundle, they can only read/write the single data row — nothing else.

---

## Backup and restore

In the Stats tab (super admin only), there is a **Backup All Sessions (JSON)** button that downloads a `.json` file of all session data. Keep this somewhere safe periodically.

There is intentionally no restore button in the UI (security risk — anyone with admin access could overwrite all data). To restore: open the Supabase table editor, find the `poker-sessions-v2` row, and paste the JSON into the `value` column manually.

---

## Deploying

1. Push to GitHub — Vercel auto-deploys on every push to `main`
2. If you change env vars in Vercel, trigger a manual redeploy for them to be baked into the bundle

---

## Local development

```bash
npm install
npm run dev       # dev server at localhost:5173
npm run build     # production build
npm run preview   # preview production build locally
```

Without `.env.local`, the app falls back to `localStorage` automatically — useful for offline testing without a Supabase connection.

---

## Security notes

- **Passwords** — only SHA-256 hashes live in the bundle, never plaintext. Use strong passphrases; weak ones are brute-forceable from the hash.
- **Supabase anon key** — safe to be public. It's a publishable key, not a secret. RLS policies are the actual protection.
- **RLS** — restricts access to the single data row. No delete policy exists, so data cannot be wiped via the API.
- **GitHub repo is private** — the storage key `poker-sessions-v2` is in the source code; keeping the repo private reduces exposure.
- **Real-time sync** — Supabase real-time pushes changes to all connected browsers instantly. Requires real-time enabled on the `poker_data` table in Supabase dashboard (Database → Replication → toggle `poker_data` on).

---

## UI design

Inspired by the Venetian Las Vegas Poker Room aesthetic.

| Element | Choice |
|---|---|
| Body / display font | Cormorant Garamond (serif) — closest free substitute for Venetian's licensed "Romie" typeface |
| Labels / buttons / nav | Oswald (geometric sans-serif) — substitute for Venetian's "brother-1816" |
| Primary color | `#450206` deep burgundy |
| Background | `#fbf0df` warm cream |
| Card background | `#f0e0c4` |
| Accent / destructive text | `#c0392b` |

All inputs are set to `font-size: 16px` to prevent iOS Safari from auto-zooming when the keyboard opens.

The player name field uses a non-semantic placeholder and `autoComplete="nope"` to suppress iOS Safari Contacts autofill. The PIN field uses `autoComplete="one-time-code"` to reduce (but not fully eliminate) iCloud Keychain prompts — Safari will still occasionally offer to save the password, which is a known iOS limitation with no clean workaround.

---

## Data safety

- **Load failure protection** — if Supabase fails to load on startup, the app shows empty data but does **not** save that empty state back. A failed load can never overwrite existing data in Supabase.
- **Backup regularly** — use the "Backup All Sessions (JSON)" button in Stats (admin role). Store the file somewhere safe. There is no automated backup.
- **Restore** — if data is lost, open Supabase → Table Editor → `poker_data` row → paste your backup JSON into the `value` column and save.

---

## Known limitations

- **Single shared dataset** — all users with a password see and modify the same data. Not suitable if you need per-user isolation.
- **No delete via API** — intentional. To delete bad data, use the Supabase table editor directly.
- **Simultaneous edits** — real-time sync is live but last write wins. Only one admin should manage an active session at a time to avoid conflicts.
