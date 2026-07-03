-- v3: operation-based backend.
--
-- Sessions move from one JSON blob (poker_data['poker-sessions-v2']) to one
-- row per session, and every mutation becomes a small operation recorded in
-- an idempotency ledger (poker_ops). This is what lets a retried save on bad
-- wifi apply exactly once instead of re-uploading the whole history.
--
-- The v2 blob and its snapshots are NOT touched — they stay in poker_data as
-- a backup and as the data source for any pre-v3 clients still running. The
-- backfill below copies (never moves) the current sessions into the new
-- table, and is safe to run more than once.

create table poker_sessions (
  id text primary key,
  data jsonb not null,          -- full session object minus id (name, date, players, log, ...)
  share_token text,             -- mirrored out of data for indexed public lookup
  ended boolean not null default false,
  deleted_at timestamptz,       -- soft delete: keeps the audit trail, prevents resurrection
  updated_at text not null default ''  -- per-session version, ISO string (text, matching v2 convention)
);
create index poker_sessions_share_token_idx on poker_sessions (share_token) where share_token is not null;

alter table poker_sessions enable row level security;
create policy "deny all anon" on poker_sessions
  for all to anon using (false);

create table poker_ops (
  op_id text primary key,       -- client-generated uuid; duplicate insert = retry of an applied op
  session_id text not null,
  type text not null,
  payload jsonb,
  applied_at timestamptz not null default now()
);

alter table poker_ops enable row level security;
create policy "deny all anon" on poker_ops
  for all to anon using (false);

-- Backfill: copy every session out of the v2 blob into its own row.
insert into poker_sessions (id, data, share_token, ended, updated_at)
select s->>'id',
       s - 'id',
       s->>'shareToken',
       coalesce((s->>'ended')::boolean, false),
       coalesce(s->>'updatedAt', '')
from poker_data,
     jsonb_array_elements(value::jsonb) as s
where key = 'poker-sessions-v2'
on conflict (id) do nothing;

-- Verify: the two numbers below must match.
select
  (select count(*) from poker_sessions) as rows_migrated,
  (select jsonb_array_length(value::jsonb) from poker_data where key = 'poker-sessions-v2') as sessions_in_blob;
