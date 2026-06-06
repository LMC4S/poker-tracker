-- Per-session share links.
--
-- Public reads now go through the service-key API endpoint /api/session/[token],
-- which returns only the single session matching an unguessable token. Anon
-- clients no longer read poker_public directly, so its blanket select policy
-- (which allowed enumerating every row with the public anon key) is removed.
--
-- Apply this AT CUTOVER, i.e. only after the new frontend is deployed to
-- production. The current live frontend still reads poker_public via anon, so
-- running this earlier would break the live homepage.

drop policy if exists "allow anon select" on poker_public;

-- Realtime on poker_public is no longer used (the share view polls the API).
alter publication supabase_realtime drop table poker_public;
