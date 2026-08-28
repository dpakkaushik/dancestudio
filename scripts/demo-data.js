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
 * enrollments, claims, leads, invites, orders, payments, refunds, payouts,
 * events and event bookings; deleting the account cascades its profile, and the
 * profile cascades the crews it leads and the follows it made. So the wipe is:
 * delete the demo businesses, then delete the demo users. Nothing untagged is
 * ever touched — the script never issues a delete that is not keyed on a demo
 * id it just looked up.
 *
 * WHY IT SEEDS THROUGH THE APP'S OWN DOORS. Each demo user signs in for real
 * (password grant) and the data is written by the same RPCs the screens call —
 * `create_tenant_with_owner`, `create_class_with_session`, `enroll_in_session`,
 * `claim_person` / `respond_to_claim`, `create_crew` / `respond_to_crew_ask`,
 * `save_event` / `publish_event` / `book_event`, `send_enquiry` /
 * `send_enquiry_quote`, `set_follow`, `check_in`, `record_payout`. So the demo
 * world obeys every rule the real one does: consent is real, capacity is real,
 * a waitlist is a real waitlist. The service role is used for exactly three
 * things a user cannot legally do: creating the accounts, back-dating a session
 * so a past class exists, and standing in for the payment webhook
 * (`apply_captured_payment`) so the money screens have real rows.
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
  const owner = await makeUser("owner", "Vikram Bhatt", "studio", "New Delhi");
  const owner2 = await makeUser("studio2", "Isha Dutta", "studio", "Pune");
  const artist = await makeUser("artist", "Meera Grewal", "trainer", "New Delhi");
  const trainer = await makeUser("trainer", "Aditya Pillai", "trainer", "New Delhi");
  const rhea = await makeUser("rhea", "Rhea Kapoor", "dancer", "Pune");
  const zaid = await makeUser("zaid", "Zaid Khan", "dancer", "Pune");
  const aki = await makeUser("aki", "Aki Sharma", "dancer", "Pune");
  const kabir = await makeUser("kabir", "Kabir Mehta", "dancer", "New Delhi");
  const everyone = [owner, owner2, artist, trainer, rhea, zaid, aki, kabir];
  everyone.forEach((u) => log(`${u.name} · ${u.email}`));

  /* ── businesses ── */
  console.log("\nBusinesses");
  const bounce = await rpc(owner.h, "create_tenant_with_owner", { p_name: "Bounce Dance Academy", p_type: "studio", p_area: "Hauz Khas", p_city: "New Delhi" });
  const eee = await rpc(owner2.h, "create_tenant_with_owner", { p_name: "EEE Dance Studio", p_type: "studio", p_area: "Kothrud", p_city: "Pune" });
  const meera = await rpc(artist.h, "create_tenant_with_owner", { p_name: "Meera Grewal Dance Co.", p_type: "trainer_business", p_area: "Saket", p_city: "New Delhi" });
  log(`${bounce.name} (studio · New Delhi)`);
  log(`${eee.name} (studio · Pune)`);
  log(`${meera.name} (artist business · New Delhi)`);

  /* ── rooms ── */
  await insert(owner.h, "rooms", { tenant_id: bounce.id, name: "Hall 1", capacity: 30, amenities: ["🪞 Mirrors", "🪵 Sprung floor", "🔊 Sound", "❄️ AC"] });
  await insert(owner.h, "rooms", { tenant_id: bounce.id, name: "Studio B", capacity: 18, amenities: ["🪞 Mirrors", "🔊 Sound"] });
  await insert(owner2.h, "rooms", { tenant_id: eee.id, name: "Studio A", capacity: 20, amenities: ["🪞 Mirrors", "🪵 Sprung floor"] });
  log("Rooms: Hall 1 · Studio B (Bounce), Studio A (EEE)");

  /* ── the team: an invite the trainer really accepts ── */
  const invite = await rpc(owner.h, "invite_to_tenant", { p_tenant_id: bounce.id, p_name: trainer.name, p_email: trainer.email, p_role: "trainer" });
  await rpc(trainer.h, "accept_tenant_invite", { p_code: invite.code });
  log(`${trainer.name} accepted the trainer invite at ${bounce.name}`);

  /* ── classes ── */
  console.log("\nClasses");
  const mkClass = async (h, tenantId, c) =>
    rpc(h, "create_class_with_session", {
      p_tenant_id: tenantId,
      p_title: c.title,
      p_style: c.style,
      p_level: c.level ?? "all",
      p_room: c.room ?? null,
      p_price_inr: c.price ?? 0,
      p_capacity: c.capacity ?? 12,
      p_status: c.status ?? "published",
      p_starts_at: c.starts,
      p_ends_at: c.ends,
    });

  const hiphop = await mkClass(owner.h, bounce.id, { title: "Hip-Hop · Beginner", style: "Hip-Hop", level: "beginner", room: "Hall 1", capacity: 12, starts: at(1, "19:00"), ends: at(1, "20:00") });
  const bolly = await mkClass(owner.h, bounce.id, { title: "Bollywood Evenings", style: "Bollywood", room: "Hall 1", price: 300, capacity: 10, starts: at(3, "18:30"), ends: at(3, "19:30") });
  const breaking = await mkClass(owner.h, bounce.id, { title: "Breaking Lab", style: "Breaking", level: "intermediate", room: "Studio B", capacity: 2, starts: at(2, "17:00"), ends: at(2, "18:00") });
  await mkClass(owner.h, bounce.id, { title: "Kathak Basics", style: "Kathak", level: "beginner", room: "Hall 1", capacity: 15, status: "draft", starts: at(5, "18:00"), ends: at(5, "19:15") });
  const past = await mkClass(owner.h, bounce.id, { title: "Contemporary Flow", style: "Contemporary", room: "Hall 1", capacity: 10, starts: at(-3, "19:00"), ends: at(-3, "20:00") });
  const salsa = await mkClass(owner2.h, eee.id, { title: "Salsa Social", style: "Salsa", room: "Studio A", capacity: 20, starts: at(2, "20:00"), ends: at(2, "21:30") });
  await mkClass(owner2.h, eee.id, { title: "Bhangra Blast", style: "Bhangra", room: "Studio A", price: 250, capacity: 15, starts: at(4, "18:00"), ends: at(4, "19:00") });
  const contemp = await mkClass(artist.h, meera.id, { title: "Contemporary · Intermediate", style: "Contemporary", level: "intermediate", capacity: 14, starts: at(3, "07:30"), ends: at(3, "08:45") });
  log("Bounce: Hip-Hop · Beginner (free), Bollywood Evenings (₹300), Breaking Lab (2 places), Kathak Basics (draft), Contemporary Flow (3 days ago)");
  log("EEE: Salsa Social, Bhangra Blast (₹250) · Meera Grewal: Contemporary · Intermediate");

  const sessionOf = async (h, classId) => (await rows(h, `class_sessions?class_id=eq.${classId}&select=id,starts_at&deleted_at=is.null&order=starts_at.asc`))[0];
  const sHiphop = await sessionOf(owner.h, hiphop.id);
  const sBolly = await sessionOf(owner.h, bolly.id);
  const sBreaking = await sessionOf(owner.h, breaking.id);
  const sPast = await sessionOf(owner.h, past.id);
  const sSalsa = await sessionOf(owner2.h, salsa.id);
  const sContemp = await sessionOf(artist.h, contemp.id);

  /* ── who is taking what: real asks, really answered ── */
  console.log("\nPeople on classes");
  const artistClaim = await rpc(owner.h, "claim_person", { p_class_id: hiphop.id, p_user_id: trainer.id, p_kind: "artist", p_pay_per_session_inr: 900 });
  await rpc(trainer.h, "respond_to_claim", { p_claim_id: artistClaim.id, p_accept: true });
  const asstClaim = await rpc(owner.h, "claim_person", { p_class_id: past.id, p_user_id: trainer.id, p_kind: "assistant", p_can_attendance: true, p_pay_per_session_inr: 600 });
  await rpc(trainer.h, "respond_to_claim", { p_claim_id: asstClaim.id, p_accept: true });
  /* and one ask still waiting, so the Inbox has something in it */
  await rpc(owner.h, "claim_person", { p_class_id: breaking.id, p_user_id: trainer.id, p_kind: "artist", p_pay_per_session_inr: 900 });
  log(`${trainer.name}: artist on Hip-Hop (₹900), assistant with attendance on Contemporary Flow, and one ask still waiting on Breaking Lab`);

  /* ── bookings, a full class and a real waitlist ── */
  console.log("\nBookings");
  await rpc(kabir.h, "enroll_in_session", { p_session_id: sHiphop.id });
  await rpc(zaid.h, "enroll_in_session", { p_session_id: sHiphop.id });
  await rpc(rhea.h, "enroll_in_session", { p_session_id: sSalsa.id });
  await rpc(kabir.h, "enroll_in_session", { p_session_id: sContemp.id });
  await rpc(aki.h, "enroll_in_session", { p_session_id: sBreaking.id });
  await rpc(zaid.h, "enroll_in_session", { p_session_id: sBreaking.id });
  const waitlisted = await rpc(rhea.h, "enroll_in_session", { p_session_id: sBreaking.id });
  log(`Hip-Hop: 2 booked · Breaking Lab: full (2) with ${rhea.name} ${waitlisted.status} · Salsa and Contemporary: 1 each`);

  /* ── the past class: booked, then a register that was actually run ──
     A learner cannot book a session that has already ended, so the seat is
     booked while the session is still in the future and the session is then
     back-dated with the service role — the one thing no user may do. */
  await patch(H_SERVICE, `class_sessions?id=eq.${sPast.id}`, { starts_at: at(30, "19:00"), ends_at: at(30, "20:00") });
  const pastKabir = await rpc(kabir.h, "enroll_in_session", { p_session_id: sPast.id });
  await rpc(aki.h, "enroll_in_session", { p_session_id: sPast.id });
  await patch(H_SERVICE, `class_sessions?id=eq.${sPast.id}`, { starts_at: at(-3, "19:00"), ends_at: at(-3, "20:00") });
  /* the register: check_in's window is the clock's, so the attendance row is written
     as the studio, against a session that has ended — service role, same as a backfill */
  await insert(H_SERVICE, "attendance", {
    enrollment_id: pastKabir.id,
    session_id: sPast.id,
    class_id: past.id,
    tenant_id: bounce.id,
    user_id: kabir.id,
    created_by: owner.id,
    updated_by: owner.id,
  });
  await patch(H_SERVICE, `classes?id=eq.${past.id}`, { status: "completed" });
  log(`Contemporary Flow (3 days ago): 2 booked, ${kabir.name} checked in, class completed`);

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
  const akiBolly = (await rows(aki.h, `enrollments?session_id=eq.${sBolly.id}&user_id=eq.${aki.id}&deleted_at=is.null&select=id`))[0];
  await rpc(aki.h, "cancel_booking", { p_enrollment_id: akiBolly.id, p_reason: "Injury — cannot make this one" });
  log("Bollywood Evenings: ₹300 UPI captured (Kabir) and ₹300 card captured then cancelled (Aki) → a refund on the studio's queue");

  /* ── the studio settles what it owes ── */
  await rpc(owner.h, "record_payout", { p_tenant_id: bounce.id, p_user_id: trainer.id, p_session_ids: [sPast.id], p_method: "upi", p_status: "done", p_note: "Contemporary Flow · assisting" });
  log(`${trainer.name} paid ₹600 for the session assisted`);

  /* ── the desk: leads at three stages ── */
  console.log("\nStudio desk");
  /* one bulk insert, and PostgREST wants every object to carry the same keys */
  await insert(owner.h, "leads", [
    { tenant_id: bounce.id, name: "Sneha Dutta", mobile: "98100 11223", interest: "Bollywood · twice a week", source: "walk_in", status: "new", trial_class_id: null, trial_on: null, note: "Walked in on Saturday" },
    { tenant_id: bounce.id, name: "Rohit Sen", mobile: "98100 44556", interest: "Hip-Hop · beginner", source: "enquiry", status: "quoted", trial_class_id: null, trial_on: null, note: "Quoted the monthly rate" },
    { tenant_id: bounce.id, name: "Priya Iyer", mobile: "98100 77889", interest: "Kathak", source: "referral", status: "trial_booked", trial_class_id: hiphop.id, trial_on: dayShift(1), note: "Coming to Monday's class" },
  ]);
  log("Leads: Sneha (new), Rohit (quoted), Priya (trial booked)");

  /* ── follows ── */
  await rpc(kabir.h, "set_follow", { p_tenant_id: bounce.id, p_on: true });
  await rpc(rhea.h, "set_follow", { p_tenant_id: bounce.id, p_on: true });
  await rpc(zaid.h, "set_follow", { p_tenant_id: eee.id, p_on: true });
  await rpc(kabir.h, "set_follow", { p_tenant_id: meera.id, p_on: true });
  log("Follows: Bounce 2, EEE 1, Meera Grewal 1");

  /* ── an enquiry, quoted ── */
  const enq = await rpc(kabir.h, "send_enquiry", {
    p_tenant_id: bounce.id,
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
  const mkEvent = async (h, tenantId, e) => {
    const id = await rpc(h, "save_event", {
      p_tenant_id: tenantId,
      p_event_id: null,
      p_event: {
        cat: e.cat,
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

  const showcase = await mkEvent(owner.h, bounce.id, {
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
  const battle = await mkEvent(owner.h, bounce.id, {
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
  await mkEvent(owner2.h, eee.id, {
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
  await mkEvent(owner.h, bounce.id, { cat: "tournament", title: "Nritya Championship", date: dayShift(28), venue: "Siri Fort Auditorium", city: "New Delhi", entryFormat: "solo", rounds: 3, entryTiers: [{ format: "solo", fee_inr: 0, capacity: 32 }], publish: false });
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
  console.log("\nSign-in is by email — use the ✉️ Email tab on /login. The magic");
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
  const tenants = await rows(H_SERVICE, `tenants?created_by=in.(${ids.join(",")})&select=id,name,type,city,deleted_at`);
  const crews = await rows(H_SERVICE, `crews?leader_id=in.(${ids.join(",")})&select=id,name,city,deleted_at`);
  const live = (a) => a.filter((r) => !r.deleted_at);
  console.log(`Demo accounts: ${users.length}`);
  users.forEach((u) => console.log(`  ${u.email}`));
  console.log(`Demo businesses: ${live(tenants).length}`);
  live(tenants).forEach((t) => console.log(`  ${t.name} (${t.type} · ${t.city})`));
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
     sessions, enrollments, claims, invites, leads, orders, payments, refunds,
     payouts, events and event bookings */
  const tenants = await rows(H_SERVICE, `tenants?created_by=in.(${ids.join(",")})&select=id,name`);
  for (const t of tenants) {
    await remove(H_SERVICE, `tenants?id=eq.${t.id}`);
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
