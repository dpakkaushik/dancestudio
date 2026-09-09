-- The audit log names WHAT was acted on, not who complained (11 Sep 2026)
-- ⚠ Rule 9: audit log.
--
-- Phase 2 shipped `decide_report` logging `('profile', reporter_id, null)` as
-- the subject, which read in the log as
--
--     admin@danceos.in  acted on a report about  an account
--
-- naming nothing and nobody, and implying the decision was about the person who
-- reported rather than the thing reported. A log that cannot be read is not
-- evidence of anything.
--
-- The subject of a report decision is the REPORTED THING, with its name
-- resolved at decision time and snapshotted, so the line still reads after that
-- studio, crew or class has been deleted. The reporter moves into `detail`,
-- where an admin can still find them — the log is admin-only, so this hides
-- nothing that was visible before; it just stops the sentence lying.
--
-- The log itself is insert-only and a trigger refuses UPDATE and DELETE from
-- everybody, service role included, so the rows phase 2 already wrote stay as
-- they are. That is the design working: a correction is a new row, and from
-- here the new rows read correctly.

create or replace function public.decide_report(p_report_id uuid, p_actioned boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
  v_label text;
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin';
  end if;
  select * into v_report from public.reports r where r.id = p_report_id and r.deleted_at is null;
  if not found then
    raise exception 'no such report';
  end if;
  if v_report.status <> 'open' then
    raise exception 'that report already has an answer';
  end if;

  update public.reports r
     set status = case when p_actioned then 'actioned' else 'dismissed' end,
         decision_note = nullif(btrim(coalesce(p_note, '')), ''),
         decided_at = now(),
         decided_by = auth.uid(),
         updated_by = auth.uid()
   where r.id = p_report_id;

  -- the reporter hears back: a report that vanishes teaches people not to report
  perform public.notify(v_report.reporter_id, 'people',
    case when p_actioned then 'DanceOS acted on your report' else 'DanceOS looked at your report' end,
    coalesce(nullif(btrim(coalesce(p_note, '')), ''),
             case when p_actioned then 'Thank you — we have dealt with it.' else 'We looked, and did not find a problem this time.' end),
    '/');

  -- the name of the thing that was reported, as it stands right now
  if v_report.subject_kind = 'tenant' then
    select t.name into v_label from public.tenants t where t.id = v_report.subject_id;
  elsif v_report.subject_kind = 'profile' then
    select p.full_name into v_label from public.profiles p where p.id = v_report.subject_id;
  elsif v_report.subject_kind = 'crew' then
    select c.name into v_label from public.crews c where c.id = v_report.subject_id;
  elsif v_report.subject_kind = 'event' then
    select e.title into v_label from public.events e where e.id = v_report.subject_id;
  else
    select c.title into v_label from public.classes c where c.id = v_report.subject_id;
  end if;

  perform public.log_admin_action(
    case when p_actioned then 'report.actioned' else 'report.dismissed' end,
    -- the audit log's subject_kind is a short list; a crew, event or class is
    -- not one of its words, so anything that is not a business is filed under
    -- the profile it hangs off — `detail` keeps the true kind and id
    case when v_report.subject_kind = 'tenant' then 'tenant' else 'profile' end,
    v_report.subject_id,
    nullif(btrim(coalesce(v_label, '')), ''),
    p_note,
    jsonb_build_object('report_id', p_report_id,
                       'reason', v_report.reason,
                       'reported_kind', v_report.subject_kind,
                       'reported_id', v_report.subject_id,
                       'reporter_id', v_report.reporter_id,
                       'reporter_note', v_report.note));
end;
$$;
comment on function public.decide_report(uuid, boolean, text) is
  'Answer a report: actioned or dismissed, with a note the reporter reads back. Audited against the THING reported, with the reporter in detail (11 Sep 2026). Acting on the subject itself is a separate, separately audited decision (unlist, suspend).';
revoke execute on function public.decide_report(uuid, boolean, text) from public, anon;
grant execute on function public.decide_report(uuid, boolean, text) to authenticated;
