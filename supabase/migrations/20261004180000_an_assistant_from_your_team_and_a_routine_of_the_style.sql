-- ═══════════════════════════════════════════════════════════════════════════
-- AN ASSISTANT COMES FROM YOUR TEAM OR YOUR CREWS, AND A ROUTINE IS OF THE
-- CLASS'S OWN STYLE (4 Oct 2026)
--
-- The user, earlier the same day: "when adding a class assistant to a class
-- should be able to add only people from your own team members or crew members.
-- no one else … add a routine should only add routines of the same dance
-- style." The app started keeping both that day (`findAssistantPool` and
-- `askClassPersonAction`; `addClassRoutineAction`). Then: "fix two remaining
-- things" — this is the database keeping them for every other door, so a direct
-- PostgREST call is refused in the same words the app uses.
--
-- What moves — TWO FUNCTION BODIES, nothing else:
--   1. `ask_class_person` refuses an ASSISTANT who is not, for the person asking:
--        · on the team of the business the class belongs to, or
--        · on the team of an artist page the asker OWNS (so a teacher on a
--          studio's class can bring their own assistant), or
--        · a confirmed member of a live crew the asker is confirmed in.
--      In the app's own words: "Only people on your team or in your crews can be
--      asked to assist." It sits after every existing check, so a stranger is
--      still told "only the owner, or the person taking this class, adds
--      assistants" first. The TEACHER (kind 'artist') is untouched — the owner
--      may still ask anybody on DanceOS to take a class (18 Sep 2026, R19).
--   2. `add_class_routine` refuses a routine whose style is not the class's:
--      "Only a {style} routine can go on a {style} class." — after the existing
--      "that routine is not yours" check.
--
-- What deliberately does NOT move:
--   · Nothing is backfilled. An assistant asked before today who sits outside
--     the pool keeps their row, and a routine already on a class of another
--     style stays on it: both rules are about the NEXT ask, and taking a person
--     or a routine off a class behind its owner's back is not a migration's act.
--   · No table, column, row, policy or grant. Both bodies are edited OUT OF THE
--     CATALOG by asserted single-occurrence anchor (`_dos_swap`, as in
--     20261004170000), so a body that has drifted refuses the whole migration
--     instead of half-applying; `create or replace` keeps both signatures, so no
--     grant moves. Nothing here writes `begin;`/`commit;` (Rule 18).
-- ═══════════════════════════════════════════════════════════════════════════

create function public._dos_swap(p_def text, p_from text, p_to text, p_fn text, p_expect integer default 1) returns text
language plpgsql as $fn$
declare v_n integer;
begin
  v_n := (length(p_def) - length(replace(p_def, p_from, ''))) / length(p_from);
  if v_n <> p_expect then
    raise exception 'anchor found % times in %, expected %: %', v_n, p_fn, p_expect, left(p_from, 80);
  end if;
  return replace(p_def, p_from, p_to);
end;
$fn$;

do $migration$
declare
  v_def text;
  v_new text;
begin
  -- ── 1. an assistant comes from the asker's team or crews ───────────────────
  select pg_get_functiondef('public.ask_class_person(uuid, uuid, text, boolean, boolean, integer)'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    E'    raise exception ''only the studio owner sets what a session pays'';\n  end if;\n',
    E'    raise exception ''only the studio owner sets what a session pays'';\n  end if;\n\n'
    || E'  -- 4 Oct 2026: an ASSISTANT comes from the asker''s own team or crews, and\n'
    || E'  -- nobody else (the user: "only people from your own team members or crew\n'
    || E'  -- members. no one else"). The same three sources as the app''s picker:\n'
    || E'  -- the class''s business, an artist page the asker owns, a crew they are in.\n'
    || E'  if p_kind = ''assistant'' and not (\n'
    || E'       exists (select 1 from public.business_members m\n'
    || E'                where m.business_id = v_class.business_id and m.user_id = p_user_id\n'
    || E'                  and m.deleted_at is null)\n'
    || E'    or exists (select 1 from public.business_members mine\n'
    || E'                 join public.businesses b on b.id = mine.business_id\n'
    || E'                                         and b.type = ''artist_page'' and b.deleted_at is null\n'
    || E'                 join public.business_members m on m.business_id = mine.business_id\n'
    || E'                                               and m.user_id = p_user_id and m.deleted_at is null\n'
    || E'                where mine.user_id = v_user and mine.member_role = ''owner''\n'
    || E'                  and mine.deleted_at is null)\n'
    || E'    or exists (select 1 from public.crew_members mine\n'
    || E'                 join public.crews cr on cr.id = mine.crew_id and cr.deleted_at is null\n'
    || E'                 join public.crew_members m on m.crew_id = mine.crew_id and m.user_id = p_user_id\n'
    || E'                                           and m.status = ''confirmed'' and m.deleted_at is null\n'
    || E'                where mine.user_id = v_user and mine.status = ''confirmed''\n'
    || E'                  and mine.deleted_at is null)\n'
    || E'  ) then\n'
    || E'    raise exception ''Only people on your team or in your crews can be asked to assist.'';\n'
    || E'  end if;\n',
    'ask_class_person');
  execute v_new;

  -- ── 2. a routine goes on a class of its own style ──────────────────────────
  select pg_get_functiondef('public.add_class_routine(uuid, uuid)'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    E'    raise exception ''that routine is not yours'';\n  end if;\n',
    E'    raise exception ''that routine is not yours'';\n  end if;\n\n'
    || E'  -- 4 Oct 2026: a routine goes on a class of its OWN style (the user: "add a\n'
    || E'  -- routine should only add routines of the same dance style").\n'
    || E'  if not exists (select 1 from public.routines r, public.classes c\n'
    || E'                  where r.id = p_routine_id and c.id = p_class_id and r.style = c.style) then\n'
    || E'    raise exception ''Only a % routine can go on a % class.'',\n'
    || E'      (select c.style from public.classes c where c.id = p_class_id),\n'
    || E'      (select c.style from public.classes c where c.id = p_class_id);\n'
    || E'  end if;\n',
    'add_class_routine');
  execute v_new;
end
$migration$;

drop function public._dos_swap(text, text, text, text, integer);
