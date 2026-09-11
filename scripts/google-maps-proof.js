/**
 * DOES THE GOOGLE KEY ACTUALLY WORK, AND FOR WHAT? (11 Sep 2026)
 *
 * The app needs three things from Google Maps Platform, and a key can be valid
 * for one and refused for another — a Maps DEMO KEY supports a limited set, a
 * key without billing is refused for all of them, and either way the failure
 * arrives as a 200 with REQUEST_DENIED inside rather than an HTTP error. So
 * this asks each one directly and prints what came back.
 *
 * Run it whenever the key changes, or when the picker starts answering nothing:
 *
 *   node scripts/google-maps-proof.js
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z_]+)=(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].trim();
}

const SERVER = env.GOOGLE_MAPS_KEY;
const BROWSER = env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

const short = (k) => (k ? `${k.slice(0, 10)}…${k.slice(-4)}` : "(missing)");

let failed = 0;
const say = (ok, what, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed += 1;
};

(async () => {
  console.log(`server key : ${short(SERVER)}`);
  console.log(`browser key: ${short(BROWSER)}`);
  console.log(`same key   : ${SERVER && SERVER === BROWSER ? "yes (fine for a demo key; split them in production)" : "no"}`);
  console.log("");

  if (!SERVER) {
    say(false, "GOOGLE_MAPS_KEY is set");
    process.exit(1);
  }

  /* 1. PLACES AUTOCOMPLETE — what somebody typed becomes real places */
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": SERVER },
      body: JSON.stringify({ input: "Kothrud", includedRegionCodes: ["in"], languageCode: "en" }),
    });
    const body = await res.json();
    const n = (body.suggestions ?? []).length;
    say(res.ok && n > 0, "Places Autocomplete", res.ok ? `${n} suggestions, first: ${body.suggestions?.[0]?.placePrediction?.text?.text ?? "?"}` : `${res.status} ${body.error?.message ?? ""}`);

    /* 2. PLACE DETAILS — the chosen one becomes a point and an address */
    const id = body.suggestions?.[0]?.placePrediction?.placeId;
    if (id) {
      const d = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
        headers: { "X-Goog-Api-Key": SERVER, "X-Goog-FieldMask": "formattedAddress,location,addressComponents" },
      });
      const dj = await d.json();
      const loc = dj.location;
      const city = (dj.addressComponents ?? []).find((c) => (c.types ?? []).includes("locality"))?.longText;
      say(d.ok && Boolean(loc), "Place Details", d.ok ? `${dj.formattedAddress} → ${loc?.latitude?.toFixed(4)},${loc?.longitude?.toFixed(4)} · city=${city ?? "—"}` : `${d.status} ${dj.error?.message ?? ""}`);
    } else {
      say(false, "Place Details", "no place id to resolve — autocomplete gave nothing");
    }
  } catch (e) {
    say(false, "Places API (New)", String(e.message ?? e));
  }

  /* 3. REVERSE GEOCODING — a dragged pin becomes an address.
   *
   * ⚠ v4, on geocode.googleapis.com, with the key as a HEADER. The classic
   * endpoint (maps.googleapis.com/maps/api/geocode/json) is v3 and a demo key
   * is REFUSED for it — with an HTTP 200 carrying REQUEST_DENIED inside, which
   * reads like a dead key rather than the wrong API. That mistake cost a
   * debugging round on 11 Sep 2026; this comment is here so it costs none. */
  try {
    const res = await fetch("https://geocode.googleapis.com/v4/geocode/location/18.5089,73.8077?languageCode=en", {
      headers: { "X-Goog-Api-Key": SERVER },
    });
    const body = await res.json();
    const first = body.results?.[0];
    const city = (first?.addressComponents ?? []).find((c) => (c.types ?? []).includes("locality"))?.longText;
    say(res.ok && Boolean(first), "Reverse Geocoding (v4)", res.ok && first ? `${first.formattedAddress} · city=${city ?? "—"}` : `${res.status} ${body.error?.message ?? ""}`);
  } catch (e) {
    say(false, "Reverse Geocoding (v4)", String(e.message ?? e));
  }

  console.log("");
  if (failed > 0) {
    console.log(`${failed} of 3 APIs did not answer. A demo key supports a limited set and has a daily quota that`);
    console.log("PAUSES rather than charges; a key with no billing account is refused for all of them.");
    process.exit(1);
  }
  console.log("All three Google APIs answered. The picker, the city search and the map all have what they need.");
})();
