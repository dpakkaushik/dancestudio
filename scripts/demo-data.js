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
 * `ask_class_person` / `respond_to_class_ask`, `respond_to_venue_request`,
 * `create_crew` / `respond_to_crew_ask`, `save_event` / `publish_event` /
 * `book_event` / `check_in_event_booking`, `send_enquiry` /
 * `send_enquiry_quote` / `answer_enquiry_quote` / `record_enquiry_payment`,
 * `set_follow` / `set_person_follow` / `set_crew_follow`,
 * `ask_organization_member`, `record_payout`. So the demo world obeys every rule
 * the real one does: consent is real, capacity is real, a waitlist is a real
 * waitlist, a venue's yes is a real yes. The service role is used for exactly
 * the things a user cannot legally do: creating the accounts, back-dating a
 * session or an event so a PAST one exists, writing the attendance rows of a
 * register that ran in the past, standing in for the payment webhook
 * (`apply_captured_payment`), and standing in for the platform admin who
 * verifies the organizations and badges their studios.
 *
 * THE WORLD (19 Sep 2026, the user: "create 15 dummy accounts for all kinds
 * of user … mostly in Gurugram, Pune, Delhi, Bengaluru … show all types of
 * events and participation and spectators … so I can view all kinds of
 * records"): 4 organizations, 4 artists, 7 users; 5 studios (two in Gurugram),
 * 4 artist pages; classes of every state — free, paid, full with a waitlist, a
 * draft, an artist's class in a studio's room (accepted, pending, declined),
 * an artist's class at their own pin, and PAST classes with registers that
 * ran; money in (UPI, card, netbanking), a refund waiting and one settled,
 * payouts; enquiries of all five kinds at every stage; three crews; events of
 * all three kinds in all four cities with solo, duet and crew entries, free
 * and paid spectators, a walk-in, check-ins, a past showcase, a past battle,
 * a draft; follows of a studio, a person, an organization and a crew; an
 * organization's named team; the Call switch on and off; leads at five
 * stages; a support thread; a report.
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
const nowIso = () => new Date().toISOString();

/* ── the four cities, with the point each business stands on ── */
const CITY = {
  Gurugram: { lat: 28.4595, lng: 77.0266 },
  Pune: { lat: 18.5204, lng: 73.8567 },
  "New Delhi": { lat: 28.6139, lng: 77.209 },
  Bengaluru: { lat: 12.9716, lng: 77.5946 },
};

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
  return { id: created.id, email, name: fullName, role, city, token: token.access_token, h: asUser(token.access_token) };
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

  /* ────────────────────────────────────────────────────────────────────────
     PEOPLE — 15 accounts: 4 organizations, 4 artists, 7 users
     ──────────────────────────────────────────────────────────────────────── */
  console.log("People");
  /* an organization is ONE LOGIN named after itself (8 Sep 2026) */
  const rhythm = await makeUser("rhythm", "Rhythm Collective", "org", "Gurugram");
  const eeeCo = await makeUser("eee", "EEE Dance Company", "org", "Pune");
  const bounceCo = await makeUser("bounce", "Bounce Dance Academy", "org", "New Delhi");
  const namma = await makeUser("namma", "Namma Dance Co.", "org", "Bengaluru");
  /* artists — a person with a live Artist plan (granted below) */
  const meera = await makeUser("meera", "Meera Grewal", "user", "Gurugram");
  const aditya = await makeUser("aditya", "Aditya Pillai", "user", "Gurugram");
  const rhea = await makeUser("rhea", "Rhea Kapoor", "user", "Pune");
  const karan = await makeUser("karan", "Karan Shetty", "user", "Bengaluru");
  /* users */
  const kabir = await makeUser("kabir", "Kabir Mehta", "user", "Gurugram");
  const zaid = await makeUser("zaid", "Zaid Khan", "user", "Gurugram");
  const aki = await makeUser("aki", "Aki Sharma", "user", "Gurugram");
  const sneha = await makeUser("sneha", "Sneha Dutta", "user", "Gurugram");
  const rohit = await makeUser("rohit", "Rohit Sen", "user", "New Delhi");
  const priya = await makeUser("priya", "Priya Iyer", "user", "Pune");
  const nikhil = await makeUser("nikhil", "Nikhil Rao", "user", "Bengaluru");
  const orgs = [rhythm, eeeCo, bounceCo, namma];
  const artists = [meera, aditya, rhea, karan];
  const users = [kabir, zaid, aki, sneha, rohit, priya, nikhil];
  const everyone = [...orgs, ...artists, ...users];
  everyone.forEach((u) => log(`${u.name} · ${u.email} · ${u.role === "org" ? "organization" : artists.includes(u) ? "artist" : "user"} · ${u.city}`));

  /* ── plans: the Artist plan and each studio's own subscription are PAID
     (10 Sep 2026) — the service role stands in for an admin's grant ── */
  const grantPlan = (kind, userId, tenantId, note) =>
    insert(H_SERVICE, "subscriptions", {
      kind, user_id: userId, business_id: tenantId, plan_key: kind === "studio" ? "studio_monthly" : "artist_monthly",
      price_inr: 0, period: "monthly", status: "active",
      current_period_start: new Date().toISOString().slice(0, 10),
      current_period_end: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      granted: true, note, created_by: userId, updated_by: userId,
    });
  for (const a of artists) await grantPlan("artist", a.id, null, "Granted by the demo seeder — nothing charged");
  log("Meera, Aditya, Rhea and Karan hold the Artist plan (granted, ₹0)");

  /* ── the organizations: about, links, a number, a contact email, a GST number, the tick, and a PIN ── */
  const orgFacts = [
    [rhythm, "Gurugram's home for street and contemporary — two studios, one crew, a stage every season.", "rhythmcollective", "+91 98100 10001", "hello@rhythm.example"],
    [eeeCo, "Pune's cypher house since 2016.", "eeedance", "+91 98200 10002", "hi@eee.example"],
    [bounceCo, "Hauz Khas. Bollywood, Hip-Hop, Kathak.", "bouncedance", "+91 98300 10003", "studio@bounce.example"],
    [namma, "Indiranagar's breaking floor.", "nammadance", "+91 98400 10004", "namaste@namma.example"],
  ];
  for (const [o, about, handle, phone, email] of orgFacts) {
    await rpc(o.h, "update_my_profile", { p_full_name: o.name, p_city: o.city, p_age: null, p_about: about, p_socials: [{ platform: "Instagram", url: `https://instagram.com/${handle}` }, { platform: "YouTube", url: `https://youtube.com/@${handle}` }], p_styles: [], p_phone: phone, p_contact_email: email });
    await patch(H_SERVICE, `profiles?id=eq.${o.id}`, {
      verified_at: nowIso(),
      gstin: `DM${handle.slice(0, 1).toUpperCase()}${String(Date.now() % 100000).padStart(5, "0")}`,
      gstin_verified_at: nowIso(),
    });
    /* the organization's own pin (push 2) — what its Location button opens */
    await rpc(o.h, "set_my_place", { p_lat: CITY[o.city].lat + 0.004, p_lng: CITY[o.city].lng + 0.003 });
  }
  log("the four organizations are verified, carry a GST number, a number, a contact email and a pin on the map");

  /* ── the people: a city, styles, About, links; the Call switch ON for Meera and OFF for Aditya (push 2) ── */
  const personFacts = [
    [meera, ["Contemporary", "Kathak"], 29, "Contemporary and Kathak. Teaching for nine years.", "+91 98100 22334", true, "meera@grewal.example"],
    [aditya, ["Hip-Hop", "Popping"], 26, "Hip-Hop and popping. Leads Gurugram Rockers.", "+91 98100 33445", false, "aditya@pillai.example"],
    [rhea, ["Hip-Hop"], 27, "Cypher first. Leads EEE Crew.", null, null, "rhea@kapoor.example"],
    [karan, ["Breaking"], 24, "B-boy. Bengaluru.", "+91 98400 55667", true, null],
    [kabir, ["Hip-Hop", "Bollywood"], 24, "Learning, mostly evenings.", null, null, null],
    [zaid, ["Breaking"], 22, null, null, null, null],
    [aki, ["Salsa", "Bollywood"], 31, null, null, null, null],
    [sneha, ["Kathak"], 28, "Kathak, three years.", null, null, null],
    [rohit, ["Bollywood"], 35, null, null, null, null],
    [priya, ["Hip-Hop"], 21, null, null, null, null],
    [nikhil, ["Breaking"], 23, null, null, null, null],
  ];
  for (const [u, styles, age, about, phone, phonePublic, email] of personFacts) {
    const handle = u.name.toLowerCase().replace(/[^a-z]/g, "");
    await rpc(u.h, "update_my_profile", { p_full_name: u.name, p_city: u.city, p_age: age, p_about: about, p_socials: artists.includes(u) ? [{ platform: "Instagram", url: `https://instagram.com/${handle}` }] : [], p_styles: styles, p_phone: phone, p_contact_email: email, p_phone_public: phonePublic });
  }
  log("every person has a city and styles; Meera and Karan show Call on their pages, Aditya keeps his number off it");

  /* ────────────────────────────────────────────────────────────────────────
     BUSINESSES — five studios (two in Gurugram) and four artist pages
     ──────────────────────────────────────────────────────────────────────── */
  console.log("\nBusinesses");
  const mkStudio = async (o, name, area, dLat, dLng) => {
    const t = await rpc(o.h, "create_business_with_owner", { p_name: name, p_type: "studio", p_area: area, p_city: o.city });
    await grantPlan("studio", o.id, t.id, "Granted by the demo seeder — nothing charged");
    /* the BADGE first (an admin's approval, which the seeder stands in for), then listed */
    await patch(H_SERVICE, `businesses?id=eq.${t.id}`, { verified_at: nowIso(), visibility: "listed" });
    /* placed on the map — Discover measures a real distance from here */
    await rpc(o.h, "set_business_location", { p_business_id: t.id, p_lat: CITY[o.city].lat + dLat, p_lng: CITY[o.city].lng + dLng, p_area: area, p_city: o.city });
    await rpc(o.h, "update_business_profile", { p_business_id: t.id, p_about: `${name} — ${area}.`, p_founded_year: 2016, p_phone: "+91 98111 00000", p_socials: [{ platform: "Instagram", url: `https://instagram.com/${name.toLowerCase().replace(/[^a-z]/g, "")}` }], p_enquiry_types: null, p_accepts_upi: true, p_accepts_cards: true, p_accepts_cash: true, p_accepts_bank: false, p_contact_email: `${area.toLowerCase().replace(/[^a-z]/g, "")}@studio.example` });
    log(`${t.name} (studio · ${o.city} · ${area}) — listed, placed, subscribed`);
    return t;
  };
  const s29 = await mkStudio(rhythm, "Rhythm Studio Sector 29", "Sector 29", 0.01, 0.012);
  const dlf = await mkStudio(rhythm, "Rhythm Studio DLF Phase 3", "DLF Phase 3", 0.03, -0.02);
  const eee = await mkStudio(eeeCo, "EEE Dance Studio", "Kothrud", -0.01, -0.03);
  const bounce = await mkStudio(bounceCo, "Bounce Dance Academy", "Hauz Khas", -0.06, -0.01);
  const nammaStudio = await mkStudio(namma, "Namma Studio Indiranagar", "Indiranagar", 0.007, 0.06);

  /* an artist's page is the business behind their classes, team and money (R22) */
  const mkPage = async (a, name, area) => {
    const t = await rpc(a.h, "create_business_with_owner", { p_name: name, p_type: "artist_page", p_area: area, p_city: a.city });
    log(`${t.name} (artist page · ${a.city})`);
    return t;
  };
  const meeraPage = await mkPage(meera, "Meera Grewal Dance Co.", "Sector 56");
  const adityaPage = await mkPage(aditya, "Aditya Pillai Movement", "Sector 14");
  const rheaPage = await mkPage(rhea, "Rhea Kapoor Studio", "Kothrud");
  const karanPage = await mkPage(karan, "Karan Shetty Breaking", "Koramangala");

  /* ── rooms ── */
  const room = (o, t, name, capacity, amenities) => insert(o.h, "rooms", { business_id: t.id, name, capacity, amenities });
  await room(rhythm, s29, "Hall A", 30, ["🪞 Mirrors", "🪵 Sprung floor", "🔊 Sound", "❄️ AC"]);
  await room(rhythm, s29, "Hall B", 15, ["🪞 Mirrors", "🔊 Sound"]);
  await room(rhythm, dlf, "Floor 1", 20, ["🪞 Mirrors", "🔊 Sound", "❄️ AC"]);
  await room(eeeCo, eee, "Studio A", 20, ["🪞 Mirrors", "🪵 Sprung floor"]);
  await room(bounceCo, bounce, "Hall 1", 25, ["🪞 Mirrors", "🔊 Sound", "❄️ AC"]);
  await room(namma, nammaStudio, "Main Floor", 24, ["🪵 Sprung floor", "🔊 Sound"]);
  log("Rooms: Hall A · Hall B (Sector 29), Floor 1 (DLF), Studio A (EEE), Hall 1 (Bounce), Main Floor (Namma)");

  /* ────────────────────────────────────────────────────────────────────────
     TEAMS — studio invites really accepted, one pending; the organization's named team
     ──────────────────────────────────────────────────────────────────────── */
  console.log("\nTeams");
  const invite = async (o, t, who, role, accept = true) => {
    const inv = await rpc(o.h, "invite_to_business", { p_business_id: t.id, p_name: who.name, p_email: who.email, p_role: role });
    if (accept) await rpc(who.h, "accept_business_invite", { p_code: inv.code });
    return inv;
  };
  await invite(rhythm, s29, aditya, "trainer");
  await invite(rhythm, s29, sneha, "staff");
  await invite(rhythm, s29, kabir, "staff", false);
  await invite(eeeCo, eee, rhea, "trainer");
  await invite(bounceCo, bounce, rohit, "staff");
  await invite(namma, nammaStudio, karan, "trainer");
  log("Sector 29: Aditya (faculty), Sneha (staff), Kabir invited and waiting · EEE: Rhea (faculty) · Bounce: Rohit (staff) · Namma: Karan (faculty)");
  /* the organization NAMES people on its page (push 2): asked, then confirmed from their Inbox */
  const orgAsk = async (o, who, role, accept = true) => {
    const m = await rpc(o.h, "ask_organization_member", { p_user_id: who.id, p_role: role });
    if (accept) await rpc(who.h, "respond_to_organization_ask", { p_member_id: m.id, p_accept: true });
  };
  await orgAsk(rhythm, meera, "owner");
  await orgAsk(rhythm, kabir, "member");
  await orgAsk(rhythm, zaid, "member", false);
  await orgAsk(eeeCo, rhea, "owner");
  log("Rhythm Collective names Meera as Owner and Kabir on its Team (Zaid still asked) · EEE Dance Company names Rhea as Owner");

  /* ────────────────────────────────────────────────────────────────────────
     CLASSES — every state, through the real three steps: ask, yes, publish
     ──────────────────────────────────────────────────────────────────────── */
  console.log("\nClasses");
  const LEVEL_LABEL = { all: "All levels", beginner: "Beginner", intermediate: "Intermediate", professional: "Professional" };
  const classLabel = (style, level) => `${style} · ${LEVEL_LABEL[level] ?? level}`;
  const mkClass = async (h, tenantId, c) =>
    rpc(h, "create_class_with_session", {
      p_business_id: tenantId,
      p_title: classLabel(c.style, c.level ?? "all"),
      p_venue_business_id: c.venue ?? null,
      /* a class in a VENUE's room names the room by id (the venue's rooms are anyone's to read) */
      p_room_id: c.roomId ?? null,
      p_lat: c.lat ?? null,
      p_lng: c.lng ?? null,
      p_maps_url: c.mapsUrl ?? null,
      p_style: c.style,
      p_level: c.level ?? "all",
      p_room: c.room ?? null,
      p_price_inr: c.price ?? 0,
      p_capacity: c.capacity ?? 12,
      p_status: "draft",
      p_starts_at: c.starts,
      p_ends_at: c.ends,
    });
  const teachAndPublish = async (ownerH, cls, teacher, payInr = 0) => {
    const ask = await rpc(ownerH, "ask_class_person", { p_class_id: cls.id, p_user_id: teacher.id, p_kind: "artist", p_pay_per_session_inr: payInr });
    await rpc(teacher.h, "respond_to_class_ask", { p_class_person_id: ask.id, p_accept: true });
    await patch(ownerH, `classes?id=eq.${cls.id}`, { status: "published" });
    return cls;
  };
  const sessionOf = async (h, classId) => (await rows(h, `class_sessions?class_id=eq.${classId}&select=id,starts_at&deleted_at=is.null&order=starts_at.asc`))[0];
  /* a PAST class: booked while its session is still ahead, then back-dated by the
     service role, its register written the same way, and completed */
  const runPast = async (o, t, cls, daysAgo, hhmm, dur, bookers, checkedIn) => {
    const s = await sessionOf(o.h, cls.id);
    await patch(H_SERVICE, `class_sessions?id=eq.${s.id}`, { starts_at: at(40, hhmm), ends_at: at(40, plusMinutes(hhmm, dur)) });
    const bookings = {};
    for (const b of bookers) bookings[b.id] = await rpc(b.h, "book_class_session", { p_session_id: s.id });
    await patch(H_SERVICE, `class_sessions?id=eq.${s.id}`, { starts_at: at(-daysAgo, hhmm), ends_at: at(-daysAgo, plusMinutes(hhmm, dur)) });
    for (const b of checkedIn) {
      await insert(H_SERVICE, "attendance", { class_booking_id: bookings[b.id].id, session_id: s.id, class_id: cls.id, business_id: t.id, user_id: b.id, created_by: o.id, updated_by: o.id });
    }
    await patch(H_SERVICE, `classes?id=eq.${cls.id}`, { status: "completed" });
    return s;
  };

  /* Sector 29 — Rhythm's flagship */
  const hiphop = await teachAndPublish(rhythm.h, await mkClass(rhythm.h, s29.id, { style: "Hip-Hop", level: "beginner", room: "Hall A", capacity: 12, starts: at(1, "19:00"), ends: at(1, "20:00") }), aditya, 900);
  const bolly = await teachAndPublish(rhythm.h, await mkClass(rhythm.h, s29.id, { style: "Bollywood", room: "Hall A", price: 300, capacity: 10, starts: at(3, "18:30"), ends: at(3, "19:30") }), aditya, 900);
  const breaking = await teachAndPublish(rhythm.h, await mkClass(rhythm.h, s29.id, { style: "Breaking", level: "intermediate", room: "Hall B", capacity: 2, starts: at(2, "17:00"), ends: at(2, "18:00") }), aditya, 900);
  await mkClass(rhythm.h, s29.id, { style: "Kathak", level: "beginner", room: "Hall A", capacity: 15, starts: at(5, "18:00"), ends: at(5, "19:15") });
  const pastContemp = await teachAndPublish(rhythm.h, await mkClass(rhythm.h, s29.id, { style: "Contemporary", room: "Hall A", capacity: 10, starts: at(40, "19:00"), ends: at(40, "20:00") }), meera, 1300);
  const pastPopping = await teachAndPublish(rhythm.h, await mkClass(rhythm.h, s29.id, { style: "Popping", room: "Hall B", capacity: 10, starts: at(40, "18:00"), ends: at(40, "19:00") }), aditya, 900);
  const pastKathak = await teachAndPublish(rhythm.h, await mkClass(rhythm.h, s29.id, { style: "Kathak", level: "beginner", room: "Hall A", capacity: 12, starts: at(40, "17:00"), ends: at(40, "18:15") }), meera, 1300);
  /* DLF Phase 3 */
  const dlfContemp = await teachAndPublish(rhythm.h, await mkClass(rhythm.h, dlf.id, { style: "Contemporary", room: "Floor 1", price: 250, capacity: 16, starts: at(4, "20:00"), ends: at(4, "21:15") }), meera, 1300);
  const pastDlfHiphop = await teachAndPublish(rhythm.h, await mkClass(rhythm.h, dlf.id, { style: "Hip-Hop", room: "Floor 1", capacity: 16, starts: at(40, "19:30"), ends: at(40, "20:30") }), aditya, 900);
  /* EEE, Pune */
  const salsa = await teachAndPublish(eeeCo.h, await mkClass(eeeCo.h, eee.id, { style: "Salsa", room: "Studio A", capacity: 20, starts: at(2, "20:00"), ends: at(2, "21:30") }), rhea, 800);
  const bhangra = await teachAndPublish(eeeCo.h, await mkClass(eeeCo.h, eee.id, { style: "Bhangra", room: "Studio A", price: 250, capacity: 15, starts: at(6, "18:00"), ends: at(6, "19:00") }), rhea, 800);
  const pastEee = await teachAndPublish(eeeCo.h, await mkClass(eeeCo.h, eee.id, { style: "Hip-Hop", level: "beginner", room: "Studio A", capacity: 15, starts: at(40, "19:00"), ends: at(40, "20:00") }), rhea, 800);
  /* Bounce, New Delhi — Aditya teaches here too, from outside the team: visiting faculty */
  const bounceBolly = await teachAndPublish(bounceCo.h, await mkClass(bounceCo.h, bounce.id, { style: "Bollywood", room: "Hall 1", capacity: 18, starts: at(3, "19:00"), ends: at(3, "20:00") }), aditya, 1000);
  const pastBounce = await teachAndPublish(bounceCo.h, await mkClass(bounceCo.h, bounce.id, { style: "Contemporary", level: "intermediate", room: "Hall 1", capacity: 12, starts: at(40, "18:00"), ends: at(40, "19:00") }), meera, 1500);
  /* Namma, Bengaluru */
  const nammaBreaking = await teachAndPublish(namma.h, await mkClass(namma.h, nammaStudio.id, { style: "Breaking", level: "beginner", room: "Main Floor", capacity: 14, starts: at(2, "18:00"), ends: at(2, "19:00") }), karan, 900);
  const pastNamma = await teachAndPublish(namma.h, await mkClass(namma.h, nammaStudio.id, { style: "Breaking", room: "Main Floor", capacity: 14, starts: at(40, "18:00"), ends: at(40, "19:30") }), karan, 900);
  log("Sector 29: Hip-Hop (free), Bollywood (₹300), Breaking (2 places), Kathak (draft), three past classes · DLF: Contemporary (₹250), one past · EEE: Salsa, Bhangra (₹250), one past · Bounce: Bollywood (Aditya, visiting), one past (Meera) · Namma: Breaking, one past");

  /* AN ARTIST'S OWN CLASSES: at their own pin (published straight away), or in a
     STUDIO'S ROOM — asked, and the studio's yes / no / silence is real */
  const gg = CITY.Gurugram;
  const meeraOwn = await mkClass(meera.h, meeraPage.id, { style: "Contemporary", level: "intermediate", capacity: 14, starts: at(3, "07:30"), ends: at(3, "08:45"), lat: gg.lat + 0.02, lng: gg.lng + 0.04, mapsUrl: `https://maps.google.com/?q=${gg.lat + 0.02},${gg.lng + 0.04}` });
  await patch(meera.h, `classes?id=eq.${meeraOwn.id}`, { status: "published" });
  const rheaOwn = await mkClass(rhea.h, rheaPage.id, { style: "Hip-Hop", capacity: 12, starts: at(4, "08:00"), ends: at(4, "09:00"), lat: CITY.Pune.lat + 0.01, lng: CITY.Pune.lng + 0.01, mapsUrl: `https://maps.google.com/?q=${CITY.Pune.lat + 0.01},${CITY.Pune.lng + 0.01}` });
  await patch(rhea.h, `classes?id=eq.${rheaOwn.id}`, { status: "published" });
  /* the venue's room, by id — a listed studio's rooms are anyone's to read */
  const roomIdOf = async (t, name) => (await rows(H_ANON, `rooms?business_id=eq.${t.id}&name=eq.${encodeURIComponent(name)}&deleted_at=is.null&select=id`))[0].id;
  /* Aditya asks Sector 29 for Hall B — the studio says yes, the class publishes, and its page names Sector 29 as the place */
  const adityaAtS29 = await mkClass(aditya.h, adityaPage.id, { style: "Hip-Hop", room: "Hall B", roomId: await roomIdOf(s29, "Hall B"), venue: s29.id, capacity: 12, starts: at(5, "18:00"), ends: at(5, "19:00") });
  await rpc(rhythm.h, "respond_to_venue_request", { p_class_id: adityaAtS29.id, p_accept: true });
  await patch(aditya.h, `classes?id=eq.${adityaAtS29.id}`, { status: "published" });
  /* Aditya asks EEE for Studio A — unanswered, so it stays a draft in EEE's Inbox */
  await mkClass(aditya.h, adityaPage.id, { style: "Popping", level: "intermediate", room: "Studio A", roomId: await roomIdOf(eee, "Studio A"), venue: eee.id, capacity: 12, starts: at(7, "19:00"), ends: at(7, "20:00") });
  /* Karan asks Namma for the Main Floor — declined */
  const karanAtNamma = await mkClass(karan.h, karanPage.id, { style: "Breaking", room: "Main Floor", roomId: await roomIdOf(nammaStudio, "Main Floor"), venue: nammaStudio.id, capacity: 10, starts: at(8, "20:00"), ends: at(8, "21:00") });
  await rpc(namma.h, "respond_to_venue_request", { p_class_id: karanAtNamma.id, p_accept: false });
  log("Meera and Rhea: a class at their own pin · Aditya: Hip-Hop in Sector 29's Hall B (the studio said yes), Popping at EEE (still asked) · Karan: Breaking at Namma (declined)");

  /* ── assistants: one confirmed with the attendance job, one still asked ── */
  const asst = await rpc(rhythm.h, "ask_class_person", { p_class_id: pastContemp.id, p_user_id: aditya.id, p_kind: "assistant", p_can_attendance: true, p_pay_per_session_inr: 600 });
  await rpc(aditya.h, "respond_to_class_ask", { p_class_person_id: asst.id, p_accept: true });
  await rpc(rhythm.h, "ask_class_person", { p_class_id: hiphop.id, p_user_id: kabir.id, p_kind: "assistant", p_can_attendance: true });
  log("Aditya assisted Meera's past Contemporary class (attendance job, ₹600) · Kabir has an assistant ask waiting on Hip-Hop");

  /* ────────────────────────────────────────────────────────────────────────
     BOOKINGS, WAITLISTS, PAST REGISTERS
     ──────────────────────────────────────────────────────────────────────── */
  console.log("\nBookings and registers");
  const sHiphop = await sessionOf(rhythm.h, hiphop.id);
  const sBolly = await sessionOf(rhythm.h, bolly.id);
  const sBreaking = await sessionOf(rhythm.h, breaking.id);
  const sDlfContemp = await sessionOf(rhythm.h, dlfContemp.id);
  const sSalsa = await sessionOf(eeeCo.h, salsa.id);
  const sBhangra = await sessionOf(eeeCo.h, bhangra.id);
  const sBounceBolly = await sessionOf(bounceCo.h, bounceBolly.id);
  const sNamma = await sessionOf(namma.h, nammaBreaking.id);
  const sMeeraOwn = await sessionOf(meera.h, meeraOwn.id);
  const sRheaOwn = await sessionOf(rhea.h, rheaOwn.id);
  const sAdityaS29 = await sessionOf(aditya.h, adityaAtS29.id);
  const book = (u, s) => rpc(u.h, "book_class_session", { p_session_id: s.id });
  await book(kabir, sHiphop);
  await book(zaid, sHiphop);
  await book(sneha, sHiphop);
  await book(aki, sBreaking);
  await book(zaid, sBreaking);
  const w1 = await book(sneha, sBreaking);
  const w2 = await book(kabir, sBreaking);
  await book(priya, sSalsa);
  await book(zaid, sSalsa);
  await book(rohit, sBounceBolly);
  await book(kabir, sBounceBolly);
  await book(nikhil, sNamma);
  await book(zaid, sNamma);
  await book(kabir, sMeeraOwn);
  await book(sneha, sMeeraOwn);
  await book(priya, sRheaOwn);
  await book(zaid, sAdityaS29);
  log(`Hip-Hop 3 booked · Breaking full (2) with Sneha ${w1.status} and Kabir ${w2.status} · Salsa 2 · Bounce Bollywood 2 · Namma Breaking 2 · Meera's own 2 · Rhea's own 1 · Aditya at Sector 29 1`);

  /* the past classes: booked, registers run, completed — what Stats and the rankings count */
  const sPastContemp = await runPast(rhythm, s29, pastContemp, 3, "19:00", 60, [kabir, aki, sneha], [kabir, aki]);
  const sPastPopping = await runPast(rhythm, s29, pastPopping, 10, "18:00", 60, [zaid, kabir], [zaid]);
  await runPast(rhythm, s29, pastKathak, 7, "17:00", 75, [sneha, aki, priya], [sneha, aki, priya]);
  const sPastDlf = await runPast(rhythm, dlf, pastDlfHiphop, 14, "19:30", 60, [kabir, zaid, aki, sneha], [kabir, zaid, aki]);
  await runPast(eeeCo, eee, pastEee, 5, "19:00", 60, [priya, kabir], [priya]);
  await runPast(bounceCo, bounce, pastBounce, 4, "18:00", 60, [rohit], [rohit]);
  await runPast(namma, nammaStudio, pastNamma, 6, "18:00", 90, [nikhil], [nikhil]);
  log("seven past classes across the five studios with real registers — Kabir 3 sessions, Aki 3, Sneha 2, Zaid 2, Priya 2, Rohit 1, Nikhil 1 checked in");

  /* ────────────────────────────────────────────────────────────────────────
     MONEY — captured payments by three methods, a refund waiting, one settled, payouts
     ──────────────────────────────────────────────────────────────────────── */
  console.log("\nMoney");
  const pay = async (u, s, amountInr, method) => {
    const order = await rpc(u.h, "create_payment_order", { p_session_id: s.id });
    const providerOrderId = `demo_order_${order.id.slice(0, 8)}`;
    await rpc(u.h, "attach_provider_order", { p_order_id: order.id, p_provider_order_id: providerOrderId });
    await rpc(H_SERVICE, "apply_captured_payment", { p_provider_order_id: providerOrderId, p_provider_payment_id: `demo_pay_${order.id.slice(0, 8)}`, p_amount_paise: amountInr * 100, p_method: method });
  };
  await pay(kabir, sBolly, 300, "upi");
  await pay(aki, sBolly, 300, "card");
  await pay(zaid, sBolly, 300, "netbanking");
  await pay(priya, sBhangra, 250, "upi");
  await pay(sneha, sDlfContemp, 250, "upi");
  await pay(aki, sDlfContemp, 250, "card");
  /* Aki cancels inside the 48-hour window → a refund the studio decides; the owner
     approves it and marks it refunded at the desk. Zaid cancels too → still waiting. */
  const akiBolly = (await rows(aki.h, `class_bookings?session_id=eq.${sBolly.id}&user_id=eq.${aki.id}&deleted_at=is.null&select=id`))[0];
  await rpc(aki.h, "cancel_class_booking_with_reason", { p_class_booking_id: akiBolly.id, p_reason: "Injury — cannot make this one" });
  const akiRefund = (await rows(H_SERVICE, `refunds?user_id=eq.${aki.id}&status=eq.requested&select=id&order=created_at.desc`))[0];
  if (akiRefund) {
    await rpc(rhythm.h, "decide_refund", { p_refund_id: akiRefund.id, p_decision: "approve", p_note: "Get well soon" });
    await rpc(rhythm.h, "settle_refund_offline", { p_refund_id: akiRefund.id, p_note: "Returned in cash at the desk" });
  }
  const zaidBolly = (await rows(zaid.h, `class_bookings?session_id=eq.${sBolly.id}&user_id=eq.${zaid.id}&deleted_at=is.null&select=id`))[0];
  await rpc(zaid.h, "cancel_class_booking_with_reason", { p_class_booking_id: zaidBolly.id, p_reason: "Travelling that week" });
  log("Bollywood ₹300 × 3 (UPI, card, netbanking); Aki's refund approved and settled at the desk, Zaid's still on the queue · Bhangra ₹250 (UPI) · DLF Contemporary ₹250 × 2");
  /* the studio settles what it owes the people who taught */
  await rpc(rhythm.h, "record_payout", { p_business_id: s29.id, p_user_id: meera.id, p_session_ids: [sPastContemp.id], p_method: "upi", p_status: "done", p_note: "Contemporary · All levels" });
  await rpc(rhythm.h, "record_payout", { p_business_id: s29.id, p_user_id: aditya.id, p_session_ids: [sPastContemp.id, sPastPopping.id], p_method: "bank_transfer", p_status: "in_transit", p_note: "Assisting + Popping" });
  await rpc(rhythm.h, "record_payout", { p_business_id: dlf.id, p_user_id: aditya.id, p_session_ids: [sPastDlf.id], p_method: "upi", p_status: "done", p_note: "Hip-Hop · All levels" });
  log("Payouts: Meera ₹1,300 (done) · Aditya ₹1,500 (in transit) at Sector 29 and ₹900 (done) at DLF");

  /* ────────────────────────────────────────────────────────────────────────
     THE DESK — leads at all five stages
     ──────────────────────────────────────────────────────────────────────── */
  console.log("\nStudio desk");
  await insert(rhythm.h, "leads", [
    { business_id: s29.id, name: "Tanvi Khanna", mobile: "98100 11223", interest: "Bollywood · twice a week", source: "walk_in", status: "new", trial_class_id: null, trial_on: null, note: "Walked in on Saturday", converted_user_id: null },
    { business_id: s29.id, name: "Rohan Verma", mobile: "98100 44556", interest: "Hip-Hop · beginner", source: "enquiry", status: "quoted", trial_class_id: null, trial_on: null, note: "Quoted the monthly rate", converted_user_id: null },
    { business_id: s29.id, name: "Ira Bose", mobile: "98100 77889", interest: "Kathak", source: "referral", status: "trial_booked", trial_class_id: hiphop.id, trial_on: dayShift(1), note: "Coming to Monday's class", converted_user_id: null },
    { business_id: s29.id, name: kabir.name, mobile: "98100 99001", interest: "Hip-Hop", source: "social", status: "converted", trial_class_id: null, trial_on: null, note: "Booked the beginner class", converted_user_id: kabir.id },
    { business_id: s29.id, name: "Dev Ahuja", mobile: "98100 22334", interest: "Salsa", source: "walk_in", status: "lost", trial_class_id: null, trial_on: null, note: "Moved to Noida", converted_user_id: null },
  ]);
  log("Leads at Sector 29: new · quoted · trial booked · converted (Kabir) · lost");

  /* ────────────────────────────────────────────────────────────────────────
     CREWS — consent working as it does for real; a number with the switch on
     ──────────────────────────────────────────────────────────────────────── */
  console.log("\nCrews");
  const mkCrew = async (leader, name, style, members, confirm) => {
    const c = await rpc(leader.h, "create_crew", { p_name: name, p_city: leader.city, p_style: style, p_member_ids: members.map((m) => m.id) });
    const asks = await rows(leader.h, `crew_members?crew_id=eq.${c.id}&status=eq.asked&deleted_at=is.null&select=id,user_id`);
    for (const m of confirm) {
      const a = asks.find((x) => x.user_id === m.id);
      await rpc(m.h, "respond_to_crew_ask", { p_member_id: a.id, p_accept: true });
    }
    return c;
  };
  const rockers = await mkCrew(aditya, "Gurugram Rockers", "Hip-Hop", [zaid, kabir, aki], [zaid, kabir]);
  await rpc(aditya.h, "update_crew", { p_crew_id: rockers.id, p_name: rockers.name, p_city: "Gurugram", p_style: "Hip-Hop", p_contact_email: "rockers@crew.example", p_phone: "+91 98100 77001", p_phone_public: true });
  const eeeCrew = await mkCrew(rhea, "EEE Crew", "Hip-Hop", [priya, zaid], [priya]);
  await rpc(rhea.h, "update_crew", { p_crew_id: eeeCrew.id, p_name: eeeCrew.name, p_city: "Pune", p_style: "Hip-Hop", p_contact_email: "eeecrew@crew.example", p_phone: "+91 98200 77002", p_phone_public: false });
  const breakers = await mkCrew(karan, "Namma Breakers", "Breaking", [nikhil], [nikhil]);
  log("Gurugram Rockers (Aditya; Zaid and Kabir in, Aki asked; Call on) · EEE Crew (Rhea; Priya in, Zaid asked; Call off) · Namma Breakers (Karan; Nikhil in)");

  /* ────────────────────────────────────────────────────────────────────────
     FOLLOWS — a studio, a person, an organization, a crew
     ──────────────────────────────────────────────────────────────────────── */
  console.log("\nFollows");
  const followBiz = (u, t) => rpc(u.h, "set_follow", { p_business_id: t.id, p_on: true });
  const followPerson = (u, p) => rpc(u.h, "set_person_follow", { p_user_id: p.id, p_on: true });
  const followCrew = (u, c) => rpc(u.h, "set_crew_follow", { p_crew_id: c.id, p_on: true });
  await followBiz(kabir, s29);
  await followBiz(zaid, s29);
  await followBiz(aki, s29);
  await followBiz(sneha, dlf);
  await followBiz(priya, eee);
  /* Rohit is on Bounce's team, and a member's follow is refused — he follows DLF instead */
  await followBiz(rohit, dlf);
  await followBiz(nikhil, nammaStudio);
  await followBiz(kabir, bounce);
  await followPerson(kabir, meera);
  await followPerson(sneha, meera);
  await followPerson(zaid, aditya);
  await followPerson(kabir, aditya);
  await followPerson(priya, rhea);
  await followPerson(nikhil, karan);
  await followPerson(aki, meera);
  /* a PUBLIC organization can be followed (19 Sep 2026) */
  await followPerson(kabir, rhythm);
  await followPerson(sneha, rhythm);
  await followPerson(priya, eeeCo);
  /* a crew's own people cannot follow it — so the followers are outsiders */
  await followCrew(sneha, rockers);
  await followCrew(rohit, rockers);
  await followCrew(kabir, eeeCrew);
  await followCrew(zaid, breakers);
  log("studios followed by 1–3 each · Meera 3, Aditya 2, Rhea 1, Karan 1 · Rhythm Collective 2, EEE Dance Company 1 · Rockers 2, EEE Crew 1, Breakers 1");

  /* ────────────────────────────────────────────────────────────────────────
     ENQUIRIES — all five kinds, at every stage, to a studio, an organization, an artist and a crew
     ──────────────────────────────────────────────────────────────────────── */
  console.log("\nEnquiries");
  const rhythmHost = await rpc(rhythm.h, "my_org_business", {});
  const eeeHost = await rpc(eeeCo.h, "my_org_business", {});
  const bounceHost = await rpc(bounceCo.h, "my_org_business", {});
  const nammaHost = await rpc(namma.h, "my_org_business", {});
  /* an enquiry names a business OR a crew, never both (18 Sep 2026) */
  const enquire = (u, businessId, type, fields, days, where, message, crewId = null) => {
    log(`… ${u.name} asks ${(crewId ?? businessId).slice(0, 8)} (${type}${crewId ? ", crew" : ""})`);
    return rpc(u.h, "send_enquiry", { p_business_id: crewId ? null : businessId, p_type_key: type, p_fields: fields, p_dates: [dayShift(days)], p_where: where, p_message: message, p_mobile: "98100 12345", p_crew_id: crewId });
  };
  const quote = (h, enq, cost, pct) => rpc(h, "send_enquiry_quote", { p_enquiry_id: enq.id, p_cost_inr: cost, p_advance_pct: pct });
  /* private sessions at Sector 29 — quoted, accepted, advance recorded */
  const e1 = await enquire(kabir, s29.id, "private", [["How many people", "2"], ["Where they train", "At the studio"], ["Style", "Hip-Hop"]], 9, "Gurugram", "Eight evening sessions before a wedding — my sister and me.");
  const q1 = await quote(rhythm.h, e1, 24000, 30);
  await rpc(kabir.h, "answer_enquiry_quote", { p_quote_id: q1.id, p_accept: true });
  await rpc(rhythm.h, "record_enquiry_payment", { p_quote_id: q1.id, p_part: "advance" });
  /* private sessions — quoted, then DECLINED by the person */
  /* Aki, not Sneha — Sneha is on Sector 29's team, and a member cannot ask their own studio */
  const e2 = await enquire(aki, s29.id, "private", [["How many people", "1"], ["Where they train", "At home"], ["Style", "Salsa"]], 12, "Gurugram", "Salsa at home, weekends.");
  const q2 = await quote(rhythm.h, e2, 18000, 50);
  await rpc(aki.h, "answer_enquiry_quote", { p_quote_id: q2.id, p_accept: false });
  await rpc(rhythm.h, "set_enquiry_status", { p_enquiry_id: e2.id, p_status: "lost" });
  /* private sessions at Bounce — new, nobody has answered */
  /* Zaid, not Rohit — Rohit is on Bounce's team */
  await enquire(zaid, bounce.id, "private", [["How many people", "4"], ["Where they train", "At the studio"], ["Style", "Bollywood"]], 15, "New Delhi", "A sangeet routine for four cousins.");
  /* a CELEBRATION asked of the ORGANIZATION — quoted, accepted, advance and balance: WON */
  const e4 = await enquire(kabir, rhythmHost, "celebration", [["Occasion", "Wedding"], ["Guests", "300"], ["Performers", "6"]], 30, "Gurugram", "A twenty-minute opening act at the reception.");
  const q4 = await quote(rhythm.h, e4, 80000, 40);
  await rpc(kabir.h, "answer_enquiry_quote", { p_quote_id: q4.id, p_accept: true });
  await rpc(rhythm.h, "record_enquiry_payment", { p_quote_id: q4.id, p_part: "advance" });
  await rpc(rhythm.h, "record_enquiry_payment", { p_quote_id: q4.id, p_part: "balance" });
  /* a CORPORATE show asked of the organization — quoted, waiting on an answer */
  const e5 = await enquire(zaid, rhythmHost, "corporate", [["Kind", "Annual day"], ["Audience", "500"]], 40, "Gurugram", "Twelve minutes, three styles, HDFC annual day.");
  await quote(rhythm.h, e5, 120000, 30);
  /* a COLLABORATION asked of EEE — new */
  await enquire(priya, eeeHost, "collab", [["Kind", "Video"], ["Format", "Two crews"]], 20, "Pune", "A joint video with EEE Crew for the monsoon.");
  /* a corporate show asked of Bounce and Namma — new, so every organization's desk has something */
  await enquire(kabir, bounceHost, "corporate", [["Kind", "Product launch"], ["Audience", "200"]], 25, "New Delhi", "Ten minutes at a launch in Aerocity.");
  await enquire(nikhil, nammaHost, "celebration", [["Occasion", "Birthday"], ["Guests", "60"], ["Performers", "2"]], 18, "Bengaluru", "A duet at a 50th birthday.");
  /* an artist asked to JUDGE — through their page; quoted and accepted */
  const e7 = await enquire(nikhil, karanPage.id, "judge", [["Event", "Bengaluru Breaking Open"], ["Rounds", "3"]], 25, "Bengaluru", "Would you judge the Open? Travel covered.");
  const q7 = await quote(karan.h, e7, 15000, 0);
  await rpc(nikhil.h, "answer_enquiry_quote", { p_quote_id: q7.id, p_accept: true });
  /* an artist asked for private sessions — quoted, accepted, advance paid */
  const e8 = await enquire(sneha, meeraPage.id, "private", [["How many people", "1"], ["Where they train", "At the studio"], ["Style", "Kathak"]], 10, "Gurugram", "Twelve sessions towards my arangetram.");
  const q8 = await quote(meera.h, e8, 30000, 25);
  await rpc(sneha.h, "answer_enquiry_quote", { p_quote_id: q8.id, p_accept: true });
  await rpc(meera.h, "record_enquiry_payment", { p_quote_id: q8.id, p_part: "advance" });
  /* a CREW asked for a celebration — quoted by its leader, waiting */
  /* Rohit, an outsider to the crew (Aki has been asked into it) */
  const e9 = await enquire(rohit, rockers.id, "celebration", [["Occasion", "Sangeet"], ["Guests", "150"], ["Performers", "5"]], 22, "Gurugram", "A crew set at my cousin's sangeet.", rockers.id);
  await quote(aditya.h, e9, 30000, 30);
  log("Sector 29: private (advance paid), private (declined → lost) · Bounce: private (new) · Rhythm Collective: celebration (WON), corporate (quoted) · EEE Dance Company: collab (new) · Bounce and Namma: one each (new) · Karan: judge (accepted) · Meera: private (advance paid) · Gurugram Rockers: celebration (quoted)");

  /* ────────────────────────────────────────────────────────────────────────
     EVENTS — all three kinds, all four cities, solo/duet/crew, free and paid seats, walk-ins, check-ins, a past one, a draft
     ──────────────────────────────────────────────────────────────────────── */
  console.log("\nEvents");
  const mkEvent = async (o, hostId, e) => {
    const id = await rpc(o.h, "save_event", {
      p_business_id: hostId,
      p_event_id: null,
      p_event: {
        category: e.cat, title: e.title, style: e.style ?? "All styles",
        start_date: e.date, end_date: e.endDate ?? e.date, start_time: e.time ?? "18:00",
        venue: e.venue, address: e.address ?? null, city: e.city,
        maps_url: `https://maps.google.com/?q=${encodeURIComponent(`${e.venue} ${e.city}`)}`,
        about: e.about ?? null, entry_format: e.entryFormat ?? "none", bracket: e.bracket ?? 0, rounds: e.rounds ?? 0,
        prizes: e.prizes ?? [], tickets_on: e.ticketsOn ?? false, entry_tiers: e.entryTiers ?? [], ticket_tiers: e.ticketTiers ?? [],
      },
    });
    if (e.publish !== false) await rpc(o.h, "publish_event", { p_event_id: id });
    return id;
  };
  const tiersOf = (eventId) => rows(H_ANON, `event_ticket_tiers?event_id=eq.${eventId}&deleted_at=is.null&select=id,name,price_inr`);
  /* a PAID seat or entry: pending until the capture — the same RPC the webhook calls */
  const payEvent = async (u, booking, amountInr, method) => {
    const order = await rpc(u.h, "create_event_payment_order", { p_event_booking_id: booking.id });
    const providerOrderId = `demo_evorder_${order.id.slice(0, 8)}`;
    await rpc(u.h, "attach_provider_order", { p_order_id: order.id, p_provider_order_id: providerOrderId });
    await rpc(H_SERVICE, "apply_captured_payment", { p_provider_order_id: providerOrderId, p_provider_payment_id: `demo_evpay_${order.id.slice(0, 8)}`, p_amount_paise: amountInr * 100, p_method: method });
  };

  /* Gurugram — the showcase: free seats, a paid VIP seat, a cancelled seat, a walk-in */
  const showcase = await mkEvent(rhythm, rhythmHost, { cat: "showcase", title: "Gurugram Monsoon Showcase", date: dayShift(12), time: "18:30", venue: "Kingdom of Dreams", address: "Sector 29", city: "Gurugram", about: "Two hours, fourteen routines, one floor. Doors at 6:30 pm.", ticketsOn: true, ticketTiers: [{ name: "Free entry", price_inr: 0, capacity: 150, sort: 0 }, { name: "VIP", price_inr: 500, capacity: 20, sort: 1 }] });
  {
    const t = await tiersOf(showcase);
    const free = t.find((x) => x.price_inr === 0);
    const vip = t.find((x) => x.price_inr === 500);
    await rpc(kabir.h, "book_event", { p_event_id: showcase, p_kind: "spectator", p_ticket_tier_id: free.id, p_qty: 2 });
    const zaidVip = await rpc(zaid.h, "book_event", { p_event_id: showcase, p_kind: "spectator", p_ticket_tier_id: vip.id, p_qty: 1 });
    await payEvent(zaid, zaidVip, 500, "upi");
    const snehaSeat = await rpc(sneha.h, "book_event", { p_event_id: showcase, p_kind: "spectator", p_ticket_tier_id: free.id, p_qty: 1 });
    await rpc(sneha.h, "cancel_event_booking", { p_booking_id: snehaSeat.id, p_reason: "Out of town" });
    await rpc(rhythm.h, "add_event_walk_in", { p_event_id: showcase, p_kind: "spectator", p_name: "Walk-in · Meenal", p_ticket_tier_id: free.id });
  }
  /* Gurugram — the battle: solo, duet (one accepted, one awaiting), crew */
  const league = await mkEvent(rhythm, rhythmHost, { cat: "battle", title: "Gurugram Breaking League", style: "Breaking", date: dayShift(20), time: "16:00", venue: "Rhythm Studio Sector 29", city: "Gurugram", about: "Top 16 brackets. Solo, duet and crew all enter.", entryFormat: "all", bracket: 16, prizes: [25000, 10000, 5000], entryTiers: [{ format: "solo", fee_inr: 0, capacity: 16 }, { format: "duo", fee_inr: 0, capacity: 8 }, { format: "crew", fee_inr: 0, capacity: 8 }] });
  await rpc(zaid.h, "book_event", { p_event_id: league, p_kind: "participant", p_format: "solo" });
  await rpc(nikhil.h, "book_event", { p_event_id: league, p_kind: "participant", p_format: "solo" });
  const duet1 = await rpc(kabir.h, "book_event", { p_event_id: league, p_kind: "participant", p_format: "duo", p_partner_id: aki.id });
  await rpc(aki.h, "respond_to_partner_ask", { p_booking_id: duet1.id, p_accept: true });
  await rpc(sneha.h, "book_event", { p_event_id: league, p_kind: "participant", p_format: "duo", p_partner_id: priya.id });
  await rpc(aditya.h, "book_event", { p_event_id: league, p_kind: "participant", p_format: "crew", p_crew_id: rockers.id });
  await rpc(karan.h, "book_event", { p_event_id: league, p_kind: "participant", p_format: "crew", p_crew_id: breakers.id });
  /* Gurugram — the tournament: PAID solo entries, paid spectator tickets */
  const nritya = await mkEvent(rhythm, rhythmHost, { cat: "tournament", title: "Nritya Championship", style: "Kathak", date: dayShift(28), endDate: dayShift(29), time: "10:00", venue: "Epicentre, Apparel House", address: "Sector 44", city: "Gurugram", about: "Three rounds over two days.", entryFormat: "solo", rounds: 3, prizes: [50000, 20000, 10000], entryTiers: [{ format: "solo", fee_inr: 300, capacity: 32 }], ticketsOn: true, ticketTiers: [{ name: "General", price_inr: 200, capacity: 300, sort: 0 }] });
  {
    const snehaEntry = await rpc(sneha.h, "book_event", { p_event_id: nritya, p_kind: "participant", p_format: "solo" });
    await payEvent(sneha, snehaEntry, 300, "upi");
    /* an entry that never paid: pending, holding no place */
    await rpc(aki.h, "book_event", { p_event_id: nritya, p_kind: "participant", p_format: "solo" });
    const t = await tiersOf(nritya);
    const rohitSeat = await rpc(rohit.h, "book_event", { p_event_id: nritya, p_kind: "spectator", p_ticket_tier_id: t[0].id, p_qty: 2 });
    await payEvent(rohit, rohitSeat, 400, "card");
  }
  /* Gurugram — a PAST showcase and a PAST battle, with check-ins, completed */
  const pastShow = await mkEvent(rhythm, rhythmHost, { cat: "showcase", title: "Spring Showcase", date: dayShift(40), time: "18:00", venue: "Kingdom of Dreams", city: "Gurugram", ticketsOn: true, ticketTiers: [{ name: "Free entry", price_inr: 0, capacity: 200, sort: 0 }] });
  {
    const t = await tiersOf(pastShow);
    const b1 = await rpc(kabir.h, "book_event", { p_event_id: pastShow, p_kind: "spectator", p_ticket_tier_id: t[0].id, p_qty: 1 });
    const b2 = await rpc(zaid.h, "book_event", { p_event_id: pastShow, p_kind: "spectator", p_ticket_tier_id: t[0].id, p_qty: 2 });
    await rpc(aki.h, "book_event", { p_event_id: pastShow, p_kind: "spectator", p_ticket_tier_id: t[0].id, p_qty: 1 });
    const walk = await rpc(rhythm.h, "add_event_walk_in", { p_event_id: pastShow, p_kind: "spectator", p_name: "Walk-in · Farhan", p_ticket_tier_id: t[0].id });
    await rpc(rhythm.h, "check_in_event_booking", { p_booking_id: b1.id, p_in: true });
    await rpc(rhythm.h, "check_in_event_booking", { p_booking_id: b2.id, p_in: true });
    if (walk && walk.id) await rpc(rhythm.h, "check_in_event_booking", { p_booking_id: walk.id, p_in: true });
    await patch(H_SERVICE, `events?id=eq.${pastShow}`, { start_date: dayShift(-20), end_date: dayShift(-20), status: "completed" });
  }
  const pastCypher = await mkEvent(rhythm, rhythmHost, { cat: "battle", title: "Winter Cypher", style: "Hip-Hop", date: dayShift(40), time: "17:00", venue: "Rhythm Studio Sector 29", city: "Gurugram", entryFormat: "all", bracket: 8, prizes: [10000, 4000], entryTiers: [{ format: "solo", fee_inr: 0, capacity: 8 }, { format: "crew", fee_inr: 0, capacity: 4 }] });
  {
    const z = await rpc(zaid.h, "book_event", { p_event_id: pastCypher, p_kind: "participant", p_format: "solo" });
    const k = await rpc(kabir.h, "book_event", { p_event_id: pastCypher, p_kind: "participant", p_format: "solo" });
    await rpc(priya.h, "book_event", { p_event_id: pastCypher, p_kind: "participant", p_format: "solo" });
    const c = await rpc(aditya.h, "book_event", { p_event_id: pastCypher, p_kind: "participant", p_format: "crew", p_crew_id: rockers.id });
    const c2 = await rpc(rhea.h, "book_event", { p_event_id: pastCypher, p_kind: "participant", p_format: "crew", p_crew_id: eeeCrew.id });
    for (const b of [z, k, c, c2]) await rpc(rhythm.h, "check_in_event_booking", { p_booking_id: b.id, p_in: true });
    await patch(H_SERVICE, `events?id=eq.${pastCypher}`, { start_date: dayShift(-30), end_date: dayShift(-30), status: "completed" });
  }
  /* Gurugram — a draft */
  await mkEvent(rhythm, rhythmHost, { cat: "showcase", title: "Summer Intensive Showcase", date: dayShift(60), venue: "TBC", city: "Gurugram", ticketsOn: true, ticketTiers: [{ name: "General", price_inr: 150, capacity: 100, sort: 0 }], publish: false });
  /* Pune — a solo battle with free spectator seats; a crew from Gurugram travels */
  const cypher9 = await mkEvent(eeeCo, eeeHost, { cat: "battle", title: "Cypher Sundays Vol. 9", style: "Hip-Hop", date: dayShift(15), time: "17:00", venue: "EEE Dance Studio", city: "Pune", entryFormat: "all", bracket: 8, prizes: [8000, 3000], entryTiers: [{ format: "solo", fee_inr: 0, capacity: 8 }, { format: "crew", fee_inr: 0, capacity: 4 }], ticketsOn: true, ticketTiers: [{ name: "Free entry", price_inr: 0, capacity: 80, sort: 0 }] });
  {
    await rpc(priya.h, "book_event", { p_event_id: cypher9, p_kind: "participant", p_format: "solo" });
    await rpc(zaid.h, "book_event", { p_event_id: cypher9, p_kind: "participant", p_format: "solo" });
    await rpc(rhea.h, "book_event", { p_event_id: cypher9, p_kind: "participant", p_format: "crew", p_crew_id: eeeCrew.id });
    await rpc(aditya.h, "book_event", { p_event_id: cypher9, p_kind: "participant", p_format: "crew", p_crew_id: rockers.id });
    const t = await tiersOf(cypher9);
    await rpc(kabir.h, "book_event", { p_event_id: cypher9, p_kind: "spectator", p_ticket_tier_id: t[0].id, p_qty: 1 });
  }
  /* New Delhi — a ticketed showcase, one paid and one free seat */
  const delhiNight = await mkEvent(bounceCo, bounceHost, { cat: "showcase", title: "Delhi Dance Night", date: dayShift(18), time: "19:00", venue: "Siri Fort Auditorium", city: "New Delhi", ticketsOn: true, ticketTiers: [{ name: "Free entry", price_inr: 0, capacity: 100, sort: 0 }, { name: "General", price_inr: 300, capacity: 200, sort: 1 }] });
  {
    const t = await tiersOf(delhiNight);
    const rohitGen = await rpc(rohit.h, "book_event", { p_event_id: delhiNight, p_kind: "spectator", p_ticket_tier_id: t.find((x) => x.price_inr === 300).id, p_qty: 1 });
    await payEvent(rohit, rohitGen, 300, "upi");
    await rpc(kabir.h, "book_event", { p_event_id: delhiNight, p_kind: "spectator", p_ticket_tier_id: t.find((x) => x.price_inr === 0).id, p_qty: 2 });
  }
  /* Bengaluru — a tournament with solo and crew entries */
  const bluOpen = await mkEvent(namma, nammaHost, { cat: "tournament", title: "Bengaluru Breaking Open", style: "Breaking", date: dayShift(25), time: "11:00", venue: "Namma Studio Indiranagar", city: "Bengaluru", entryFormat: "all", rounds: 3, prizes: [30000, 10000], entryTiers: [{ format: "solo", fee_inr: 0, capacity: 16 }, { format: "crew", fee_inr: 0, capacity: 6 }] });
  await rpc(nikhil.h, "book_event", { p_event_id: bluOpen, p_kind: "participant", p_format: "solo" });
  await rpc(zaid.h, "book_event", { p_event_id: bluOpen, p_kind: "participant", p_format: "solo" });
  await rpc(karan.h, "book_event", { p_event_id: bluOpen, p_kind: "participant", p_format: "crew", p_crew_id: breakers.id });
  log("Gurugram: Monsoon Showcase (free + paid VIP + a cancelled seat + a walk-in), Breaking League (solo × 2, duet accepted, duet awaiting, crews × 2), Nritya Championship (paid entry, an unpaid entry, paid seats), Spring Showcase (past, checked in, completed), Winter Cypher (past, completed — the crews' battle record), Summer Intensive (draft)");
  log("Pune: Cypher Sundays Vol. 9 (solo × 2, crews × 2, a free seat) · New Delhi: Delhi Dance Night (a paid and a free seat) · Bengaluru: Breaking Open (solo × 2, a crew)");

  /* ────────────────────────────────────────────────────────────────────────
     THE PLATFORM — a support thread, a report
     ──────────────────────────────────────────────────────────────────────── */
  console.log("\nPlatform");
  await rpc(rhythm.h, "open_support_thread", { p_subject: "GST number", p_body: "Our GST certificate was renewed — does the number on file need updating?" });
  await rpc(rohit.h, "report_content", { p_subject_kind: "business", p_subject_id: eee.id, p_reason: "other", p_note: "Demo report — nothing is wrong with this studio." });
  log("Rhythm Collective opened a support thread · Rohit filed a demo report on EEE Dance Studio");

  console.log("\n─────────────────────────────────────────────");
  console.log("Demo world ready. Sign in with any of these:");
  everyone.forEach((u) => console.log(`  ${u.email}   (${u.name} · ${u.role === "org" ? "organization" : artists.includes(u) ? "artist" : "user"} · ${u.city})`));
  console.log(`  password: ${PASSWORD}`);
  console.log("\nSign in at /login/email with the password. Remove everything with:  node scripts/demo-data.js wipe");
}

