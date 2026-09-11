/**
 * Put the two Google Maps keys on the Vercel project and rebuild production
 * (11 Sep 2026).
 *
 * WHY THIS EXISTS: the app moved from OpenStreetMap (keyless) to Google Maps,
 * which needs `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (drawn in the browser, baked in
 * at BUILD time) and `GOOGLE_MAPS_KEY` (Places + Geocoding, server only).
 * Both were in `.env.local` on the laptop and nowhere else — so the deployed
 * site drew "no Google Maps key is configured" while the laptop drew the map.
 *
 * WHAT IT DOES, in order:
 *   1. reads VERCEL_TOKEN and the two Google keys from .env.local
 *   2. upserts both keys on production + preview + development
 *   3. starts a fresh production build of `main` — a NEXT_PUBLIC_ value is
 *      inlined when the bundle is built, so saving the variable alone changes
 *      nothing; the site needs one more build
 *   4. prints the deployment URL to watch
 *
 * Run it from the repo root:
 *     node scripts/vercel-set-google-keys.js
 *
 * Nothing is deleted or changed except the two variables named above.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const env = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z_]+)=(.*)$/.exec(l);
  if (m) env[m[1]] = m[2].trim();
}

const TEAM = "team_8gAXT14BpUHN0qXiODSE2Xsc";
const PROJECT = "prj_2mCpGiEPYzFYXTSDFbJzRXqSY9nI";
const REPO_ID = 1337117359;
const H = { Authorization: `Bearer ${env.VERCEL_TOKEN}`, "Content-Type": "application/json" };

const api = async (method, p, body) => {
  const r = await fetch(`https://api.vercel.com${p}${p.includes("?") ? "&" : "?"}teamId=${TEAM}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${t.slice(0, 300)}`);
  return JSON.parse(t);
};

(async () => {
  for (const k of ["VERCEL_TOKEN", "NEXT_PUBLIC_GOOGLE_MAPS_KEY", "GOOGLE_MAPS_KEY"]) {
    if (!env[k]) throw new Error(`${k} is not set in .env.local`);
  }

  const targets = ["production", "preview", "development"];
  const out = await api("POST", `/v10/projects/${PROJECT}/env?upsert=true`, [
    { key: "NEXT_PUBLIC_GOOGLE_MAPS_KEY", value: env.NEXT_PUBLIC_GOOGLE_MAPS_KEY, type: "encrypted", target: targets },
    { key: "GOOGLE_MAPS_KEY", value: env.GOOGLE_MAPS_KEY, type: "encrypted", target: targets },
  ]);
  const written = (out.created || []).map((e) => `${e.key} [${e.target.join(", ")}]`);
  console.log(`1. written: ${written.join("; ") || JSON.stringify(out).slice(0, 200)}`);
  if (out.failed && out.failed.length) {
    throw new Error(`some variables were refused: ${JSON.stringify(out.failed).slice(0, 300)}`);
  }

  const after = await api("GET", `/v9/projects/${PROJECT}/env`);
  const names = (after.envs || []).map((e) => e.key);
  const both = names.includes("NEXT_PUBLIC_GOOGLE_MAPS_KEY") && names.includes("GOOGLE_MAPS_KEY");
  console.log(`2. the project now carries ${names.length} variables; both Google keys present: ${both}`);
  if (!both) throw new Error("the keys did not land — stop here");

  const dep = await api("POST", "/v13/deployments?forceNew=1", {
    name: "dancestudio",
    project: PROJECT,
    target: "production",
    gitSource: { type: "github", repoId: REPO_ID, ref: "main" },
  });
  console.log(`3. production build started: https://${dep.url}`);
  console.log(`   watch it at https://vercel.com — it takes 2–4 minutes; the site is https://dancestudio-orcin.vercel.app`);
})().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exit(1);
});
