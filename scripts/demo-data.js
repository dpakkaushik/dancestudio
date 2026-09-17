/**
 * DanceOS demo data — one file, three commands:
 *
 *   node scripts/demo-data.js seed     → build the whole demo world
 *   node scripts/demo-data.js status   → what demo data exists right now
 *   node scripts/demo-data.js wipe     → remove ALL of it, in one step
 *
 * WHY IT IS SAFE TO WIPE. Every demo account is `demo.<name>@example.com`, and
 * every demo row is owned by one of them: businesses are created BY a demo
 * owner, so deleting the business cascades its rooms, classes, sessions,
 * class_bookings, claims, leads, invites, orders, payments, refunds, payouts,
 * events and event bookings; deleting the account cascades its profile, and the
 * profile cascades the crews it leads and the follows it made. So the wipe is:
 * delete the demo businesses, then delete the demo users. Nothing untagged is
 * ever touched — the script never issues a delete that is not keyed on a demo
 * id it just looked up.
 *
 * WHY IT SEEDS THROUGH THE APP'S OWN DOORS. Each demo user signs in for real
 * (password grant) and the data is written by the same RPCs the screens call —
 * `create_business_with_owner`, `create_class_with_session`, `book_class_session`,
 * `ask_class_person` / `respond_to_class_ask`, `create_crew` / `respond_to_crew_ask`,
 * `save_event` / `publish_event` / `book_event`, `send_enquiry` /
 * `send_enquiry_quote`, `set_follow`, `check_in`, `record_payout`. So the demo
 * world obeys every rule the real one does: consent is real, capacity is real,
 * a waitlist is a real waitlist. The service role is used for exactly three
 * things a user cannot legally do: creating the accounts, back-dating a session
 * so a past class exists, standing in for the payment webhook
 * (`apply_captured_payment`) so the money screens have real rows, and — since
 * 8 Sep 2026 — standing in for the platform admin who verifies the two demo
 * organizations, so their studios are public.
 *
 * The cast is the prototype's own (Bounce Dance Academy, EEE Crew, Rhea
 * Kapoor…), so demo data is recognisable as demo data at a glance.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PASSWORD = "Demo-passw0rd!";
const DEMO_RE = /^demo\.[a-z0-9-]+@example\.com$/;

/* ── env ── */
const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
const envGet = (k) => {
  const m = env.match(new RegExp(`^${k}\\s*=\\s*(.*)$`, "m"));
  return m ? m[1].trim().replace(/^"|"$/g, "") : "";
};
const BASE = envGet("NEXT_PUBLIC_SUPABASE_URL");
const ANON = envGet("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = envGet("SUPABASE_SERVICE_ROLE_KEY");
if (!BASE || !ANON || !SERVICE) {
  console.error("Supabase keys missing from .env.local");
  process.exit(1);
}

/* ── http ── */
const H_SERVICE = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", "User-Agent": "danceos-demo" };
const H_ANON = { apikey: ANON, "Content-Type": "application/json", "User-Agent": "danceos-demo" };
const asUser = (token) => ({ apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "danceos-demo" });

async function call(method, url, headers, body, label) {
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text).message ?? text;
    } catch {
      /* not json */
    }
    throw new Error(`${label ?? url} → ${res.status} ${msg}`);
  }
  return text ? JSON.parse(text) : null;
}

const rpc = (headers, fn, args) => call("POST", `${BASE}/rest/v1/rpc/${fn}`, headers, args ?? {}, `rpc ${fn}`);
const rows = (headers, query) => call("GET", `${BASE}/rest/v1/${query}`, headers, undefined, `get ${query}`);
const insert = (headers, table, body) => call("POST", `${BASE}/rest/v1/${table}`, { ...headers, Prefer: "return=representation" }, body, `insert ${table}`);
const patch = (headers, query, body) => call("PATCH", `${BASE}/rest/v1/${query}`, headers, body, `patch ${query}`);
const remove = (headers, query) => call("DELETE", `${BASE}/rest/v1/${query}`, headers, undefined, `delete ${query}`);

/* ── dates, in IST, as the app stores them ── */
const IST = "+05:30";
const dayShift = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const at = (days, hhmm) => `${dayShift(days)}T${hhmm}:00${IST}`;