/* "19:00" + 75 → "20:15" */
function plusMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
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

  /* the crews first — a crew's header rows and its members go with it, and a
     leader with a crew still standing could not be deleted before 19 Sep 2026 */
  const crews = await rows(H_SERVICE, `crews?leader_id=in.(${ids.join(",")})&select=id,name`);
  for (const c of crews) {
    await remove(H_SERVICE, `crews?id=eq.${c.id}`);
    console.log(`  crew removed: ${c.name}`);
  }
  /* the businesses: deleting one cascades its rooms, classes, sessions,
     class_bookings, claims, invites, leads, orders, payments, refunds,
     payouts, events and event bookings. THE CLASSES GO FIRST: a studio that is
     the VENUE of an artist's class would otherwise have that class's venue set
     to null by the cascade, an UPDATE the room guard refuses on a published
     class ("take the class off the calendar before moving it") */
  const businesses = await rows(H_SERVICE, `businesses?created_by=in.(${ids.join(",")})&select=id,name`);
  if (businesses.length > 0) {
    await remove(H_SERVICE, `classes?business_id=in.(${businesses.map((t) => t.id).join(",")})`);
    console.log("  classes removed");
  }
  for (const t of businesses) {
    await remove(H_SERVICE, `businesses?id=eq.${t.id}`);
    console.log(`  business removed: ${t.name}`);
  }
  /* then the accounts: deleting a user cascades its profile, and the profile
     cascades its follows, its bookings and its enquiries */
  for (const u of users) {
    await call("DELETE", `${BASE}/auth/v1/admin/users/${u.id}`, H_SERVICE, undefined, `delete user ${u.email}`);
    console.log(`  account removed: ${u.email}`);
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
