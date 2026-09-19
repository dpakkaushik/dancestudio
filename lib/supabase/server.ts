import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { resilientFetch } from "./fetch";

/** ONE CLIENT PER REQUEST, ONE `getUser()` PER REQUEST (19 Sep 2026, the user:
 *  "make app snappier, should not lag anywhere").
 *
 *  Every repository helper that needs "who is asking" calls `auth.getUser()`,
 *  and each call is a round trip to Supabase Auth. Home made about seven of
 *  them before it read a single row — the layout, the bell count, the
 *  memberships, the crews, the page, and so on — each on a client of its own,
 *  because this factory returned a fresh one every time it was called.
 *
 *  Two things fix that without a caller changing:
 *  · the factory is wrapped in React `cache()`, so within one server request
 *    (a render OR a server action) every caller gets the SAME client;
 *  · that client's no-argument `getUser()` is memoised on the instance, so the
 *    first answer is the answer for the whole request. A call that carries a
 *    JWT is not memoised (it is asking about that token, not the session), and
 *    any auth call that can change who the session is — sign-in, sign-up,
 *    sign-out, an OTP or code exchange, a user update — clears the memo, so a
 *    server action that signs somebody in reads the new person afterwards.
 *
 *  Behaviour is otherwise identical: the same cookies, the same resilient fetch. */
type ServerClient = ReturnType<typeof createServerClient>;

function memoiseGetUser(client: ServerClient) {
  const auth = client.auth as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  const original = auth.getUser.bind(client.auth);
  let memo: Promise<unknown> | null = null;
  auth.getUser = (jwt?: unknown) => {
    if (jwt) return original(jwt);
    memo ??= original();
    return memo;
  };
  for (const name of ["signInWithPassword", "signInWithOtp", "signUp", "signOut", "verifyOtp", "exchangeCodeForSession", "updateUser", "setSession", "refreshSession"] as const) {
    const fn = auth[name];
    if (typeof fn !== "function") continue;
    const bound = fn.bind(client.auth);
    auth[name] = (...args: unknown[]) => {
      memo = null;
      return bound(...args).finally(() => {
        memo = null;
      });
    };
  }
}

export const createSupabaseServerClient = cache(async () => {
  const cookieStore = await cookies();

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      /* reads retry once or twice when the gateway blinks (11 Sep 2026) — see lib/supabase/fetch.ts */
      global: { fetch: resilientFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component where cookies are read-only;
            // the proxy (updateSession) refreshes sessions instead.
          }
        },
      },
    }
  );
  memoiseGetUser(client);
  return client;
});
