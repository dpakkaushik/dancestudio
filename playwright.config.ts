import { defineConfig } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Playwright doesn't read Next's .env.local — load the Supabase keys the spec
// needs (admin sign-up minting + cleanup). Existing env vars win.
try {
  const envFile = readFileSync(resolve(__dirname, ".env.local"), "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2];
    }
  }
} catch {
  // no .env.local (CI) — the keys must come from real env vars instead
}

/** Where the suite points. Overridable because port 3000 is not always this app:
 *  another project's dev server can already hold it — and on Windows `localhost`
 *  resolves to ::1 first, so with `reuseExistingServer` the suite can silently
 *  drive somebody else's site and fail on selectors that were never there. Pin
 *  it with PLAYWRIGHT_BASE_URL, e.g.
 *  PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 against `next start -p 3100`. */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // the story is told in serial SEGMENTS now (e2e/happy-path.spec.ts), the longest
  // of which runs in ~35 s against a dev server compiling each route on first
  // visit. Two minutes is head-room; it was five while the whole story was one
  // test, and a limit that no longer bites is a limit that hides a hang.
  timeout: 120_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
