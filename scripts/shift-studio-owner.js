/* SHIFT A STUDIO'S OWNER SEAT TO A PERSON (26 Sep 2026).
 *
 * The user: "shift one studio to deepak kaushik and one to alisha." A studio is
 * whoever holds its OWNER seat on `business_members` — verification, the
 * subscription, the switcher, THIS STUDIO in Settings and every desk read that
 * seat and nothing else. So a shift is ONE row moving: the owner seat's
 * `user_id` goes from the organization to the person. Nothing about the studio
 * itself changes (its badge, its rooms, its classes, its photos stay), and the
 * organization keeps every other studio it owns.
 *
 * What it deliberately does NOT do, said here so nobody has to guess:
 *   · it moves no SUBSCRIPTION row — `subscriptions.user_id` is the PAYER of a
 *     Cashfree mandate, and a mandate is bound to the customer who authorised
 *     it. The script REFUSES a studio with a live subscription (granted or
 *     paid) rather than re-attributing money it cannot move; pick one that has
 *     none, or cancel it first.
 *   · it moves no PHOTOS — they live in `proof/{uploader}/…` and the read
 *     policy is by studio, so the person sees them; only DELETING one of the
 *     organization's old objects stays the organization's (its folder).
 *   · it moves no verification REQUEST — `org_id` on a request is who ASKED,
 *     which is history.
 *
 *   node scripts/shift-studio-owner.js --studio <business id> --to <user id>            # dry run
 *   node scripts/shift-studio-owner.js --studio <business id> --to <user id> --apply    # writes
 *
 * Needs the service role key in .env.local: `business_members` has no UPDATE
 * policy for anybody, on purpose.
 */
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const val = (k) => (env.split(/\r?\n/).find((l) => l.startsWith(k + "=")) || "").split("=").slice(1).join("=").trim();
const BASE = val("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE = val("SUPABASE_SERVICE_ROLE_KEY");
if (!BASE || !SERVICE) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local");
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", "User-Agent": "danceos-shift/1.0", Prefer: "return=representation" };

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const STUDIO = arg("--studio");
const TO = arg("--to");
const APPLY = process.argv.includes("--apply");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID.test(STUDIO || "") || !UUID.test(TO || "")) {
  console.error("usage: node scripts/shift-studio-owner.js --studio <business id> --to <user id> [--apply]");
  process.exit(2);
}

async function call(method, url, body) {
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const get = (p) => call("GET", `${BASE}/rest/v1/${p}`);

(async () => {
  const [studio] = await get(`businesses?select=id,name,type,visibility,city,verified_at,deleted_at&id=eq.${STUDIO}`);
  if (!studio || studio.deleted_at) throw new Error("no such live business");
  if (studio.type !== "studio") throw new Error(`${studio.name} is a ${studio.type}, not a studio — only a studio moves`);
  const [person] = await get(`profiles?select=id,full_name,role,deleted_at&id=eq.${TO}`);
  if (!person || person.deleted_at) throw new Error("no such live profile");
  if (person.role === "org") throw new Error(`${person.full_name} is an organization — this script shifts a studio to a PERSON`);

  const owners = await get(`business_members?select=id,user_id,member_role,created_at&business_id=eq.${STUDIO}&member_role=eq.owner&deleted_at=is.null`);
  if (owners.length !== 1) throw new Error(`expected exactly one live owner seat, found ${owners.length}`);
  const seat = owners[0];
  const [from] = await get(`profiles?select=id,full_name,role&id=eq.${seat.user_id}`);
  if (seat.user_id === TO) { console.log(`${person.full_name} already owns ${studio.name} — nothing to do`); return; }

  /* the person may already be ON the team (a trainer's seat, or visiting faculty):
     that seat would clash with the owner seat, so it is closed in the same move */
  const theirSeats = await get(`business_members?select=id,member_role&business_id=eq.${STUDIO}&user_id=eq.${TO}&deleted_at=is.null`);

  /* money is the one thing this script will not re-attribute */
  const subs = await get(`subscriptions?select=id,status,granted,user_id,current_period_end&business_id=eq.${STUDIO}&deleted_at=is.null&status=neq.expired`);
  const classes = await get(`classes?select=id&business_id=eq.${STUDIO}&deleted_at=is.null`);
  const photos = await get(`studio_photos?select=id,org_id&business_id=eq.${STUDIO}&deleted_at=is.null`);
  const cap = await get(`business_members?select=business_id,businesses!inner(type)&user_id=eq.${TO}&member_role=eq.owner&deleted_at=is.null&businesses.type=eq.studio`);

  console.log(`STUDIO   ${studio.name} · ${studio.type} · ${studio.visibility} · ${studio.city} · badge ${studio.verified_at ? "✓" : "—"}`);
  console.log(`FROM     ${from?.full_name ?? seat.user_id} (${from?.role ?? "?"})`);
  console.log(`TO       ${person.full_name} (${person.role}) — owns ${cap.length} studio(s) today`);
  console.log(`KEEPS    ${classes.length} class(es), ${photos.length} photo(s) — untouched`);
  if (theirSeats.length) console.log(`CLOSES   ${person.full_name}'s existing seat(s) here: ${theirSeats.map((s) => s.member_role).join(", ")} (the owner seat replaces them)`);
  if (subs.length) {
    console.log(`REFUSED  ${studio.name} carries a live subscription (${subs.map((s) => `${s.status}${s.granted ? " granted" : ""} until ${s.current_period_end}`).join("; ")}).`);
    console.log(`         A mandate belongs to whoever authorised it; cancel or let it end, or pick a studio without one.`);
    process.exit(1);
  }
  if (cap.length >= 15) { console.log(`REFUSED  ${person.full_name} already runs 15 studios`); process.exit(1); }

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Add --apply to move the owner seat."); return; }

  for (const s of theirSeats) {
    await call("PATCH", `${BASE}/rest/v1/business_members?id=eq.${s.id}`, { deleted_at: new Date().toISOString(), updated_by: TO });
  }
  const [moved] = await call("PATCH", `${BASE}/rest/v1/business_members?id=eq.${seat.id}`, { user_id: TO, updated_by: TO });
  console.log(`\nMOVED    owner seat ${moved.id}: ${seat.user_id} → ${moved.user_id}`);
  const after = await get(`business_members?select=user_id,member_role&business_id=eq.${STUDIO}&deleted_at=is.null`);
  console.log(`NOW      ${after.map((m) => `${m.user_id === TO ? person.full_name : m.user_id}:${m.member_role}`).join(", ")}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
