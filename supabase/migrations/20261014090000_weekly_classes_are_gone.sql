-- ═══════════════════════════════════════════════════════════════════════════
-- WEEKLY CLASSES ARE GONE (11 Oct 2026, the user: "remove the weekly class
-- logic completly it just complicates a lot of things").
--
-- `20261013090000_a_class_repeats_weekly` added three doors and edited three
-- bodies. The app stopped calling the three doors in the same push as this
-- file, so they are DROPPED here — a door nothing opens is a door somebody can
-- still walk through with a token:
--
--   1. `add_weekly_sessions(uuid, date)`               — DROPPED
--   2. `create_class_series(… 17 args …)`              — DROPPED
--   3. `cancel_class_session(uuid, text)`              — DROPPED
--
-- ⚠ The three EDITED bodies are deliberately LEFT as they are:
-- `update_class_with_session`, `assert_room_ok` and
-- `cancel_class_bookings_for_class`. Each was written to behave EXACTLY as
-- before for a class with one session (that migration's own words, and its
-- dry run's), and with (1) and (2) gone nothing can give a class a second
-- session. Re-editing three live bodies on production to restore text that
-- does the same thing is risk without benefit (the 28 Sep lesson).
--
-- Counted before writing: 0 live classes have more than one live session, and
-- 0 sessions were called off on their own — so nothing on record depends on
-- the three doors. No table, column, row, policy or grant on anything else
-- moves. No `begin;`/`commit;` (Rule 18).
-- ═══════════════════════════════════════════════════════════════════════════

-- create_class_series calls add_weekly_sessions, so it goes first
drop function public.create_class_series(
  uuid, text, text, text, text, integer, integer, text,
  timestamptz, timestamptz, uuid, text, uuid,
  double precision, double precision, text, date);

drop function public.add_weekly_sessions(uuid, date);

drop function public.cancel_class_session(uuid, text);
