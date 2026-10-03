// Checks for 20261003130000_a_notification_reaches_the_phone, run inside the dry
// run's rolled-back transaction by scripts/dry-run-migration.js. ⚠ pg_net queues a
// request and sends it only AFTER commit, so nothing here ever leaves the database:
// the queue is read inside the transaction and rolled back with it.
module.exports = async (c, { check }) => {
  const q = async (sql, args = []) => (await c.query(sql, args)).rows;
  const as = async (uid) => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await q("set local role authenticated");
  };
  const asAnon = async () => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "anon" })]);
    await q("set local role anon");
  };
  const asNobody = async () => {
    await q("reset role");
    await q(`select set_config('request.jwt.claims', '{}', true)`);
  };
  const queued = async () => (await q(`select count(*)::int n from net.http_request_queue`))[0].n;

  check((await q(`select 1 from pg_extension where extname = 'pg_net'`)).length === 1, "pg_net is installed");
  const pol = await q(`select count(*)::int n from pg_policies where schemaname='public'`);
  check(pol[0].n === 104, `public policies grow by exactly one, the own-rows read (${pol[0].n})`);
  const anon = await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and has_function_privilege('anon', p.oid, 'execute')`);
  check(anon[0].n === 39, `anon's executable set unchanged (${anon[0].n})`);
  const g = await q(`select has_table_privilege('anon', 'public.push_subscriptions', 'select') a, has_table_privilege('authenticated', 'public.push_subscriptions', 'insert') i, has_table_privilege('authenticated', 'public.push_subscriptions', 'select') s`);
  check(!g[0].a && !g[0].i && g[0].s, "anon reads nothing; a signed-in person reads and may not write directly");
  const pd = await q(`select has_function_privilege('authenticated', 'public.push_dispatch()', 'execute') u`);
  check(!pd[0].u, "the dispatch trigger function is executable by no client role");

  await asNobody();
  const [a, b] = (await q(`select id from public.profiles where deleted_at is null order by created_at limit 2`)).map((r) => r.id);
  const ep = "https://fcm.googleapis.com/fcm/send/dry-run-" + Date.now();
  const key = "B" + "x".repeat(86);
  const auth = "y".repeat(22);

  await as(a);
  const id = (await q(`select public.save_push_subscription($1, $2, $3, 'dry run') id`, [ep, key, auth]))[0].id;
  check(Boolean(id), "a person registers their device");
  const again = (await q(`select public.save_push_subscription($1, $2, $3) id`, [ep, key, auth]))[0].id;
  check(again === id, "registering the same device twice is one row");
  check((await q(`select count(*)::int n from public.push_subscriptions`))[0].n >= 1, "they read their own device");
  await as(b);
  check((await q(`select count(*)::int n from public.push_subscriptions where user_id = $1`, [a]))[0].n === 0, "somebody else reads none of it");
  await asAnon();
  await q("savepoint sp");
  let anonRefused = false;
  try {
    await q(`select public.save_push_subscription('https://x', 'k', 'a')`);
  } catch {
    anonRefused = true;
  }
  await q("rollback to savepoint sp");
  check(anonRefused, "a stranger cannot register a device");

  // without the vault secrets, a notification queues nothing
  await asNobody();
  let before = await queued();
  await q(`select public.notify($1, 'booking', 'Dry run', 'push check', '/')`, [a]);
  check((await queued()) === before, "with no dispatch address in the vault, nothing is sent");

  // with them, it queues exactly one call to that address, carrying the secret
  await q(`select vault.create_secret('https://example.invalid/api/webhooks/push', 'push_dispatch_url')`);
  await q(`select vault.create_secret('dry-run-secret', 'push_dispatch_secret')`);
  before = await queued();
  await q(`select public.notify($1, 'booking', 'Dry run', 'push check', '/')`, [a]);
  const req = await q(`select url, headers from net.http_request_queue order by id desc limit 1`);
  check((await queued()) === before + 1 && req[0].url === "https://example.invalid/api/webhooks/push", "a notification queues one call to the dispatch address");
  check(JSON.stringify(req[0].headers).includes("dry-run-secret"), "and the call carries the shared secret");

  // somebody with no device costs nothing
  before = await queued();
  await q(`select public.notify($1, 'booking', 'Dry run', 'push check', '/')`, [b]);
  check((await queued()) === before, "a person with no device is not called for");

  // Push switched off, or that kind switched off, sends nothing
  await q(`insert into public.notification_prefs (user_id, push, created_by, updated_by) values ($1, false, $1, $1)
           on conflict (user_id) do update set push = false`, [a]);
  before = await queued();
  await q(`select public.notify($1, 'booking', 'Dry run', 'push check', '/')`, [a]);
  check((await queued()) === before, "Push switched off sends nothing");
  await q(`update public.notification_prefs set push = true, kinds = kinds || '{"booking": false}'::jsonb where user_id = $1`, [a]);
  before = await queued();
  await q(`select public.notify($1, 'booking', 'Dry run', 'push check', '/')`, [a]);
  check((await queued()) === before, "a kind switched off sends nothing");

  // the same device signed in as somebody else moves to them
  await as(b);
  await q(`select public.save_push_subscription($1, $2, $3)`, [ep, key, auth]);
  await asNobody();
  const owners = await q(`select user_id from public.push_subscriptions where endpoint = $1 and deleted_at is null`, [ep]);
  check(owners.length === 1 && owners[0].user_id === b, "a device signed in as somebody else follows them, once");

  await as(b);
  await q(`select public.remove_push_subscription($1)`, [ep]);
  await asNobody();
  check((await q(`select count(*)::int n from public.push_subscriptions where endpoint = $1 and deleted_at is null`, [ep]))[0].n === 0, "turning Push off removes the device");
};
