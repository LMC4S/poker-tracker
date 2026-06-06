-- Per-session share links.
--
-- Public reads now go through the service-key API endpoint /api/session, which
-- returns only the single session matching an unguessable token (plus aggregate
-- series stats). Anon clients no longer read the database directly, so the old
-- poker_public snapshot table is unused and removed.
--
-- poker_public only ever held a derived snapshot regenerated on each save, so
-- dropping it loses no source data. Apply this after the new frontend is live.
-- (Safe to run on a fresh install too: the table won't exist and this is a
-- no-op.)

drop table if exists poker_public cascade;
