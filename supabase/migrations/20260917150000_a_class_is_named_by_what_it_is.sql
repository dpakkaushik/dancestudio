-- A class is named by what it IS — its style and its level — never typed.
-- (17 Sep 2026, the user: "remove class name from the class form and remove
-- from everywhere in the app.")
--
-- The form lost its CLASS NAME field, and the app now WRITES `classes.title`
-- as "{style} · {level}" on every save (the prototype's own dosClassLabel,
-- DanceOSApp.jsx:176-183) and never READS the stored column: every repository
-- derives the label from `style` and `level`, so an old typed name cannot
-- reach a screen through the app's own reads.
--
-- What the app cannot reach is the DATABASE'S OWN words, which print the
-- stored column: the notification triggers ("… booked {title}", "A place
-- opened in {title}", "{title} · your call, inside the policy window."),
-- my_session_history (the Stats History rows), the admin money desk's
-- class_title, and the label a report or an audit row gives a class. Every
-- class saved before today still carries the name somebody typed, so this
-- renames those rows ONCE to the same label the app writes now. Soft-deleted
-- rows are renamed too: nothing anywhere should carry a typed class name.
--
-- Deliberately NOT done here:
--   * share_slug is untouched — a booking link handed out is a promise (Rule 14),
--     and the slug was only ever DERIVED from the title at insert, never read back.
--   * create_class_with_session keeps its p_title argument (Rule 4; and two
--     overloads of one name is how PostgREST stops finding either) — the app
--     passes the label into it.
--   * No trigger keeps title derived. The app is the only writer that matters,
--     the proof scripts pass a title and delete their rows afterwards, and a
--     rule that only NAMES things is not worth a sixth trigger on this table.
--
-- RLS impact: NONE. No policy, grant or function changes — one UPDATE and a
-- column comment. The classes_set_updated_at trigger stamps the rows it
-- touches; it coalesces updated_by when auth.uid() is null (20260824190000).

with label as (
  select c.id,
         concat_ws(' · ', c.style,
           case c.level
             when 'all'          then 'All levels'
             when 'beginner'     then 'Beginner'
             when 'intermediate' then 'Intermediate'
             when 'professional' then 'Professional'
             else c.level
           end) as new_title
    from public.classes c
)
update public.classes c
   set title = l.new_title
  from label l
 where l.id = c.id
   and c.title is distinct from l.new_title;

comment on column public.classes.title is
  'Derived, never typed: "{style} · {level}" (the app''s dosClassLabel). The form has had no name field since 17 Sep 2026; the app writes this on every save and reads style + level instead of it. Kept because the slug trigger, the notification triggers and the admin desks print it.';
