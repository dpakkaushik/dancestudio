/** A FETCH THAT TRIES AGAIN WHEN THE GATEWAY BLINKS (11 Sep 2026).
 *
 *  Found by the e2e suite: Supabase's edge answered ONE read in about a
 *  thousand with a Cloudflare `502 Bad Gateway` — an HTML page where JSON was
 *  expected — and that one answer became a 500 for the person looking at
 *  Discover. Nothing was wrong with the query, the data or the code; the
 *  request simply needed asking again 300 ms later.
 *
 *  Every server client in this app fetches through here. The rule is the one
 *  every large consumer app applies at its API edge:
 *
 *  - ONLY IDEMPOTENT REQUESTS ARE RETRIED — GET and HEAD. A POST is a write
 *    (every RPC is a POST, and `create_tenant_with_owner` run twice is two
 *    studios), so it is never repeated here; a write that fails is reported.
 *  - ONLY GATEWAY FAILURES ARE RETRIED — 502, 503, 504, and a request that
 *    never got an answer at all. A 4xx is the app being told something and is
 *    returned as-is; a 429 is deliberately NOT retried, because retrying a
 *    rate limit is how a hot path makes its own rate limit worse.
 *  - TWICE, WITH A PAUSE — 300 ms, then 900 ms. Long enough for a blip to pass,
 *    short enough that the worst case still renders inside a page's budget.
 *  - AN ABORTED REQUEST STAYS ABORTED — a caller that gave up is not overruled. */

const RETRY_STATUSES = new Set([502, 503, 504]);
const IDEMPOTENT = new Set(["GET", "HEAD"]);
const PAUSES_MS = [300, 900];

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const resilientFetch: typeof fetch = async (input, init) => {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (!IDEMPOTENT.has(method)) {
    return fetch(input, init);
  }

  let lastError: unknown = null;
  for (let attempt = 0; ; attempt++) {
    let response: Response | null = null;
    try {
      response = await fetch(input, init);
    } catch (e) {
      lastError = e;
    }
    if (response && !RETRY_STATUSES.has(response.status)) {
      return response;
    }
    const exhausted = attempt >= PAUSES_MS.length || init?.signal?.aborted;
    if (exhausted) {
      if (response) return response;
      throw lastError;
    }
    /* say so — a gateway that blinks often is worth knowing about, and this
       line is the only place it would ever show */
    console.warn(`[supabase] ${response ? `HTTP ${response.status}` : "no answer"} on ${method} — retrying in ${PAUSES_MS[attempt]} ms`);
    await pause(PAUSES_MS[attempt]);
  }
};
