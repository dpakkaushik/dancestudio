-- A STUDIO CAN INVITE VISITING FACULTY (19 Sep 2026)
--
-- Found by the e2e, not by reading: the Team desk offers a studio three labels
-- (Faculty · Visiting faculty · Staff — `rolesFor`, the user's own "Label them
-- according to what profile I am in"), and picking the middle one answered
--
--     23514  new row for relation "business_invites" violates check constraint
--            "business_invites_member_role_check"
--
-- `visiting_faculty` became a fourth `member_role` on 18 Sep 2026, when an
-- outside teacher who accepts a class ask gets that seat — and that migration
-- widened `business_members`, which is where the seat lands. It did NOT widen
-- `business_invites`, because until today nothing could ASK for that seat:
-- the invite form offered trainer | staff only.
--
-- 20260919190000 then taught both doors (the people picker and the email form)
-- to offer it, and widened `invite_person_to_business`'s own guard to admit it —
-- but the CHECK underneath them both was left as Step 12b wrote it. So the
-- label was offered, accepted by the RPC, and refused by the table.
--
-- ⚠ The lesson worth keeping: a value added to one table's vocabulary does not
-- reach the tables that FEED it. `business_members` and `business_invites` hold
-- the same word and are constrained separately, and only a call finds that.
--
-- Nothing else moves: no policy, no grant, no function, no row. Every existing
-- invite holds 'trainer' or 'staff' and satisfies the wider constraint by
-- construction, so this widens what is allowed and forbids nothing new.

alter table public.business_invites
  drop constraint business_invites_member_role_check;

alter table public.business_invites
  add constraint business_invites_member_role_check
  check (member_role = any (array['trainer', 'staff', 'visiting_faculty']));

comment on column public.business_invites.member_role is
  'The seat being offered: trainer (Faculty) | visiting_faculty | staff. Never owner — that one is not grantable (the prototype''s settings footnote, 18434). Kept in step with business_members.member_role, which is where the seat lands when the invite is accepted.';