/* ── accounts ── */
async function listDemoUsers() {
  const out = [];
  for (let page = 1; page <= 20; page += 1) {
    const body = await call("GET", `${BASE}/auth/v1/admin/users?page=${page}&per_page=200`, H_SERVICE, undefined, "list users");
    const users = body.users ?? [];
    users.forEach((u) => {
      if (u.email && DEMO_RE.test(u.email)) out.push({ id: u.id, email: u.email });
    });
    if (users.length < 200) break;
  }
  return out;
}

async function makeUser(handle, fullName, role, city) {
  const email = `demo.${handle}@example.com`;
  const created = await call("POST", `${BASE}/auth/v1/admin/users`, H_SERVICE, { email, password: PASSWORD, email_confirm: true }, `create user ${email}`);
  await insert(H_SERVICE, "profiles", { id: created.id, full_name: fullName, role, city, created_by: created.id, updated_by: created.id });
  const token = await call("POST", `${BASE}/auth/v1/token?grant_type=password`, H_ANON, { email, password: PASSWORD }, `sign in ${email}`);
  return { id: created.id, email, name: fullName, role, token: token.access_token, h: asUser(token.access_token) };
}

/* ── the seed ── */
async function seed() {
  const existing = await listDemoUsers();
  if (existing.length > 0) {
    console.log(`There are already ${existing.length} demo accounts. Run "wipe" first (or "status" to see them).`);
    process.exit(1);
  }
  const log = (s) => console.log(`  ${s}`);
  console.log("Seeding the DanceOS demo world…\n");

  /* ── people ── */
  console.log("People");
  /* two kinds of account since 8 Sep 2026: a person ("user") or an organization ("org") */
  const owner = await makeUser("owner", "Vikram Bhatt", "org", "New Delhi");
  const owner2 = await makeUser("studio2", "Isha Dutta", "org", "Pune");
  const artist = await makeUser("artist", "Meera Grewal", "user", "New Delhi");
  const trainer = await makeUser("trainer", "Aditya Pillai", "user", "New Delhi");
  const rhea = await makeUser("rhea", "Rhea Kapoor", "user", "Pune");
  const zaid = await makeUser("zaid", "Zaid Khan", "user", "Pune");
  const aki = await makeUser("aki", "Aki Sharma", "user", "Pune");
  const kabir = await makeUser("kabir", "Kabir Mehta", "user", "New Delhi");
  const everyone = [owner, owner2, artist, trainer, rhea, zaid, aki, kabir];
  everyone.forEach((u) => log(`${u.name} · ${u.email}`));

  /* ── who is what (8 Sep 2026): Pro is the PLAN, and an organization is verified before its studios are public ── */
  /* 10 Sep 2026: both plans are PAID subscriptions (₹700 a month for an artist, ₹1,200 a month
     per studio, through a Cashfree mandate), so the free RPC refuses them. The service role
     stands in for an admin's grant — the row admin_grant_subscription writes: granted, active,
     ₹0, twelve months, no mandate. */
  const grantPlan = (kind, userId, tenantId, note) =>
    insert(H_SERVICE, "subscriptions", {
      kind, user_id: userId, business_id: tenantId, plan_key: kind === "studio" ? "studio_monthly" : "artist_monthly",
      price_inr: 0, period: "monthly", status: "active",
      current_period_start: new Date().toISOString().slice(0, 10),
      current_period_end: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      granted: true, note, created_by: userId, updated_by: userId,
    });
  await grantPlan("artist", artist.id, null, "Granted by the demo seeder — nothing charged");
  await grantPlan("artist", trainer.id, null, "Granted by the demo seeder — nothing charged");
  log(`${artist.name} and ${trainer.name} hold the Artist plan (granted for a year at ₹0 — nothing charged)`);
  for (const [o, city] of [[owner, "New Delhi"], [owner2, "Pune"]]) {
    const handle = o.name.toLowerCase().replace(/[^a-z]/g, "");
    await rpc(o.h, "update_my_profile", { p_full_name: o.name, p_city: city, p_age: null, p_about: null, p_socials: [{ platform: "Instagram", url: `https://instagram.com/${handle}` }], p_styles: [], p_phone: null });
    /* the service role stands in for the admin here, exactly as it stands in for the webhook below */
    await patch(H_SERVICE, `profiles?id=eq.${o.id}`, {
      verified_at: new Date().toISOString(),
      /* 11 Sep 2026: a verified GST number is what an event needs */
      gstin: `DM${o === owner ? "A" : "B"}${String(Date.now() % 100000).padStart(5, "0")}`,
      gstin_verified_at: new Date().toISOString(),
    });
  }
  log(`${owner.name} and ${owner2.name} are verified organizations — each studio they open gets its own subscription below`);
  /* requirement 3 (9 Sep 2026): a user names at least one style, and every profile keeps a city */
  for (const [u, city, styles] of [[artist, "New Delhi", ["Contemporary", "Kathak"]], [trainer, "New Delhi", ["Hip-Hop", "Bollywood"]], [rhea, "Pune", ["Hip-Hop"]], [zaid, "Pune", ["Breaking"]], [aki, "Pune", ["Salsa"]], [kabir, "New Delhi", ["Bhangra"]]]) {
    await rpc(u.h, "update_my_profile", { p_full_name: u.name, p_city: city, p_age: null, p_about: null, p_socials: [], p_styles: styles, p_phone: null });
  }

  /* ── businesses ── */
  console.log("\nBusinesses");
  const bounce = await rpc(owner.h, "create_business_with_owner", { p_name: "Bounce Dance Academy", p_type: "studio", p_area: "Hauz Khas", p_city: "New Delhi" });
  const eee = await rpc(owner2.h, "create_business_with_owner", { p_name: "EEE Dance Studio", p_type: "studio", p_area: "Kothrud", p_city: "Pune" });
  const meera = await rpc(artist.h, "create_business_with_owner", { p_name: "Meera Grewal Dance Co.", p_type: "artist_page", p_area: "Saket", p_city: "New Delhi" });
  log(`${bounce.name} (studio · New Delhi)`);
  log(`${eee.name} (studio · Pune)`);
  log(`${meera.name} (artist business · New Delhi)`);
  /* each studio's OWN subscription (10 Sep 2026): a studio is born private and goes public when
     its subscription is live. Granted here as an admin would, and listed the way the grant lists it. */
  for (const [o, t] of [[owner, bounce], [owner2, eee]]) {
    await grantPlan("studio", o.id, t.id, "Granted by the demo seeder — nothing charged");
    /* 11 Sep 2026: the BADGE first (an admin's approval, which the seeder stands in for), then listed */
    await patch(H_SERVICE, `businesses?id=eq.${t.id}`, { verified_at: new Date().toISOString(), visibility: "listed" });
  }
  log("Bounce and EEE each hold their own studio subscription (granted, ₹0) and are on Discover");

  /* ── rooms ── */
  await insert(owner.h, "rooms", { business_id: bounce.id, name: "Hall 1", capacity: 30, amenities: ["🪞 Mirrors", "🪵 Sprung floor", "🔊 Sound", "❄️ AC"] });
  await insert(owner.h, "rooms", { business_id: bounce.id, name: "Studio B", capacity: 18, amenities: ["🪞 Mirrors", "🔊 Sound"] });
  await insert(owner2.h, "rooms", { business_id: eee.id, name: "Studio A", capacity: 20, amenities: ["🪞 Mirrors", "🪵 Sprung floor"] });
  log("Rooms: Hall 1 · Studio B (Bounce), Studio A (EEE)");

  /* ── the team: an invite the trainer really accepts ── */
  const invite = await rpc(owner.h, "invite_to_business", { p_business_id: bounce.id, p_name: trainer.name, p_email: trainer.email, p_role: "trainer" });
  await rpc(trainer.h, "accept_business_invite", { p_code: invite.code });
  log(`${trainer.name} accepted the trainer invite at ${bounce.name}`);

  /* ── classes ── */
  console.log("\nClasses");
  /* 17 Sep 2026: a class has no name. The database's title column is "{style} · {level}" —
     exactly what the app writes (dosClassLabel) — so the seeder passes the same, never a typed one. */
  const LEVEL_LABEL = { all: "All levels", beginner: "Beginner", intermediate: "Intermediate", professional: "Professional" };
  const classLabel = (style, level) => `${style} · ${LEVEL_LABEL[level] ?? level}`;
  /* 18 Sep 2026: A CLASS IS BORN A DRAFT AND PUBLISHED ONCE ITS TEACHER HAS SAID YES.
     The seeder does exactly what a studio does — ask, accept, publish — through the
     real RPCs, so the demo world cannot contain a state the real one could not. */
  const mkClass = async (h, tenantId, c) =>
    rpc(h, "create_class_with_session", {
      p_business_id: tenantId,
      p_title: classLabel(c.style, c.level ?? "all"),
      p_venue_business_id: c.venue ?? null,
      p_lat: c.lat ?? null,
      p_lng: c.lng ?? null,
      p_maps_url: c.mapsUrl ?? null,
      p_style: c.style,
      p_level: c.level ?? "all",
      p_room: c.room ?? null,
      p_price_inr: c.price ?? 0,
      p_capacity: c.capacity ?? 12,
      /* every class is saved as a draft now; publishing is the step below */
      p_status: "draft",
      p_starts_at: c.starts,
      p_ends_at: c.ends,
    });

  /* the ask, the yes, and the publish — the three real steps, in the real order.
     An outside teacher who accepts becomes VISITING FACULTY on the studio's team
     (respond_to_class_ask does that), which is how Meera comes to teach at Bounce. */
  const teachAndPublish = async (ownerH, cls, teacher, payInr = 0) => {
    const ask = await rpc(ownerH, "ask_class_person", { p_class_id: cls.id, p_user_id: teacher.id, p_kind: "artist", p_pay_per_session_inr: payInr });
    await rpc(teacher.h, "respond_to_class_ask", { p_class_person_id: ask.id, p_accept: true });
    await patch(ownerH, `classes?id=eq.${cls.id}`, { status: "published" });
    return cls;
  };

  const hiphop = await teachAndPublish(owner.h, await mkClass(owner.h, bounce.id, { style: "Hip-Hop", level: "beginner", room: "Hall 1", capacity: 12, starts: at(1, "19:00"), ends: at(1, "20:00") }), trainer, 900);
  const bolly = await teachAndPublish(owner.h, await mkClass(owner.h, bounce.id, { style: "Bollywood", room: "Hall 1", price: 300, capacity: 10, starts: at(3, "18:30"), ends: at(3, "19:30") }), trainer, 900);
  /* Breaking keeps the demo's one UNANSWERED ask, so the Inbox has something in it —
     it is an ASSISTANT ask now, because an unanswered TEACHER ask would keep the
     class a draft and the waitlist below needs it live (18 Sep 2026) */
  const breaking = await teachAndPublish(owner.h, await mkClass(owner.h, bounce.id, { style: "Breaking", level: "intermediate", room: "Studio B", capacity: 2, starts: at(2, "17:00"), ends: at(2, "18:00") }), trainer, 900);
  await mkClass(owner.h, bounce.id, { style: "Kathak", level: "beginner", room: "Hall 1", capacity: 15, starts: at(5, "18:00"), ends: at(5, "19:15") });
  /* the past class is taught by the ARTIST from outside the team: accepting seats
     Meera at Bounce as VISITING FACULTY, which is the new role in the flesh */
  const past = await teachAndPublish(owner.h, await mkClass(owner.h, bounce.id, { style: "Contemporary", room: "Hall 1", capacity: 10, starts: at(-3, "19:00"), ends: at(-3, "20:00") }), artist, 1300);
  const salsa = await teachAndPublish(owner2.h, await mkClass(owner2.h, eee.id, { style: "Salsa", room: "Studio A", capacity: 20, starts: at(2, "20:00"), ends: at(2, "21:30") }), rhea);
  await teachAndPublish(owner2.h, await mkClass(owner2.h, eee.id, { style: "Bhangra", room: "Studio A", price: 250, capacity: 15, starts: at(4, "18:00"), ends: at(4, "19:00") }), aki);
  /* AN ARTIST'S OWN CLASS: they are its teacher by construction, and it is held at
     a place of their own — a map pin, their own capacity, published straight away */
  const contemp = await mkClass(artist.h, meera.id, {
    style: "Contemporary", level: "intermediate", capacity: 14, starts: at(3, "07:30"), ends: at(3, "08:45"),
    lat: 28.5245, lng: 77.2066, mapsUrl: "https://maps.google.com/?q=28.5245,77.2066",
  });
  await patch(artist.h, `classes?id=eq.${contemp.id}`, { status: "published" });
  log("Bounce: Hip-Hop · Beginner (free, taught by Aarav), Bollywood · All levels (₹300), Breaking · Intermediate (2 places), Kathak · Beginner (draft), Contemporary · All levels (3 days ago, taught by Meera as visiting faculty)");
  log("EEE: Salsa · All levels (Rhea), Bhangra · All levels (₹250, Aki) · Meera Grewal: Contemporary · Intermediate at her own place");

  const sessionOf = async (h, classId) => (await rows(h, `class_sessions?class_id=eq.${classId}&select=id,starts_at&deleted_at=is.null&order=starts_at.asc`))[0];
  const sHiphop = await sessionOf(owner.h, hiphop.id);
  const sBolly = await sessionOf(owner.h, bolly.id);
  const sBreaking = await sessionOf(owner.h, breaking.id);
  const sPast = await sessionOf(owner.h, past.id);
  const sSalsa = await sessionOf(owner2.h, salsa.id);
  const sContemp = await sessionOf(artist.h, contemp.id);

  /* ── who else is on a class: real asks, really answered ──
     The TEACHERS were asked and accepted above (that is what let each class be
     published). What is left is the assistants, and one ask nobody has answered. */
  console.log("\nPeople on classes");
  const asstClaim = await rpc(owner.h, "ask_class_person", { p_class_id: past.id, p_user_id: trainer.id, p_kind: "assistant", p_can_attendance: true, p_pay_per_session_inr: 600 });
  await rpc(trainer.h, "respond_to_class_ask", { p_class_person_id: asstClaim.id, p_accept: true });
  /* and one ask still waiting, so the Inbox has something in it */
  await rpc(owner.h, "ask_class_person", { p_class_id: breaking.id, p_user_id: rhea.id, p_kind: "assistant", p_can_attendance: true });
  log(`${trainer.name}: artist on Hip-Hop and Bollywood (₹900), assistant with attendance on the Contemporary class; one assistant ask still waiting on the Breaking class`);

  /* ── bookings, a full class and a real waitlist ── */
  console.log("\nBookings");
  await rpc(kabir.h, "book_class_session", { p_session_id: sHiphop.id });
  await rpc(zaid.h, "book_class_session", { p_session_id: sHiphop.id });
  await rpc(rhea.h, "book_class_session", { p_session_id: sSalsa.id });
  await rpc(kabir.h, "book_class_session", { p_session_id: sContemp.id });
  await rpc(aki.h, "book_class_session", { p_session_id: sBreaking.id });
  await rpc(zaid.h, "book_class_session", { p_session_id: sBreaking.id });
  const waitlisted = await rpc(rhea.h, "book_class_session", { p_session_id: sBreaking.id });
  log(`Hip-Hop: 2 booked · Breaking: full (2) with ${rhea.name} ${waitlisted.status} · Salsa and Contemporary: 1 each`);

  /* ── the past class: booked, then a register that was actually run ──
     A learner cannot book a session that has already ended, so the seat is
     booked while the session is still in the future and the session is then
     back-dated with the service role — the one thing no user may do. */
  await patch(H_SERVICE, `class_sessions?id=eq.${sPast.id}`, { starts_at: at(30, "19:00"), ends_at: at(30, "20:00") });
  const pastKabir = await rpc(kabir.h, "book_class_session", { p_session_id: sPast.id });
  await rpc(aki.h, "book_class_session", { p_session_id: sPast.id });
  await patch(H_SERVICE, `class_sessions?id=eq.${sPast.id}`, { starts_at: at(-3, "19:00"), ends_at: at(-3, "20:00") });
  /* the register: check_in's window is the clock's, so the attendance row is written
     as the studio, against a session that has ended — service role, same as a backfill */
  await insert(H_SERVICE, "attendance", {
    class_booking_id: pastKabir.id,
    session_id: sPast.id,
    class_id: past.id,
    business_id: bounce.id,
    user_id: kabir.id,
    created_by: owner.id,
    updated_by: owner.id,
  });
  await patch(H_SERVICE, `classes?id=eq.${past.id}`, { status: "completed" });
  log(`Contemporary · All levels (3 days ago): 2 booked, ${kabir.name} checked in, class completed`);

  /* ── money: one real captured payment, and one refund waiting on the studio ──
     The seat is granted by `apply_captured_payment` — the same RPC the Cashfree
     webhook calls — so the ledger and the roster agree by construction. */
  console.log("\nMoney");
  const order = await rpc(kabir.h, "create_payment_order", { p_session_id: sBolly.id });
  const providerOrderId = `demo_order_${order.id.slice(0, 8)}`;
  await rpc(kabir.h, "attach_provider_order", { p_order_id: order.id, p_provider_order_id: providerOrderId });
  await rpc(H_SERVICE, "apply_captured_payment", { p_provider_order_id: providerOrderId, p_provider_payment_id: `demo_pay_${order.id.slice(0, 8)}`, p_amount_paise: 300 * 100, p_method: "upi" });
  const order2 = await rpc(aki.h, "create_payment_order", { p_session_id: sBolly.id });
  const providerOrderId2 = `demo_order_${order2.id.slice(0, 8)}`;
  await rpc(aki.h, "attach_provider_order", { p_order_id: order2.id, p_provider_order_id: providerOrderId2 });
  await rpc(H_SERVICE, "apply_captured_payment", { p_provider_order_id: providerOrderId2, p_provider_payment_id: `demo_pay_${order2.id.slice(0, 8)}`, p_amount_paise: 300 * 100, p_method: "card" });
  const akiBolly = (await rows(aki.h, `class_bookings?session_id=eq.${sBolly.id}&user_id=eq.${aki.id}&deleted_at=is.null&select=id`))[0];
  await rpc(aki.h, "cancel_class_booking_with_reason", { p_class_booking_id: akiBolly.id, p_reason: "Injury — cannot make this one" });
  log("Bollywood · All levels: ₹300 UPI captured (Kabir) and ₹300 card captured then cancelled (Aki) → a refund on the studio's queue");

  /* ── the studio settles what it owes ── */
  await rpc(owner.h, "record_payout", { p_business_id: bounce.id, p_user_id: trainer.id, p_session_ids: [sPast.id], p_method: "upi", p_status: "done", p_note: "Contemporary · All levels · assisting" });
  log(`${trainer.name} paid ₹600 for the session assisted`);

  /* ── the desk: leads at three stages ── */
  console.log("\nStudio desk");
  /* one bulk insert, and PostgREST wants every object to carry the same keys */
  await insert(owner.h, "leads", [
    { business_id: bounce.id, name: "Sneha Dutta", mobile: "98100 11223", interest: "Bollywood · twice a week", source: "walk_in", status: "new", trial_class_id: null, trial_on: null, note: "Walked in on Saturday" },
    { business_id: bounce.id, name: "Rohit Sen", mobile: "98100 44556", interest: "Hip-Hop · beginner", source: "enquiry", status: "quoted", trial_class_id: null, trial_on: null, note: "Quoted the monthly rate" },
    { business_id: bounce.id, name: "Priya Iyer", mobile: "98100 77889", interest: "Kathak", source: "referral", status: "trial_booked", trial_class_id: hiphop.id, trial_on: dayShift(1), note: "Coming to Monday's class" },
  ]);
  log("Leads: Sneha (new), Rohit (quoted), Priya (trial booked)");

  /* ── follows ── */
  await rpc(kabir.h, "set_follow", { p_business_id: bounce.id, p_on: true });
  await rpc(rhea.h, "set_follow", { p_business_id: bounce.id, p_on: true });
  await rpc(zaid.h, "set_follow", { p_business_id: eee.id, p_on: true });
  await rpc(kabir.h, "set_follow", { p_business_id: meera.id, p_on: true });
  log("Follows: Bounce 2, EEE 1, Meera Grewal 1");

  /* ── an enquiry, quoted ── */
  const enq = await rpc(kabir.h, "send_enquiry", {
    p_business_id: bounce.id,
    p_type_key: "private",
    p_fields: [["How many people", "2"], ["Where they train", "At the studio"], ["City", "New Delhi"]],
    p_dates: [dayShift(9)],
    p_where: "New Delhi",
    p_message: "Eight evening sessions before a wedding — my sister and me.",
    p_mobile: "98100 12345",
  });
  await rpc(owner.h, "send_enquiry_quote", { p_enquiry_id: enq.id, p_cost_inr: 24000, p_advance_pct: 30 });
  log("Kabir asked Bounce about private sessions; the studio quoted ₹24,000 (30% advance)");

  /* ── a crew, with consent working exactly as it does for real ── */
  console.log("\nCrew");
  const crew = await rpc(rhea.h, "create_crew", { p_name: "EEE Crew", p_city: "Pune", p_style: "Hip-Hop", p_member_ids: [zaid.id, aki.id] });
  const asks = await rows(rhea.h, `crew_members?crew_id=eq.${crew.id}&status=eq.asked&deleted_at=is.null&select=id,user_id`);
  const zaidAsk = asks.find((a) => a.user_id === zaid.id);
  await rpc(zaid.h, "respond_to_crew_ask", { p_member_id: zaidAsk.id, p_accept: true });
  log(`${crew.name} (Pune · Hip-Hop) led by ${rhea.name}: ${zaid.name} confirmed, ${aki.name} still asked`);

  /* ── events ── */
  console.log("\nEvents");
  /* R15 (9 Sep 2026): an event is the ORGANIZATION's, so it is hosted by the
     organization's own tenant rather than by one of its studios — save_event
     refuses a studio outright. `my_org_business` returns that row, making it on
     first ask, and the public event page prints the organization's name. */
  const bounceEvents = await rpc(owner.h, "my_org_business", {});
  const eeeEvents = await rpc(owner2.h, "my_org_business", {});
  log("events are held by the organizations themselves (R15), not by their studios");
  const mkEvent = async (h, tenantId, e) => {
    const id = await rpc(h, "save_event", {
      p_business_id: tenantId,
      p_event_id: null,
      p_event: {
        category: e.cat,
        title: e.title,
        style: e.style ?? "All styles",
        start_date: e.date,
        end_date: e.endDate ?? e.date,
        start_time: e.time ?? "18:00",
        venue: e.venue,
        address: e.address ?? null,
        city: e.city,
        maps_url: `https://maps.google.com/?q=${encodeURIComponent(`${e.venue} ${e.city}`)}`,
        about: e.about ?? null,
        entry_format: e.entryFormat ?? "none",
        bracket: e.bracket ?? 0,
        rounds: e.rounds ?? 0,
        prizes: e.prizes ?? [],
        tickets_on: e.ticketsOn ?? false,
        entry_tiers: e.entryTiers ?? [],
        ticket_tiers: e.ticketTiers ?? [],
      },
    });
    if (e.publish !== false) await rpc(h, "publish_event", { p_event_id: id });
    return id;
  };

  const showcase = await mkEvent(owner.h, bounceEvents, {
    cat: "showcase",
    title: "Monsoon Showcase Vol 2",
    date: dayShift(12),
    time: "18:30",
    venue: "Talkatora Indoor Stadium",
    address: "Willingdon Crescent",
    city: "New Delhi",
    about: "Two hours, fourteen routines, one floor. Doors at 6:30 pm.",
    ticketsOn: true,
    ticketTiers: [
      { name: "Free entry", price_inr: 0, capacity: 150, sort: 0 },
      { name: "VIP", price_inr: 500, capacity: 20, sort: 1 },
    ],
  });
  const battle = await mkEvent(owner.h, bounceEvents, {
    cat: "battle",
    title: "Delhi Breaking League",
    style: "Breaking",
    date: dayShift(20),
    time: "16:00",
    venue: "Hauz Khas Social",
    city: "New Delhi",
    about: "Top 16 brackets. Solo, duet and crew all enter.",
    entryFormat: "all",
    bracket: 16,
    prizes: [25000, 10000, 5000],
    entryTiers: [
      { format: "solo", fee_inr: 0, capacity: 16 },
      { format: "duo", fee_inr: 0, capacity: 8 },
      { format: "crew", fee_inr: 0, capacity: 8 },
    ],
  });
  await mkEvent(owner2.h, eeeEvents, {
    cat: "battle",
    title: "Cypher Sundays Vol. 9",
    style: "Hip-Hop",
    date: dayShift(15),
    time: "17:00",
    venue: "EEE Dance Studio",
    city: "Pune",
    entryFormat: "solo",
    bracket: 8,
    prizes: [8000, 3000],
    entryTiers: [{ format: "solo", fee_inr: 0, capacity: 8 }],
  });
  await mkEvent(owner.h, bounceEvents, { cat: "tournament", title: "Nritya Championship", date: dayShift(28), venue: "Siri Fort Auditorium", city: "New Delhi", entryFormat: "solo", rounds: 3, entryTiers: [{ format: "solo", fee_inr: 0, capacity: 32 }], publish: false });
  log("Bounce: Monsoon Showcase Vol 2 (tickets), Delhi Breaking League (solo/duet/crew), Nritya Championship (draft)");
  log("EEE: Cypher Sundays Vol. 9 (solo)");

  const tiers = await rows(H_ANON, `event_ticket_tiers?event_id=eq.${showcase}&deleted_at=is.null&select=id,name,price_inr`);
  const freeTier = tiers.find((t) => t.price_inr === 0);
  await rpc(kabir.h, "book_event", { p_event_id: showcase, p_kind: "spectator", p_ticket_tier_id: freeTier.id, p_qty: 2 });
  await rpc(zaid.h, "book_event", { p_event_id: battle, p_kind: "participant", p_format: "solo" });
  await rpc(rhea.h, "book_event", { p_event_id: battle, p_kind: "participant", p_format: "crew", p_crew_id: crew.id });
  await rpc(kabir.h, "book_event", { p_event_id: battle, p_kind: "participant", p_format: "duo", p_partner_id: aki.id });
  log(`Showcase: 2 seats held by ${kabir.name} · Battle: ${zaid.name} solo, ${crew.name} entered by its leader, ${kabir.name} duet with ${aki.name} (awaiting partner)`);

  console.log("\n─────────────────────────────────────────────");
  console.log("Demo world ready. Sign in with any of these:");
  everyone.forEach((u) => console.log(`  ${u.email}   (${u.name} · ${u.role})`));
  console.log(`  password: ${PASSWORD}`);
  console.log("\nSign-in is by email only — go to /login/email. The magic");
  console.log("link goes to an address nobody reads, so for clicking around use");
  console.log("the password with Supabase's password grant, or invite yourself as");
  console.log("staff from a demo studio.");
  console.log("\nRemove everything with:  node scripts/demo-data.js wipe");
}

