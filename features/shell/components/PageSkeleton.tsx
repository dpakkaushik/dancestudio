/** THE SHELL PAINTS FIRST (19 Sep 2026, the user: "make app snappier should
 *  not lag anywhere").
 *
 *  Every route under the chrome is dynamic — it reads cookies, so nothing is
 *  prerendered — and until today there was no `loading.tsx` under the group at
 *  all. Two things followed. Nothing streamed: a tap sat on the OLD page for
 *  the whole server render (the auth round trips, the reads, Mumbai to the
 *  phone) with no feedback — which is what "it lags" looks like. And `<Link>`
 *  prefetch was dead: for a dynamic route the App Router prefetches only down
 *  to the nearest loading boundary, and with none there was nothing to fetch.
 *
 *  This is the placeholder the signed-in TABS and DESKS stream over: three soft
 *  blocks in the page's own surface colour, no text (a word would flash), the
 *  same 430px column every page uses. ⚠ It is deliberately NOT at the group's
 *  root and NOT under any PUBLIC page (`/studio`, `/org`, `/crew`, `/person`,
 *  `/c`, `/e`) nor the admin panel: once a boundary streams, a `notFound()` or a
 *  `redirect()` inside it goes out as a 200 with a client-side hop, and a
 *  stranger's 404 on an unlisted studio, a plain user's page or /admin is a
 *  promise the suite (and a search engine) reads off the STATUS. Found by the
 *  first run: four specs went red on `expect(status).toBe(404)`. */
export function PageSkeleton() {
  const block = (h: number, r = 18) => (
    <div aria-hidden="true" style={{ height: h, borderRadius: r, background: "var(--card)", border: "1.5px solid var(--el)", opacity: 0.7 }} />
  );
  return (
    <div role="status" aria-label="Loading" style={{ maxWidth: 430, margin: "0 auto", padding: "12px 16px 40px", display: "flex", flexDirection: "column", gap: 12, minHeight: "60vh" }}>
      {block(206, 22)}
      {block(56, 14)}
      {block(120)}
      {block(120)}
    </div>
  );
}
