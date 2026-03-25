# Poker Tracker

A personal poker session tracker — built with React + Vite, persisted to Supabase, deployed on Vercel.

---

## What it does

- Create and manage poker sessions
- Track players, buy-ins, rebuys, and cash-outs
- Auto-calculates profit/loss per player
- Three-role password system: super admin, admin, and view-only
- JSON backup and restore of all session data

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
│   ├── main.jsx          # React entry point
│   ├── App.jsx           # Entire app (single-file component, ~1000 lines)
│   └── lib/
│       └── supabase.js   # Supabase client (null-safe, falls back to localStorage)
├── index.html
├── vite.config.js
├── package.json
├── supabase-schema.sql   # Run once in Supabase SQL Editor to create the table
└── .env.example          # Template for required environment variables
```

---

## Role system

Three passwords, each hashed with SHA-256 and stored as env vars. The actual passwords are never in the codebase or bundle.

| Role | Nav tabs visible | What they can do |
|---|---|---|
| **Super Admin** | Home, Session, History, Players, Stats | Full access. Sees all sessions, real names, all-time data, cumulative charts, player search |
| **Admin** | Home, Session, Stats | Can create/edit/delete sessions. Stats shows real names, last 4 sessions only, highlight cards, no chart |
| **View-only** | Home, Stats | Read-only. Same limited Stats view as admin. All edit buttons hidden |

### Tab breakdown

- **Home** — active sessions + 3 most recent ended sessions. Admin can create/delete, view-only cannot.
- **Session** — live session management (add players, buy-ins, cash-outs, end session). Admin only controls.
- **History** — (super admin only) all-time leaderboard + full list of past sessions.
- **Players** — (super admin only) search any player by name, view their full profile: stat cards, cumulative chart, session-by-session history.
- **Stats** — visible to all roles, but content differs by role (see above).

### Stats view by role

**Super Admin (full):**
- Cumulative winnings chart (all sessions, all regular players)
- Player stats table: sessions, win %, net, avg, best, worst (all time)

**Admin / View-only (limited):**
- Highlight cards based on last 4 sessions:
  - 🔥 Hot Streak — most consecutive profitable sessions
  - 🏆 Best Single Win — highest single-session profit
  - 🎯 Most Consistent — lowest variance across sessions
  - 📅 Buy-in Monster — who bought in the most
- Player stats table: sessions, win %, net, avg (last 4 sessions only)

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

In the Stats tab (admin role), there is a **Backup All Sessions (JSON)** button that downloads a `.json` file of all session data. Keep this somewhere safe periodically.

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
- **No real-time sync** — two people saving simultaneously will overwrite each other. Designed for one admin managing sessions at a time.

---

## Known limitations

- **Single shared dataset** — all users with a password see and modify the same data. Not suitable if you need per-user isolation.
- **No delete via API** — intentional. To delete bad data, use the Supabase table editor directly.
- **No real-time collaboration** — last write wins. One person should manage an active session at a time.