/* ── status ── */
async function status() {
  const users = await listDemoUsers();
  if (users.length === 0) {
    console.log("No demo data. Create it with: node scripts/demo-data.js seed");
    return;
  }
  const ids = users.map((u) => u.id);
  const businesses = await rows(H_SERVICE, `businesses?created_by=in.(${ids.join(",")})&select=id,name,type,city,deleted_at`);
  const crews = await rows(H_SERVICE, `crews?leader_id=in.(${ids.join(",")})&select=id,name,city,deleted_at`);
  const live = (a) => a.filter((r) => !r.deleted_at);
  console.log(`Demo accounts: ${users.length}`);
  users.forEach((u) => console.log(`  ${u.email}`));
  console.log(`Demo businesses: ${live(businesses).length}`);
  live(businesses).forEach((t) => console.log(`  ${t.name} (${t.type} · ${t.city})`));
  console.log(`Demo crews: ${live(crews).length}`);
  live(crews).forEach((c) => console.log(`  ${c.name} (${c.city})`));
  console.log("\nRemove everything with:  node scripts/demo-data.js wipe");
}

/* ── wipe ── */
async function wipe() {
  const users = await listDemoUsers();
  if (users.length === 0) {
    console.log("Nothing to wipe — no demo accounts found.");
    return;
  }
  const ids = users.map((u) => u.id);
  console.log(`Wiping ${users.length} demo accounts and everything they own…`);

  /* the businesses first: deleting a tenant cascades its rooms, classes,
     sessions, class_bookings, claims, invites, leads, orders, payments, refunds,
     payouts, events and event bookings */
  const businesses = await rows(H_SERVICE, `businesses?created_by=in.(${ids.join(",")})&select=id,name`);
  for (const t of businesses) {
    await remove(H_SERVICE, `businesses?id=eq.${t.id}`);
    console.log(`  business removed: ${t.name}`);
  }
  /* then the accounts: deleting a user cascades its profile, and the profile
     cascades the crews it leads, its follows, its bookings and its enquiries */
  for (const u of users) {
    await call("DELETE", `${BASE}/auth/v1/admin/users/${u.id}`, H_SERVICE, undefined, `delete user ${u.email}`);
    console.log(`  account removed: ${u.email}`);
  }
  /* a crew whose leader was not a demo account cannot exist — the seeder only
     ever creates crews led by demo people — but check, so "wipe" means wiped */
  const strays = await rows(H_SERVICE, `crews?leader_id=in.(${ids.join(",")})&select=id,name`);
  for (const c of strays) {
    await remove(H_SERVICE, `crews?id=eq.${c.id}`);
    console.log(`  crew removed: ${c.name}`);
  }
  console.log("\nDemo data gone. Nothing else was touched.");
}

const command = (process.argv[2] ?? "status").toLowerCase();
const run = { seed, status, wipe }[command];
if (!run) {
  console.error("Usage: node scripts/demo-data.js seed | status | wipe");
  process.exit(1);
}
run().catch((err) => {
  console.error(`\n✕ ${err.message}`);
  console.error('\nThe world may be half-built. Run "node scripts/demo-data.js wipe" and try again.');
  process.exit(1);
});
