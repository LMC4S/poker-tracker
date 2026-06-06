# Home Game Tracker

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
  <a href="https://vercel.com"><img src="https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel" alt="Vercel"></a>
  <a href="https://supabase.com"><img src="https://img.shields.io/badge/Database-Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"></a>
</p>

Self-hosted web app for home game hosts to track buy-ins, cashouts, and balances during a session. The host runs the session; players who have the link for a session can follow it in their browser, read-only. Data stays in your own Supabase database.

No player accounts. Admin access is PIN-protected, and the full session history never leaves the server. See [Security](#security) for details.

📖 **[Developer documentation](https://lmc4s.github.io/poker-tracker/docs/)** — architecture, data model, HTTP API reference, auth flow, and security model. ([source](docs/index.html))

## How sharing works

Each session has its own share link: `https://your-app.vercel.app/s/<token>`. The token is a random UUID, so links are not guessable and cannot be enumerated.

- The host copies a session's link and sends it to the group.
- Anyone with the link sees that one session, read-only, updating every few seconds. It keeps working after the session ends (it shows the final standings).
- The shared view has two tabs: **Session** (the linked game) and **Home** (series stats across all games — aggregate numbers only, no per-player history).
- The root URL (`/` with no token) shows nothing but a prompt to use a shared link. There is no public listing of sessions.

## Features

- Per-session share links — send a link, the group follows that session live in any phone browser, no app install
- Buy-ins, rebuys, cashouts, undo cashout, with player-name autocomplete from past games
- Series stats across all games — sessions played, typical buy-in, longest session, biggest swing
- Screenshot summary card ranked by net profit, shared via the Web Share API or saved as PNG
- One-click JSON backup of all data
- Mobile-first, built for phones at the table
- Runs on the Vercel and Supabase free tiers

## Install

You need free accounts on [Vercel](https://vercel.com) and [Supabase](https://supabase.com).

### Step 1 — Set up the database

Create a new project at [supabase.com/dashboard](https://supabase.com/dashboard). When it is ready, open the **SQL Editor** and run the contents of [`supabase/migrations/20260101000000_init.sql`](supabase/migrations/20260101000000_init.sql). This creates the `poker_data` table and the row-level-security policy that blocks all anonymous access to it.

Then go to **Project Settings → API** and copy:
- **Project URL** — looks like `https://abcdefg.supabase.co`
- **service_role secret** — the longer JWT (click Reveal). Keep this private.

The browser never talks to Supabase directly, so you do not need the anon key.

### Step 2 — Deploy to Vercel

Click the button below. It clones the repo to your GitHub, prompts you for the keys from Step 1, and deploys.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/LMC4S/poker-tracker&project-name=poker-tracker&repository-name=poker-tracker&env=SUPABASE_URL,SUPABASE_SERVICE_KEY,ADMIN_PIN,ADMIN_API_SECRET&envDescription=SUPABASE_URL%3A%20your%20Supabase%20Project%20URL.%20SUPABASE_SERVICE_KEY%3A%20service_role%20secret%20from%20Supabase.%20ADMIN_PIN%3A%20your%20admin%20password.%20ADMIN_API_SECRET%3A%20run%20openssl%20rand%20-hex%2032%20to%20generate.)

Environment variables:

| Variable | Where to get it |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API → service_role secret |
| `ADMIN_PIN` | Pick anything. This is your admin password |
| `ADMIN_API_SECRET` | Run `openssl rand -hex 32` in your terminal |

### Step 3 — Run a game

Vercel gives you a URL like `https://your-app.vercel.app`.

- **Host:** go to `/admin`, enter your PIN, create a session.
- **Group:** open a session, tap **Copy Link**, and send it to them. Each session has its own link.

Custom domain: Vercel project → **Settings → Domains**.

## Local development

Local dev is for working on the code. To run a real game with your group, [deploy to Vercel](#install).

The share view and the admin panel both depend on the serverless API routes in `api/`, which Vite does not serve. Use `vercel dev` to run them locally:

```bash
npm install
cp .env.example .env.local   # fill in your Supabase keys
npx vercel dev
```

This runs the app on `localhost:3000` with the API routes working.

- `localhost:3000/admin` — admin panel (PIN required; default PIN is `AKo`, set in `.env.example`)
- `localhost:3000/s/<token>` — shared read-only view of one session
- `localhost:3000/` — the "use a shared link" prompt

`npm run dev` (plain Vite, on `localhost:5173`) builds the front end but does not serve `api/`, so only the root prompt renders. For UI-only work without a database, the admin panel falls back to `localStorage` when the API is absent.

## Stack

| Layer | Tech |
|---|---|
| **UI** | React 18 + Vite |
| **Database** | Supabase (Postgres) |
| **API** | Vercel Serverless Functions |
| **Screenshot share** | html2canvas + Web Share API |
| **Fonts** | Oswald, Cormorant Garamond, Inter |

## Architecture

All database access goes through serverless functions holding the service key. The browser never has a database credential.

```
   Admin (/admin)                     Observer (/s/<token>)
        │                                     │
        ▼                                     ▼
  ┌──────────────┐                   ┌──────────────────┐
  │  /api/auth   │                   │  /api/session    │
  │  /api/sessions│                  │  ?token=...      │
  └──────┬───────┘                   └────────┬─────────┘
         │  service key                       │  service key
         ▼                                     ▼
   ┌──────────────────────── poker_data ──────────────────┐
   │  full history (RLS: deny all anon)                    │
   └──────────────────────────────────────────────────────┘
```

| | Observer (`/s/<token>`) | Admin (`/admin`) |
|---|---|---|
| **Access** | Holds a session's token | PIN required |
| **Sees** | One session + aggregate series stats | All sessions, full history |
| **Source** | `/api/session?token=` | `/api/sessions` |
| **Updates** | 5-second polling | 5-second polling |
| **Writes** | None | `x-admin-secret` header |

## Security

One database table, `poker_data`, holds everything. Its RLS policy denies all anonymous access, and no database credential ships in the browser bundle. Every read and write goes through a serverless function that uses the service key:

- **Admin** routes (`/api/auth`, `/api/sessions`) require the `x-admin-secret` header, checked server-side with a constant-time comparison.
- **Observer** route (`/api/session`) takes a session token and returns only that one session plus aggregate series stats. There is no way to list or enumerate sessions.

The admin PIN is SHA-256 hashed in the browser before it is sent. The admin session persists in `localStorage` so it survives app-switching and reloads on mobile; clear site data to log out.

Share tokens are random UUIDs. Anyone with a session's link can view that session, so treat links as you would the information in them.

## License

MIT
