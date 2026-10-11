// Checks for 20261019090000_notifications_by_area_and_invites_told, run inside
// the dry run's rolled-back transaction by scripts/dry-run-migration.js.
module.exports = async (c, { check }) => {
  const q = async (sql, args = []) => (await c.query(sql, args)).rows;
  const as = async (sub, role = "authenticated") => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role })]);
    if (role === "authenticated") await q("set local role authenticated");
  };
  const asNobody = async () => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', '{}', true)`);
  };
  const refused = async (sql, args, fragment) => {
    await q("savepoint t");
    try {
      await q(sql, args);
      await q("release savepoint t");
      return "went through";
    } catch (e) {
      await q("rollback to savepoint t");
      return fragment === null || e.message.includes(fragment) ? true : e.message;
    }
  };
  const uuid = async () => (await q("select gen_random_uuid() u"))[0].u;
  const notes = async (user, extra = "true", args = []) => {
    await asNobody();
    return (await q(`select count(*)::int n from public.notifications where user_id = $1 and deleted_at is null and ${extra}`, [user, ...args]))[0].n;
  };

  /* 1 · the rule */
  await asNobody();
  const g = async (k, h) => (await q(`select public.notification_group($1, $2) g`, [k, h]))[0].g;
  check(await g("people", "/c/abc-123") === "class", "a class page is the class area");
  check(await g("booking", "/business/x/classes") === "class", "a booking is the class area");
  check(await g("people", "/crews?show=in") === "crew", "a crew link is the crew area");
  check(await g("people", "/practice") === "crew", "a practice is the crew area");
  check(await g("people", "/business?show=team") === "team", "the Team section is the team area");
  check(await g("people", "/business/x/staff") === "team", "a team desk is the team area");
  check(await g("money", "/c/abc") === "money", "money stays money");
  check(await g("enquiry", "/inbox/enquiries/x") === "enquiry", "an enquiry stays an enquiry");
  check(await g("people", "/admin/support/x") === "danceos", "an admin or support link is DanceOS");
  check(await g("people", "/business") === "danceos", "a studio's standing is DanceOS");
  check(await g("event", "/business/x/events/y") === "event", "a retired event stays event");

  /* 2 · the stored rows */
  const bad = await q(`select count(*)::int n from public.notifications where kind not in ('class','team','crew','enquiry','money','danceos','event')`);
  check(bad[0].n === 0, "every stored row is in a group", bad[0].n);
  const inbox = await q(`select count(*)::int n from public.notifications where href = '/inbox' and deleted_at is null and (title like '% wants you as %' or title like '% wants you on the roster%' or title like '% asks to hold %')`);
  check(inbox[0].n === 0, "no class or crew ask still opens /inbox", inbox[0].n);
  const evUnread = await q(`select count(*)::int n from public.notifications where kind = 'event' and read_at is null and deleted_at is null`);
  check(evUnread[0].n === 0, "old event rows are read (history)", evUnread[0].n);
  const prefKeys = await q(`select count(*)::int n from public.notification_prefs where kinds ?| array['people','booking','event']`);
  check(prefKeys[0].n === 0, "no old keys left in anybody's prefs", prefKeys[0].n);

  /* 3 · a new row lands in its group whatever the writer said */
  const ids = {};
  for (const n of ["owner", "invitee", "byEmail", "other"]) {
    const id = await uuid();
    ids[n] = id;
    await q(`insert into auth.users (id, email, instance_id, aud, role, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), '{}', '{}', now(), now())`,
      [id, `dry.notif.${n.toLowerCase()}.${id.slice(0, 6)}@example.com`]);
    await q(`insert into public.profiles (id, full_name, role, city, created_by, updated_by) values ($1, $2, 'user', 'Pune', $1, $1)`, [id, `Dry ${n}`]);
  }
  const { owner, invitee, byEmail, other } = ids;
  await q(`update public.profiles set profile_photo_path = $2 where id = $1`, [owner, `avatars/${owner}/face.jpg`]);
  await as(owner, "service_role");
  await q(`select public.notify($1, 'people', 'Dry class ping', null, '/c/dry-slug')`, [other]);
  check(await notes(other, "title = 'Dry class ping' and kind = 'class'") === 1, "a 'people' write opening a class lands in class");

  /* 4 · a team invite is told */
  const [{ id: biz }] = await q(`insert into public.businesses (name, type, city, visibility, created_by, updated_by)
                                 values ('Dry Artist Page', 'artist_page', 'Pune', 'unlisted', $1, $1) returning id`, [owner]);
  await q(`insert into public.business_members (business_id, user_id, member_role, created_by, updated_by) values ($1, $2, 'owner', $2, $2)`, [biz, owner]);
  await as(owner);
  const r = await refused(`select public.invite_person_to_business($1, $2, 'trainer')`, [biz, invitee], null);
  check(r === "went through", "the owner invites a person", r);
  check(await notes(invitee, "kind = 'team' and href = '/business?show=team' and title = 'Dry Artist Page wants you on its team'") === 1, "the person invited is TOLD");
  check(await notes(invitee, "body ilike 'As Faculty%'") === 1, "the seat is named in words");

  await as(invitee);
  const [pend] = await q(`select * from public.my_pending_invites() where business_id = $1`, [biz]);
  check(pend && pend.inviter_name === "Dry owner", "the invite names who invited", pend);
  check(pend && pend.business_photo_path === `avatars/${owner}/face.jpg`, "an artist's invite carries the ARTIST's own picture", pend);

  await q(`select public.decline_business_invite($1)`, [pend.code]);
  check(await notes(owner, "kind = 'team' and title = 'Dry invitee said no to Dry Artist Page'") === 1, "the owner hears the no");
  await as(invitee);
  const [ans] = await q(`select * from public.my_answered_invites() where business_id = $1`, [biz]);
  check(ans && ans.status === "declined" && ans.inviter_name === "Dry owner", "the answer stays with the person, naming the inviter", ans);

  /* 5 · by address: the person who signs in with it is told; a withdrawal too */
  await as(owner, "service_role");
  const email = (await q(`select email from auth.users where id = $1`, [byEmail]))[0].email;
  const [{ id: inv2 }] = await q(`insert into public.business_invites (business_id, name, email, member_role, code, status, created_by, updated_by)
                                  values ($1, 'Dry E', $2, 'staff', 'drycode' || substr(md5(random()::text), 1, 8), 'pending', $3, $3) returning id`, [biz, email, owner]);
  check(await notes(byEmail, "kind = 'team' and body ilike 'As Other team member%'") === 1, "an invite by address reaches the account with that address");
  await q(`update public.business_invites set status = 'revoked' where id = $1`, [inv2]);
  check(await notes(byEmail, "title = 'Dry Artist Page withdrew its invitation'") === 1, "a withdrawal is told");

  /* 6 · settings per group */
  await as(other);
  await q(`select public.set_notification_prefs($1::jsonb, null, null, null, $2::jsonb)`, [JSON.stringify({ class: false }), JSON.stringify({ money: false })]);
  const [pr] = await q(`select kinds, push_kinds from public.notification_prefs where user_id = $1`, [other]);
  check(pr.kinds.class === false && pr.push_kinds.money === false, "both switches are stored", pr);
  check(await refused(`select public.set_notification_prefs('{"people": true}'::jsonb, null, null, null)`, [], "unknown notification group") === true, "an old key is refused");
  check(await refused(`select public.set_notification_prefs(null, null, null, null, '{"class": "yes"}'::jsonb)`, [], "on or off") === true, "a switch must be a boolean");
  const unread = (await q(`select public.my_unread_notifications() n`))[0].n;
  check(unread === 0, "a group switched off here is not counted on the bell", unread);

  /* 7 · nothing else moved */
  await asNobody();
  const anon = await q(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`);
  check(anon[0].n === 40, "anon's executable set is still 40", anon[0].n);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname = 'public'`);
  check(pol[0].n === 107, "public policies still 107", pol[0].n);
  const acl = await q(`select p.proname, p.proacl::text a from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname in ('my_pending_invites','my_answered_invites','set_notification_prefs')`);
  check(acl.length === 3 && acl.every((x) => x.a.includes("authenticated=X") && !x.a.includes("anon=X")), "the three doors keep authenticated, not anon", acl);
  const overloads = await q(`select count(*)::int n from pg_proc where proname = 'set_notification_prefs'`);
  check(overloads[0].n === 1, "one set_notification_prefs, no overload", overloads[0].n);
};
