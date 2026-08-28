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
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
