import type { SupabaseClient } from "@supabase/supabase-js";

/** THE BROWSER CLIENT, LOADED ON THE PRESS THAT NEEDS IT (5 Oct 2026).
 *
 *  The user: "app getting slow and laggy". Measured on the live site: Home
 *  shipped a 246 KB chunk that is the Supabase browser library, up front, on
 *  every first load — because the photo picker imported it statically, and the
 *  picker is drawn on every home. Nothing on a home talks to Supabase from the
 *  browser until somebody actually uploads or removes a picture; every read is
 *  the server's. So the four client files that write to Storage ask for the
 *  client through this, and the library arrives with the first upload instead.
 *
 *  ⚠ A dynamic `import()` is what splits it into a chunk of its own — a static
 *  import of `./client` anywhere in a client component puts it back in the
 *  page's bundle, which is the thing this exists to stop. */
let pending: Promise<SupabaseClient> | null = null;

export function browserSupabase(): Promise<SupabaseClient> {
  if (!pending) {
    pending = import("./client").then((m) => m.createSupabaseBrowserClient());
    /* a failed load (offline, a deploy mid-session) must not poison every later
       press — the next one tries again */
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
